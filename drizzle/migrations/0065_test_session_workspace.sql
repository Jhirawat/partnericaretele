CREATE TABLE public.test_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), suite_key text NOT NULL CHECK(suite_key IN ('public_routes','auth_guards','role_access','isolation','safety_gates','credit_lifecycle','mcs_handoff','certificates','outbox','sla','privacy','reconciliation','audit','protection','backup','content','rollback','no_external')),
 version integer NOT NULL CHECK(version>0), campaign_version text NOT NULL CHECK(campaign_version='v1'),
 environment_label text NOT NULL CHECK(environment_label IN ('Signed-in preview')),
 status text NOT NULL CHECK(status IN ('planned','ready','active','paused','completed','blocked')),
 owner_role text NOT NULL CHECK(owner_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')), reviewer_role text NOT NULL CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),
 prerequisite_state text NOT NULL CHECK(prerequisite_state IN ('none missing','Missing: superadmin_account','Missing: preview_access','Missing: second_reviewer','Missing: protection_evidence','Missing: backup_evidence','Missing: content_review','Missing: superadmin_account, preview_access','Missing: superadmin_account, preview_access, second_reviewer','Missing: protection_evidence, backup_evidence','Missing: protection_evidence, backup_evidence, second_reviewer','Missing: content_review, second_reviewer')),
 expected text NOT NULL CHECK(expected IN ('Public pages load with unique accessible metadata','Signed-out visitors are sent to sign-in','Live behaviour matches the access matrix','A partner never reads another partner''s records','No request without four PASS screening results','One reservation, one consumption, no negative balance','Adapter stays in mock mode with no automatic calls','Certificate files stay private and need review','External delivery workers do nothing','Pauses and maintenance are excluded from SLA clocks','Privacy requests need independent approval with history kept','Adjustments are reporting-only and independently approved','Audit rows cannot be edited or deleted','Recorded migration/RLS/storage evidence confirmed independently','Restore test recorded and confirmed independently','Every content type acknowledged by a different reviewer','Rollback drill runs on synthetic state only','No requests leave the site during checks')),
 blocker_reason text NOT NULL CHECK(blocker_reason IN ('None','Prerequisites unavailable','Independent review outstanding','Owner action required','Campaign not executed')),
 evidence_label text NOT NULL CHECK(evidence_label IN ('Manual availability attestation','Owner handoff review','Independent evidence review')),
 next_action text NOT NULL CHECK(next_action IN ('Arrange missing prerequisites','Request independent review','Plan the real signed-in run','Record the blocker with the owner')),
 recorder uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), UNIQUE(suite_key,version)
);
GRANT SELECT ON public.test_sessions TO authenticated;
GRANT ALL ON public.test_sessions TO service_role;
ALTER TABLE public.test_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_sessions_read ON public.test_sessions FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
CREATE TABLE public.test_session_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.test_sessions(id), outcome text NOT NULL CHECK(outcome IN ('confirmed','rejected')),
 reviewer uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), UNIQUE(session_id,reviewer)
);
GRANT SELECT ON public.test_session_reviews TO authenticated;
GRANT ALL ON public.test_session_reviews TO service_role;
ALTER TABLE public.test_session_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_session_reviews_read ON public.test_session_reviews FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
REVOKE ALL ON public.test_sessions, public.test_session_reviews FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.test_sessions, public.test_session_reviews FROM authenticated;
CREATE TRIGGER test_sessions_immutable BEFORE UPDATE OR DELETE ON public.test_sessions FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER test_session_reviews_immutable BEFORE UPDATE OR DELETE ON public.test_session_reviews FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE FUNCTION public.test_session_prereqs(_suite text) RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE _suite
  WHEN 'public_routes' THEN ARRAY['protection_evidence','backup_evidence']
  WHEN 'auth_guards' THEN ARRAY[]::text[]
  WHEN 'role_access' THEN ARRAY['superadmin_account','preview_access']
  WHEN 'isolation' THEN ARRAY['superadmin_account','preview_access']
  WHEN 'safety_gates' THEN ARRAY['superadmin_account','preview_access']
  WHEN 'credit_lifecycle' THEN ARRAY['superadmin_account','preview_access']
  WHEN 'mcs_handoff' THEN ARRAY[]::text[]
  WHEN 'certificates' THEN ARRAY['superadmin_account','preview_access']
  WHEN 'outbox' THEN ARRAY[]::text[]
  WHEN 'sla' THEN ARRAY[]::text[]
  WHEN 'privacy' THEN ARRAY['superadmin_account','preview_access','second_reviewer']
  WHEN 'reconciliation' THEN ARRAY['superadmin_account','preview_access','second_reviewer']
  WHEN 'audit' THEN ARRAY[]::text[]
  WHEN 'protection' THEN ARRAY['protection_evidence','backup_evidence','second_reviewer']
  WHEN 'backup' THEN ARRAY['protection_evidence','backup_evidence','second_reviewer']
  WHEN 'content' THEN ARRAY['content_review','second_reviewer']
  WHEN 'rollback' THEN ARRAY['superadmin_account','preview_access']
  WHEN 'no_external' THEN ARRAY[]::text[] END $$;
