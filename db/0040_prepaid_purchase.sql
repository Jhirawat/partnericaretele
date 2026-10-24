-- Phase 08 (UI support): patient self-service prepaid package purchase.
-- Creates a PENDING care_payments row bound to an exact APPROVED, non-unlimited
-- care_plan_versions row. The plan binding lives in the trusted server snapshot
-- (snapshot.plan_version_id) so the later GRANT in care_personal_command can
-- verify payment <-> package without trusting any client input.
-- Additive only: no existing function, table or policy is changed.

CREATE OR REPLACE FUNCTION public.care_prepaid_purchase(_plan_version uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _u uuid := auth.uid();
  _p public.patients;
  _pv public.care_plan_versions;
  _terms public.care_terms;
  _id uuid;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;

  -- Patient self-scope only: the caller must own the patient record.
  SELECT * INTO _p FROM public.patients WHERE auth_user_id = _u LIMIT 1;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'PATIENT_NOT_LINKED'; END IF;
  IF _p.partner_id IS NULL THEN RAISE EXCEPTION 'PARTNER_CONTEXT_REQUIRED'; END IF;

  SELECT * INTO _pv FROM public.care_plan_versions WHERE id = _plan_version;
  IF _pv.id IS NULL OR _pv.status <> 'APPROVED' THEN RAISE EXCEPTION 'PLAN_NOT_APPROVED'; END IF;
  IF _pv.unlimited THEN RAISE EXCEPTION 'UNLIMITED_NOT_PREPAID'; END IF;
  IF _pv.price_minor IS NULL OR _pv.price_minor < 1 THEN RAISE EXCEPTION 'PLAN_NOT_PRICED'; END IF;

  SELECT * INTO _terms FROM public.care_terms WHERE active LIMIT 1;
  IF _terms.id IS NULL THEN RAISE EXCEPTION 'TERMS_NOT_ACTIVE'; END IF;

  INSERT INTO public.care_payments
    (partner_id, patient_id, kind, channel, collector, credits, amount_minor, terms_id, snapshot, created_by)
  VALUES
    (_p.partner_id, _p.id, 'DIRECT', 'DIRECT', 'THAIKANYA', NULL, _pv.price_minor, _terms.id,
     _terms.settings || jsonb_build_object(
       'version', _terms.version,
       'plan_version_id', _pv.id,
       'plan_code', _pv.plan_code,
       'plan_name', _pv.name,
       'prepaid', true),
     _u)
  RETURNING id INTO _id;

  RETURN jsonb_build_object(
    'id', _id,
    'amount_minor', _pv.price_minor,
    'currency', _pv.currency,
    'status', 'PENDING',
    'plan_version_id', _pv.id);
END $$;

REVOKE ALL ON FUNCTION public.care_prepaid_purchase(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.care_prepaid_purchase(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.care_prepaid_purchase(uuid) TO service_role;
