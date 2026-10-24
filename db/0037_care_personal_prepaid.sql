-- Phase 07 (corrected): personal prepaid COUNT/VALUE ledger.
-- Separate from organisation sponsor credits (care_credit_lots). A lot binds the
-- exact package version plus one successful verified LIVE payment (patient, amount,
-- currency). COUNT = one completed assessment per unit; VALUE = the full immutable
-- service price in THB minor units, whole service only, never mixed with COUNT.
-- Earliest eligible expiry first (FEFO). Grant/reserve/capture/release are
-- server-only, append-only and conserve balance. Sandbox payments never grant.
-- Additive only; existing org credit logic untouched. Nothing activated.

CREATE TABLE public.care_personal_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  kind text NOT NULL CHECK (kind IN ('COUNT','VALUE')),
  plan_version_id uuid NOT NULL REFERENCES public.care_plan_versions(id),
  payment_id uuid UNIQUE REFERENCES public.care_payments(id),
  service_id uuid REFERENCES public.services(id),   -- NULL = any covered service
  doctor_id uuid REFERENCES public.doctors(id),     -- NULL = any doctor
  currency text NOT NULL DEFAULT 'THB',
  granted_count integer NOT NULL DEFAULT 0 CHECK (granted_count >= 0),
  used_count integer NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  granted_minor bigint NOT NULL DEFAULT 0 CHECK (granted_minor >= 0),
  used_minor bigint NOT NULL DEFAULT 0 CHECK (used_minor >= 0),
  expires_at timestamptz NOT NULL,
  environment text NOT NULL DEFAULT 'live' CHECK (environment IN ('live','sandbox')),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  CHECK (used_count <= granted_count),
  CHECK (used_minor <= granted_minor),
  CHECK (kind <> 'COUNT' OR (granted_count > 0 AND granted_minor = 0)),
  CHECK (kind <> 'VALUE' OR (granted_minor > 0 AND granted_count = 0))
);
CREATE INDEX care_personal_lots_fefo ON public.care_personal_lots (patient_id, expires_at, purchased_at, id);
GRANT SELECT ON public.care_personal_lots TO authenticated;
GRANT ALL ON public.care_personal_lots TO service_role;
ALTER TABLE public.care_personal_lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY care_personal_lots_read ON public.care_personal_lots FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patients p WHERE p.id = patient_id AND (
      p.auth_user_id = auth.uid() OR public.is_platform_staff(auth.uid())
      OR public.belongs_to_partner(auth.uid(), partner_id)
    )
  ));

CREATE TABLE public.care_personal_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.care_appointments(id),
  lot_id uuid NOT NULL REFERENCES public.care_personal_lots(id),
  state text NOT NULL DEFAULT 'RESERVED' CHECK (state IN ('RESERVED','CONSUMED','RELEASED','REVERSED')),
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  amount_minor bigint NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (appointment_id, lot_id)
);
CREATE INDEX care_personal_active_holds ON public.care_personal_holds (lot_id) WHERE state = 'RESERVED';
GRANT SELECT ON public.care_personal_holds TO authenticated;
GRANT ALL ON public.care_personal_holds TO service_role;
ALTER TABLE public.care_personal_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY care_personal_holds_read ON public.care_personal_holds FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.care_personal_lots l JOIN public.patients p ON p.id = l.patient_id
    WHERE l.id = lot_id AND (
      p.auth_user_id = auth.uid() OR public.is_platform_staff(auth.uid())
      OR public.belongs_to_partner(auth.uid(), l.partner_id)
    )
  ));

-- Append-only personal ledger. No UPDATE/DELETE ever.
CREATE TABLE public.care_personal_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  lot_id uuid REFERENCES public.care_personal_lots(id),
  appointment_id uuid REFERENCES public.care_appointments(id),
  type text NOT NULL CHECK (type IN ('GRANT','RESERVE','CAPTURE','RELEASE','EXPIRE','REVERSE')),
  quantity integer NOT NULL DEFAULT 0,
  amount_minor bigint NOT NULL DEFAULT 0,
  balance_count_after integer,
  balance_minor_after bigint,
  idempotency_key text NOT NULL UNIQUE,
  actor uuid NOT NULL,
  reference text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.care_personal_ledger TO authenticated;
