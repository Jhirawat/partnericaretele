CREATE OR REPLACE FUNCTION public.site_settings_scope(_scope text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT auth.uid() IS NOT NULL AND (public.care_super(auth.uid()) OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND status='ACTIVE' AND ((_scope='customer' AND role IN ('PATIENT','CUSTOMER')) OR (_scope='doctor' AND role='DOCTOR') OR (_scope='admin' AND role IN ('OPERATIONS_ADMIN','FINANCE_ADMIN','COMPLIANCE_AUDITOR','LOCATION_MANAGER'))))) $$;
ALTER FUNCTION public.site_setting_validate(text,jsonb) RENAME TO site_setting_validate_base;
CREATE FUNCTION public.site_setting_validate(_key text,_value jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT public.site_setting_validate_base(CASE WHEN _key='theme_customer' THEN 'theme_admin' ELSE _key END,_value) $$;
REVOKE ALL ON FUNCTION public.site_setting_validate(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.site_setting_validate(text,jsonb) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.site_settings_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='DELETE' THEN IF OLD.key IN ('site_name','theme_admin','theme_doctor','theme_customer','site_logo','site_favicon','logo','favicon') THEN RAISE EXCEPTION 'SETTING_DELETE_FORBIDDEN'; END IF; RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND OLD.key IN ('site_name','theme_admin','theme_doctor','theme_customer','site_logo','site_favicon','logo','favicon') AND NEW.key<>OLD.key THEN RAISE EXCEPTION 'SETTING_KEY_IMMUTABLE'; END IF;
 IF NEW.key IN ('site_logo','site_favicon','logo','favicon') AND NOT public.care_super(auth.uid()) THEN RAISE EXCEPTION 'SUPER_REQUIRED'; END IF;
 IF NEW.key IN ('site_name','theme_admin','theme_doctor','theme_customer') THEN
 IF NOT public.care_super(auth.uid()) THEN RAISE EXCEPTION 'SUPER_REQUIRED'; END IF;
 NEW.value:=public.site_setting_validate(NEW.key,NEW.value); NEW.updated_by:=auth.uid(); NEW.updated_at:=now(); NEW.revision:=CASE WHEN TG_OP='INSERT' THEN 1 ELSE OLD.revision+1 END;
 END IF; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.site_settings_capture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.key IN ('site_name','theme_admin','theme_doctor','theme_customer') THEN
 INSERT INTO public.platform_settings_history(setting_key,revision,value,actor_user_id) VALUES(NEW.key,NEW.revision,NEW.value,auth.uid());
 INSERT INTO public.audit_log(actor_user_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'SITE_SETTING_CHANGED','platform_setting',NEW.key,jsonb_build_object('key',NEW.key,'revision',NEW.revision));
 END IF; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.site_settings_read(_scope text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF _scope IS NULL OR _scope NOT IN ('admin','doctor','customer','manage') OR (_scope='manage' AND NOT public.care_super(auth.uid())) OR (_scope<>'manage' AND NOT public.site_settings_scope(_scope)) THEN RAISE EXCEPTION 'SETTING_SCOPE_REQUIRED'; END IF;
 RETURN jsonb_build_object('settings',coalesce((SELECT jsonb_object_agg(key,jsonb_build_object('value',value,'revision',revision)) FROM public.platform_settings WHERE key='site_name' OR (_scope='manage' AND key IN ('theme_admin','theme_doctor','theme_customer')) OR key='theme_'||_scope),'{}'::jsonb),'history',CASE WHEN _scope='manage' THEN coalesce((SELECT jsonb_agg(h) FROM (SELECT setting_key,revision,value,created_at FROM public.platform_settings_history ORDER BY created_at DESC,id DESC LIMIT 100) h),'[]'::jsonb) ELSE '[]'::jsonb END);
END $$;
DROP POLICY branding_scoped_read ON public.platform_settings;
DROP POLICY branding_scope_restriction ON public.platform_settings;
CREATE POLICY branding_scoped_read ON public.platform_settings FOR SELECT TO authenticated USING((key='site_name' AND (public.site_settings_scope('admin') OR public.site_settings_scope('doctor') OR public.site_settings_scope('customer'))) OR (key='theme_admin' AND public.site_settings_scope('admin')) OR (key='theme_doctor' AND public.site_settings_scope('doctor')) OR (key='theme_customer' AND public.site_settings_scope('customer')));
CREATE POLICY branding_scope_restriction ON public.platform_settings AS RESTRICTIVE FOR SELECT TO authenticated USING(key NOT IN ('site_name','theme_admin','theme_doctor','theme_customer') OR (key='site_name' AND (public.site_settings_scope('admin') OR public.site_settings_scope('doctor') OR public.site_settings_scope('customer'))) OR (key='theme_admin' AND public.site_settings_scope('admin')) OR (key='theme_doctor' AND public.site_settings_scope('doctor')) OR (key='theme_customer' AND public.site_settings_scope('customer')));
CREATE POLICY customer_branding_insert_guard ON public.platform_settings AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(key NOT IN ('theme_customer','site_logo','site_favicon','logo','favicon') OR public.care_super(auth.uid()));
CREATE POLICY customer_branding_update_guard ON public.platform_settings AS RESTRICTIVE FOR UPDATE TO authenticated USING(key NOT IN ('theme_customer','site_logo','site_favicon','logo','favicon') OR public.care_super(auth.uid())) WITH CHECK(key NOT IN ('theme_customer','site_logo','site_favicon','logo','favicon') OR public.care_super(auth.uid()));
CREATE POLICY customer_branding_delete_guard ON public.platform_settings AS RESTRICTIVE FOR DELETE TO authenticated USING(key NOT IN ('theme_customer','site_logo','site_favicon','logo','favicon') OR public.care_super(auth.uid()));