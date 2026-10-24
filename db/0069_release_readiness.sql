-- Release readiness: append-only sign-offs, independent approvals, maintenance banner and read-only smoke checks.
-- No provider, payment, MCS, ledger, certificate-content or clinical mutation.
CREATE TABLE public.release_checklist_items(key text PRIMARY KEY CHECK(key ~ '^[a-z_]{3,40}$'),category text NOT NULL CHECK(category IN ('security','privacy','financial','clinical','operations')),sensitive boolean NOT NULL,owner_role public.app_role NOT NULL,position int NOT NULL UNIQUE);
GRANT SELECT ON public.release_checklist_items TO authenticated;GRANT ALL ON public.release_checklist_items TO service_role;ALTER TABLE public.release_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.release_signoffs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),item_key text NOT NULL REFERENCES public.release_checklist_items(key),version int NOT NULL CHECK(version>0),status text NOT NULL CHECK(status IN ('pending','passed','failed','waived','blocked')),owner_role public.app_role NOT NULL,evidence_reference text NOT NULL,reason text NOT NULL,actor uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(item_key,version));
GRANT SELECT ON public.release_signoffs TO authenticated;GRANT ALL ON public.release_signoffs TO service_role;ALTER TABLE public.release_signoffs ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.release_approvals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),signoff_id uuid NOT NULL UNIQUE REFERENCES public.release_signoffs(id),decision text NOT NULL CHECK(decision IN ('approved','rejected')),reason text NOT NULL,actor uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
GRANT SELECT ON public.release_approvals TO authenticated;GRANT ALL ON public.release_approvals TO service_role;ALTER TABLE public.release_approvals ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.release_banner_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),active boolean NOT NULL,message text NOT NULL,reason text NOT NULL,actor uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
GRANT SELECT ON public.release_banner_events TO authenticated;GRANT ALL ON public.release_banner_events TO service_role;ALTER TABLE public.release_banner_events ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.release_operations(key uuid PRIMARY KEY,actor uuid NOT NULL,intent jsonb NOT NULL,result jsonb NOT NULL);
GRANT ALL ON public.release_operations TO service_role;ALTER TABLE public.release_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.release_checklist_items,public.release_signoffs,public.release_approvals,public.release_banner_events,public.release_operations FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.release_checklist_items,public.release_signoffs,public.release_approvals,public.release_banner_events,public.release_operations FROM authenticated;
REVOKE SELECT ON public.release_operations FROM authenticated;
CREATE TRIGGER release_item_immutable BEFORE UPDATE OR DELETE ON public.release_checklist_items FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER release_signoff_immutable BEFORE UPDATE OR DELETE ON public.release_signoffs FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER release_approval_immutable BEFORE UPDATE OR DELETE ON public.release_approvals FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER release_banner_immutable BEFORE UPDATE OR DELETE ON public.release_banner_events FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER release_operation_immutable BEFORE UPDATE OR DELETE ON public.release_operations FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
-- Global (null tenant) Superadmin or Operations admin only.
CREATE FUNCTION public.release_scope(_u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT _u IS NOT NULL AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=_u AND status='ACTIVE' AND partner_id IS NULL AND role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')) $$;
REVOKE ALL ON FUNCTION public.release_scope(uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.release_scope(uuid) TO authenticated;
CREATE POLICY release_item_read ON public.release_checklist_items FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE POLICY release_signoff_read ON public.release_signoffs FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE POLICY release_approval_read ON public.release_approvals FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE POLICY release_banner_read ON public.release_banner_events FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
INSERT INTO public.release_checklist_items(key,category,sensitive,owner_role,position) VALUES
('migration_state','security',true,'SUPER_ADMIN',1),('rls_storage','security',true,'SUPER_ADMIN',2),('role_scope','security',true,'SUPER_ADMIN',3),
('screening_config','clinical',true,'OPERATIONS_ADMIN',4),('doctor_assignment','clinical',true,'OPERATIONS_ADMIN',5),('credit_invariants','financial',true,'SUPER_ADMIN',6),
('mcs_handoff','clinical',true,'OPERATIONS_ADMIN',7),('certificate_privacy','privacy',true,'OPERATIONS_ADMIN',8),('notification_disabled','operations',false,'OPERATIONS_ADMIN',9),
('sla_controls','operations',false,'OPERATIONS_ADMIN',10),('privacy_retention','privacy',true,'SUPER_ADMIN',11),('reconciliation_close','financial',true,'SUPER_ADMIN',12),
('audit_integrity','security',true,'SUPER_ADMIN',13),('backup_restore','operations',false,'SUPER_ADMIN',14),('preview_smoke','operations',false,'OPERATIONS_ADMIN',15);
-- Effective status: sensitive passed/waived sign-offs stay pending until an independent approval; rejection blocks.
CREATE FUNCTION public.release_effective(_s uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN s.status NOT IN ('passed','waived') OR NOT i.sensitive THEN s.status WHEN a.decision='approved' THEN s.status WHEN a.decision='rejected' THEN 'blocked' ELSE 'pending' END
 FROM release_signoffs s JOIN release_checklist_items i ON i.key=s.item_key LEFT JOIN release_approvals a ON a.signoff_id=s.id WHERE s.id=_s $$;
REVOKE ALL ON FUNCTION public.release_effective(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.release_command(_op text,_args jsonb,_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();op release_operations;why text:=btrim(coalesce(_args->>'reason',''));item release_checklist_items;s release_signoffs;v int;rid uuid;res jsonb;cid uuid:=gen_random_uuid();ev text:=coalesce(_args->>'evidence_reference','');msg text:=btrim(coalesce(_args->>'message',''));
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _key IS NULL OR _args IS NULL OR jsonb_typeof(_args)<>'object' OR length(_args::text)>2000 OR length(why) NOT BETWEEN 3 AND 500 OR _op NOT IN ('signoff','approve','reject','banner')
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(_args)k WHERE k<>ALL(ARRAY['item_key','status','evidence_reference','reason','signoff_id','active','message'])) THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 SELECT * INTO op FROM release_operations WHERE key=_key;
 IF FOUND THEN IF op.actor<>u OR op.intent<>jsonb_build_object('op',_op,'args',_args) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';END IF;RETURN op.result;END IF;
 PERFORM pg_advisory_xact_lock(hashtext('release_command'));
 IF _op='signoff' THEN
  SELECT * INTO item FROM release_checklist_items WHERE key=_args->>'item_key';
  IF NOT FOUND OR coalesce(_args->>'status','') NOT IN ('pending','passed','failed','waived','blocked') OR ev !~ '^[A-Za-z0-9][A-Za-z0-9_:/.#-]{2,119}$' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
  SELECT coalesce(max(version),0)+1 INTO v FROM release_signoffs WHERE item_key=item.key;
  INSERT INTO release_signoffs(item_key,version,status,owner_role,evidence_reference,reason,actor,correlation_id) VALUES(item.key,v,_args->>'status',item.owner_role,ev,why,u,cid) RETURNING id INTO rid;
  res:=jsonb_build_object('id',rid,'version',v,'correlation_id',cid,'effective',release_effective(rid));
 ELSIF _op IN ('approve','reject') THEN
  SELECT * INTO s FROM release_signoffs WHERE id=(_args->>'signoff_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SIGNOFF_NOT_FOUND';END IF;
  SELECT * INTO item FROM release_checklist_items WHERE key=s.item_key;
  IF NOT item.sensitive OR s.status NOT IN ('passed','waived') THEN RAISE EXCEPTION 'APPROVAL_NOT_APPLICABLE';END IF;
  IF s.actor=u THEN RAISE EXCEPTION 'INDEPENDENT_APPROVAL_REQUIRED';END IF;
  IF EXISTS(SELECT 1 FROM release_signoffs WHERE item_key=s.item_key AND version>s.version) THEN RAISE EXCEPTION 'SUPERSEDED_SIGNOFF';END IF;
  IF EXISTS(SELECT 1 FROM release_approvals WHERE signoff_id=s.id) THEN RAISE EXCEPTION 'ALREADY_DECIDED';END IF;
  INSERT INTO release_approvals(signoff_id,decision,reason,actor,correlation_id) VALUES(s.id,CASE WHEN _op='approve' THEN 'approved' ELSE 'rejected' END,why,u,cid) RETURNING id INTO rid;
  res:=jsonb_build_object('id',rid,'correlation_id',cid,'effective',release_effective(s.id));
 ELSE
  IF jsonb_typeof(_args->'active')<>'boolean' OR length(msg) NOT BETWEEN 3 AND 200 OR msg ~ '@|https?://' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
  INSERT INTO release_banner_events(active,message,reason,actor,correlation_id) VALUES((_args->>'active')::boolean,msg,why,u,cid) RETURNING id INTO rid;
  res:=jsonb_build_object('id',rid,'correlation_id',cid,'active',(_args->>'active')::boolean);
 END IF;
 INSERT INTO release_operations(key,actor,intent,result) VALUES(_key,u,jsonb_build_object('op',_op,'args',_args),res);
 RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.release_command(text,jsonb,uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.release_command(text,jsonb,uuid) TO authenticated;
-- Banner text only; visible to every signed-in user, no actor identity.
CREATE FUNCTION public.release_banner() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE (SELECT CASE WHEN active THEN jsonb_build_object('message',message,'since',created_at) END FROM release_banner_events ORDER BY created_at DESC,id DESC LIMIT 1) END $$;
REVOKE ALL ON FUNCTION public.release_banner() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.release_banner() TO authenticated;
-- Read-only database smoke checks returning statuses and counts only (no identifiers, content or secrets).
CREATE FUNCTION public.release_smoke() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE n bigint;out jsonb:='[]';mig bigint;sla numeric;
BEGIN
 IF NOT release_scope(auth.uid()) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity;
 out:=out||jsonb_build_object('check','rls_enabled','status',CASE WHEN n=0 THEN 'passed' ELSE 'failed' END,'count',n);
 SELECT count(*) INTO n FROM storage.buckets WHERE id IN ('care-certificates','partner-applications') AND public;
 SELECT n+CASE WHEN (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND permissive='RESTRICTIVE' AND policyname LIKE 'certificate_storage_%')>=5 THEN 0 ELSE 1 END INTO n;
 out:=out||jsonb_build_object('check','private_storage','status',CASE WHEN n=0 THEN 'passed' ELSE 'failed' END,'count',n);
 IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN out:=out||jsonb_build_object('check','migration_metadata','status','blocked','count',0);
 ELSE EXECUTE 'SELECT count(*) FROM drizzle.__drizzle_migrations' INTO mig;out:=out||jsonb_build_object('check','migration_metadata','status',CASE WHEN mig>0 THEN 'passed' ELSE 'failed' END,'count',mig);END IF;
 SELECT count(*) INTO n FROM unnest(ARRAY['release_checklist_items','release_signoffs','release_approvals','release_banner_events','release_operations','care_certificate_revisions','fin_adjustments','privacy_requests','audit_log','credit_transactions']) t WHERE to_regclass('public.'||t) IS NULL OR has_table_privilege('anon','public.'||t,'SELECT') OR has_table_privilege('authenticated','public.'||t,'UPDATE') OR has_table_privilege('authenticated','public.'||t,'DELETE');
 out:=out||jsonb_build_object('check','grant_boundaries','status',CASE WHEN n=0 THEN 'passed' ELSE 'failed' END,'count',n);
 SELECT count(*) INTO n FROM partners WHERE care_available(id)<0;
 SELECT n+(SELECT count(*) FROM (SELECT consultation_id FROM credit_transactions WHERE type='CONSUME' AND consultation_id IS NOT NULL GROUP BY consultation_id HAVING count(*)>1)d) INTO n;
 out:=out||jsonb_build_object('check','credit_invariants','status',CASE WHEN n=0 THEN 'passed' ELSE 'failed' END,'count',n);
 SELECT count(*) INTO n FROM unnest(ARRAY['audit_log','credit_transactions','care_certificate_revisions','fin_adjustments','fin_compensating_entries','release_signoffs','release_approvals','release_banner_events']) t WHERE NOT EXISTS(SELECT 1 FROM pg_trigger tg WHERE tg.tgrelid=to_regclass('public.'||t) AND tg.tgfoid='public.care_immutable()'::regprocedure AND tg.tgenabled<>'D');
 out:=out||jsonb_build_object('check','audit_append_only','status',CASE WHEN n=0 THEN 'passed' ELSE 'failed' END,'count',n);
 sla:=sla_elapsed('2026-01-05T00:00:00Z','2026-01-05T02:00:00Z','calendar','UTC','{1,2,3,4,5}','09:00','17:00','[{"start":"2026-01-05T00:30:00Z","end":"2026-01-05T01:00:00Z"}]');
 out:=out||jsonb_build_object('check','sla_clock','status',CASE WHEN sla IN (90,5400) THEN 'passed' ELSE 'failed' END,'count',sla);
 SELECT count(*) INTO n FROM notification_deliveries WHERE status IN ('SENT','DELIVERED');
 out:=out||jsonb_build_object('check','no_external_delivery','status',CASE WHEN n=0 THEN 'passed' ELSE 'failed' END,'count',n);
 RETURN out;
END $$;
REVOKE ALL ON FUNCTION public.release_smoke() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.release_smoke() TO authenticated;
CREATE FUNCTION public.release_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 RETURN jsonb_build_object(
  'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('key',i.key,'category',i.category,'sensitive',i.sensitive,'owner_role',i.owner_role,
    'latest',(SELECT jsonb_build_object('id',s.id,'version',s.version,'status',s.status,'effective',release_effective(s.id),'evidence_reference',s.evidence_reference,'reason',s.reason,'mine',s.actor=u,'correlation_id',s.correlation_id,'created_at',s.created_at,
      'approval',(SELECT jsonb_build_object('decision',a.decision,'reason',a.reason,'correlation_id',a.correlation_id,'created_at',a.created_at) FROM release_approvals a WHERE a.signoff_id=s.id))
     FROM release_signoffs s WHERE s.item_key=i.key ORDER BY s.version DESC LIMIT 1),
    'versions',(SELECT count(*) FROM release_signoffs s WHERE s.item_key=i.key)) ORDER BY i.position),'[]') FROM release_checklist_items i),
  'banner',(SELECT jsonb_build_object('active',active,'message',message,'created_at',created_at,'correlation_id',correlation_id) FROM release_banner_events ORDER BY created_at DESC,id DESC LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION public.release_console() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.release_console() TO authenticated;
