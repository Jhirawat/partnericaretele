-- Backup evidence register: redacted manual metadata only, append-only and versioned; never proves a backup exists.
-- An entry counts as passed only when a different signed-in reviewer confirms its latest version. No external provider.
CREATE TABLE public.backup_evidence(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lineage uuid NOT NULL,version int NOT NULL CHECK(version>0),scope_label text NOT NULL CHECK(char_length(scope_label) BETWEEN 3 AND 120),environment_label text NOT NULL CHECK(char_length(environment_label) BETWEEN 3 AND 60),backup_date date,retention_days int CHECK(retention_days BETWEEN 1 AND 3650),restore_test_date date,restore_result text NOT NULL CHECK(restore_result IN ('not_tested','success','partial','failed')),owner_role text NOT NULL CHECK(owner_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),reviewer_role text NOT NULL CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),evidence_ref text NOT NULL CHECK(char_length(evidence_ref) BETWEEN 3 AND 120),status text NOT NULL CHECK(status IN ('pending','blocked','unverified')),next_action text NOT NULL CHECK(char_length(next_action) BETWEEN 3 AND 300),recorder uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(lineage,version));
CREATE TABLE public.backup_evidence_confirmations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),evidence_id uuid NOT NULL REFERENCES public.backup_evidence(id),outcome text NOT NULL CHECK(outcome IN ('confirmed','rejected')),note text NOT NULL CHECK(char_length(note) BETWEEN 3 AND 300),reviewer uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(evidence_id,reviewer));
GRANT SELECT ON public.backup_evidence,public.backup_evidence_confirmations TO authenticated;GRANT ALL ON public.backup_evidence,public.backup_evidence_confirmations TO service_role;
ALTER TABLE public.backup_evidence ENABLE ROW LEVEL SECURITY;ALTER TABLE public.backup_evidence_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backup_evidence,public.backup_evidence_confirmations FROM PUBLIC,anon;REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.backup_evidence,public.backup_evidence_confirmations FROM authenticated;
CREATE TRIGGER backup_evidence_immutable BEFORE UPDATE OR DELETE ON public.backup_evidence FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER backup_evidence_confirmations_immutable BEFORE UPDATE OR DELETE ON public.backup_evidence_confirmations FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE POLICY backup_evidence_read ON public.backup_evidence FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE POLICY backup_evidence_confirmations_read ON public.backup_evidence_confirmations FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE FUNCTION public.backup_unsafe(_t text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT public.release_unsafe_text(coalesce(_t,'')) OR coalesce(_t,'') ~* '(storage|bucket|s3|gs)://|pg_dump|insert\s+into|create\s+table|copy\s+\w+|\.sql\b|\.dump\b|password|secret|apikey|api_key' $$;
REVOKE ALL ON FUNCTION public.backup_unsafe(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.backup_evidence_record(_lineage uuid,_scope text,_env text,_backup_date date,_retention int,_restore_date date,_result text,_owner text,_reviewer text,_ref text,_status text,_next text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();l uuid:=coalesce(_lineage,gen_random_uuid());v int;row backup_evidence;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _status IS NULL OR _status NOT IN ('pending','blocked','unverified') OR _result IS NULL OR _result NOT IN ('not_tested','success','partial','failed') OR _owner NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN') OR _reviewer NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN')
  OR backup_unsafe(_scope) OR backup_unsafe(_env) OR backup_unsafe(_ref) OR backup_unsafe(_next)
  OR char_length(btrim(coalesce(_scope,''))) NOT BETWEEN 3 AND 120 OR char_length(btrim(coalesce(_env,''))) NOT BETWEEN 3 AND 60 OR char_length(btrim(coalesce(_ref,''))) NOT BETWEEN 3 AND 120 OR char_length(btrim(coalesce(_next,''))) NOT BETWEEN 3 AND 300
  OR _backup_date>current_date OR _restore_date>current_date OR (_result<>'not_tested' AND _restore_date IS NULL) OR (_retention IS NOT NULL AND _retention NOT BETWEEN 1 AND 3650) THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('backup_evidence:'||l::text));
 SELECT coalesce(max(version),0)+1 INTO v FROM backup_evidence WHERE lineage=l;
 IF _lineage IS NOT NULL AND v=1 THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 INSERT INTO backup_evidence(lineage,version,scope_label,environment_label,backup_date,retention_days,restore_test_date,restore_result,owner_role,reviewer_role,evidence_ref,status,next_action,recorder) VALUES(l,v,btrim(_scope),btrim(_env),_backup_date,_retention,_restore_date,_result,_owner,_reviewer,btrim(_ref),_status,btrim(_next),u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'lineage',row.lineage,'version',row.version,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
CREATE FUNCTION public.backup_evidence_confirm(_id uuid,_outcome text,_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();e backup_evidence;row backup_evidence_confirmations;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _outcome IS NULL OR _outcome NOT IN ('confirmed','rejected') OR backup_unsafe(_note) OR char_length(btrim(coalesce(_note,''))) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 SELECT * INTO e FROM backup_evidence WHERE id=_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF e.recorder=u THEN RAISE EXCEPTION 'SECOND_REVIEWER_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM backup_evidence x WHERE x.lineage=e.lineage AND x.version>e.version) THEN RAISE EXCEPTION 'STALE_VERSION';END IF;
 INSERT INTO backup_evidence_confirmations(evidence_id,outcome,note,reviewer) VALUES(e.id,_outcome,btrim(_note),u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
REVOKE ALL ON FUNCTION public.backup_evidence_record(uuid,text,text,date,int,date,text,text,text,text,text,text),public.backup_evidence_confirm(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.backup_evidence_record(uuid,text,text,date,int,date,text,text,text,text,text,text),public.backup_evidence_confirm(uuid,text,text) TO authenticated;
-- Redacted projection: no identities, only "mine" flags and confirmation outcomes.
CREATE FUNCTION public.backup_evidence_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'lineage',e.lineage,'version',e.version,'scope_label',e.scope_label,'environment_label',e.environment_label,'backup_date',e.backup_date,'retention_days',e.retention_days,'restore_test_date',e.restore_test_date,'restore_result',e.restore_result,'owner_role',e.owner_role,'reviewer_role',e.reviewer_role,'evidence_ref',e.evidence_ref,'status',e.status,'next_action',e.next_action,'correlation_id',e.correlation_id,'created_at',e.created_at,'mine',e.recorder=u,
  'latest',NOT EXISTS(SELECT 1 FROM backup_evidence x WHERE x.lineage=e.lineage AND x.version>e.version),
  'confirmations',coalesce((SELECT jsonb_agg(jsonb_build_object('outcome',c.outcome,'independent',c.reviewer<>e.recorder,'mine',c.reviewer=u,'created_at',c.created_at,'correlation_id',c.correlation_id) ORDER BY c.created_at) FROM backup_evidence_confirmations c WHERE c.evidence_id=e.id),'[]'::jsonb)) ORDER BY e.lineage,e.version) FROM backup_evidence e),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.backup_evidence_console() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.backup_evidence_console() TO authenticated;