-- Phase 14: follow-up plans on appointments.
-- The assigned doctor schedules follow-ups; the patient, assigned doctor,
-- org staff and platform can read them. All writes go through
-- care_followup_command; cancel is terminal. Every action is audit-logged.

CREATE TABLE IF NOT EXISTS public.care_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.care_appointments(id),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id),
  due_at timestamptz NOT NULL,
  instructions text NOT NULL,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','DONE','CANCELLED')),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS care_followups_patient_idx ON public.care_followups (patient_id, due_at);

GRANT SELECT ON public.care_followups TO authenticated;
GRANT ALL ON public.care_followups TO service_role;

ALTER TABLE public.care_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS care_followups_read ON public.care_followups;
CREATE POLICY care_followups_read ON public.care_followups FOR SELECT TO authenticated
USING (
  public.care_patient_scope(patient_id, auth.uid())
  OR public.care_ops_scope(partner_id, auth.uid())
  OR public.care_platform(auth.uid())
  OR doctor_id = public.care_note_doctor(appointment_id, auth.uid())
);

-- No INSERT/UPDATE/DELETE policies: care_followup_command is the only write path.

CREATE OR REPLACE FUNCTION public.care_followup_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'FOLLOWUP_IMMUTABLE'; END IF;
  IF OLD.status IN ('DONE','CANCELLED') THEN RAISE EXCEPTION 'FOLLOWUP_TERMINAL'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS care_followups_guard ON public.care_followups;
CREATE TRIGGER care_followups_guard BEFORE UPDATE OR DELETE ON public.care_followups
FOR EACH ROW EXECUTE FUNCTION public.care_followup_guard();

CREATE OR REPLACE FUNCTION public.care_followup_command(_op text, _args jsonb, _key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _appt record; _doc uuid; _f record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
  IF _key IS NULL OR _key !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;

  IF _op = 'SCHEDULE' THEN
    SELECT * INTO _appt FROM public.care_appointments WHERE id = (_args->>'appointment_id')::uuid;
    IF _appt.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    _doc := public.care_note_doctor(_appt.id, auth.uid());
    IF _doc IS NULL THEN RAISE EXCEPTION 'ASSIGNED_DOCTOR_REQUIRED'; END IF;
    IF _appt.state <> 'COMPLETED' THEN RAISE EXCEPTION 'APPOINTMENT_NOT_COMPLETED'; END IF;
    IF (_args->>'due_at')::timestamptz <= now() THEN RAISE EXCEPTION 'DUE_AT_IN_PAST'; END IF;
    IF COALESCE(_args->>'instructions', '') = '' THEN RAISE EXCEPTION 'INSTRUCTIONS_REQUIRED'; END IF;
    INSERT INTO public.care_followups
      (appointment_id, patient_id, partner_id, doctor_id, due_at, instructions, idempotency_key)
    VALUES (_appt.id, _appt.patient_id, _appt.partner_id, _doc,
      (_args->>'due_at')::timestamptz, _args->>'instructions', _key)
    RETURNING * INTO _f;
  ELSIF _op IN ('DONE','CANCEL') THEN
    SELECT * INTO _f FROM public.care_followups WHERE id = (_args->>'id')::uuid;
    IF _f.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF public.care_note_doctor(_f.appointment_id, auth.uid()) IS DISTINCT FROM _f.doctor_id
       AND NOT public.care_ops_scope(_f.partner_id, auth.uid())
       AND NOT public.care_platform(auth.uid()) THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
    UPDATE public.care_followups
    SET status = CASE WHEN _op = 'DONE' THEN 'DONE' ELSE 'CANCELLED' END, updated_at = now()
    WHERE id = _f.id RETURNING * INTO _f;
  ELSE
    RAISE EXCEPTION 'UNKNOWN_OPERATION';
  END IF;

  INSERT INTO public.audit_log (actor_user_id, partner_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), _f.partner_id, 'FOLLOWUP_' || _op, 'care_followups', _f.id::text,
    jsonb_build_object('appointment_id', _f.appointment_id, 'patient_id', _f.patient_id, 'op', _op));
  RETURN jsonb_build_object('id', _f.id, 'status', _f.status);
END $$;

REVOKE ALL ON FUNCTION public.care_followup_command(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.care_followup_command(text, jsonb, text) TO authenticated;

-- care_note_doctor is a read-only STABLE definer lookup; the followups read
-- policy runs as the querying user, so authenticated needs EXECUTE.
GRANT EXECUTE ON FUNCTION public.care_note_doctor(uuid, uuid) TO authenticated;
