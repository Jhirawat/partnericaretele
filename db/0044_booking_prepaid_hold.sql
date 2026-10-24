-- Phase 12: prepayment at booking via the personal prepaid ledger.
-- A patient self-booking now atomically RESERVES the earliest eligible prepaid
-- lot (COUNT = one session, VALUE = the full immutable service price) when no
-- active membership covers the visit. Staff COMPLETE captures the hold;
-- CANCEL / NO_SHOW releases it. All ledger writes stay inside
-- care_personal_command (append-only, idempotent keys derived from the
-- appointment id, so replays never double-spend). Membership-covered bookings
-- keep payment_state 'UNPAID' (covered). Additive only; nothing activated.

-- The personal ledger requires pure-UUID idempotency keys. Derive a stable
-- UUID per (purpose, appointment) so retries replay instead of double-spending.
CREATE OR REPLACE FUNCTION public.care_derived_key(_tag text, _id uuid)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT substr(md5(_tag || ':' || _id::text), 1, 8) || '-'
       || substr(md5(_tag || ':' || _id::text), 9, 4) || '-'
       || substr(md5(_tag || ':' || _id::text), 13, 4) || '-'
       || substr(md5(_tag || ':' || _id::text), 17, 4) || '-'
       || substr(md5(_tag || ':' || _id::text), 21, 12)
