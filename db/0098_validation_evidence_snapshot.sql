-- Final validation evidence snapshot: append-only, versioned, redacted verification metadata for the existing app/database/typecheck/build/preview suites. A recorded "passed" counts only after a different signed-in reviewer confirms the latest version; simulated fixtures can never be recorded. No release authority.
CREATE TABLE public.validation_snapshot_record(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),check_key text NOT NULL CHECK(check_key IN ('app-tests','database-tests','typecheck','production-build','private-route-auth','noindex-coverage','signed-out-block','mobile-preview','desktop-preview','zero-record-reads','simulated-separation','zero-outbound-calls')),version int NOT NULL CHECK(version>0),status text NOT NULL CHECK(status IN ('passed','pending','blocked','unverified')),numeric_count int CHECK(numeric_count>=0),optional_skip text NOT NULL DEFAULT 'none' CHECK(optional_skip IN ('none','optional-concurrency-skip')),blocker_reason text NOT NULL CHECK(blocker_reason IN ('No blocker recorded','Evidence not recorded','Independent review outstanding','Suite execution outstanding','Optional check skipped','Environment unavailable')),evidence_label text NOT NULL CHECK(evidence_label='Independent validation metadata review'),recorder uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(check_key,version),CHECK((status='passed')=(blocker_reason='No blocker recorded' AND optional_skip='none')),CHECK(optional_skip='none' OR (check_key='database-tests' AND status<>'passed')));
CREATE TABLE public.validation_snapshot_review(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),record_id uuid NOT NULL REFERENCES public.validation_snapshot_record(id),outcome text NOT NULL CHECK(outcome IN ('confirmed','concern')),reviewer uuid NOT NULL,reviewer_role text NOT NULL CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(record_id));
GRANT SELECT ON public.validation_snapshot_record,public.validation_snapshot_review TO authenticated;
GRANT ALL ON public.validation_snapshot_record,public.validation_snapshot_review TO service_role;
ALTER TABLE public.validation_snapshot_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_snapshot_review ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.validation_snapshot_record,public.validation_snapshot_review FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.validation_snapshot_record,public.validation_snapshot_review FROM authenticated;
CREATE POLICY validation_snapshot_record_read ON public.validation_snapshot_record FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
CREATE POLICY validation_snapshot_review_read ON public.validation_snapshot_review FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
CREATE TRIGGER validation_snapshot_record_immutable BEFORE UPDATE OR DELETE ON public.validation_snapshot_record FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER validation_snapshot_review_immutable BEFORE UPDATE OR DELETE ON public.validation_snapshot_review FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE FUNCTION public.validation_snapshot_record_save(_check_key text,_version int,_status text,_count int,_optional_skip text,_blocker_reason text,_evidence_label text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); v int; row validation_snapshot_record;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF; PERFORM care_require_strong();
 IF _check_key IS NULL OR _check_key NOT IN ('app-tests','database-tests','typecheck','production-build','private-route-auth','noindex-coverage','signed-out-block','mobile-preview','desktop-preview','zero-record-reads','simulated-separation','zero-outbound-calls') OR _version IS NULL OR _version<0 OR _status IS NULL OR _status NOT IN ('passed','pending','blocked','unverified') OR _optional_skip IS NULL OR _optional_skip NOT IN ('none','optional-concurrency-skip') OR _blocker_reason IS NULL OR _blocker_reason NOT IN ('No blocker recorded','Evidence not recorded','Independent review outstanding','Suite execution outstanding','Optional check skipped','Environment unavailable') OR _evidence_label IS DISTINCT FROM 'Independent validation metadata review' OR access_unsafe(_check_key) OR access_unsafe(_optional_skip) OR access_unsafe(_blocker_reason) OR access_unsafe(_evidence_label) THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 IF (_status='passed')<> (_blocker_reason='No blocker recorded' AND _optional_skip='none') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 IF _optional_skip<>'none' AND (_check_key<>'database-tests' OR _status='passed') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('validation_snapshot:'||_check_key));
 SELECT coalesce(max(version),0) INTO v FROM validation_snapshot_record WHERE check_key=_check_key; IF v<>_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 INSERT INTO validation_snapshot_record(check_key,version,status,numeric_count,optional_skip,blocker_reason,evidence_label,recorder) VALUES(_check_key,v+1,_status,_count,_optional_skip,_blocker_reason,_evidence_label,u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'version',row.version,'correlation_id',row.correlation_id);
