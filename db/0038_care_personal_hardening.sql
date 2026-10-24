-- Phase 07 hardening (source audit 0037): personal prepaid ledger.
-- (1) Financial mutation + balance/eligibility helpers are SERVER-ONLY:
--     EXECUTE revoked from PUBLIC/anon/authenticated; service_role only.
--     The command takes an explicit verified _actor (the app server verifies
--     the session + MFA before calling with the service client). A safe
--     scoped read DTO (care_personal_balance) is the only authenticated entry.
-- (2) GRANT requires EXACT live environment (NULL/unknown rejected) and an
--     immutable PAYMENT -> PACKAGE_VERSION binding from the payment's trusted
--     snapshot (price match alone is insufficient); service/doctor
--     restrictions come from the snapshot, never from caller _args.
-- (3) Idempotency: authorization runs BEFORE replay lookup; the key is bound
--     to an input hash (op + args + actor) — same key + same input replays,
--     same key + different input is IDEMPOTENCY_CONFLICT. No cross-user replay.
-- (4) Eligibility filters whole-service coverage BEFORE FEFO selection
--     (an exhausted earliest COUNT lot no longer blocks a funded later lot);
--     availability rechecked under row locks; validity required at now AND at
--     the appointment start.
-- (5) CAPTURE only by the appointment's assigned, active, licensed doctor on
--     a COMPLETED appointment; RELEASE only after CANCELLED/NO_SHOW (policy-
--     driven), never during active or completed clinical care. Appointment
--     row locked FOR UPDATE before funding changes; a consumed hold cannot be
--     recaptured under a different key.
-- (6) Cross-tenant consistency trigger: a hold's lot must belong to the
--     appointment's patient AND partner.
-- Additive only; existing lots/holds/ledger rows and org credits untouched.

