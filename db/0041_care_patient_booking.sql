-- Phase 09: patient self-service video-session booking.
-- Patients book their OWN appointments against an approved service version of
-- their own organisation. Funding must come from an existing entitlement
-- (active membership period or eligible prepaid lot) — no client-supplied
-- payment, plan, price or organisation is ever trusted. Staff still confirm,
-- assign the doctor and attach any direct payment via care_appointment_command.
-- Additive only; no existing function, table or policy is changed.

-- Safe catalog DTO for the caller's own patient organisation.
CREATE OR REPLACE FUNCTION public.care_my_catalog()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
  SELECT partner_id INTO _org FROM public.patients WHERE auth_user_id = auth.uid() LIMIT 1;
  IF _org IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN public.care_catalog(_org);
END $$;
REVOKE ALL ON FUNCTION public.care_my_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.care_my_catalog() TO authenticated;

-- Patient self-booking. Entitlement is evaluated server-side at the requested
-- start time; without one the booking is refused (staff can still book with a
-- verified payment through care_appointment_command).
CREATE OR REPLACE FUNCTION public.care_patient_book(
  _service_version uuid,
  _starts timestamptz,
  _ends timestamptz,
  _key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _patient record; _sv record; _ent jsonb; _id uuid;
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
         _patient.id, _sv.service_id, NULL, _patient.partner_id, 'THB', _sv.price_minor) e
     ) THEN
    RAISE EXCEPTION 'ENTITLEMENT_REQUIRED';
  END IF;

  INSERT INTO public.care_appointments
    (partner_id, patient_id, service_version_id, starts_at, ends_at, state,
     payment_state, idempotency_key, created_by)
  VALUES (_patient.partner_id, _patient.id, _sv.id, _starts, _ends, 'REQUESTED',
          'UNPAID', _key, auth.uid())
  RETURNING id INTO _id;

  INSERT INTO public.audit_log (actor_user_id, partner_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), _patient.partner_id, 'APPOINTMENT_PATIENT_BOOK', 'care_appointments', _id::text,
    jsonb_build_object('patient_id', _patient.id, 'service_version_id', _sv.id,
      'starts_at', _starts, 'ends_at', _ends, 'entitlement', _ent->>'reason'));

  RETURN jsonb_build_object('id', _id, 'state', 'REQUESTED');
END $$;
REVOKE ALL ON FUNCTION public.care_patient_book(uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.care_patient_book(uuid, timestamptz, timestamptz, text) TO authenticated;
