-- Additive staff security; no accounts or credentials are created.
DROP TRIGGER IF EXISTS profiles_bootstrap_super_admin ON public.profiles;
CREATE OR REPLACE FUNCTION public.bootstrap_first_super_admin() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.bootstrap_first_super_admin() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role AND status='ACTIVE' AND (_role<>'SUPER_ADMIN' OR partner_id IS NULL)) $$;
CREATE TABLE public.staff_security_state(user_id uuid PRIMARY KEY,reset_required boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.staff_security_state TO authenticated;
GRANT ALL ON public.staff_security_state TO service_role;
ALTER TABLE public.staff_security_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_security_self_read ON public.staff_security_state FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE OR REPLACE FUNCTION public.staff_security_audit(_action text,_state text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF _action NOT IN ('STAFF_ACCESS_DENIED','STAFF_MFA_REQUIRED','STAFF_RESET_REQUIRED','STAFF_PASSWORD_CHANGED') OR _state NOT IN ('DENIED','MFA_REQUIRED','RESET_REQUIRED','PASSWORD_CHANGED') THEN RAISE EXCEPTION 'INVALID_SECURITY_EVENT'; END IF;
 INSERT INTO public.audit_log(actor_user_id,action,entity_type,metadata) VALUES(auth.uid(),_action,'staff_security',jsonb_build_object('state',_state)); END $$;
REVOKE ALL ON FUNCTION public.staff_security_audit(text,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.staff_access_check(_scope text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE allowed boolean; BEGIN
 IF auth.uid() IS NULL THEN RETURN 'DENIED'; END IF;
 IF _scope IS NULL OR _scope NOT IN ('staff','super') THEN RAISE EXCEPTION 'INVALID_STAFF_SCOPE'; END IF;
 allowed:=CASE WHEN _scope='super' THEN public.care_super(auth.uid()) ELSE EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND status='ACTIVE' AND partner_id IS NULL AND role IN ('SUPER_ADMIN','OPERATIONS_ADMIN','FINANCE_ADMIN','COMPLIANCE_AUDITOR')) END;
 IF NOT allowed THEN PERFORM public.staff_security_audit('STAFF_ACCESS_DENIED','DENIED'); RETURN 'DENIED'; END IF;
 IF EXISTS(SELECT 1 FROM public.staff_security_state WHERE user_id=auth.uid() AND reset_required) THEN PERFORM public.staff_security_audit('STAFF_RESET_REQUIRED','RESET_REQUIRED'); RETURN 'RESET_REQUIRED'; END IF;
 IF coalesce(auth.jwt()->>'aal','aal1')<>'aal2' THEN PERFORM public.staff_security_audit('STAFF_MFA_REQUIRED','MFA_REQUIRED'); RETURN 'MFA_REQUIRED'; END IF;
 RETURN 'ALLOWED'; END $$;
REVOKE ALL ON FUNCTION public.staff_access_check(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_access_check(text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.staff_role_security_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r public.user_roles; BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 IF auth.role()='authenticated' AND (NOT public.care_super(auth.uid()) OR coalesce(auth.jwt()->>'aal','aal1')<>'aal2') THEN RAISE EXCEPTION 'SUPER_MFA_REQUIRED'; END IF;
 IF TG_OP<>'DELETE' AND NEW.role='SUPER_ADMIN' AND NEW.partner_id IS NOT NULL THEN RAISE EXCEPTION 'GLOBAL_SUPER_REQUIRED'; END IF;
 RETURN r; END $$;
CREATE TRIGGER staff_role_security_guard BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.staff_role_security_guard();
CREATE OR REPLACE FUNCTION public.staff_role_security_capture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r public.user_roles; BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 IF TG_OP='INSERT' AND r.partner_id IS NULL AND r.role IN ('SUPER_ADMIN','OPERATIONS_ADMIN','FINANCE_ADMIN','COMPLIANCE_AUDITOR') THEN INSERT INTO public.staff_security_state(user_id) VALUES(r.user_id) ON CONFLICT(user_id) DO NOTHING; END IF;
 INSERT INTO public.audit_log(actor_user_id,action,entity_type,metadata) VALUES(auth.uid(),CASE WHEN TG_OP='INSERT' THEN 'ROLE_PROVISIONED' ELSE 'ROLE_CHANGED' END,'user_role',jsonb_build_object('role',r.role,'status',r.status,'operation',TG_OP,'scope',CASE WHEN r.partner_id IS NULL THEN 'GLOBAL' ELSE 'TENANT' END));
 RETURN r; END $$;
CREATE TRIGGER staff_role_security_capture AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.staff_role_security_capture();
CREATE POLICY role_super_insert_guard ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.care_super(auth.uid()) AND auth.jwt()->>'aal'='aal2');
CREATE POLICY role_super_update_guard ON public.user_roles AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.care_super(auth.uid()) AND auth.jwt()->>'aal'='aal2') WITH CHECK(public.care_super(auth.uid()) AND auth.jwt()->>'aal'='aal2');
CREATE POLICY role_super_delete_guard ON public.user_roles AS RESTRICTIVE FOR DELETE TO authenticated USING(public.care_super(auth.uid()) AND auth.jwt()->>'aal'='aal2');
CREATE POLICY platform_super_insert_guard ON public.platform_settings AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.care_super(auth.uid()) AND auth.jwt()->>'aal'='aal2');
CREATE POLICY platform_super_update_guard ON public.platform_settings AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.care_super(auth.uid()) AND auth.jwt()->>'aal'='aal2') WITH CHECK(public.care_super(auth.uid()) AND auth.jwt()->>'aal'='aal2');
CREATE POLICY platform_super_delete_guard ON public.platform_settings AS RESTRICTIVE FOR DELETE TO authenticated USING(public.care_super(auth.uid()) AND auth.jwt()->>'aal'='aal2');
CREATE OR REPLACE FUNCTION public.platform_security_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.care_super(auth.uid()) OR coalesce(auth.jwt()->>'aal','aal1')<>'aal2' OR EXISTS(SELECT 1 FROM public.staff_security_state WHERE user_id=auth.uid() AND reset_required) THEN RAISE EXCEPTION 'SUPER_MFA_REQUIRED'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END $$;
CREATE TRIGGER platform_security_guard BEFORE INSERT OR UPDATE OR DELETE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.platform_security_guard();
CREATE OR REPLACE FUNCTION public.staff_password_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
 UPDATE public.staff_security_state SET reset_required=false,revision=revision+1,updated_at=now() WHERE user_id=NEW.id;
 IF FOUND THEN INSERT INTO public.audit_log(actor_user_id,action,entity_type,metadata) VALUES(NEW.id,'STAFF_PASSWORD_CHANGED','staff_security',jsonb_build_object('state','PASSWORD_CHANGED')); END IF;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER staff_password_changed AFTER UPDATE OF encrypted_password ON auth.users FOR EACH ROW EXECUTE FUNCTION public.staff_password_changed();
REVOKE ALL ON FUNCTION public.staff_role_security_guard(),public.staff_role_security_capture(),public.platform_security_guard(),public.staff_password_changed() FROM PUBLIC,anon,authenticated;