CREATE FUNCTION public.test_prereq_available(_key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM test_prerequisites p WHERE p.prerequisite_key=_key AND p.status='available' AND p.review_due>=current_date
  AND p.version=(SELECT max(x.version) FROM test_prerequisites x WHERE x.prerequisite_key=p.prerequisite_key)
  AND EXISTS(SELECT 1 FROM test_prerequisite_reviews c WHERE c.prerequisite_id=p.id AND c.outcome='confirmed' AND c.reviewer<>p.recorder)
  AND NOT EXISTS(SELECT 1 FROM test_prerequisite_reviews c WHERE c.prerequisite_id=p.id AND c.outcome='rejected')) $$;
CREATE FUNCTION public.test_session_record(_suite text,_status text,_evidence text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); r test_sessions; req text[]; miss text[]; k text; e text; b text; n text; ps text;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM care_require_strong();
 req:=test_session_prereqs(coalesce(_suite,''));
 IF req IS NULL OR coalesce(_status,'') NOT IN ('planned','ready','active','paused','completed','blocked') OR coalesce(_evidence,'') NOT IN ('Manual availability attestation','Owner handoff review','Independent evidence review') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 IF _status IN ('active','paused','completed') THEN RAISE EXCEPTION 'CAMPAIGN_NOT_RUNNABLE'; END IF;
 miss:=ARRAY[]::text[]; FOREACH k IN ARRAY req LOOP IF NOT test_prereq_available(k) THEN miss:=miss||k; END IF; END LOOP;
 IF _status='ready' AND array_length(miss,1) IS NOT NULL THEN RAISE EXCEPTION 'PREREQUISITES_UNAVAILABLE'; END IF;
 e:=CASE _suite WHEN 'public_routes' THEN 'Public pages load with unique accessible metadata' WHEN 'auth_guards' THEN 'Signed-out visitors are sent to sign-in' WHEN 'role_access' THEN 'Live behaviour matches the access matrix' WHEN 'isolation' THEN 'A partner never reads another partner''s records' WHEN 'safety_gates' THEN 'No request without four PASS screening results' WHEN 'credit_lifecycle' THEN 'One reservation, one consumption, no negative balance' WHEN 'mcs_handoff' THEN 'Adapter stays in mock mode with no automatic calls' WHEN 'certificates' THEN 'Certificate files stay private and need review' WHEN 'outbox' THEN 'External delivery workers do nothing' WHEN 'sla' THEN 'Pauses and maintenance are excluded from SLA clocks' WHEN 'privacy' THEN 'Privacy requests need independent approval with history kept' WHEN 'reconciliation' THEN 'Adjustments are reporting-only and independently approved' WHEN 'audit' THEN 'Audit rows cannot be edited or deleted' WHEN 'protection' THEN 'Recorded migration/RLS/storage evidence confirmed independently' WHEN 'backup' THEN 'Restore test recorded and confirmed independently' WHEN 'content' THEN 'Every content type acknowledged by a different reviewer' WHEN 'rollback' THEN 'Rollback drill runs on synthetic state only' WHEN 'no_external' THEN 'No requests leave the site during checks' END;
 ps:=CASE WHEN array_length(miss,1) IS NULL THEN 'none missing' ELSE 'Missing: '||array_to_string(miss,', ') END;
 b:=CASE WHEN _status='blocked' THEN 'Owner action required' WHEN array_length(miss,1) IS NOT NULL THEN 'Prerequisites unavailable' WHEN _status='ready' THEN 'Campaign not executed' ELSE 'None' END;
 n:=CASE WHEN array_length(miss,1) IS NOT NULL THEN 'Arrange missing prerequisites' WHEN _status='ready' THEN 'Plan the real signed-in run' WHEN _status='blocked' THEN 'Record the blocker with the owner' ELSE 'Request independent review' END;
 PERFORM pg_advisory_xact_lock(hashtextextended('test-session:'||_suite,0));
 INSERT INTO test_sessions(suite_key,version,status,owner_role,reviewer_role,prerequisite_state,expected,blocker_reason,evidence_label,next_action,recorder)
 SELECT _suite,coalesce(max(version),0)+1,_status,'SUPER_ADMIN','OPERATIONS_ADMIN',ps,e,b,_evidence,n,u FROM test_sessions WHERE suite_key=_suite RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'version',r.version,'correlation_id',r.correlation_id);
