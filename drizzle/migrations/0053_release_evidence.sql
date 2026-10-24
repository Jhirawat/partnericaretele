-- see db/0070_release_evidence.sql
CREATE TABLE public.release_evidence(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lineage uuid NOT NULL,version int NOT NULL CHECK(version>0),item_key text NOT NULL REFERENCES public.release_checklist_items(key),evidence_type text NOT NULL CHECK(evidence_type IN ('automated','manual_production')),reference_label text NOT NULL,owner_role public.app_role NOT NULL,next_action text NOT NULL,status text NOT NULL CHECK(status IN ('passed','pending','blocked','unverified')),blocked_reason text,review_due date,actor uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(lineage,version),CHECK(status NOT IN ('blocked','unverified') OR blocked_reason IS NOT NULL));
GRANT SELECT ON public.release_evidence TO authenticated;GRANT ALL ON public.release_evidence TO service_role;ALTER TABLE public.release_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.release_evidence FROM PUBLIC,anon;REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.release_evidence FROM authenticated;
CREATE TRIGGER release_evidence_immutable BEFORE UPDATE OR DELETE ON public.release_evidence FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE POLICY release_evidence_read ON public.release_evidence FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE FUNCTION public.release_unsafe_text(_t text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT _t ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|https?://|sb_secret_|sb_publishable_|service_role|eyJ[A-Za-z0-9_-]{10,}|-----BEGIN|password|passwd|secret|token|[0-9]{9,}|[0-9][0-9 -]{11,}[0-9]' $$;
REVOKE ALL ON FUNCTION public.release_unsafe_text(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.release_evidence_command(_args jsonb,_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();op release_operations;item release_checklist_items;prev release_evidence;lin uuid;v int;rid uuid;cid uuid:=gen_random_uuid();res jsonb;
 ref text:=btrim(coalesce(_args->>'reference_label',''));nxt text:=btrim(coalesce(_args->>'next_action',''));br text:=nullif(btrim(coalesce(_args->>'blocked_reason','')),'');st text:=coalesce(_args->>'status','');ty text:=coalesce(_args->>'evidence_type','');due date;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _key IS NULL OR _args IS NULL OR jsonb_typeof(_args)<>'object' OR length(_args::text)>2000
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(_args)k WHERE k<>ALL(ARRAY['item_key','lineage','evidence_type','reference_label','next_action','status','blocked_reason','review_due']))
  OR ty NOT IN ('automated','manual_production') OR st NOT IN ('passed','pending','blocked','unverified')
  OR ref !~ '^[A-Za-z0-9][A-Za-z0-9 _:/.#-]{2,119}$' OR length(nxt) NOT BETWEEN 3 AND 300 OR length(coalesce(br,'')) > 300
  OR (st IN ('blocked','unverified') AND br IS NULL)
  OR release_unsafe_text(ref) OR release_unsafe_text(nxt) OR release_unsafe_text(coalesce(br,'')) THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 BEGIN due:=nullif(_args->>'review_due','')::date;EXCEPTION WHEN others THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END;
 SELECT * INTO op FROM release_operations WHERE key=_key;
 IF FOUND THEN IF op.actor<>u OR op.intent<>jsonb_build_object('op','evidence','args',_args) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';END IF;RETURN op.result;END IF;
 PERFORM pg_advisory_xact_lock(hashtext('release_command'));
 SELECT * INTO item FROM release_checklist_items WHERE key=_args->>'item_key';IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF _args ? 'lineage' THEN
  BEGIN lin:=(_args->>'lineage')::uuid;EXCEPTION WHEN others THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END;
  SELECT * INTO prev FROM release_evidence WHERE lineage=lin ORDER BY version DESC LIMIT 1;
  IF NOT FOUND OR prev.item_key<>item.key THEN RAISE EXCEPTION 'EVIDENCE_NOT_FOUND';END IF;v:=prev.version+1;
 ELSE lin:=gen_random_uuid();v:=1;END IF;
 INSERT INTO release_evidence(lineage,version,item_key,evidence_type,reference_label,owner_role,next_action,status,blocked_reason,review_due,actor,correlation_id)
  VALUES(lin,v,item.key,ty,ref,item.owner_role,nxt,st,br,due,u,cid) RETURNING id INTO rid;
 res:=jsonb_build_object('id',rid,'lineage',lin,'version',v,'correlation_id',cid);
 INSERT INTO release_operations(key,actor,intent,result) VALUES(_key,u,jsonb_build_object('op','evidence','args',_args),res);
 RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.release_evidence_command(jsonb,uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.release_evidence_command(jsonb,uuid) TO authenticated;
CREATE FUNCTION public.release_evidence_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'lineage',e.lineage,'version',e.version,'item_key',e.item_key,'evidence_type',e.evidence_type,'reference_label',e.reference_label,'owner_role',e.owner_role,'next_action',e.next_action,'status',e.status,'blocked_reason',e.blocked_reason,'review_due',e.review_due,'correlation_id',e.correlation_id,'created_at',e.created_at,'mine',e.actor=u,'latest',NOT EXISTS(SELECT 1 FROM release_evidence x WHERE x.lineage=e.lineage AND x.version>e.version)) ORDER BY e.item_key,e.lineage,e.version) FROM release_evidence e),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.release_evidence_console() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.release_evidence_console() TO authenticated;