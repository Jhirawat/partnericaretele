-- Phase 15: appointment documents (doctor-issued visit summaries).
-- One document per appointment; DRAFT → ISSUED, immutable once issued, no
-- deletes. Issuing drives the appointment document_state to FINAL. All writes
-- go through care_document_command; every action is audit-logged.

CREATE TABLE IF NOT EXISTS public.care_appointment_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL UNIQUE REFERENCES public.care_appointments(id),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id),
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED')),
  idempotency_key text NOT NULL UNIQUE,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.care_appointment_documents TO authenticated;
GRANT ALL ON public.care_appointment_documents TO service_role;

ALTER TABLE public.care_appointment_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS care_appointment_documents_read ON public.care_appointment_documents;
CREATE POLICY care_appointment_documents_read ON public.care_appointment_documents
FOR SELECT TO authenticated
USING (
  public.care_patient_scope(patient_id, auth.uid())
  OR public.care_ops_scope(partner_id, auth.uid())
  OR public.care_platform(auth.uid())
  OR doctor_id = public.care_note_doctor(appointment_id, auth.uid())
);

-- No INSERT/UPDATE/DELETE policies: care_document_command is the only write path.

CREATE OR REPLACE FUNCTION public.care_appointment_document_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'DOCUMENT_IMMUTABLE'; END IF;
  IF OLD.status = 'ISSUED' THEN RAISE EXCEPTION 'DOCUMENT_IMMUTABLE'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS care_appointment_documents_guard ON public.care_appointment_documents;
CREATE TRIGGER care_appointment_documents_guard BEFORE UPDATE OR DELETE ON public.care_appointment_documents
FOR EACH ROW EXECUTE FUNCTION public.care_appointment_document_guard();

CREATE OR REPLACE FUNCTION public.care_document_command(_op text, _args jsonb, _key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _appt record; _doc uuid; _d record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
  IF _key IS NULL OR _key !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  SELECT * INTO _appt FROM public.care_appointments WHERE id = (_args->>'appointment_id')::uuid;
  IF _appt.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  _doc := public.care_note_doctor(_appt.id, auth.uid());
  IF _doc IS NULL THEN RAISE EXCEPTION 'ASSIGNED_DOCTOR_REQUIRED'; END IF;

  IF _op = 'DRAFT' THEN
    IF _appt.clinical_state <> 'COMPLETED' THEN RAISE EXCEPTION 'CLINICAL_NOT_COMPLETED'; END IF;
    IF COALESCE(_args->>'title', '') = '' OR COALESCE(_args->>'body', '') = '' THEN
      RAISE EXCEPTION 'DOCUMENT_INCOMPLETE';
    END IF;
    INSERT INTO public.care_appointment_documents
      (appointment_id, patient_id, partner_id, doctor_id, title, body, idempotency_key)
    VALUES (_appt.id, _appt.patient_id, _appt.partner_id, _doc,
      _args->>'title', _args->>'body', _key)
    RETURNING * INTO _d;
    UPDATE public.care_appointments SET document_state = 'DRAFT' WHERE id = _appt.id;
  ELSIF _op = 'SAVE' THEN
    SELECT * INTO _d FROM public.care_appointment_documents WHERE appointment_id = _appt.id;
    IF _d.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF _d.doctor_id <> _doc THEN RAISE EXCEPTION 'ASSIGNED_DOCTOR_REQUIRED'; END IF;
    UPDATE public.care_appointment_documents SET
      title = COALESCE(_args->>'title', title),
      body = COALESCE(_args->>'body', body),
      updated_at = now()
    WHERE id = _d.id RETURNING * INTO _d;
  ELSIF _op = 'ISSUE' THEN
    SELECT * INTO _d FROM public.care_appointment_documents WHERE appointment_id = _appt.id;
    IF _d.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF _d.doctor_id <> _doc THEN RAISE EXCEPTION 'ASSIGNED_DOCTOR_REQUIRED'; END IF;
    -- Apply any unsaved edits before locking so ISSUE never discards text
    -- the doctor typed since the last SAVE (same rule as clinical FINALIZE).
    UPDATE public.care_appointment_documents SET
      title = COALESCE(_args->>'title', title),
      body = COALESCE(_args->>'body', body),
      updated_at = now()
    WHERE id = _d.id RETURNING * INTO _d;
    IF COALESCE(_d.title, '') = '' OR COALESCE(_d.body, '') = '' THEN
      RAISE EXCEPTION 'DOCUMENT_INCOMPLETE';
    END IF;
    UPDATE public.care_appointment_documents SET status = 'ISSUED', issued_at = now(), updated_at = now()
    WHERE id = _d.id RETURNING * INTO _d;
    UPDATE public.care_appointments SET document_state = 'FINAL' WHERE id = _appt.id;
  ELSE
    RAISE EXCEPTION 'UNKNOWN_OPERATION';
  END IF;

  INSERT INTO public.audit_log (actor_user_id, partner_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), _appt.partner_id, 'DOCUMENT_' || _op, 'care_appointment_documents', _d.id::text,
    jsonb_build_object('appointment_id', _appt.id, 'patient_id', _appt.patient_id, 'op', _op));
  RETURN jsonb_build_object('id', _d.id, 'status', _d.status);
END $$;

REVOKE ALL ON FUNCTION public.care_document_command(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.care_document_command(text, jsonb, text) TO authenticated;

-- The 0036 guard rejected any update on a terminal-state appointment, which
-- also blocked document_state/clinical_state updates where state is unchanged.
-- Same-state updates (only side channels change) are always legal.
CREATE OR REPLACE FUNCTION public.care_appointment_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'APPOINTMENT_IMMUTABLE'; END IF;
  IF OLD.state IN ('COMPLETED','CANCELLED','NO_SHOW') AND NEW.state IS DISTINCT FROM OLD.state THEN
    RAISE EXCEPTION 'APPOINTMENT_TERMINAL';
  END IF;
  IF NEW.state IS NOT DISTINCT FROM OLD.state THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD.state = 'REQUESTED' AND NEW.state IN ('CONFIRMED','CANCELLED'))
    OR (OLD.state = 'CONFIRMED' AND NEW.state IN ('COMPLETED','CANCELLED','NO_SHOW'))
  ) THEN
    RAISE EXCEPTION 'APPOINTMENT_ILLEGAL_TRANSITION';
  END IF;
  RETURN NEW;
END $$;
