-- Phase 13: appointment-bound clinical notes with a lifecycle.
-- One note per appointment. The assigned, active, licensed doctor drafts while
-- the appointment is CONFIRMED (clinical_state IN_PROGRESS); FINALIZE locks the
-- note forever and moves clinical_state to COMPLETED. Final notes are
-- immutable (guard trigger), deletable by nobody, and every action is audited.
-- Reads are scoped: the patient, the assigned doctor, an active-relationship
-- doctor, the organisation's staff, or platform staff. Additive only.

CREATE TABLE public.care_clinical_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL UNIQUE REFERENCES public.care_appointments(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE RESTRICT,
  subjective text,
  objective text,
  assessment text,
  plan text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','FINAL')),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX care_clinical_notes_patient_idx ON public.care_clinical_notes (patient_id);
CREATE INDEX care_clinical_notes_partner_idx ON public.care_clinical_notes (partner_id);

GRANT SELECT ON public.care_clinical_notes TO authenticated;
GRANT ALL ON public.care_clinical_notes TO service_role;

ALTER TABLE public.care_clinical_notes ENABLE ROW LEVEL SECURITY;
-- Read scope: the patient, the assigned doctor, an active-relationship doctor,
-- the organisation's staff, or platform staff. No direct writes for anyone.
CREATE POLICY care_clinical_notes_read ON public.care_clinical_notes
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.patients p
            WHERE p.id = patient_id AND p.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.doctors d
               WHERE d.id = doctor_id AND d.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.care_relationships r
               JOIN public.doctors rd ON rd.id = r.doctor_id
               WHERE r.patient_id = patient_id AND rd.auth_user_id = auth.uid()
                 AND r.revoked_at IS NULL AND r.valid_from <= now()
                 AND (r.valid_until IS NULL OR r.valid_until > now()))
    OR public.care_ops_scope(partner_id, auth.uid())
    OR public.care_super(auth.uid())
  );

-- Final notes are immutable; notes are never deleted.
CREATE OR REPLACE FUNCTION public.care_clinical_note_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'CLINICAL_NOTE_IMMUTABLE'; END IF;
  IF OLD.status = 'FINAL' THEN RAISE EXCEPTION 'CLINICAL_NOTE_FINAL'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER care_clinical_note_guard BEFORE UPDATE OR DELETE ON public.care_clinical_notes
  FOR EACH ROW EXECUTE FUNCTION public.care_clinical_note_guard();
REVOKE ALL ON FUNCTION public.care_clinical_note_guard() FROM PUBLIC, anon, authenticated;