GRANT ALL ON public.care_personal_ledger TO service_role;
ALTER TABLE public.care_personal_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY care_personal_ledger_read ON public.care_personal_ledger FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patients p WHERE p.id = patient_id AND (
      p.auth_user_id = auth.uid() OR public.is_platform_staff(auth.uid())
      OR public.belongs_to_partner(auth.uid(), p.partner_id)
    )
  ));
CREATE OR REPLACE FUNCTION public.care_personal_ledger_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'LEDGER_IMMUTABLE'; END $$;
CREATE TRIGGER care_personal_ledger_immutable BEFORE UPDATE OR DELETE ON public.care_personal_ledger
  FOR EACH ROW EXECUTE FUNCTION public.care_personal_ledger_immutable();
REVOKE ALL ON FUNCTION public.care_personal_ledger_immutable() FROM PUBLIC, anon, authenticated;

-- Available balance for one lot (granted - used - active reservations).
CREATE OR REPLACE FUNCTION public.care_personal_lot_available(_lot uuid,
  OUT count_available integer, OUT minor_available bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _l public.care_personal_lots; _hc int; _hm bigint;
BEGIN
  SELECT * INTO _l FROM public.care_personal_lots WHERE id = _lot;
  IF _l.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT COALESCE(sum(quantity),0), COALESCE(sum(amount_minor),0) INTO _hc, _hm
  FROM public.care_personal_holds WHERE lot_id = _lot AND state = 'RESERVED';
  count_available := _l.granted_count - _l.used_count - _hc;
  minor_available := _l.granted_minor - _l.used_minor - _hm;
END $$;

-- Eligible lots for a purchase context, earliest eligible expiry first.
-- Sandbox lots are never eligible. Restrictions: service, doctor, tenant, currency.
CREATE OR REPLACE FUNCTION public.care_personal_eligible(_patient uuid, _service uuid,
  _doctor uuid, _partner uuid, _currency text)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id FROM public.care_personal_lots l
  WHERE l.patient_id = _patient
    AND l.environment = 'live'
    AND l.expires_at > now()
    AND (l.service_id IS NULL OR l.service_id = _service)
    AND (l.doctor_id IS NULL OR l.doctor_id = _doctor)
    AND l.partner_id = _partner
    AND l.currency = _currency
  ORDER BY l.expires_at, l.purchased_at, l.id
$$;

-- Single server-only command entry: GRANT / RESERVE / CAPTURE / RELEASE.
-- GRANT binds the exact package version + a successful verified LIVE payment whose
-- amount and currency match the package price. Idempotent on payment and key.
CREATE OR REPLACE FUNCTION public.care_personal_command(_op text, _args jsonb, _key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid := auth.uid(); _patient uuid; _pv record; _pay record; _lot record;
        _appt record; _hold record; _id uuid; _bc int; _bm bigint; _need_minor bigint; _sv record;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
  IF _key IS NULL OR _key !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_key, 0));

  -- Idempotent replay: same key returns the original outcome.
  IF EXISTS (SELECT 1 FROM public.care_personal_ledger WHERE idempotency_key = _key) THEN
    RETURN (SELECT jsonb_build_object('id', lot_id, 'type', type, 'replayed', true)
            FROM public.care_personal_ledger WHERE idempotency_key = _key LIMIT 1);
  END IF;

  IF _op = 'GRANT' THEN
    -- Server-only: staff actor, exact package version, verified LIVE payment.
    IF NOT public.is_platform_staff(_u) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    PERFORM public.care_require_strong();
    SELECT * INTO _pv FROM public.care_plan_versions WHERE id = (_args->>'plan_version_id')::uuid;
    IF _pv.id IS NULL OR _pv.status <> 'APPROVED' THEN RAISE EXCEPTION 'PLAN_NOT_APPROVED'; END IF;
    SELECT * INTO _pay FROM public.care_payments WHERE id = (_args->>'payment_id')::uuid;
    IF _pay.id IS NULL OR _pay.status <> 'PAID' THEN RAISE EXCEPTION 'PAYMENT_NOT_VERIFIED'; END IF;
    IF COALESCE(_pay.provider_environment, 'live') <> 'live' THEN RAISE EXCEPTION 'SANDBOX_NO_GRANT'; END IF;
    IF _pay.amount_minor <> _pv.price_minor OR _pay.currency <> _pv.currency THEN
      RAISE EXCEPTION 'PAYMENT_PLAN_MISMATCH';
    END IF;
    _patient := _pay.patient_id;
    IF _patient IS NULL THEN RAISE EXCEPTION 'PAYMENT_HAS_NO_PATIENT'; END IF;
    -- One lot per payment, forever.
    SELECT * INTO _lot FROM public.care_personal_lots WHERE payment_id = _pay.id;
    IF _lot.id IS NOT NULL THEN
      RETURN jsonb_build_object('id', _lot.id, 'type', 'GRANT', 'replayed', true);
    END IF;
    IF _pv.unlimited THEN RAISE EXCEPTION 'UNLIMITED_NOT_PREPAID'; END IF;
    INSERT INTO public.care_personal_lots
      (patient_id, partner_id, kind, plan_version_id, payment_id, service_id, doctor_id, currency,
       granted_count, granted_minor, expires_at, environment)
    VALUES (_patient, _pay.partner_id,
            CASE WHEN _pv.quota IS NOT NULL THEN 'COUNT' ELSE 'VALUE' END,
            _pv.id, _pay.id,
            NULLIF(_args->>'service_id','')::uuid, NULLIF(_args->>'doctor_id','')::uuid,
            _pv.currency,
            COALESCE(_pv.quota, 0),
            CASE WHEN _pv.quota IS NOT NULL THEN 0 ELSE _pv.price_minor END,
            now() + make_interval(months => _pv.duration_months), 'live')
    RETURNING id INTO _id;
    INSERT INTO public.care_personal_ledger (patient_id, lot_id, type, quantity, amount_minor,
      balance_count_after, balance_minor_after, idempotency_key, actor, reference, metadata)
    SELECT _patient, _id, 'GRANT', l.granted_count, l.granted_minor,
      l.granted_count, l.granted_minor, _key, _u, _pay.id::text,
      jsonb_build_object('payment_id', _pay.id, 'plan_version_id', _pv.id)
    FROM public.care_personal_lots l WHERE l.id = _id;
    RETURN jsonb_build_object('id', _id, 'type', 'GRANT');
  END IF;

  -- RESERVE / CAPTURE / RELEASE operate on an appointment for the caller's scope.
  SELECT * INTO _appt FROM public.care_appointments WHERE id = (_args->>'appointment_id')::uuid;
  IF _appt.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (public.care_ops_scope(_appt.partner_id, _u) OR public.care_super(_u)
          OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = _appt.patient_id AND p.auth_user_id = _u)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT * INTO _sv FROM public.care_service_versions WHERE id = _appt.service_version_id;

  IF _op = 'RESERVE' THEN
    IF _appt.state NOT IN ('REQUESTED','CONFIRMED') THEN RAISE EXCEPTION 'APPOINTMENT_STATE_CONFLICT'; END IF;
    IF EXISTS (SELECT 1 FROM public.care_personal_holds h
               JOIN public.care_personal_lots l ON l.id = h.lot_id
               WHERE h.appointment_id = _appt.id AND h.state = 'RESERVED') THEN
      RAISE EXCEPTION 'ALREADY_RESERVED';
    END IF;
    -- Earliest eligible expiry first; whole service only.
    SELECT * INTO _lot FROM public.care_personal_lots l
    WHERE l.id IN (SELECT public.care_personal_eligible(_appt.patient_id, _sv.service_id,
                     _appt.doctor_id, _appt.partner_id, 'THB'))
    -- COUNT entitlements are consumed before VALUE balances; earliest expiry first.
    ORDER BY (l.kind = 'VALUE'), l.expires_at, l.purchased_at, l.id LIMIT 1
    FOR UPDATE OF l;
    IF _lot.id IS NULL THEN RAISE EXCEPTION 'NO_ELIGIBLE_LOT'; END IF;
    IF _lot.kind = 'COUNT' THEN
      SELECT a.count_available, a.minor_available INTO _bc, _bm FROM public.care_personal_lot_available(_lot.id) a;
      IF _bc < 1 THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
      INSERT INTO public.care_personal_holds (appointment_id, lot_id, quantity)
      VALUES (_appt.id, _lot.id, 1) RETURNING id INTO _id;
    ELSE
      _need_minor := _sv.price_minor;
      SELECT a.count_available, a.minor_available INTO _bc, _bm FROM public.care_personal_lot_available(_lot.id) a;
      IF _bm < _need_minor THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
      INSERT INTO public.care_personal_holds (appointment_id, lot_id, amount_minor)
      VALUES (_appt.id, _lot.id, _need_minor) RETURNING id INTO _id;
    END IF;
    INSERT INTO public.care_personal_ledger (patient_id, lot_id, appointment_id, type, quantity,
      amount_minor, idempotency_key, actor, reference)
    SELECT _appt.patient_id, _lot.id, _appt.id, 'RESERVE', h.quantity, h.amount_minor, _key, _u, NULL
    FROM public.care_personal_holds h WHERE h.id = _id;
    RETURN jsonb_build_object('id', _id, 'lot_id', _lot.id, 'type', 'RESERVE');
  END IF;

  SELECT * INTO _hold FROM public.care_personal_holds
  WHERE appointment_id = _appt.id AND state = 'RESERVED' LIMIT 1;
  IF _hold.id IS NULL THEN RAISE EXCEPTION 'NO_ACTIVE_HOLD'; END IF;
  SELECT * INTO _lot FROM public.care_personal_lots WHERE id = _hold.lot_id FOR UPDATE;

  IF _op = 'CAPTURE' THEN
    -- COUNT: exactly one completed assessment. VALUE: full immutable service price.
    IF _appt.state <> 'COMPLETED' THEN RAISE EXCEPTION 'APPOINTMENT_NOT_COMPLETED'; END IF;
    IF _lot.kind = 'COUNT' THEN
      UPDATE public.care_personal_lots SET used_count = used_count + 1 WHERE id = _lot.id;
    ELSE
      IF _hold.amount_minor <> _sv.price_minor THEN RAISE EXCEPTION 'PARTIAL_VALUE_FORBIDDEN'; END IF;
      UPDATE public.care_personal_lots SET used_minor = used_minor + _hold.amount_minor WHERE id = _lot.id;
    END IF;
    UPDATE public.care_personal_holds SET state = 'CONSUMED', resolved_at = now() WHERE id = _hold.id;
    INSERT INTO public.care_personal_ledger (patient_id, lot_id, appointment_id, type, quantity,
      amount_minor, balance_count_after, balance_minor_after, idempotency_key, actor, reference)
    SELECT _appt.patient_id, _lot.id, _appt.id, 'CAPTURE', _hold.quantity, _hold.amount_minor,
      l.granted_count - l.used_count, l.granted_minor - l.used_minor, _key, _u, NULL
    FROM public.care_personal_lots l WHERE l.id = _lot.id;
    RETURN jsonb_build_object('id', _hold.id, 'lot_id', _lot.id, 'type', 'CAPTURE');
  ELSIF _op = 'RELEASE' THEN
    UPDATE public.care_personal_holds SET state = 'RELEASED', resolved_at = now() WHERE id = _hold.id;
    INSERT INTO public.care_personal_ledger (patient_id, lot_id, appointment_id, type, quantity,
      amount_minor, idempotency_key, actor, reference)
    VALUES (_appt.patient_id, _lot.id, _appt.id, 'RELEASE', _hold.quantity, _hold.amount_minor,
      _key, _u, NULL);
    RETURN jsonb_build_object('id', _hold.id, 'lot_id', _lot.id, 'type', 'RELEASE');
  END IF;

  RAISE EXCEPTION 'UNKNOWN_OPERATION';
END $$;
-- Public mutation entry (same pattern as care_command): EXECUTE is granted to
-- authenticated, and every operation enforces its own authorization inside.
REVOKE ALL ON FUNCTION public.care_personal_command(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.care_personal_command(text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.care_personal_lot_available(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.care_personal_eligible(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.care_personal_eligible(uuid, uuid, uuid, uuid, text) TO authenticated;