END $$;
CREATE FUNCTION public.validation_snapshot_confirm(_id uuid,_outcome text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); e validation_snapshot_record; role text; row validation_snapshot_review;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF; PERFORM care_require_strong();
 IF _outcome IS NULL OR _outcome NOT IN ('confirmed','concern') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 SELECT * INTO e FROM validation_snapshot_record WHERE id=_id; IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('validation_snapshot:'||e.check_key));
 IF e.version<>(SELECT max(version) FROM validation_snapshot_record WHERE check_key=e.check_key) THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 IF e.recorder=u THEN RAISE EXCEPTION 'SECOND_REVIEWER_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM validation_snapshot_review WHERE record_id=e.id) THEN RAISE EXCEPTION 'DUPLICATE_REVIEW'; END IF;
 SELECT x.role::text INTO role FROM user_roles x WHERE x.user_id=u AND x.partner_id IS NULL AND x.role IN ('SUPER_ADMIN','OPERATIONS_ADMIN') ORDER BY x.role LIMIT 1;
 IF role IS NULL THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 INSERT INTO validation_snapshot_review(record_id,outcome,reviewer,reviewer_role) VALUES(e.id,_outcome,u,role) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'correlation_id',row.correlation_id);
END $$;
CREATE FUNCTION public.validation_snapshot_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); k text; e validation_snapshot_record; rv validation_snapshot_review; state text; reason text; rows jsonb:='[]';
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF; PERFORM care_require_strong();
 FOREACH k IN ARRAY ARRAY['app-tests','database-tests','typecheck','production-build','private-route-auth','noindex-coverage','signed-out-block','mobile-preview','desktop-preview','zero-record-reads','simulated-separation','zero-outbound-calls'] LOOP
  SELECT * INTO e FROM validation_snapshot_record WHERE check_key=k ORDER BY version DESC LIMIT 1;
  SELECT * INTO rv FROM validation_snapshot_review WHERE record_id=e.id;
  state:=CASE WHEN e.id IS NULL THEN 'unverified' WHEN rv.outcome='concern' THEN 'blocked' WHEN e.status='passed' AND rv.outcome='confirmed' AND rv.reviewer<>e.recorder THEN 'passed' WHEN e.status='passed' THEN 'unverified' ELSE e.status END;
  reason:=CASE WHEN e.id IS NULL THEN 'Evidence not recorded' WHEN rv.outcome='concern' THEN 'Independent review outstanding' WHEN e.status='passed' AND rv.id IS NULL THEN 'Independent review outstanding' ELSE e.blocker_reason END;
  rows:=rows||jsonb_build_array(jsonb_build_object('key',k,'status',state,'reason',reason,'record',CASE WHEN e.id IS NULL THEN NULL ELSE jsonb_build_object('id',e.id,'version',e.version,'status',e.status,'numeric_count',e.numeric_count,'optional_skip',e.optional_skip,'blocker_reason',e.blocker_reason,'evidence_label',e.evidence_label,'mine',e.recorder=u,'created_at',e.created_at,'correlation_id',e.correlation_id,'reviewed',rv.id IS NOT NULL,'review_outcome',rv.outcome) END,'last_reviewed',rv.created_at));
 END LOOP;
 RETURN rows;
END $$;
REVOKE ALL ON FUNCTION public.validation_snapshot_record_save(text,int,text,int,text,text,text),public.validation_snapshot_confirm(uuid,text),public.validation_snapshot_console() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.validation_snapshot_record_save(text,int,text,int,text,text,text),public.validation_snapshot_confirm(uuid,text),public.validation_snapshot_console() TO authenticated;
COMMENT ON TABLE public.validation_snapshot_record IS 'Redacted validation metadata only. A passed result counts only after independent confirmation of the latest version. No release authority.';