-- Resolve the caller's doctor row for an appointment: must be the assigned,
-- active, licensed doctor. Server-side only; never client-supplied.
CREATE OR REPLACE FUNCTION public.care_note_doctor(_appointment uuid, _uid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id FROM public.care_appointments a
  JOIN public.doctors d ON d.id = a.doctor_id
  WHERE a.id = _appointment AND d.auth_user_id = _uid AND d.status = 'ACTIVE'
    AND (d.license_expires_on IS NULL OR d.license_expires_on >= now()::date)
$$;
REVOKE ALL ON FUNCTION public.care_note_doctor(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.care_note_doctor(uuid, uuid) TO service_role;

-- Audited command entry: START / SAVE / FINALIZE.
CREATE OR REPLACE FUNCTION public.care_clinical_command(_op text, _args jsonb, _key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _appt record; _doc uuid; _note record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
  IF _key IS NULL OR _key !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;

  SELECT * INTO _appt FROM public.care_appointments WHERE id = (_args->>'appointment_id')::uuid;
  IF _appt.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  _doc := public.care_note_doctor(_appt.id, auth.uid());
  IF _doc IS NULL THEN RAISE EXCEPTION 'ASSIGNED_DOCTOR_REQUIRED'; END IF;

  IF _op = 'START' THEN
    IF _appt.state <> 'CONFIRMED' THEN RAISE EXCEPTION 'APPOINTMENT_NOT_CONFIRMED'; END IF;
    INSERT INTO public.care_clinical_notes
      (appointment_id, patient_id, partner_id, doctor_id, idempotency_key)
    VALUES (_appt.id, _appt.patient_id, _appt.partner_id, _doc, _key)
    RETURNING * INTO _note;
    UPDATE public.care_appointments SET clinical_state = 'IN_PROGRESS' WHERE id = _appt.id;
  ELSIF _op = 'SAVE' THEN
    SELECT * INTO _note FROM public.care_clinical_notes WHERE appointment_id = _appt.id;
    IF _note.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF _note.doctor_id <> _doc THEN RAISE EXCEPTION 'ASSIGNED_DOCTOR_REQUIRED'; END IF;
    UPDATE public.care_clinical_notes SET
      subjective = COALESCE(_args->>'subjective', subjective),
      objective = COALESCE(_args->>'objective', objective),
      assessment = COALESCE(_args->>'assessment', assessment),
      plan = COALESCE(_args->>'plan', plan)
    WHERE id = _note.id RETURNING * INTO _note;
  ELSIF _op = 'FINALIZE' THEN
    SELECT * INTO _note FROM public.care_clinical_notes WHERE appointment_id = _appt.id;
    IF _note.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF _note.doctor_id <> _doc THEN RAISE EXCEPTION 'ASSIGNED_DOCTOR_REQUIRED'; END IF;
    -- Apply the caller's current field values before locking, so edits made
    -- since the last SAVE are not silently discarded by finalizing.
    UPDATE public.care_clinical_notes SET
      subjective = COALESCE(_args->>'subjective', subjective),
      objective = COALESCE(_args->>'objective', objective),
      assessment = COALESCE(_args->>'assessment', assessment),
      plan = COALESCE(_args->>'plan', plan)
    WHERE id = _note.id RETURNING * INTO _note;
    IF COALESCE(_note.assessment, '') = '' OR COALESCE(_note.plan, '') = '' THEN
      RAISE EXCEPTION 'NOTE_INCOMPLETE';
    END IF;
    UPDATE public.care_clinical_notes SET status = 'FINAL' WHERE id = _note.id
    RETURNING * INTO _note;
    UPDATE public.care_appointments SET clinical_state = 'COMPLETED' WHERE id = _appt.id;
  ELSE
    RAISE EXCEPTION 'UNKNOWN_OPERATION';
  END IF;

  INSERT INTO public.audit_log (actor_user_id, partner_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), _appt.partner_id, 'CLINICAL_NOTE_' || _op, 'care_clinical_notes', _note.id::text,
    jsonb_build_object('appointment_id', _appt.id, 'patient_id', _appt.patient_id, 'op', _op));
  RETURN jsonb_build_object('id', _note.id, 'status', _note.status);
END $$;
REVOKE ALL ON FUNCTION public.care_clinical_command(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.care_clinical_command(text, jsonb, text) TO authenticated;

-- Scoped read DTO: the caller sees a note only within the read policy scope.
CREATE OR REPLACE FUNCTION public.care_clinical_read(_appointment uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _note record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
  SELECT * INTO _note FROM public.care_clinical_notes WHERE appointment_id = _appointment;
  IF _note.id IS NULL THEN RETURN NULL; END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM public.patients p
            WHERE p.id = _note.patient_id AND p.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.doctors d
               WHERE d.id = _note.doctor_id AND d.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.care_relationships r
               JOIN public.doctors rd ON rd.id = r.doctor_id
               WHERE r.patient_id = _note.patient_id AND rd.auth_user_id = auth.uid()
                 AND r.revoked_at IS NULL AND r.valid_from <= now()
                 AND (r.valid_until IS NULL OR r.valid_until > now()))
    OR public.care_ops_scope(_note.partner_id, auth.uid())
    OR public.care_super(auth.uid())
  ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN jsonb_build_object(
    'id', _note.id, 'appointment_id', _note.appointment_id,
    'patient_id', _note.patient_id, 'doctor_id', _note.doctor_id,
    'subjective', _note.subjective, 'objective', _note.objective,
    'assessment', _note.assessment, 'plan', _note.plan,
    'status', _note.status, 'updated_at', _note.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.care_clinical_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.care_clinical_read(uuid) TO authenticated;
