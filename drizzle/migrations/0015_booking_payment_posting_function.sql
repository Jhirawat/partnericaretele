-- Phase 1 step 8: atomic posting of a booking payment.
-- Writes the payment, the balanced ledger pair, commission snapshots and
-- therapist earnings in one transaction. Clients may not insert ledger rows
-- directly; this SECURITY DEFINER function is the only path.

CREATE OR REPLACE FUNCTION public.record_booking_payment(
  _booking_id UUID,
  _amount NUMERIC,
  _channel public.payment_channel,
  _reference TEXT,
  _provider_reference TEXT DEFAULT NULL,
  _fee_amount NUMERIC DEFAULT 0
) RETURNS public.payment_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller UUID := auth.uid();
  bk public.bookings;
  existing public.payment_transactions;
  payment public.payment_transactions;
  grp UUID := gen_random_uuid();
  cash_account UUID;
  revenue_account UUID;
  fee_account UUID;
  commission_account UUID;
  item RECORD;
  plan RECORD;
  rule RECORD;
  snap public.commission_snapshots;
  computed NUMERIC(12,2);
BEGIN
  SELECT * INTO bk FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found';
  END IF;

  IF caller IS NOT NULL AND NOT (public.can_write_platform(caller) OR public.belongs_to_partner(caller, bk.partner_id)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  SELECT * INTO existing FROM public.payment_transactions WHERE reference = _reference;
  IF FOUND THEN
    RETURN existing;
  END IF;

  SELECT id INTO cash_account FROM public.ledger_accounts WHERE code = '1000';
  SELECT id INTO revenue_account FROM public.ledger_accounts WHERE code = '4000';
  SELECT id INTO fee_account FROM public.ledger_accounts WHERE code = '5000';
  SELECT id INTO commission_account FROM public.ledger_accounts WHERE code = '2100';

  INSERT INTO public.payment_transactions
    (partner_id, location_id, booking_id, patient_id, reference, provider, provider_reference,
     channel, status, currency, amount, fee_amount, captured_at, created_by)
  VALUES
    (bk.partner_id, bk.location_id, bk.id, bk.patient_id, _reference, 'MANUAL', _provider_reference,
     _channel, 'PAID', bk.currency, _amount, COALESCE(_fee_amount, 0), now(), caller)
  RETURNING * INTO payment;

  INSERT INTO public.ledger_entries (partner_id, location_id, account_id, payment_transaction_id, booking_id, entry_group, direction, currency, amount, memo)
  VALUES (bk.partner_id, bk.location_id, cash_account, payment.id, bk.id, grp, 'DEBIT', bk.currency, _amount, 'Booking payment received'),
         (bk.partner_id, bk.location_id, revenue_account, payment.id, bk.id, grp, 'CREDIT', bk.currency, _amount, 'Service revenue');

  IF COALESCE(_fee_amount, 0) > 0 THEN
    INSERT INTO public.ledger_entries (partner_id, location_id, account_id, payment_transaction_id, booking_id, entry_group, direction, currency, amount, memo)
    VALUES (bk.partner_id, bk.location_id, fee_account, payment.id, bk.id, grp, 'DEBIT', bk.currency, _fee_amount, 'Processing fee'),
           (bk.partner_id, bk.location_id, cash_account, payment.id, bk.id, grp, 'CREDIT', bk.currency, _fee_amount, 'Processing fee');
  END IF;

  UPDATE public.bookings
     SET paid_amount = paid_amount + _amount
   WHERE id = bk.id;

  -- Commission: snapshot the applicable rule once per booking item.
  SELECT * INTO plan FROM public.commission_plans
   WHERE partner_id = bk.partner_id AND active = true AND effective_from <= CURRENT_DATE
   ORDER BY effective_from DESC LIMIT 1;

  IF FOUND THEN
    FOR item IN
      SELECT bi.*, s.category
        FROM public.booking_items bi
        JOIN public.services s ON s.id = bi.service_id
       WHERE bi.booking_id = bk.id AND bi.cancelled = false AND bi.therapist_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.commission_snapshots cs WHERE cs.booking_item_id = bi.id)
    LOOP
      SELECT * INTO rule FROM public.commission_rules cr
       WHERE cr.plan_id = plan.id
         AND (cr.service_id = item.service_id OR cr.service_category = item.category OR (cr.service_id IS NULL AND cr.service_category IS NULL))
       ORDER BY (cr.service_id = item.service_id) DESC, cr.priority ASC
       LIMIT 1;

      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      computed := CASE rule.basis
        WHEN 'FIXED_PER_SERVICE' THEN rule.fixed_amount * item.quantity
        ELSE ROUND(item.line_total * rule.rate / 100.0, 2)
      END;

      INSERT INTO public.commission_snapshots
        (booking_item_id, plan_id, rule_id, basis, rate, fixed_amount, base_amount, computed_amount)
      VALUES (item.id, plan.id, rule.id, rule.basis, rule.rate, rule.fixed_amount, item.line_total, computed)
      RETURNING * INTO snap;

      INSERT INTO public.therapist_earnings
        (therapist_id, partner_id, booking_item_id, snapshot_id, currency, amount, status, earned_on)
      VALUES (item.therapist_id, bk.partner_id, item.id, snap.id, bk.currency, computed, 'PENDING', (item.starts_at AT TIME ZONE 'UTC')::date);

      IF computed > 0 THEN
        INSERT INTO public.ledger_entries (partner_id, location_id, account_id, payment_transaction_id, booking_id, entry_group, direction, currency, amount, memo)
        VALUES (bk.partner_id, bk.location_id, commission_account, payment.id, bk.id, grp, 'CREDIT', bk.currency, computed, 'Therapist commission accrued'),
               (bk.partner_id, bk.location_id, revenue_account, payment.id, bk.id, grp, 'DEBIT', bk.currency, computed, 'Therapist commission accrued');
      END IF;
    END LOOP;
  END IF;

  RETURN payment;
END;
$$;

REVOKE ALL ON FUNCTION public.record_booking_payment(UUID, NUMERIC, public.payment_channel, TEXT, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_booking_payment(UUID, NUMERIC, public.payment_channel, TEXT, TEXT, NUMERIC) TO authenticated, service_role;
