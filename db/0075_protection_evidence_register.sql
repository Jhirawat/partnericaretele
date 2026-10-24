-- Migration, RLS and storage protection evidence: redacted manual metadata only, append-only and versioned.
-- Passes only after a different signed-in reviewer confirms the latest version. Reads no production schema or data.
CREATE TABLE public.protection_evidence(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lineage uuid NOT NULL,version int NOT NULL CHECK(version>0),environment_label text NOT NULL CHECK(char_length(environment_label) BETWEEN 3 AND 60),migration_label text NOT NULL CHECK(char_length(migration_label) BETWEEN 3 AND 60),applied_date date,migration_history text NOT NULL CHECK(migration_history IN ('not_checked','matched','drift')),rls_result text NOT NULL CHECK(rls_result IN ('not_checked','all_enabled','gaps')),protected_tables text NOT NULL CHECK(protected_tables IN ('not_checked','all_protected','gaps')),storage_policy text NOT NULL CHECK(storage_policy IN ('not_checked','private','public_found')),owner_role text NOT NULL CHECK(owner_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),reviewer_role text NOT NULL CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),evidence_ref text NOT NULL CHECK(char_length(evidence_ref) BETWEEN 3 AND 120),status text NOT NULL CHECK(status IN ('pending','blocked','unverified')),next_action text NOT NULL CHECK(char_length(next_action) BETWEEN 3 AND 300),recorder uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(lineage,version));
CREATE TABLE public.protection_evidence_confirmations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),evidence_id uuid NOT NULL REFERENCES public.protection_evidence(id),outcome text NOT NULL CHECK(outcome IN ('confirmed','rejected')),note text NOT NULL CHECK(char_length(note) BETWEEN 3 AND 300),reviewer uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(evidence_id,reviewer));
GRANT SELECT ON public.protection_evidence,public.protection_evidence_confirmations TO authenticated;GRANT ALL ON public.protection_evidence,public.protection_evidence_confirmations TO service_role;
ALTER TABLE public.protection_evidence ENABLE ROW LEVEL SECURITY;ALTER TABLE public.protection_evidence_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.protection_evidence,public.protection_evidence_confirmations FROM PUBLIC,anon;REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.protection_evidence,public.protection_evidence_confirmations FROM authenticated;
CREATE TRIGGER protection_evidence_immutable BEFORE UPDATE OR DELETE ON public.protection_evidence FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER protection_evidence_confirmations_immutable BEFORE UPDATE OR DELETE ON public.protection_evidence_confirmations FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE POLICY protection_evidence_read ON public.protection_evidence FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE POLICY protection_evidence_confirmations_read ON public.protection_evidence_confirmations FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE FUNCTION public.protection_unsafe(_t text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT public.backup_unsafe(_t) OR coalesce(_t,'') ~* 'create\s+(policy|function|index|schema)|alter\s+(table|policy)|grant\s+\w+\s+on|enable\s+row\s+level|\.json\M' $$;
REVOKE ALL ON FUNCTION public.protection_unsafe(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.protection_evidence_record(_lineage uuid,_env text,_mig text,_applied date,_history text,_rls text,_tables text,_storage text,_owner text,_reviewer text,_ref text,_status text,_next text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();l uuid:=coalesce(_lineage,gen_random_uuid());v int;row protection_evidence;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _status IS NULL OR _status NOT IN ('pending','blocked','unverified') OR _history IS NULL OR _history NOT IN ('not_checked','matched','drift') OR _rls IS NULL OR _rls NOT IN ('not_checked','all_enabled','gaps') OR _tables IS NULL OR _tables NOT IN ('not_checked','all_protected','gaps') OR _storage IS NULL OR _storage NOT IN ('not_checked','private','public_found')
  OR _owner IS NULL OR _owner NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN') OR _reviewer IS NULL OR _reviewer NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN')
  OR protection_unsafe(_env) OR protection_unsafe(_mig) OR protection_unsafe(_ref) OR protection_unsafe(_next)
  OR char_length(btrim(coalesce(_env,''))) NOT BETWEEN 3 AND 60 OR char_length(btrim(coalesce(_mig,''))) NOT BETWEEN 3 AND 60 OR char_length(btrim(coalesce(_ref,''))) NOT BETWEEN 3 AND 120 OR char_length(btrim(coalesce(_next,''))) NOT BETWEEN 3 AND 300
  OR _applied>current_date THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('protection_evidence:'||l::text));
 SELECT coalesce(max(version),0)+1 INTO v FROM protection_evidence WHERE lineage=l;
 IF _lineage IS NOT NULL AND v=1 THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 INSERT INTO protection_evidence(lineage,version,environment_label,migration_label,applied_date,migration_history,rls_result,protected_tables,storage_policy,owner_role,reviewer_role,evidence_ref,status,next_action,recorder) VALUES(l,v,btrim(_env),btrim(_mig),_applied,_history,_rls,_tables,_storage,_owner,_reviewer,btrim(_ref),_status,btrim(_next),u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'lineage',row.lineage,'version',row.version,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
CREATE FUNCTION public.protection_evidence_confirm(_id uuid,_outcome text,_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();e protection_evidence;row protection_evidence_confirmations;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _outcome IS NULL OR _outcome NOT IN ('confirmed','rejected') OR protection_unsafe(_note) OR char_length(btrim(coalesce(_note,''))) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 SELECT * INTO e FROM protection_evidence WHERE id=_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF e.recorder=u THEN RAISE EXCEPTION 'SECOND_REVIEWER_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM protection_evidence x WHERE x.lineage=e.lineage AND x.version>e.version) THEN RAISE EXCEPTION 'STALE_VERSION';END IF;
 INSERT INTO protection_evidence_confirmations(evidence_id,outcome,note,reviewer) VALUES(e.id,_outcome,btrim(_note),u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
REVOKE ALL ON FUNCTION public.protection_evidence_record(uuid,text,text,date,text,text,text,text,text,text,text,text,text),public.protection_evidence_confirm(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.protection_evidence_record(uuid,text,text,date,text,text,text,text,text,text,text,text,text),public.protection_evidence_confirm(uuid,text,text) TO authenticated;
CREATE FUNCTION public.protection_evidence_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'lineage',e.lineage,'version',e.version,'environment_label',e.environment_label,'migration_label',e.migration_label,'applied_date',e.applied_date,'migration_history',e.migration_history,'rls_result',e.rls_result,'protected_tables',e.protected_tables,'storage_policy',e.storage_policy,'owner_role',e.owner_role,'reviewer_role',e.reviewer_role,'evidence_ref',e.evidence_ref,'status',e.status,'next_action',e.next_action,'correlation_id',e.correlation_id,'created_at',e.created_at,'mine',e.recorder=u,
  'latest',NOT EXISTS(SELECT 1 FROM protection_evidence x WHERE x.lineage=e.lineage AND x.version>e.version),
  'confirmations',coalesce((SELECT jsonb_agg(jsonb_build_object('outcome',c.outcome,'independent',c.reviewer<>e.recorder,'mine',c.reviewer=u,'created_at',c.created_at,'correlation_id',c.correlation_id) ORDER BY c.created_at) FROM protection_evidence_confirmations c WHERE c.evidence_id=e.id),'[]'::jsonb)) ORDER BY e.lineage,e.version) FROM protection_evidence e),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.protection_evidence_console() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.protection_evidence_console() TO authenticated;