-- Master Workflow Phase 1. Additive; no patient or economic records are changed.
CREATE TABLE public.partner_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id uuid NOT NULL,
 organization_type text NOT NULL DEFAULT 'CLINIC' CHECK (organization_type IN ('CLINIC','HEALTH_ESTABLISHMENT','MEDICAL_SERVICE')),
 form jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','NEED_MORE_DOCUMENTS','APPROVED','ACTIVE','REJECTED','SUSPENDED')),
 scope_partner_id uuid REFERENCES public.partners(id), partner_id uuid UNIQUE REFERENCES public.partners(id),
 reason text, reviewer uuid, reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_user_id)
);
GRANT SELECT ON public.partner_applications TO authenticated;
GRANT ALL ON public.partner_applications TO service_role;
ALTER TABLE public.partner_applications ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.partner_application_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES public.partner_applications(id),
 document_type text NOT NULL CHECK(length(document_type) BETWEEN 1 AND 120), primary_license boolean NOT NULL DEFAULT false,
 object_path text NOT NULL UNIQUE, file_name text NOT NULL CHECK(length(file_name) BETWEEN 1 AND 200),
 issue_date date NOT NULL, expiry_date date, review_status text NOT NULL DEFAULT 'PENDING' CHECK(review_status IN ('PENDING','ACCEPTED','NEED_MORE_INFO','REJECTED')),
 reviewer uuid, reviewed_at timestamptz, reason text, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partner_application_documents TO authenticated;
GRANT ALL ON public.partner_application_documents TO service_role;
ALTER TABLE public.partner_application_documents ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.partner_application_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES public.partner_applications(id), actor_user_id uuid NOT NULL,
 action text NOT NULL, from_state text, to_state text, reason text, context jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partner_application_events TO authenticated;
