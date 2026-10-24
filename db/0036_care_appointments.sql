-- Phase 07: appointment state machine.
-- Independent appointment / payment / video / clinical / funding / document states.
-- Double-booking blocked by an exclusion constraint on the doctor's time range.
-- BOOK requires an entitled membership OR a verified payment; direct writes denied.
-- Additive only; existing consultations/bookings untouched. Nothing activated.

CREATE TABLE public.care_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  doctor_id uuid REFERENCES public.doctors(id),
  service_version_id uuid NOT NULL REFERENCES public.care_service_versions(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'REQUESTED'
    CHECK (state IN ('REQUESTED','CONFIRMED','CANCELLED','COMPLETED','NO_SHOW')),
  payment_state text NOT NULL DEFAULT 'UNPAID'
    CHECK (payment_state IN ('UNPAID','RESERVED','CAPTURED','RELEASED','REFUNDED')),
  video_state text NOT NULL DEFAULT 'NONE'
    CHECK (video_state IN ('NONE','REQUESTED','READY','ENDED','FAILED')),
  clinical_state text NOT NULL DEFAULT 'NONE'
    CHECK (clinical_state IN ('NONE','IN_PROGRESS','COMPLETED','LOCKED')),
  funding_state text NOT NULL DEFAULT 'NONE'
    CHECK (funding_state IN ('NONE','PENDING','FUNDED','FAILED')),
  document_state text NOT NULL DEFAULT 'NONE'
    CHECK (document_state IN ('NONE','DRAFT','FINAL')),
  payment_id uuid REFERENCES public.care_payments(id),
  cancellation_reason text,
  idempotency_key text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX care_appointments_org_idx ON public.care_appointments (partner_id, starts_at);
CREATE INDEX care_appointments_patient_idx ON public.care_appointments (patient_id);
-- No double-booking: one active appointment per doctor per time range.
ALTER TABLE public.care_appointments ADD CONSTRAINT care_appointments_no_overlap
  EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (doctor_id IS NOT NULL AND state IN ('REQUESTED','CONFIRMED'));
GRANT SELECT ON public.care_appointments TO authenticated;
GRANT ALL ON public.care_appointments TO service_role;
ALTER TABLE public.care_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY care_appointments_read ON public.care_appointments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = patient_id AND (
      p.auth_user_id = auth.uid() OR public.is_platform_staff(auth.uid())
      OR public.belongs_to_partner(auth.uid(), partner_id)
    )
  ));

-- State transition guard: only legal transitions; terminal states immutable.
CREATE OR REPLACE FUNCTION public.care_appointment_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'APPOINTMENT_IMMUTABLE'; END IF;
  IF OLD.state IN ('COMPLETED','CANCELLED','NO_SHOW') AND NEW.state IS DISTINCT FROM OLD.state THEN
    RAISE EXCEPTION 'APPOINTMENT_TERMINAL';
  END IF;
  IF NOT (
    (OLD.state = 'REQUESTED' AND NEW.state IN ('REQUESTED','CONFIRMED','CANCELLED'))
    OR (OLD.state = 'CONFIRMED' AND NEW.state IN ('CONFIRMED','COMPLETED','CANCELLED','NO_SHOW'))
  ) THEN
    RAISE EXCEPTION 'APPOINTMENT_ILLEGAL_TRANSITION';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER care_appointment_guard BEFORE UPDATE OR DELETE ON public.care_appointments
  FOR EACH ROW EXECUTE FUNCTION public.care_appointment_guard();
REVOKE ALL ON FUNCTION public.care_appointment_guard() FROM PUBLIC, anon, authenticated;

-- Audited command entry: BOOK / CONFIRM / CANCEL / COMPLETE / NO_SHOW.
CREATE OR REPLACE FUNCTION public.care_appointment_command(_op text, _args jsonb, _key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _patient uuid; _org uuid; _sv record; _doc uuid; _start timestamptz; _end timestamptz;
        _ent jsonb; _pay uuid; _id uuid; _appt record;
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
    UPDATE public.care_appointments SET state = 'CANCELLED',
      cancellation_reason = _args->>'reason' WHERE id = _appt.id;
  ELSIF _op = 'COMPLETE' THEN
    UPDATE public.care_appointments SET state = 'COMPLETED' WHERE id = _appt.id;
  ELSIF _op = 'NO_SHOW' THEN
    UPDATE public.care_appointments SET state = 'NO_SHOW' WHERE id = _appt.id;
  ELSE
    RAISE EXCEPTION 'UNKNOWN_OPERATION';
  END IF;

  INSERT INTO public.audit_log (actor_user_id, partner_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), _appt.partner_id, 'APPOINTMENT_' || _op, 'care_appointments', _appt.id::text,
    jsonb_build_object('op', _op, 'doctor_id', _appt.doctor_id));
  RETURN jsonb_build_object('id', _appt.id, 'op', _op);
END $$;
GRANT EXECUTE ON FUNCTION public.care_appointment_command(text, jsonb, text) TO authenticated;