$$;
REVOKE ALL ON FUNCTION public.care_derived_key(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.care_derived_key(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.care_patient_book(
  _service_version uuid,
  _starts timestamptz,
  _ends timestamptz,
  _key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _patient record; _sv record; _ent jsonb; _id uuid; _hold jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
  IF _key IS NULL OR _key !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;

  SELECT id, partner_id INTO _patient FROM public.patients WHERE auth_user_id = auth.uid() LIMIT 1;
  IF _patient.id IS NULL THEN RAISE EXCEPTION 'PATIENT_NOT_LINKED'; END IF;

  SELECT * INTO _sv FROM public.care_service_versions WHERE id = _service_version;
  IF _sv.id IS NULL OR _sv.status <> 'APPROVED'
     OR (_sv.effective_from IS NOT NULL AND _sv.effective_from > now())
     OR (_sv.effective_to IS NOT NULL AND _sv.effective_to <= now()) THEN
    RAISE EXCEPTION 'SERVICE_VERSION_NOT_BOOKABLE';
  END IF;
  IF _sv.partner_id <> _patient.partner_id THEN RAISE EXCEPTION 'CROSS_TENANT_BOOKING'; END IF;
  IF _starts IS NULL OR _ends IS NULL OR _ends <= _starts THEN RAISE EXCEPTION 'INVALID_WINDOW'; END IF;
  IF _starts <= now() THEN RAISE EXCEPTION 'INVALID_WINDOW'; END IF;

  -- Entitled by an active paid membership period OR an eligible prepaid lot
  -- (service/tenant/currency restrictions enforced by the eligibility function).
  _ent := public.care_entitlement(_patient.id, _starts, _sv.service_id);
  IF NOT COALESCE((_ent->>'entitled')::boolean, false)
     AND NOT EXISTS (
       SELECT 1 FROM public.care_personal_eligible(
         _patient.id, _sv.service_id, NULL, _patient.partner_id, 'THB') e
     ) THEN
    RAISE EXCEPTION 'ENTITLEMENT_REQUIRED';
  END IF;

  INSERT INTO public.care_appointments
    (partner_id, patient_id, service_version_id, starts_at, ends_at, state,
     payment_state, idempotency_key, created_by)
  VALUES (_patient.partner_id, _patient.id, _sv.id, _starts, _ends, 'REQUESTED',
          'UNPAID', _key, auth.uid())
  RETURNING id INTO _id;

  -- Prepayment: without membership cover, reserve the prepaid lot now. The
  -- reservation key is derived from the appointment id, so a retried booking
  -- with a new client key can never reserve twice for one appointment.
  IF NOT COALESCE((_ent->>'entitled')::boolean, false) THEN
    -- 4-arg server form (0038): the patient is the verified actor.
    _hold := public.care_personal_command('RESERVE',
      jsonb_build_object('appointment_id', _id),
      public.care_derived_key('care-appt-reserve', _id), auth.uid());
    UPDATE public.care_appointments SET payment_state = 'RESERVED' WHERE id = _id;
  END IF;

  INSERT INTO public.audit_log (actor_user_id, partner_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), _patient.partner_id, 'APPOINTMENT_PATIENT_BOOK', 'care_appointments', _id::text,
    jsonb_build_object('patient_id', _patient.id, 'service_version_id', _sv.id,
      'starts_at', _starts, 'ends_at', _ends, 'entitlement', _ent->>'reason',
      'prepaid_hold', _hold));

  RETURN jsonb_build_object('id', _id, 'state', 'REQUESTED',
    'payment_state', CASE WHEN _hold IS NULL THEN 'UNPAID' ELSE 'RESERVED' END);
END $$;
REVOKE ALL ON FUNCTION public.care_patient_book(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.care_patient_book(uuid, timestamptz, timestamptz, text) TO authenticated;

-- Staff lifecycle: COMPLETE captures the prepaid hold, CANCEL / NO_SHOW release
-- it. Derived idempotency keys make repeated transitions safe.
CREATE OR REPLACE FUNCTION public.care_appointment_command(_op text, _args jsonb, _key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _patient uuid; _org uuid; _sv record; _doc uuid; _start timestamptz; _end timestamptz;
        _ent jsonb; _pay uuid; _id uuid; _appt record; _settle jsonb; _doc_user uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
  IF _key IS NULL OR _key !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;

  IF _op = 'BOOK' THEN
    _patient := (_args->>'patient_id')::uuid;
    SELECT * INTO _sv FROM public.care_service_versions WHERE id = (_args->>'service_version_id')::uuid;
    IF _sv.id IS NULL OR _sv.status <> 'APPROVED'
       OR (_sv.effective_from IS NOT NULL AND _sv.effective_from > now())
       OR (_sv.effective_to IS NOT NULL AND _sv.effective_to <= now()) THEN
      RAISE EXCEPTION 'SERVICE_VERSION_NOT_BOOKABLE';
    END IF;
    SELECT partner_id INTO _org FROM public.patients WHERE id = _patient;
    IF _org IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF _sv.partner_id <> _org THEN RAISE EXCEPTION 'CROSS_TENANT_BOOKING'; END IF;
    IF NOT (public.care_ops_scope(_org, auth.uid()) OR public.care_super(auth.uid())) THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
    _start := (_args->>'starts_at')::timestamptz;
    _end := (_args->>'ends_at')::timestamptz;
    IF _start IS NULL OR _end IS NULL OR _end <= _start THEN RAISE EXCEPTION 'INVALID_WINDOW'; END IF;
    -- Entitlement: entitled membership OR a verified payment for this org.
    _ent := public.care_entitlement(_patient, _start, _sv.service_id);
    _pay := NULLIF(_args->>'payment_id','')::uuid;
    IF NOT COALESCE((_ent->>'entitled')::boolean, false) THEN
      IF _pay IS NULL THEN RAISE EXCEPTION 'ENTITLEMENT_REQUIRED'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.care_payments cp
                     WHERE cp.id = _pay AND cp.partner_id = _org AND cp.status = 'VERIFIED') THEN
        RAISE EXCEPTION 'PAYMENT_NOT_VERIFIED';
      END IF;
    END IF;
    INSERT INTO public.care_appointments
      (partner_id, patient_id, service_version_id, starts_at, ends_at, state,
       payment_state, payment_id, idempotency_key, created_by)
    VALUES (_org, _patient, _sv.id, _start, _end, 'REQUESTED',
            CASE WHEN _pay IS NOT NULL THEN 'CAPTURED' ELSE 'UNPAID' END,
            _pay, _key, auth.uid())
    RETURNING id INTO _id;
    INSERT INTO public.audit_log (actor_user_id, partner_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), _org, 'APPOINTMENT_BOOK', 'care_appointments', _id::text,
      jsonb_build_object('patient_id', _patient, 'service_version_id', _sv.id,
        'starts_at', _start, 'ends_at', _end, 'payment_id', _pay,
        'entitlement', _ent->>'reason'));
    RETURN jsonb_build_object('id', _id, 'state', 'REQUESTED');
  END IF;

  -- Transition ops
  SELECT * INTO _appt FROM public.care_appointments WHERE id = (_args->>'id')::uuid;
  IF _appt.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (public.care_ops_scope(_appt.partner_id, auth.uid()) OR public.care_super(auth.uid())) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF _op = 'CONFIRM' THEN
    _doc := NULLIF(_args->>'doctor_id','')::uuid;
    IF _doc IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.doctors d WHERE d.id = _doc AND d.status = 'ACTIVE'
        AND (d.license_expires_on IS NULL OR d.license_expires_on > CURRENT_DATE)
    ) THEN RAISE EXCEPTION 'DOCTOR_NOT_ACTIVE'; END IF;
    UPDATE public.care_appointments SET state = 'CONFIRMED', doctor_id = COALESCE(_doc, doctor_id)
    WHERE id = _appt.id;
  ELSIF _op = 'CANCEL' THEN
    -- Single UPDATE to the terminal state (the guard forbids later writes),
    -- then release the hold; both share one transaction, so a release failure
    -- rolls the cancellation back too.
    UPDATE public.care_appointments SET state = 'CANCELLED',
      cancellation_reason = _args->>'reason',
      payment_state = CASE WHEN payment_state = 'RESERVED' THEN 'RELEASED' ELSE payment_state END
    WHERE id = _appt.id;
    IF _appt.payment_state = 'RESERVED' THEN
      -- Release is operations/platform only; the staff caller is the actor.
      _settle := public.care_personal_command('RELEASE',
        jsonb_build_object('appointment_id', _appt.id),
        public.care_derived_key('care-appt-release', _appt.id), auth.uid());
    END IF;
  ELSIF _op = 'COMPLETE' THEN
    IF _appt.payment_state = 'RESERVED' THEN
      -- Capture requires the assigned, active, licensed doctor as actor (0038).
      -- Resolve the doctor server-side; never trust a client-supplied actor.
      SELECT d.auth_user_id INTO _doc_user FROM public.doctors d
      WHERE d.id = _appt.doctor_id AND d.status = 'ACTIVE'
        AND (d.license_expires_on IS NULL OR d.license_expires_on >= now()::date);
      IF _doc_user IS NULL THEN RAISE EXCEPTION 'ASSIGNED_DOCTOR_REQUIRED'; END IF;
      -- State must be COMPLETED before the ledger capture validates it; the
      -- whole command is one transaction, so a capture failure rolls both back.
      UPDATE public.care_appointments SET state = 'COMPLETED', payment_state = 'CAPTURED'
      WHERE id = _appt.id;
      _settle := public.care_personal_command('CAPTURE',
        jsonb_build_object('appointment_id', _appt.id),
        public.care_derived_key('care-appt-capture', _appt.id), _doc_user);
    ELSE
      UPDATE public.care_appointments SET state = 'COMPLETED' WHERE id = _appt.id;
    END IF;
  ELSIF _op = 'NO_SHOW' THEN
    UPDATE public.care_appointments SET state = 'NO_SHOW',
      payment_state = CASE WHEN payment_state = 'RESERVED' THEN 'RELEASED' ELSE payment_state END
    WHERE id = _appt.id;
    IF _appt.payment_state = 'RESERVED' THEN
      _settle := public.care_personal_command('RELEASE',
        jsonb_build_object('appointment_id', _appt.id),
        public.care_derived_key('care-appt-release', _appt.id), auth.uid());
    END IF;
  ELSE
    RAISE EXCEPTION 'UNKNOWN_OPERATION';
  END IF;

  INSERT INTO public.audit_log (actor_user_id, partner_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), _appt.partner_id, 'APPOINTMENT_' || _op, 'care_appointments', _appt.id::text,
    jsonb_build_object('op', _op, 'doctor_id', _appt.doctor_id, 'settlement', _settle));
  RETURN jsonb_build_object('id', _appt.id, 'op', _op);
END $$;
GRANT EXECUTE ON FUNCTION public.care_appointment_command(text, jsonb, text) TO authenticated;
