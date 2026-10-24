-- Phase 10: automatic personal prepaid lot grant on confirmed LIVE settlement.
-- When a prepaid purchase (snapshot.prepaid = true, created by care_prepaid_purchase)
-- transitions to PAID in the live environment, the database itself creates the
-- care_personal_lots row and the append-only GRANT ledger entry. No staff action
-- and no client input is involved; the grant is derived entirely from the trusted
-- payment row and the immutable plan version it was bound to at purchase time.
-- Sandbox payments never grant (provider_environment must be 'live').
-- Idempotent: one lot per payment forever (payment_id UNIQUE) and a unique
-- idempotency key per grant. If the bound plan version is missing or no longer
-- APPROVED, settlement still succeeds and a finance reconciliation conflict is
-- recorded instead of granting.
-- Additive only: no existing function, table or policy is changed.

CREATE OR REPLACE FUNCTION public.care_prepaid_auto_grant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _pv public.care_plan_versions;
  _lot uuid;
BEGIN
  -- Only the PENDING -> PAID transition of a live prepaid purchase grants.
  IF NEW.status <> 'PAID' OR OLD.status IS NOT DISTINCT FROM 'PAID' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.snapshot->>'prepaid', 'false') <> 'true' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.provider_environment, 'live') <> 'live' THEN RETURN NEW; END IF;
  IF NEW.patient_id IS NULL THEN RETURN NEW; END IF;

  -- One lot per payment, forever.
  IF EXISTS (SELECT 1 FROM public.care_personal_lots WHERE payment_id = NEW.id) THEN RETURN NEW; END IF;

  SELECT * INTO _pv FROM public.care_plan_versions
   WHERE id = NULLIF(NEW.snapshot->>'plan_version_id', '')::uuid;
  IF _pv.id IS NULL OR _pv.status <> 'APPROVED' OR _pv.unlimited
     OR _pv.price_minor IS NULL OR _pv.price_minor <> NEW.amount_minor
     OR _pv.currency <> NEW.currency THEN
    INSERT INTO public.integration_conflicts (partner_id, conflict_type, details)
    VALUES (NEW.partner_id, 'CARE_PREPAID_AUTO_GRANT_FAILED',
            jsonb_build_object('payment_id', NEW.id, 'plan_version_id', NEW.snapshot->>'plan_version_id',
                               'requires_finance_reconciliation', true));
    RETURN NEW;
  END IF;

  INSERT INTO public.care_personal_lots
    (patient_id, partner_id, kind, plan_version_id, payment_id, currency,
     granted_count, granted_minor, expires_at, environment)
  VALUES (NEW.patient_id, NEW.partner_id,
          CASE WHEN _pv.quota IS NOT NULL THEN 'COUNT' ELSE 'VALUE' END,
          _pv.id, NEW.id, _pv.currency,
          COALESCE(_pv.quota, 0),
          CASE WHEN _pv.quota IS NOT NULL THEN 0 ELSE _pv.price_minor END,
          now() + make_interval(months => _pv.duration_months), 'live')
  RETURNING id INTO _lot;

  INSERT INTO public.care_personal_ledger
    (patient_id, lot_id, type, quantity, amount_minor,
     balance_count_after, balance_minor_after, idempotency_key, actor, reference, metadata)
  SELECT NEW.patient_id, _lot, 'GRANT', l.granted_count, l.granted_minor,
         l.granted_count, l.granted_minor,
         'care:auto-grant:' || NEW.id::text,
         COALESCE(NEW.verified_by, NEW.created_by), NEW.id::text,
         jsonb_build_object('payment_id', NEW.id, 'plan_version_id', _pv.id, 'auto', true)
    FROM public.care_personal_lots l WHERE l.id = _lot;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS care_prepaid_auto_grant ON public.care_payments;
CREATE TRIGGER care_prepaid_auto_grant
  AFTER UPDATE OF status ON public.care_payments
  FOR EACH ROW EXECUTE FUNCTION public.care_prepaid_auto_grant();

REVOKE ALL ON FUNCTION public.care_prepaid_auto_grant() FROM PUBLIC, anon, authenticated;
