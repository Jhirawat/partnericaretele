-- Phase 04: explicit time-bounded doctor<->patient care relationships with revocation.
-- Additive only. Clinical access previously derived solely from consultation assignment;
-- this adds an explicit, auditable relationship layer with narrow permissions.

CREATE TABLE public.care_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id),
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX care_relationships_patient_idx ON public.care_relationships (patient_id);
CREATE INDEX care_relationships_doctor_idx ON public.care_relationships (doctor_id);

GRANT SELECT ON public.care_relationships TO authenticated;
GRANT ALL ON public.care_relationships TO service_role;
ALTER TABLE public.care_relationships ENABLE ROW LEVEL SECURITY;

-- Narrow read: platform admin, managing partner staff of the owning org, the doctor
-- themselves, or the patient themselves. No other tenant visibility.
CREATE POLICY care_relationships_read ON public.care_relationships FOR SELECT TO authenticated
  USING (
    public.care_super(auth.uid())
    OR public.can_manage_partner(auth.uid(), partner_id)
    OR EXISTS (SELECT 1 FROM public.doctors d WHERE d.id = doctor_id AND d.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.auth_user_id = auth.uid())
  );
-- No direct INSERT/UPDATE/DELETE for authenticated: mutations go through the
-- audited server commands below (service_role / SECURITY DEFINER path).

-- Cross-tenant guard: relationship partner must be the patient's owning partner,
-- and the doctor must be approved/ACTIVE with a valid license at grant time.
CREATE OR REPLACE FUNCTION public.care_relationship_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = NEW.patient_id AND p.partner_id = NEW.partner_id) THEN
    RAISE EXCEPTION 'CROSS_TENANT_RELATIONSHIP';
  END IF;
  IF TG_OP = 'INSERT' AND NOT EXISTS (
    SELECT 1 FROM public.doctors d WHERE d.id = NEW.doctor_id AND d.status = 'ACTIVE'
      AND (d.license_expires_on IS NULL OR d.license_expires_on >= current_date)
  ) THEN
    RAISE EXCEPTION 'DOCTOR_NOT_ACTIVE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER care_relationship_guard BEFORE INSERT OR UPDATE ON public.care_relationships
  FOR EACH ROW EXECUTE FUNCTION public.care_relationship_guard();

-- Clinical access now ALSO honours an active, unrevoked, in-window relationship.
CREATE OR REPLACE FUNCTION public.care_clinical_access(_c uuid, _u uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM consultations c
    JOIN patients p ON p.id = c.patient_id
    LEFT JOIN doctors d ON d.id = c.assigned_doctor_id
    WHERE c.id = _c AND (
      p.auth_user_id = _u
      OR (d.auth_user_id = _u AND is_active_doctor(_u))
      OR EXISTS (
        SELECT 1 FROM public.care_relationships r
        JOIN public.doctors rd ON rd.id = r.doctor_id
        WHERE r.patient_id = c.patient_id AND rd.auth_user_id = _u
          AND r.revoked_at IS NULL AND r.valid_from <= now()
          AND (r.valid_until IS NULL OR r.valid_until > now())
          AND public.is_active_doctor(_u)
      )
    )
  )
$$;

-- Audited grant command: platform admin or managing partner staff of the patient's org,
-- with MFA step-up. Verified actor from auth.uid(); no client-supplied actor.
CREATE OR REPLACE FUNCTION public.care_grant_relationship(_patient uuid, _doctor uuid, _valid_until timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid; _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
  SELECT partner_id INTO _org FROM public.patients WHERE id = _patient;
  IF _org IS NULL THEN RAISE EXCEPTION 'PATIENT_NOT_FOUND'; END IF;
  IF NOT (public.care_super(auth.uid()) OR public.can_manage_partner(auth.uid(), _org)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  PERFORM public.care_require_strong();
  INSERT INTO public.care_relationships (patient_id, doctor_id, partner_id, valid_until, granted_by)
  VALUES (_patient, _doctor, _org, _valid_until, auth.uid()) RETURNING id INTO _id;
  INSERT INTO public.audit_log (actor_user_id, partner_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), _org, 'CARE_RELATIONSHIP_GRANT', 'care_relationships', _id::text,
    jsonb_build_object('patient_id', _patient, 'doctor_id', _doctor, 'valid_until', _valid_until));
  RETURN _id;
END $$;

-- Audited revocation command, same authorization.
CREATE OR REPLACE FUNCTION public.care_revoke_relationship(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
  SELECT partner_id INTO _org FROM public.care_relationships WHERE id = _id AND revoked_at IS NULL;
  IF _org IS NULL THEN RAISE EXCEPTION 'RELATIONSHIP_NOT_FOUND'; END IF;
  IF NOT (public.care_super(auth.uid()) OR public.can_manage_partner(auth.uid(), _org)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  PERFORM public.care_require_strong();
  UPDATE public.care_relationships SET revoked_at = now(), revoke_reason = _reason WHERE id = _id;
  INSERT INTO public.audit_log (actor_user_id, partner_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), _org, 'CARE_RELATIONSHIP_REVOKE', 'care_relationships', _id::text,
    jsonb_build_object('reason', _reason));
END $$;

GRANT EXECUTE ON FUNCTION public.care_grant_relationship(uuid, uuid, timestamptz),
  public.care_revoke_relationship(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.care_relationship_guard() FROM PUBLIC, anon, authenticated;
