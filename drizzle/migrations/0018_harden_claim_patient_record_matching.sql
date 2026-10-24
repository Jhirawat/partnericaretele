CREATE OR REPLACE FUNCTION public.claim_patient_record(_external_patient_id text)
RETURNS patients
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.patients;
  _ref text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  _ref := upper(btrim(_external_patient_id));

  -- Already linked to this account? Return the record instead of failing.
  SELECT * INTO _row FROM public.patients
  WHERE upper(external_patient_id) = _ref AND auth_user_id = auth.uid();
  IF FOUND THEN
    RETURN _row;
  END IF;

  UPDATE public.patients
  SET auth_user_id = auth.uid()
  WHERE upper(external_patient_id) = _ref
    AND auth_user_id IS NULL
  RETURNING * INTO _row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no unclaimed record with that patient reference';
  END IF;

  RETURN _row;
END;
$function$;