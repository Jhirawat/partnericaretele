-- Restrictive policies also constrain any older permissive storage policies.
CREATE POLICY care_storage_read_defence ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(bucket_id<>'care-documents' OR EXISTS(SELECT 1 FROM public.care_documents d WHERE d.object_path=name AND public.care_document_access(d.id,auth.uid())));
CREATE POLICY care_storage_anon_defence ON storage.objects AS RESTRICTIVE FOR SELECT TO anon USING(bucket_id<>'care-documents');
CREATE POLICY care_storage_insert_defence ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'care-documents' OR (public.is_active_doctor(auth.uid()) AND EXISTS(SELECT 1 FROM public.care_documents d WHERE d.object_path=name AND public.care_clinical_access(d.consultation_id,auth.uid()))));
CREATE POLICY care_storage_update_defence ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(bucket_id<>'care-documents') WITH CHECK(bucket_id<>'care-documents');
CREATE POLICY care_storage_delete_defence ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'care-documents');
CREATE FUNCTION public.care_doctor_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF current_user IN ('authenticated','anon') AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id OR NEW.license_number IS DISTINCT FROM OLD.license_number OR NEW.license_expires_on IS DISTINCT FROM OLD.license_expires_on) THEN
  IF NOT public.care_super(auth.uid()) THEN RAISE EXCEPTION 'SUPER_ADMIN_REQUIRED'; END IF;
  PERFORM public.care_require_strong();
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER care_doctor_approval_guard BEFORE INSERT OR UPDATE ON public.doctors FOR EACH ROW EXECUTE FUNCTION care_doctor_approval_guard();
CREATE FUNCTION public.care_patient_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF current_user IN ('authenticated','anon') AND (
  (TG_OP='UPDATE' AND (NEW.partner_id IS DISTINCT FROM OLD.partner_id OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id OR NEW.hn IS DISTINCT FROM OLD.hn OR NEW.mcs_patient_id IS DISTINCT FROM OLD.mcs_patient_id))
  OR (TG_OP='INSERT' AND (NEW.hn IS NOT NULL OR NEW.mcs_patient_id IS NOT NULL OR (NEW.auth_user_id IS NOT NULL AND NEW.auth_user_id<>auth.uid())))) THEN
  IF NOT public.care_super(auth.uid()) THEN RAISE EXCEPTION 'VERIFIED_IDENTITY_ADMIN_REQUIRED'; END IF;
  PERFORM public.care_require_strong();
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER care_patient_identity_guard BEFORE INSERT OR UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION care_patient_identity_guard();