GRANT ALL ON public.partner_application_events TO service_role;
ALTER TABLE public.partner_application_events ENABLE ROW LEVEL SECURITY;
-- Only explicitly global staff rows confer global access.
CREATE OR REPLACE FUNCTION public.is_platform_staff(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND status='ACTIVE' AND partner_id IS NULL AND role IN ('SUPER_ADMIN','OPERATIONS_ADMIN','FINANCE_ADMIN','COMPLIANCE_AUDITOR'))
$$;
CREATE OR REPLACE FUNCTION public.can_write_platform(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND status='ACTIVE' AND partner_id IS NULL AND role IN ('SUPER_ADMIN','OPERATIONS_ADMIN'))
$$;
CREATE FUNCTION public.partner_review_scope(_u uuid,_p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT can_write_platform(_u) OR EXISTS(SELECT 1 FROM user_roles WHERE user_id=_u AND role='OPERATIONS_ADMIN' AND status='ACTIVE' AND partner_id=_p)
$$;
CREATE FUNCTION public.partner_workspace_enabled(_p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM partner_applications WHERE partner_id=_p AND status NOT IN ('APPROVED','ACTIVE'))
$$;
CREATE OR REPLACE FUNCTION public.belongs_to_partner(_user_id uuid,_partner_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT partner_workspace_enabled(_partner_id) AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND status='ACTIVE' AND partner_id=_partner_id AND role<>'DOCTOR')
$$;
CREATE OR REPLACE FUNCTION public.can_manage_partner(_user_id uuid,_partner_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT partner_workspace_enabled(_partner_id) AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND status='ACTIVE' AND partner_id=_partner_id AND role IN ('PARTNER_OWNER','PARTNER_MANAGER'))
$$;
CREATE OR REPLACE FUNCTION public.can_read_partner(_user_id uuid,_partner_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT is_platform_staff(_user_id) OR partner_review_scope(_user_id,_partner_id) OR belongs_to_partner(_user_id,_partner_id)
$$;
CREATE FUNCTION public.partner_application_access(_id uuid,_u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM partner_applications WHERE id=_id AND (owner_user_id=_u OR partner_review_scope(_u,scope_partner_id)))
$$;
CREATE POLICY application_read ON public.partner_applications FOR SELECT TO authenticated USING(owner_user_id=auth.uid() OR partner_review_scope(auth.uid(),scope_partner_id));
CREATE POLICY application_document_read ON public.partner_application_documents FOR SELECT TO authenticated USING(partner_application_access(application_id,auth.uid()));
CREATE POLICY application_event_read ON public.partner_application_events FOR SELECT TO authenticated USING(partner_application_access(application_id,auth.uid()));
-- Keep old organizations intact; tighten broad operational access and exclude doctor tenant-wide access.
ALTER POLICY "partners visible to members and staff" ON public.partners USING(can_read_partner(auth.uid(),id));
ALTER POLICY "partners updated by platform or owner" ON public.partners USING(partner_review_scope(auth.uid(),id) OR can_manage_partner(auth.uid(),id)) WITH CHECK(partner_review_scope(auth.uid(),id) OR can_manage_partner(auth.uid(),id));
ALTER POLICY "manage locations" ON public.locations WITH CHECK(partner_review_scope(auth.uid(),partner_id) OR can_manage_partner(auth.uid(),partner_id));
ALTER POLICY "update locations" ON public.locations USING(partner_review_scope(auth.uid(),partner_id) OR can_manage_partner(auth.uid(),partner_id)) WITH CHECK(partner_review_scope(auth.uid(),partner_id) OR can_manage_partner(auth.uid(),partner_id));
ALTER POLICY "doctors readable by signed-in users" ON public.doctors USING(auth_user_id=auth.uid() OR partner_review_scope(auth.uid(),location_partner(location_id)));
ALTER POLICY "platform admins manage doctors" ON public.doctors USING(partner_review_scope(auth.uid(),location_partner(location_id))) WITH CHECK(partner_review_scope(auth.uid(),location_partner(location_id)));
CREATE OR REPLACE FUNCTION public.care_doctor_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF current_user IN ('authenticated','anon') AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id OR NEW.license_number IS DISTINCT FROM OLD.license_number OR NEW.license_expires_on IS DISTINCT FROM OLD.license_expires_on OR NEW.location_id IS DISTINCT FROM OLD.location_id OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at) THEN
  IF NOT partner_review_scope(auth.uid(),location_partner(NEW.location_id)) OR (TG_OP='UPDATE' AND NOT partner_review_scope(auth.uid(),location_partner(OLD.location_id))) THEN RAISE EXCEPTION 'SUPER_ADMIN_REQUIRED'; END IF;
  PERFORM care_require_strong();
 END IF; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.doctors_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT partner_review_scope(auth.uid(),location_partner(NEW.location_id)) AND auth.uid() IS NOT NULL THEN
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.license_number IS DISTINCT FROM OLD.license_number OR NEW.license_expires_on IS DISTINCT FROM OLD.license_expires_on OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id OR NEW.location_id IS DISTINCT FROM OLD.location_id OR NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN RAISE EXCEPTION 'DOCTOR_FIELDS_ADMIN_ONLY'; END IF;
 END IF; NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE FUNCTION public.partner_approval_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF current_user IN ('authenticated','anon') AND EXISTS(SELECT 1 FROM partner_applications WHERE partner_id=OLD.id) AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.id IS DISTINCT FROM OLD.id) THEN RAISE EXCEPTION 'USE_PARTNER_APPLICATION_COMMAND'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER partner_approval_guard BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.partner_approval_guard();