-- (1) Privilege lockdown -----------------------------------------------------
REVOKE ALL ON FUNCTION public.care_personal_command(text, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.care_personal_lot_available(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.care_personal_eligible(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- Old 3-arg command is retired: no caller may use it.
CREATE OR REPLACE FUNCTION public.care_personal_command(_op text, _args jsonb, _key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'SERVER_ONLY_USE_ACTOR_COMMAND';
END $$;
REVOKE ALL ON FUNCTION public.care_personal_command(text, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;

-- New server-only command with explicit verified actor.
CREATE OR REPLACE FUNCTION public.care_personal_command(_op text, _args jsonb, _key text, _actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _patient uuid; _pv record; _pay record; _lot record; _appt record; _hold record;
        _id uuid; _bc int; _bm bigint; _need_minor bigint; _sv record;
        _pv_id uuid; _hash text; _prev record;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'ACTOR_REQUIRED'; END IF;
  IF _key IS NULL OR _key !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  _hash := md5(_op || ':' || _args::text || ':' || _actor::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(_key, 0));

  -- (3) Resolve the target and AUTHORIZE before any idempotent replay.
  IF _op = 'GRANT' THEN
    SELECT * INTO _pay FROM public.care_payments WHERE id = (_args->>'payment_id')::uuid;
    IF _pay.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF NOT public.is_platform_staff(_actor) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  ELSE
    SELECT * INTO _appt FROM public.care_appointments WHERE id = (_args->>'appointment_id')::uuid FOR UPDATE;
    IF _appt.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF _op = 'RESERVE' THEN
      IF NOT (public.care_ops_scope(_appt.partner_id, _actor) OR public.care_super(_actor)
              OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = _appt.patient_id AND p.auth_user_id = _actor)) THEN
        RAISE EXCEPTION 'FORBIDDEN';
      END IF;
    ELSIF _op = 'CAPTURE' THEN
      -- (5) Only the assigned, active, licensed doctor may capture.
      IF NOT EXISTS (
        SELECT 1 FROM public.doctors d
        WHERE d.id = _appt.doctor_id AND d.auth_user_id = _actor AND d.status = 'ACTIVE'
          AND (d.license_expires_on IS NULL OR d.license_expires_on >= now()::date)
      ) THEN RAISE EXCEPTION 'ASSIGNED_DOCTOR_REQUIRED'; END IF;
    ELSIF _op = 'RELEASE' THEN
      -- Policy-driven release: operations/platform only, never the patient.
      IF NOT (public.care_ops_scope(_appt.partner_id, _actor) OR public.care_super(_actor)) THEN
        RAISE EXCEPTION 'FORBIDDEN';
      END IF;
    ELSE
      RAISE EXCEPTION 'UNKNOWN_OPERATION';
    END IF;
  END IF;

  -- Idempotent replay: same key + same input returns the original outcome;
  -- same key + different input is a conflict.
  SELECT * INTO _prev FROM public.care_personal_ledger WHERE idempotency_key = _key;
  IF _prev.id IS NOT NULL THEN
    IF _prev.metadata->>'input_hash' = _hash THEN
      RETURN jsonb_build_object('id', _prev.lot_id, 'type', _prev.type, 'replayed', true);
    END IF;
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
  END IF;

  IF _op = 'GRANT' THEN
    -- (2) Exact live environment only; unknown/NULL rejected.
    IF _pay.status <> 'PAID' THEN RAISE EXCEPTION 'PAYMENT_NOT_VERIFIED'; END IF;
    IF _pay.provider_environment IS NULL OR _pay.provider_environment <> 'live' THEN
      RAISE EXCEPTION 'ENVIRONMENT_NOT_LIVE';
    END IF;
    -- Immutable payment -> package-version binding from the trusted snapshot.
    _pv_id := NULLIF(_pay.snapshot->>'plan_version_id', '')::uuid;
    IF _pv_id IS NULL THEN RAISE EXCEPTION 'PAYMENT_PLAN_UNBOUND'; END IF;
    IF NULLIF(_args->>'plan_version_id', '') IS NOT NULL
       AND (_args->>'plan_version_id')::uuid <> _pv_id THEN
      RAISE EXCEPTION 'PLAN_BINDING_MISMATCH';
    END IF;
    SELECT * INTO _pv FROM public.care_plan_versions WHERE id = _pv_id;
    IF _pv.id IS NULL OR _pv.status <> 'APPROVED' THEN RAISE EXCEPTION 'PLAN_NOT_APPROVED'; END IF;
    IF _pay.amount_minor <> _pv.price_minor OR _pay.currency <> _pv.currency THEN
      RAISE EXCEPTION 'PAYMENT_PLAN_MISMATCH';
    END IF;
    _patient := _pay.patient_id;
    IF _patient IS NULL THEN RAISE EXCEPTION 'PAYMENT_HAS_NO_PATIENT'; END IF;
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
            NULLIF(_pay.snapshot->>'service_id', '')::uuid,
            NULLIF(_pay.snapshot->>'doctor_id', '')::uuid,
            _pv.currency,
            COALESCE(_pv.quota, 0),
            CASE WHEN _pv.quota IS NOT NULL THEN 0 ELSE _pv.price_minor END,
            now() + make_interval(months => _pv.duration_months), 'live')
    RETURNING id INTO _id;
    INSERT INTO public.care_personal_ledger (patient_id, lot_id, type, quantity, amount_minor,
      balance_count_after, balance_minor_after, idempotency_key, actor, reference, metadata)
    SELECT _patient, _id, 'GRANT', l.granted_count, l.granted_minor,
      l.granted_count, l.granted_minor, _key, _actor, _pay.id::text,
      jsonb_build_object('payment_id', _pay.id, 'plan_version_id', _pv.id, 'input_hash', _hash)
    FROM public.care_personal_lots l WHERE l.id = _id;
    RETURN jsonb_build_object('id', _id, 'type', 'GRANT');
  END IF;

  SELECT * INTO _sv FROM public.care_service_versions WHERE id = _appt.service_version_id;

  IF _op = 'RESERVE' THEN
    IF _appt.state NOT IN ('REQUESTED','CONFIRMED') THEN RAISE EXCEPTION 'APPOINTMENT_STATE_CONFLICT'; END IF;
    IF EXISTS (SELECT 1 FROM public.care_personal_holds h
               WHERE h.appointment_id = _appt.id AND h.state = 'RESERVED') THEN
      RAISE EXCEPTION 'ALREADY_RESERVED';
    END IF;
    _need_minor := COALESCE(_sv.price_minor, 0);
    -- (4) Coverage-aware FEFO: only lots that can fund the WHOLE service are
    -- candidates; COUNT before VALUE; validity at now AND appointment start.
    SELECT * INTO _lot FROM public.care_personal_lots l
    WHERE l.id IN (SELECT public.care_personal_eligible(_appt.patient_id, _sv.service_id,
                     _appt.doctor_id, _appt.partner_id, 'THB', _need_minor))
      AND l.expires_at > GREATEST(now(), COALESCE(_appt.starts_at, now()))
    ORDER BY (l.kind = 'VALUE'), l.expires_at, l.purchased_at, l.id LIMIT 1
    FOR UPDATE OF l;
    IF _lot.id IS NULL THEN RAISE EXCEPTION 'NO_ELIGIBLE_LOT'; END IF;
    -- Recheck availability under the row lock.
    SELECT a.count_available, a.minor_available INTO _bc, _bm FROM public.care_personal_lot_available(_lot.id) a;
    IF _lot.kind = 'COUNT' THEN
      IF _bc < 1 THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
      INSERT INTO public.care_personal_holds (appointment_id, lot_id, quantity)
      VALUES (_appt.id, _lot.id, 1) RETURNING id INTO _id;
    ELSE
      IF _bm < _need_minor OR _need_minor <= 0 THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
      INSERT INTO public.care_personal_holds (appointment_id, lot_id, amount_minor)
      VALUES (_appt.id, _lot.id, _need_minor) RETURNING id INTO _id;
    END IF;
    INSERT INTO public.care_personal_ledger (patient_id, lot_id, appointment_id, type, quantity,
      amount_minor, idempotency_key, actor, reference, metadata)
    SELECT _appt.patient_id, _lot.id, _appt.id, 'RESERVE', h.quantity, h.amount_minor, _key, _actor, NULL,
      jsonb_build_object('input_hash', _hash)
    FROM public.care_personal_holds h WHERE h.id = _id;
    RETURN jsonb_build_object('id', _id, 'lot_id', _lot.id, 'type', 'RESERVE');
  END IF;

  SELECT * INTO _hold FROM public.care_personal_holds
  WHERE appointment_id = _appt.id AND state = 'RESERVED' LIMIT 1;
  IF _hold.id IS NULL THEN RAISE EXCEPTION 'NO_ACTIVE_HOLD'; END IF;
  SELECT * INTO _lot FROM public.care_personal_lots WHERE id = _hold.lot_id FOR UPDATE;

  IF _op = 'CAPTURE' THEN
    IF _appt.state <> 'COMPLETED' THEN RAISE EXCEPTION 'APPOINTMENT_NOT_COMPLETED'; END IF;
    IF _lot.kind = 'COUNT' THEN
      UPDATE public.care_personal_lots SET used_count = used_count + 1 WHERE id = _lot.id;
    ELSE
      IF _hold.amount_minor <> _sv.price_minor THEN RAISE EXCEPTION 'PARTIAL_VALUE_FORBIDDEN'; END IF;
      UPDATE public.care_personal_lots SET used_minor = used_minor + _hold.amount_minor WHERE id = _lot.id;
    END IF;
    UPDATE public.care_personal_holds SET state = 'CONSUMED', resolved_at = now() WHERE id = _hold.id;
    INSERT INTO public.care_personal_ledger (patient_id, lot_id, appointment_id, type, quantity,
      amount_minor, balance_count_after, balance_minor_after, idempotency_key, actor, reference, metadata)
    SELECT _appt.patient_id, _lot.id, _appt.id, 'CAPTURE', _hold.quantity, _hold.amount_minor,
      l.granted_count - l.used_count, l.granted_minor - l.used_minor, _key, _actor, NULL,
      jsonb_build_object('input_hash', _hash)
    FROM public.care_personal_lots l WHERE l.id = _lot.id;
    RETURN jsonb_build_object('id', _hold.id, 'lot_id', _lot.id, 'type', 'CAPTURE');
  ELSIF _op = 'RELEASE' THEN
    -- (5) Policy-driven release only: after cancellation / no-show, never
    -- during active or completed clinical care.
    IF _appt.state NOT IN ('CANCELLED','NO_SHOW') THEN RAISE EXCEPTION 'RELEASE_NOT_ALLOWED'; END IF;
    UPDATE public.care_personal_holds SET state = 'RELEASED', resolved_at = now() WHERE id = _hold.id;
    INSERT INTO public.care_personal_ledger (patient_id, lot_id, appointment_id, type, quantity,
      amount_minor, idempotency_key, actor, reference, metadata)
    VALUES (_appt.patient_id, _lot.id, _appt.id, 'RELEASE', _hold.quantity, _hold.amount_minor,
      _key, _actor, NULL, jsonb_build_object('input_hash', _hash));
    RETURN jsonb_build_object('id', _hold.id, 'lot_id', _lot.id, 'type', 'RELEASE');
  END IF;

  RAISE EXCEPTION 'UNKNOWN_OPERATION';
END $$;
REVOKE ALL ON FUNCTION public.care_personal_command(text, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.care_personal_command(text, jsonb, text, uuid) TO service_role;

-- (4) Coverage-aware eligibility (new signature; old one revoked above).
CREATE OR REPLACE FUNCTION public.care_personal_eligible(_patient uuid, _service uuid,
  _doctor uuid, _partner uuid, _currency text, _need_minor bigint)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id FROM public.care_personal_lots l
  WHERE l.patient_id = _patient
    AND l.environment = 'live'
    AND l.expires_at > now()
    AND (l.service_id IS NULL OR l.service_id = _service)
    AND (l.doctor_id IS NULL OR l.doctor_id = _doctor)
    AND l.partner_id = _partner
    AND l.currency = _currency
    AND (
      (l.kind = 'COUNT' AND l.granted_count - l.used_count -
        (SELECT COALESCE(sum(h.quantity),0) FROM public.care_personal_holds h
         WHERE h.lot_id = l.id AND h.state = 'RESERVED') >= 1)
      OR
      (l.kind = 'VALUE' AND l.granted_minor - l.used_minor -
        (SELECT COALESCE(sum(h.amount_minor),0) FROM public.care_personal_holds h
         WHERE h.lot_id = l.id AND h.state = 'RESERVED') >= _need_minor)
    )
  ORDER BY l.expires_at, l.purchased_at, l.id
$$;
REVOKE ALL ON FUNCTION public.care_personal_eligible(uuid, uuid, uuid, uuid, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.care_personal_eligible(uuid, uuid, uuid, uuid, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.care_personal_lot_available(uuid) TO service_role;

-- Safe scoped read DTO: the only authenticated entry point.
CREATE OR REPLACE FUNCTION public.care_personal_balance(_patient uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p record;
BEGIN
  SELECT * INTO _p FROM public.patients WHERE id = _patient;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (_p.auth_user_id = auth.uid() OR public.is_platform_staff(auth.uid())
          OR public.belongs_to_partner(auth.uid(), _p.partner_id)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'lot_id', l.id, 'kind', l.kind, 'expires_at', l.expires_at,
      'count_available', l.granted_count - l.used_count - COALESCE(h.q, 0),
      'minor_available', l.granted_minor - l.used_minor - COALESCE(h.m, 0)
    ) ORDER BY l.expires_at), '[]'::jsonb)
    FROM public.care_personal_lots l
    LEFT JOIN (SELECT lot_id, sum(quantity) q, sum(amount_minor) m
               FROM public.care_personal_holds WHERE state = 'RESERVED' GROUP BY lot_id) h
      ON h.lot_id = l.id
    WHERE l.patient_id = _patient AND l.environment = 'live' AND l.expires_at > now());
END $$;
REVOKE ALL ON FUNCTION public.care_personal_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.care_personal_balance(uuid) TO authenticated;

-- (6) Cross-tenant consistency: a hold's lot must match the appointment's
-- patient and partner.
CREATE OR REPLACE FUNCTION public.care_personal_hold_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _l record; _a record;
BEGIN
  SELECT * INTO _l FROM public.care_personal_lots WHERE id = NEW.lot_id;
  SELECT * INTO _a FROM public.care_appointments WHERE id = NEW.appointment_id;
  IF _l.id IS NULL OR _a.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF _l.patient_id <> _a.patient_id OR _l.partner_id <> _a.partner_id THEN
    RAISE EXCEPTION 'CROSS_TENANT_HOLD';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER care_personal_hold_guard BEFORE INSERT OR UPDATE ON public.care_personal_holds
  FOR EACH ROW EXECUTE FUNCTION public.care_personal_hold_guard();
REVOKE ALL ON FUNCTION public.care_personal_hold_guard() FROM PUBLIC, anon, authenticated;
