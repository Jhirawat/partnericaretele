-- Correctif: la version de campagne et le libellé d'environnement sont fixes et doivent être insérés par la commande.
CREATE OR REPLACE FUNCTION public.test_session_record(_suite text,_status text,_evidence text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
 INSERT INTO test_sessions(suite_key,version,campaign_version,environment_label,status,owner_role,reviewer_role,prerequisite_state,expected,blocker_reason,evidence_label,next_action,recorder)
 SELECT _suite,coalesce(max(version),0)+1,'v1','Signed-in preview',_status,'SUPER_ADMIN','OPERATIONS_ADMIN',ps,e,b,_evidence,n,u FROM test_sessions WHERE suite_key=_suite RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'version',r.version,'correlation_id',r.correlation_id);
END $$;
REVOKE ALL ON FUNCTION public.test_session_record(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.test_session_record(text,text,text) TO authenticated;
