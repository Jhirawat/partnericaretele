CREATE OR REPLACE FUNCTION public.apply_credit_transaction(
  _partner_id UUID,
  _type public.credit_txn_type,
  _quantity INTEGER,
  _idempotency_key TEXT,
  _consultation_id UUID DEFAULT NULL,
  _actor UUID DEFAULT NULL,
  _reference_id TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS public.credit_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  existing public.credit_transactions;
  current_balance INTEGER;
  delta INTEGER;
  new_balance INTEGER;
  inserted public.credit_transactions;
BEGIN
  -- Authorisation. A NULL caller means trusted server-side execution
  -- (service role: webhook processing and scheduled jobs).
  IF caller IS NOT NULL THEN
    IF _type IN ('PURCHASE','ADJUSTMENT','REFUND') THEN
      IF NOT public.can_write_platform(caller) THEN
        RAISE EXCEPTION 'FORBIDDEN';
      END IF;
    ELSE
      IF NOT (public.can_write_platform(caller) OR public.belongs_to_partner(caller, _partner_id)) THEN
        RAISE EXCEPTION 'FORBIDDEN';
      END IF;
    END IF;
  END IF;

  SELECT * INTO existing FROM public.credit_transactions WHERE idempotency_key = _idempotency_key;
  IF FOUND THEN
    RETURN existing;
  END IF;

  IF _quantity <= 0 AND _type IN ('PURCHASE','RESERVE','CONSUME','RELEASE') THEN
    RAISE EXCEPTION 'quantity must be positive for %', _type;
  END IF;

  SELECT credit_balance INTO current_balance FROM public.partners WHERE id = _partner_id FOR UPDATE;
  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'partner not found';
  END IF;

  delta := CASE _type
    WHEN 'PURCHASE' THEN _quantity
    WHEN 'RESERVE' THEN -_quantity
    WHEN 'CONSUME' THEN 0
    WHEN 'RELEASE' THEN _quantity
    ELSE _quantity
  END;

  new_balance := current_balance + delta;
  IF new_balance < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  IF delta <> 0 THEN
    UPDATE public.partners SET credit_balance = new_balance WHERE id = _partner_id;
  END IF;

  INSERT INTO public.credit_transactions
    (partner_id, consultation_id, type, quantity, balance_after, reference_id, idempotency_key, created_by, metadata)
  VALUES
    (_partner_id, _consultation_id, _type, _quantity, new_balance, _reference_id, _idempotency_key, COALESCE(_actor, caller), COALESCE(_metadata, '{}'::jsonb))
  RETURNING * INTO inserted;

  RETURN inserted;
END; $$;