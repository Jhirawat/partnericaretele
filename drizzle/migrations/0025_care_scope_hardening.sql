CREATE FUNCTION public.care_encounter_scope(_id uuid,_u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM consultations c WHERE c.id=_id AND (care_finance(_u) OR care_platform(_u)
 OR can_manage_partner(_u,c.partner_id) OR care_clinical_access(c.id,_u)
 OR EXISTS(SELECT 1 FROM care_branch_permissions b WHERE b.user_id=_u AND b.location_id=c.care_location_id AND b.partner_id=c.partner_id AND b.queue_allowed)))
$$;
REVOKE ALL ON FUNCTION care_encounter_scope(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION care_encounter_scope(uuid,uuid) TO authenticated;
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='consultations' LOOP EXECUTE format('DROP POLICY %I ON public.consultations',p.policyname); END LOOP;
END $$;
CREATE POLICY care_encounter_read ON public.consultations FOR SELECT TO authenticated USING(
 (care_model AND care_encounter_scope(id,auth.uid())) OR
 (NOT care_model AND (is_platform_staff(auth.uid()) OR belongs_to_partner(auth.uid(),partner_id) OR care_clinical_access(id,auth.uid()))));
CREATE POLICY legacy_encounter_insert ON public.consultations FOR INSERT TO authenticated WITH CHECK(NOT care_model AND (care_platform(auth.uid()) OR belongs_to_partner(auth.uid(),partner_id)));
CREATE POLICY legacy_encounter_update ON public.consultations FOR UPDATE TO authenticated USING(NOT care_model AND (care_platform(auth.uid()) OR belongs_to_partner(auth.uid(),partner_id) OR (is_active_doctor(auth.uid()) AND care_clinical_access(id,auth.uid())))) WITH CHECK(NOT care_model AND (care_platform(auth.uid()) OR belongs_to_partner(auth.uid(),partner_id) OR (is_active_doctor(auth.uid()) AND care_clinical_access(id,auth.uid()))));
DROP POLICY care_hold_read ON public.care_holds;
CREATE POLICY care_hold_read ON public.care_holds FOR SELECT TO authenticated USING(care_encounter_scope(consultation_id,auth.uid()));
DROP POLICY care_usage_read ON public.care_annual_usage;
CREATE POLICY care_usage_read ON public.care_annual_usage FOR SELECT TO authenticated USING(care_encounter_scope(consultation_id,auth.uid()));
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='memberships' LOOP EXECUTE format('DROP POLICY %I ON public.memberships',p.policyname); END LOOP;
END $$;
CREATE POLICY care_member_read ON public.memberships FOR SELECT TO authenticated USING((care_terms IS NOT NULL AND care_patient_scope(patient_id,auth.uid())) OR (care_terms IS NULL AND (is_platform_staff(auth.uid()) OR EXISTS(SELECT 1 FROM patients p WHERE p.id=patient_id AND (p.auth_user_id=auth.uid() OR belongs_to_partner(auth.uid(),p.partner_id))))));
CREATE POLICY legacy_member_insert ON public.memberships FOR INSERT TO authenticated WITH CHECK(care_terms IS NULL AND care_platform(auth.uid()));
CREATE POLICY legacy_member_update ON public.memberships FOR UPDATE TO authenticated USING(care_terms IS NULL AND care_platform(auth.uid())) WITH CHECK(care_terms IS NULL AND care_platform(auth.uid()));

CREATE FUNCTION public.care_role_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF current_user IN ('authenticated','anon') THEN
  IF NOT public.care_super(auth.uid()) THEN RAISE EXCEPTION 'SUPER_ADMIN_REQUIRED'; END IF;
  PERFORM public.care_require_strong();
 END IF; IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER care_role_guard BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION care_role_guard();
-- Private helper is used by invoker trigger; it reveals no data and only rejects low assurance.
REVOKE ALL ON FUNCTION care_require_strong() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION care_require_strong() TO authenticated;

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='patient_consents' AND cmd='INSERT' LOOP EXECUTE format('DROP POLICY %I ON public.patient_consents',p.policyname); END LOOP;
END $$;
CREATE POLICY care_patient_consent_insert ON public.patient_consents FOR INSERT TO authenticated WITH CHECK(recorded_by=auth.uid() AND EXISTS(SELECT 1 FROM patients p WHERE p.id=patient_id AND p.auth_user_id=auth.uid()));
CREATE OR REPLACE FUNCTION public.consultation_consent_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.status::text='STARTED' AND OLD.status::text<>'STARTED' AND NOT COALESCE((SELECT accepted FROM patient_consents WHERE patient_id=NEW.patient_id AND consent_type='TELEMEDICINE' ORDER BY created_at DESC,id DESC LIMIT 1),false) THEN RAISE EXCEPTION 'PATIENT_CONSENT_REQUIRED'; END IF;
 RETURN NEW;
END $$;