END $$;
CREATE FUNCTION public.test_session_confirm(_id uuid,_outcome text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); r test_sessions; v int; c test_session_reviews;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM care_require_strong();
 IF coalesce(_outcome,'') NOT IN ('confirmed','rejected') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 SELECT * INTO r FROM test_sessions WHERE id=_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('test-session:'||r.suite_key,0));
 SELECT max(version) INTO v FROM test_sessions WHERE suite_key=r.suite_key;
 IF r.version<>v THEN RAISE EXCEPTION 'LATEST_VERSION_REQUIRED'; END IF;
 IF r.recorder=u THEN RAISE EXCEPTION 'SECOND_REVIEWER_REQUIRED'; END IF;
 IF _outcome='confirmed' AND r.status='blocked' THEN RAISE EXCEPTION 'BLOCKED_SESSION'; END IF;
 INSERT INTO test_session_reviews(session_id,outcome,reviewer) VALUES(r.id,_outcome,u) RETURNING * INTO c;
 RETURN jsonb_build_object('id',c.id,'correlation_id',c.correlation_id);
END $$;
CREATE FUNCTION public.test_session_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM care_require_strong();
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'suite_key',r.suite_key,'version',r.version,'campaign_version',r.campaign_version,'environment_label',r.environment_label,'status',r.status,'owner_role',r.owner_role,'reviewer_role',r.reviewer_role,'prerequisite_state',r.prerequisite_state,'expected',r.expected,'blocker_reason',r.blocker_reason,'evidence_label',r.evidence_label,'next_action',r.next_action,'created_at',r.created_at,'correlation_id',r.correlation_id,'mine',r.recorder=u,'latest',r.version=(SELECT max(x.version) FROM test_sessions x WHERE x.suite_key=r.suite_key),
 'reviews',coalesce((SELECT jsonb_agg(jsonb_build_object('outcome',c.outcome,'independent',c.reviewer<>r.recorder,'mine',c.reviewer=u,'created_at',c.created_at,'correlation_id',c.correlation_id) ORDER BY c.created_at) FROM test_session_reviews c WHERE c.session_id=r.id),'[]'::jsonb)) ORDER BY r.suite_key,r.version) FROM test_sessions r),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.test_session_prereqs(text),public.test_prereq_available(text),public.test_session_record(text,text,text),public.test_session_confirm(uuid,text),public.test_session_console() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.test_session_record(text,text,text),public.test_session_confirm(uuid,text),public.test_session_console() TO authenticated;