CREATE FUNCTION public.partner_application_command(_op text,_id uuid DEFAULT NULL,_args jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a partner_applications; d partner_application_documents; u uuid:=auth.uid(); oldstate text; p uuid; loc uuid; v_reason text:=nullif(btrim(_args->>'reason'),''); f jsonb; path text;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF _op='CREATE' THEN
  INSERT INTO partner_applications(owner_user_id) VALUES(u) ON CONFLICT(owner_user_id) DO NOTHING;
  SELECT * INTO a FROM partner_applications WHERE owner_user_id=u FOR UPDATE;
  RETURN to_jsonb(a);
 END IF;
 SELECT * INTO a FROM partner_applications WHERE id=_id FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF NOT partner_application_access(a.id,u) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 oldstate:=a.status;
 IF _op IN ('SAVE','DOCUMENT','SUBMIT') THEN
  IF a.owner_user_id<>u THEN RAISE EXCEPTION 'OWNER_REQUIRED'; END IF;
  IF a.status NOT IN ('DRAFT','NEED_MORE_DOCUMENTS','REJECTED') THEN
   IF _op='SUBMIT' AND a.status='SUBMITTED' THEN RETURN to_jsonb(a); END IF;
   RAISE EXCEPTION 'APPLICATION_LOCKED';
  END IF;
  IF _op='SAVE' THEN
   f:=_args->'form';
   IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR length(f::text)>6000 OR EXISTS(SELECT 1 FROM jsonb_object_keys(f) k WHERE k NOT IN ('organizationName','ownerName','email','phone','branchName','address','city','countryCode')) OR EXISTS(SELECT 1 FROM jsonb_each(f) kv WHERE jsonb_typeof(kv.value)<>'string' OR length(kv.value#>>'{}')>500) THEN RAISE EXCEPTION 'INVALID_FORM'; END IF;
   UPDATE partner_applications SET form=f,organization_type=_args->>'organizationType',updated_at=now() WHERE id=a.id;
  ELSIF _op='DOCUMENT' THEN
   path:=_args->>'objectPath';
   IF path IS NULL OR path !~ ('^'||a.id::text||'/[a-f0-9-]+\.(pdf|png|jpg)$') OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='partner-applications' AND name=path) THEN RAISE EXCEPTION 'DOCUMENT_UPLOAD_REQUIRED'; END IF;
   IF nullif(btrim(_args->>'documentType'),'') IS NULL OR nullif(btrim(_args->>'fileName'),'') IS NULL OR (_args->>'issueDate') IS NULL THEN RAISE EXCEPTION 'INVALID_DOCUMENT'; END IF;
   IF (_args->>'issueDate')::date>current_date OR ((_args->>'expiryDate') IS NOT NULL AND (_args->>'expiryDate')::date<(_args->>'issueDate')::date) THEN RAISE EXCEPTION 'INVALID_DOCUMENT_DATES'; END IF;
   INSERT INTO partner_application_documents(application_id,document_type,primary_license,object_path,file_name,issue_date,expiry_date) VALUES(a.id,_args->>'documentType',coalesce((_args->>'primaryLicense')::boolean,false),path,_args->>'fileName',(_args->>'issueDate')::date,(_args->>'expiryDate')::date);
  ELSE
   IF EXISTS(SELECT 1 FROM unnest(ARRAY['organizationName','ownerName','email','phone','branchName','address','city','countryCode']) k WHERE nullif(btrim(a.form->>k),'') IS NULL) OR (a.form->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR (a.form->>'countryCode') !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'APPLICATION_INCOMPLETE'; END IF;
   IF NOT EXISTS(SELECT 1 FROM partner_application_documents WHERE application_id=a.id AND primary_license AND review_status NOT IN ('REJECTED','NEED_MORE_INFO') AND (expiry_date IS NULL OR expiry_date>=current_date) AND document_type=CASE WHEN a.organization_type='HEALTH_ESTABLISHMENT' THEN 'HEALTH_ESTABLISHMENT_LICENSE' ELSE 'HEALTHCARE_FACILITY_LICENSE' END) THEN RAISE EXCEPTION 'PRIMARY_LICENSE_REQUIRED'; END IF;
   UPDATE partner_applications SET status='SUBMITTED',reason=NULL,updated_at=now() WHERE id=a.id;
  END IF;
 ELSE
  IF _op='ACTIVATE' AND a.status='APPROVED' AND a.owner_user_id=u THEN NULL;
  ELSE
   IF NOT partner_review_scope(u,a.scope_partner_id) THEN RAISE EXCEPTION 'REVIEWER_REQUIRED'; END IF;
   PERFORM care_require_strong();
  END IF;
  IF length(coalesce(v_reason,''))>1000 THEN RAISE EXCEPTION 'INVALID_REASON'; END IF;
  IF _op='ASSIGN_SCOPE' THEN
   IF NOT can_write_platform(u) OR a.status IN ('APPROVED','ACTIVE','SUSPENDED') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
   UPDATE partner_applications SET scope_partner_id=(_args->>'scopePartnerId')::uuid,updated_at=now() WHERE id=a.id;
  ELSIF _op='REVIEW' THEN
   IF a.status<>'SUBMITTED' THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
   UPDATE partner_applications SET status='UNDER_REVIEW',reviewer=u,reviewed_at=now(),updated_at=now() WHERE id=a.id;
  ELSIF _op='REVIEW_DOCUMENT' THEN
   IF a.status<>'UNDER_REVIEW' THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
   SELECT * INTO d FROM partner_application_documents WHERE id=(_args->>'documentId')::uuid AND application_id=a.id FOR UPDATE;
   IF d.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
   IF (_args->>'reviewStatus') NOT IN ('ACCEPTED','NEED_MORE_INFO','REJECTED') OR ((_args->>'reviewStatus')<>'ACCEPTED' AND v_reason IS NULL) THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
   UPDATE partner_application_documents SET review_status=_args->>'reviewStatus',reason=v_reason,reviewer=u,reviewed_at=now() WHERE id=d.id;
  ELSIF _op IN ('REQUEST_DOCUMENTS','REJECT') THEN
   IF a.status NOT IN ('SUBMITTED','UNDER_REVIEW') THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
   IF v_reason IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
   UPDATE partner_applications SET status=CASE WHEN _op='REJECT' THEN 'REJECTED' ELSE 'NEED_MORE_DOCUMENTS' END,reason=v_reason,reviewer=u,reviewed_at=now(),updated_at=now() WHERE id=a.id;
  ELSIF _op='APPROVE' THEN
   IF a.status IN ('APPROVED','ACTIVE') THEN RETURN to_jsonb(a); END IF;
   IF a.status<>'UNDER_REVIEW' THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
   IF NOT EXISTS(SELECT 1 FROM partner_application_documents WHERE application_id=a.id AND primary_license AND review_status='ACCEPTED' AND (expiry_date IS NULL OR expiry_date>=current_date) AND document_type=CASE WHEN a.organization_type='HEALTH_ESTABLISHMENT' THEN 'HEALTH_ESTABLISHMENT_LICENSE' ELSE 'HEALTHCARE_FACILITY_LICENSE' END) OR EXISTS(SELECT 1 FROM partner_application_documents WHERE application_id=a.id AND review_status='PENDING') THEN RAISE EXCEPTION 'DOCUMENT_REVIEW_REQUIRED'; END IF;
   INSERT INTO partners(partner_code,legal_name,display_name,status,country_code,email,phone,address,branch_name) VALUES('APP-'||replace(a.id::text,'-',''),a.form->>'organizationName',a.form->>'organizationName','ACTIVE',a.form->>'countryCode',a.form->>'email',a.form->>'phone',a.form->>'address',a.form->>'branchName') RETURNING id INTO p;
   INSERT INTO locations(partner_id,code,name,address,city,country_code) VALUES(p,'MAIN',a.form->>'branchName',a.form->>'address',a.form->>'city',a.form->>'countryCode') RETURNING id INTO loc;
   UPDATE partners SET default_location_id=loc WHERE id=p;
   INSERT INTO user_roles(user_id,role,partner_id,status) VALUES(a.owner_user_id,'PARTNER_OWNER',p,'ACTIVE');
   UPDATE partner_applications SET status='APPROVED',partner_id=p,reason=v_reason,reviewer=u,reviewed_at=now(),updated_at=now() WHERE id=a.id;
  ELSIF _op='ACTIVATE' THEN
   IF a.status='ACTIVE' THEN RETURN to_jsonb(a); END IF;
   IF a.status NOT IN ('APPROVED','SUSPENDED') OR (a.status='SUSPENDED' AND NOT partner_review_scope(u,a.scope_partner_id)) THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
   UPDATE partner_applications SET status='ACTIVE',reason=v_reason,updated_at=now() WHERE id=a.id;
   UPDATE partners SET status='ACTIVE' WHERE id=a.partner_id;
  ELSIF _op='SUSPEND' THEN
   IF a.status='SUSPENDED' THEN RETURN to_jsonb(a); END IF;
   IF a.status NOT IN ('APPROVED','ACTIVE') THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
   IF v_reason IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
   UPDATE partner_applications SET status='SUSPENDED',reason=v_reason,reviewer=u,reviewed_at=now(),updated_at=now() WHERE id=a.id;
   UPDATE partners SET status='SUSPENDED' WHERE id=a.partner_id;
  ELSE RAISE EXCEPTION 'UNKNOWN_OPERATION'; END IF;
 END IF;
 SELECT * INTO a FROM partner_applications WHERE id=a.id;
 INSERT INTO partner_application_events(application_id,actor_user_id,action,from_state,to_state,reason,context) VALUES(a.id,u,_op,oldstate,a.status,v_reason,jsonb_build_object('document_id',d.id,'scope_partner_id',a.scope_partner_id));
 INSERT INTO audit_log(actor_user_id,partner_id,action,entity_type,entity_id,metadata) VALUES(u,a.partner_id,'PARTNER_APPLICATION_'||_op,'partner_application',a.id,jsonb_build_object('from_state',oldstate,'to_state',a.status,'reason',v_reason,'document_id',d.id));
 RETURN to_jsonb(a);
END $$;
REVOKE ALL ON FUNCTION public.partner_application_command(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.partner_application_command(text,uuid,jsonb) TO authenticated;
CREATE POLICY partner_application_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='partner-applications' AND EXISTS(SELECT 1 FROM partner_applications a WHERE a.id::text=split_part(name,'/',1) AND a.owner_user_id=auth.uid() AND a.status IN ('DRAFT','NEED_MORE_DOCUMENTS','REJECTED')) AND name ~ '^[a-f0-9-]+/[a-f0-9-]+\.(pdf|png|jpg)$');
CREATE POLICY partner_application_file_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='partner-applications' AND EXISTS(SELECT 1 FROM partner_applications a WHERE a.id::text=split_part(name,'/',1) AND partner_application_access(a.id,auth.uid())));
REVOKE ALL ON FUNCTION public.partner_review_scope(uuid,uuid),public.partner_workspace_enabled(uuid),public.partner_application_access(uuid,uuid),public.partner_approval_guard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.partner_review_scope(uuid,uuid),public.partner_workspace_enabled(uuid),public.partner_application_access(uuid,uuid) TO authenticated,service_role;
CREATE FUNCTION public.partner_patient_case(_p uuid,_u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM consultations WHERE patient_id=_p AND care_clinical_access(id,_u))
$$;
REVOKE ALL ON FUNCTION public.partner_patient_case(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.partner_patient_case(uuid,uuid) TO authenticated,service_role;
ALTER POLICY "patients tenant read" ON public.patients USING(can_read_partner(auth.uid(),partner_id) OR auth_user_id=auth.uid() OR partner_patient_case(id,auth.uid()));
ALTER POLICY "consents readable" ON public.patient_consents USING(EXISTS(SELECT 1 FROM patients p WHERE p.id=patient_id AND (partner_review_scope(auth.uid(),p.partner_id) OR p.auth_user_id=auth.uid() OR belongs_to_partner(auth.uid(),p.partner_id) OR partner_patient_case(p.id,auth.uid()))));
CREATE OR REPLACE FUNCTION public.can_manage_location(_user_id uuid,_location_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT partner_review_scope(_user_id,location_partner(_location_id)) OR can_manage_partner(_user_id,location_partner(_location_id)) OR (partner_workspace_enabled(location_partner(_location_id)) AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND status='ACTIVE' AND role='LOCATION_MANAGER' AND partner_id=location_partner(_location_id)))
$$;
-- Branch before accessing table-specific records; SQL AND does not guarantee short-circuit evaluation.
CREATE OR REPLACE FUNCTION public.care_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF current_user IN ('authenticated','anon') THEN
  CASE TG_TABLE_NAME
   WHEN 'partners' THEN
    IF NEW.credit_balance IS DISTINCT FROM OLD.credit_balance OR NEW.care_credit_model IS DISTINCT FROM OLD.care_credit_model THEN RAISE EXCEPTION 'SERVER_LEDGER_ONLY'; END IF;
   WHEN 'consultations' THEN
    IF NEW.care_model OR (TG_OP='UPDATE' AND OLD.care_model) THEN RAISE EXCEPTION 'CARE_RPC_ONLY'; END IF;
   WHEN 'memberships' THEN
    IF NEW.care_terms IS NOT NULL OR (TG_OP='UPDATE' AND OLD.care_terms IS NOT NULL) THEN RAISE EXCEPTION 'CARE_RPC_ONLY'; END IF;
   WHEN 'credit_orders' THEN
    IF EXISTS(SELECT 1 FROM public.partners WHERE id=NEW.partner_id AND care_credit_model='LOTS_V1') THEN RAISE EXCEPTION 'CARE_RPC_ONLY'; END IF;
   ELSE NULL;
  END CASE;
 END IF; RETURN NEW;
END $$;
