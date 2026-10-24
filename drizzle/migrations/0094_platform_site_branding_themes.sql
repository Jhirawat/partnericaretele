ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;
CREATE TABLE public.platform_settings_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), setting_key text NOT NULL, revision integer NOT NULL, value jsonb NOT NULL, actor_user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(setting_key,revision));
GRANT SELECT ON public.platform_settings_history TO authenticated;
GRANT ALL ON public.platform_settings_history TO service_role;
ALTER TABLE public.platform_settings_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY settings_history_super_read ON public.platform_settings_history FOR SELECT TO authenticated USING(public.care_super(auth.uid()));
CREATE FUNCTION public.site_settings_scope(_scope text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT auth.uid() IS NOT NULL AND (public.care_super(auth.uid()) OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND status='ACTIVE' AND ((_scope='doctor' AND role='DOCTOR') OR (_scope='admin' AND role IN ('OPERATIONS_ADMIN','FINANCE_ADMIN','COMPLIANCE_AUDITOR','LOCATION_MANAGER'))))) $$;
REVOKE ALL ON FUNCTION public.site_settings_scope(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.site_settings_scope(text) TO authenticated,service_role;
CREATE POLICY branding_scoped_read ON public.platform_settings FOR SELECT TO authenticated USING((key='site_name' AND (public.site_settings_scope('admin') OR public.site_settings_scope('doctor'))) OR (key='theme_admin' AND public.site_settings_scope('admin')) OR (key='theme_doctor' AND public.site_settings_scope('doctor')));
CREATE POLICY branding_scope_restriction ON public.platform_settings AS RESTRICTIVE FOR SELECT TO authenticated USING(key NOT IN ('site_name','theme_admin','theme_doctor') OR (key='site_name' AND (public.site_settings_scope('admin') OR public.site_settings_scope('doctor'))) OR (key='theme_admin' AND public.site_settings_scope('admin')) OR (key='theme_doctor' AND public.site_settings_scope('doctor')));
CREATE POLICY branding_write_restriction ON public.platform_settings AS RESTRICTIVE FOR ALL TO authenticated USING(key NOT IN ('site_name','theme_admin','theme_doctor') OR public.care_super(auth.uid())) WITH CHECK(key NOT IN ('site_name','theme_admin','theme_doctor') OR public.care_super(auth.uid()));
CREATE FUNCTION public.site_setting_validate(_key text,_value jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$ DECLARE n text; k text; BEGIN
 IF _key='site_name' THEN
 IF jsonb_typeof(_value) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'INVALID_SITE_NAME'; END IF;
 n:=btrim(_value#>>'{}');
 IF length(n)>80 OR n ~ '[[:cntrl:]<>/@\\:=]' OR n ~* '(www\.|https?\.|\.com\M|\.net\M|\.org\M|password|secret|token|credential)' OR n ~ '[0-9]{7}' THEN RAISE EXCEPTION 'INVALID_SITE_NAME'; END IF;
 RETURN to_jsonb(n);
 END IF;
 IF _key NOT IN ('theme_admin','theme_doctor') OR jsonb_typeof(_value) IS DISTINCT FROM 'object' OR NOT (_value ?& ARRAY['mode','primary','font','scale','weight','radius','card','navigation','collapsed']) OR (SELECT count(*) FROM jsonb_object_keys(_value))<>9 THEN RAISE EXCEPTION 'INVALID_THEME'; END IF;
 FOREACH k IN ARRAY ARRAY['mode','primary','font','radius','card','navigation'] LOOP IF jsonb_typeof(_value->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'INVALID_THEME'; END IF; END LOOP;
 IF _value->>'mode' NOT IN ('light','dark','system') OR _value->>'primary' !~ '^#[0-9a-fA-F]{6}$' OR _value->>'font' NOT IN ('system','manrope','sora') OR jsonb_typeof(_value->'scale') IS DISTINCT FROM 'number' OR (_value->>'scale')::numeric NOT BETWEEN 0.9 AND 1.2 OR jsonb_typeof(_value->'weight') IS DISTINCT FROM 'number' OR (_value->>'weight')::numeric NOT IN (400,600,700) OR _value->>'radius' NOT IN ('square','subtle','rounded') OR _value->>'card' NOT IN ('standard','glass') OR _value->>'navigation' NOT IN ('sidebar','topbar') OR jsonb_typeof(_value->'collapsed') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'INVALID_THEME'; END IF;
 RETURN _value || jsonb_build_object('primary',lower(_value->>'primary'));
END $$;
REVOKE ALL ON FUNCTION public.site_setting_validate(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.site_setting_validate(text,jsonb) TO authenticated,service_role;
CREATE FUNCTION public.site_settings_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='DELETE' THEN IF OLD.key IN ('site_name','theme_admin','theme_doctor') THEN RAISE EXCEPTION 'SETTING_DELETE_FORBIDDEN'; END IF; RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND OLD.key IN ('site_name','theme_admin','theme_doctor') AND NEW.key<>OLD.key THEN RAISE EXCEPTION 'SETTING_KEY_IMMUTABLE'; END IF;
 IF NEW.key IN ('site_name','theme_admin','theme_doctor') THEN
 IF NOT public.care_super(auth.uid()) THEN RAISE EXCEPTION 'SUPER_REQUIRED'; END IF;
 NEW.value:=public.site_setting_validate(NEW.key,NEW.value); NEW.updated_by:=auth.uid(); NEW.updated_at:=now(); NEW.revision:=CASE WHEN TG_OP='INSERT' THEN 1 ELSE OLD.revision+1 END;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER site_settings_guard BEFORE INSERT OR UPDATE OR DELETE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.site_settings_guard();
CREATE FUNCTION public.site_settings_capture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.key IN ('site_name','theme_admin','theme_doctor') THEN
 INSERT INTO public.platform_settings_history(setting_key,revision,value,actor_user_id) VALUES(NEW.key,NEW.revision,NEW.value,auth.uid());
 INSERT INTO public.audit_log(actor_user_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),'SITE_SETTING_CHANGED','platform_setting',NEW.key,jsonb_build_object('key',NEW.key,'revision',NEW.revision));
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER site_settings_capture AFTER INSERT OR UPDATE ON public.platform_settings FOR EACH ROW EXECUTE FUNCTION public.site_settings_capture();
CREATE FUNCTION public.site_settings_history_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'SETTING_HISTORY_IMMUTABLE'; END $$;
CREATE TRIGGER settings_history_immutable BEFORE UPDATE OR DELETE ON public.platform_settings_history FOR EACH ROW EXECUTE FUNCTION public.site_settings_history_immutable();
REVOKE ALL ON FUNCTION public.site_settings_guard(),public.site_settings_capture(),public.site_settings_history_immutable() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.site_settings_save(_key text,_value jsonb,_expected integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r public.platform_settings; BEGIN
 IF NOT public.care_super(auth.uid()) THEN RAISE EXCEPTION 'SUPER_REQUIRED'; END IF;
 PERFORM public.site_setting_validate(_key,_value);
 PERFORM pg_advisory_xact_lock(hashtext('site-setting:'||_key));
 SELECT * INTO r FROM public.platform_settings WHERE key=_key FOR UPDATE;
 IF _expected IS NULL OR _expected<>coalesce(r.revision,0) THEN RAISE EXCEPTION 'STALE_SETTING_VERSION'; END IF;
 INSERT INTO public.platform_settings(key,value,updated_by) VALUES(_key,_value,auth.uid()) ON CONFLICT(key) DO UPDATE SET value=excluded.value RETURNING * INTO r;
 RETURN jsonb_build_object('key',r.key,'value',r.value,'revision',r.revision,'updatedAt',r.updated_at);
END $$;
REVOKE ALL ON FUNCTION public.site_settings_save(text,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.site_settings_save(text,jsonb,integer) TO authenticated;
CREATE FUNCTION public.site_settings_read(_scope text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF _scope NOT IN ('admin','doctor','manage') OR (_scope='manage' AND NOT public.care_super(auth.uid())) OR (_scope<>'manage' AND NOT public.site_settings_scope(_scope)) THEN RAISE EXCEPTION 'SETTING_SCOPE_REQUIRED'; END IF;
 RETURN jsonb_build_object('settings',coalesce((SELECT jsonb_object_agg(key,jsonb_build_object('value',value,'revision',revision)) FROM public.platform_settings WHERE key='site_name' OR (_scope='manage' AND key IN ('theme_admin','theme_doctor')) OR key='theme_'||_scope),'{}'::jsonb),'history',CASE WHEN _scope='manage' THEN coalesce((SELECT jsonb_agg(h) FROM (SELECT setting_key,revision,value,created_at FROM public.platform_settings_history ORDER BY created_at DESC,id DESC LIMIT 100) h),'[]'::jsonb) ELSE '[]'::jsonb END);
END $$;
REVOKE ALL ON FUNCTION public.site_settings_read(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.site_settings_read(text) TO authenticated;