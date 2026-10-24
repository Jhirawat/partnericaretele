-- Lets a signed-in patient link their own account to an existing unclaimed patient record.
-- The RLS UPDATE policy on patients only allows platform staff, partner staff, or the
-- already-linked auth user, so a patient can never claim a record whose auth_user_id is NULL.
-- This SECURITY DEFINER function performs that single, tightly-scoped claim atomically:
-- it only touches rows matching the given external_patient_id that are still unclaimed,
-- and only ever sets auth_user_id to the caller's own auth.uid().

CREATE OR REPLACE FUNCTION public.claim_patient_record(_external_patient_id TEXT)
RETURNS public.patients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.patients;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.patients
  SET auth_user_id = auth.uid()
  WHERE external_patient_id = upper(_external_patient_id)
    AND auth_user_id IS NULL
  RETURNING * INTO _row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no unclaimed record with that patient reference';
  END IF;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_patient_record(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_patient_record(TEXT) TO authenticated;