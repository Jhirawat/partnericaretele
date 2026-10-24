-- Phase 11: private video rooms for appointments.
-- The video_state column already exists (0036). This migration adds room
-- coordinates and a single trusted command for video transitions.
-- Fail closed: without a configured video provider the server function never
-- calls OPEN, so no room URL is ever stored and no join link renders.
-- Additive only; nothing activated.

ALTER TABLE public.care_appointments
  ADD COLUMN IF NOT EXISTS video_room_name text,
  ADD COLUMN IF NOT EXISTS video_room_url text;

-- Room coordinates are write-protected: only the trusted command may set them.
CREATE OR REPLACE FUNCTION public.care_video_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.video_state IS DISTINCT FROM OLD.video_state
    OR NEW.video_room_name IS DISTINCT FROM OLD.video_room_name
    OR NEW.video_room_url IS DISTINCT FROM OLD.video_room_url
  ) AND current_setting('care.video_command', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'VIDEO_COMMAND_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS care_video_guard ON public.care_appointments;
CREATE TRIGGER care_video_guard BEFORE UPDATE ON public.care_appointments
  FOR EACH ROW EXECUTE FUNCTION public.care_video_guard();

-- Trusted video command. Ops:
--   OPEN  {id, room_name, room_url}  CONFIRMED appointment, video NONE/FAILED -> READY
--   END   {id}                        READY -> ENDED (keeps room name for audit, clears URL)
--   FAIL  {id}                        NONE/REQUESTED/READY -> FAILED
-- Caller must be the assigned doctor, partner staff of the appointment's
-- organisation, or platform staff. The patient never opens rooms.
CREATE OR REPLACE FUNCTION public.care_video_command(_op text, _args jsonb, _key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id uuid := (_args->>'id')::uuid;
  _a public.care_appointments;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO _a FROM public.care_appointments WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF NOT (
    public.is_platform_staff(_uid)
    OR public.belongs_to_partner(_uid, _a.partner_id)
    OR EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = _a.doctor_id AND d.auth_user_id = _uid)
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  PERFORM set_config('care.video_command', 'on', true);

  IF _op = 'OPEN' THEN
    IF _a.state <> 'CONFIRMED' THEN RAISE EXCEPTION 'APPOINTMENT_NOT_CONFIRMED'; END IF;
    IF _a.video_state NOT IN ('NONE','FAILED') THEN RAISE EXCEPTION 'VIDEO_ALREADY_OPEN'; END IF;
    IF _args->>'room_name' IS NULL OR _args->>'room_url' IS NULL THEN
      RAISE EXCEPTION 'ROOM_REQUIRED';
    END IF;
    UPDATE public.care_appointments
      SET video_state = 'READY',
          video_room_name = _args->>'room_name',
          video_room_url = _args->>'room_url',
          updated_at = now()
      WHERE id = _id;
  ELSIF _op = 'END' THEN
    IF _a.video_state <> 'READY' THEN RAISE EXCEPTION 'VIDEO_NOT_READY'; END IF;
    UPDATE public.care_appointments
      SET video_state = 'ENDED', video_room_url = NULL, updated_at = now()
      WHERE id = _id;
  ELSIF _op = 'FAIL' THEN
    IF _a.video_state NOT IN ('NONE','REQUESTED','READY') THEN
      RAISE EXCEPTION 'VIDEO_STATE_INVALID';
    END IF;
    UPDATE public.care_appointments
      SET video_state = 'FAILED', video_room_url = NULL, updated_at = now()
      WHERE id = _id;
  ELSE
    RAISE EXCEPTION 'UNKNOWN_OP';
  END IF;

  INSERT INTO public.audit_log (partner_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (_a.partner_id, _uid, 'APPOINTMENT_VIDEO_' || _op, 'care_appointments', _id,
          jsonb_build_object('key', _key, 'video_state',
            (SELECT video_state FROM public.care_appointments WHERE id = _id)));

  RETURN jsonb_build_object('id', _id, 'op', _op, 'video_state',
    (SELECT video_state FROM public.care_appointments WHERE id = _id));
END;
$$;

REVOKE ALL ON FUNCTION public.care_video_command(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.care_video_command(text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.care_video_command(text, jsonb, text) TO service_role;
