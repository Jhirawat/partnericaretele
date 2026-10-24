-- Human test session results recorder and reconciliation: append-only, versioned, redacted result metadata for a future manually started signed-in human verification session. Nothing here starts a session, runs tests, publishes, deploys, changes permissions, resets data or calls external services. A result can be recorded only while the session's latest start-gate event is in-progress with every hard prerequisite confirmed; a passed result counts only after two different signed-in reviewers with different global roles confirm the latest version. Dependent blockers are derived as reopened when a prerequisite result is withdrawn or becomes stale; nothing is auto-closed and no release authority is granted.
CREATE FUNCTION public.session_result_catalog() RETURNS TABLE(ord int,suite_key text,expected text,artifact text,blocker text,check_id text) LANGUAGE sql IMMUTABLE SET search_path=public AS $$ VALUES
 (1,'public_routes','Public pages load with unique accessible metadata','verification_campaign','seo_accessibility','seo-public'),
 (2,'auth_guards','Signed-out visitors are sent to sign-in','access_matrix','access_matrix','redirect-signed-out'),
 (3,'role_access','Live behaviour matches the access matrix','access_matrix','access_matrix','matrix-live'),
 (4,'isolation','A partner never reads another partner''s records','access_matrix','access_matrix','isolation-tenant'),
 (5,'safety_gates','No request without four PASS screening results','verification_campaign','verification_campaign','screening-gates'),
 (6,'credit_lifecycle','One reservation, one consumption, no negative balance','verification_campaign','verification_campaign','credit-invariants'),
 (7,'mcs_handoff','Adapter stays in mock mode with no automatic calls','verification_campaign','verification_campaign','mcs-manual'),
 (8,'certificates','Certificate files stay private and need review','verification_campaign','verification_campaign','certificates-private'),
 (9,'outbox','External delivery workers do nothing','integration_safety','notifications_outbox','outbox-disabled'),
 (10,'sla','Pauses and maintenance are excluded from SLA clocks','verification_campaign','sla_controls','sla-clock'),
 (11,'privacy','Privacy requests need independent approval with history kept','verification_campaign','privacy_retention','privacy-retention'),
 (12,'reconciliation','Adjustments are reporting-only and independently approved','verification_campaign','reconciliation','reconciliation'),
 (13,'audit','Audit rows cannot be edited or deleted','release_evidence','campaign_history','audit-append-only'),
 (14,'protection','Recorded migration/RLS/storage evidence confirmed independently','protection_evidence','protection_evidence','protection-evidence'),
 (15,'backup','Restore test recorded and confirmed independently','backup_evidence','backup_evidence','backup-evidence'),
 (16,'content','Every content type acknowledged by a different reviewer','content_review','content_claims','content-review'),
 (17,'rollback','Rollback drill runs on synthetic state only','release_runbook','rollback_drill','rollback-drill'),
 (18,'no_external','No requests leave the site during checks','integration_safety','notifications_outbox','no-external') $$;
REVOKE ALL ON FUNCTION public.session_result_catalog() FROM PUBLIC,anon,authenticated;
CREATE TABLE public.session_result_record(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_key text NOT NULL CHECK(session_key IN ('primary-human-session','follow-up-human-session')),
 suite_key text NOT NULL CHECK(suite_key IN ('public_routes','auth_guards','role_access','isolation','safety_gates','credit_lifecycle','mcs_handoff','certificates','outbox','sla','privacy','reconciliation','audit','protection','backup','content','rollback','no_external')),
 version int NOT NULL CHECK(version>0),
 expected text NOT NULL CHECK(expected IN ('Public pages load with unique accessible metadata','Signed-out visitors are sent to sign-in','Live behaviour matches the access matrix','A partner never reads another partner''s records','No request without four PASS screening results','One reservation, one consumption, no negative balance','Adapter stays in mock mode with no automatic calls','Certificate files stay private and need review','External delivery workers do nothing','Pauses and maintenance are excluded from SLA clocks','Privacy requests need independent approval with history kept','Adjustments are reporting-only and independently approved','Audit rows cannot be edited or deleted','Recorded migration/RLS/storage evidence confirmed independently','Restore test recorded and confirmed independently','Every content type acknowledged by a different reviewer','Rollback drill runs on synthetic state only','No requests leave the site during checks')),
 status text NOT NULL CHECK(status IN ('passed','failed','blocked','concern','unverified')),
 result_label text NOT NULL CHECK(result_label IN ('Observed as expected','Deviation observed','Execution blocked','Reviewer concern recorded','Not yet observed')),
 blocker_reason text NOT NULL CHECK(blocker_reason IN ('No blocker recorded','Result not recorded','Session not authorized','Prerequisite suite outstanding','Independent review outstanding','Deviation under investigation','Concern raised')),
 next_action text NOT NULL CHECK(next_action IN ('No action required','Re-run the suite manually','Record the blocker in the owner action queue','Request independent review','Await the prerequisite suite result')),
 environment_label text NOT NULL CHECK(environment_label='Signed-in preview'),
 evidence_label text NOT NULL CHECK(evidence_label='Independent human session result review'),
 source_session_version int NOT NULL CHECK(source_session_version>=0),
 owner_role text NOT NULL CHECK(owner_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),
 recorder uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 UNIQUE(session_key,suite_key,version),
 CHECK((status='passed')=(result_label='Observed as expected' AND blocker_reason='No blocker recorded')));
CREATE TABLE public.session_result_review(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 record_id uuid NOT NULL REFERENCES public.session_result_record(id),
 review_slot int NOT NULL CHECK(review_slot IN (1,2)),
 outcome text NOT NULL CHECK(outcome IN ('confirmed','concern')),
 reviewer uuid NOT NULL,
 reviewer_role text NOT NULL CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 UNIQUE(record_id,review_slot), UNIQUE(record_id,reviewer));
GRANT SELECT ON public.session_result_record,public.session_result_review TO authenticated;
GRANT ALL ON public.session_result_record,public.session_result_review TO service_role;
ALTER TABLE public.session_result_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_result_review ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.session_result_record,public.session_result_review FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.session_result_record,public.session_result_review FROM authenticated;
CREATE POLICY session_result_record_read ON public.session_result_record FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
CREATE POLICY session_result_review_read ON public.session_result_review FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
CREATE TRIGGER session_result_record_immutable BEFORE UPDATE OR DELETE ON public.session_result_record FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER session_result_review_immutable BEFORE UPDATE OR DELETE ON public.session_result_review FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
-- A result counts as passed only with two confirmed reviews by different reviewers, neither the recorder, holding different global roles, on the latest version, while every hard prerequisite remains confirmed.
CREATE FUNCTION public.session_result_passed(_record_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM session_result_record r WHERE r.id=_record_id AND r.status='passed'
  AND (SELECT count(*) FROM session_result_review v WHERE v.record_id=r.id AND v.outcome='confirmed' AND v.reviewer<>r.recorder)=2
  AND (SELECT count(DISTINCT v.reviewer_role) FROM session_result_review v WHERE v.record_id=r.id AND v.outcome='confirmed' AND v.reviewer<>r.recorder)=2)
 $$;
REVOKE ALL ON FUNCTION public.session_result_passed(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.session_result_record_save(_session text,_suite text,_version int,_status text,_result_label text,_blocker_reason text,_next_action text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); v int; role text; cat record; se session_start_event; row session_result_record;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF; PERFORM care_require_strong();
 SELECT * INTO cat FROM session_result_catalog() WHERE suite_key=coalesce(_suite,'');
 IF cat.suite_key IS NULL OR _session IS NULL OR _session NOT IN ('primary-human-session','follow-up-human-session') OR _version IS NULL OR _version<0 OR coalesce(_status,'') NOT IN ('passed','failed','blocked','concern','unverified') OR coalesce(_result_label,'') NOT IN ('Observed as expected','Deviation observed','Execution blocked','Reviewer concern recorded','Not yet observed') OR coalesce(_blocker_reason,'') NOT IN ('No blocker recorded','Result not recorded','Session not authorized','Prerequisite suite outstanding','Independent review outstanding','Deviation under investigation','Concern raised') OR coalesce(_next_action,'') NOT IN ('No action required','Re-run the suite manually','Record the blocker in the owner action queue','Request independent review','Await the prerequisite suite result') OR access_unsafe(_status) OR access_unsafe(_result_label) OR access_unsafe(_blocker_reason) OR access_unsafe(_next_action) THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 IF (_status='passed')<>(_result_label='Observed as expected' AND _blocker_reason='No blocker recorded') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 SELECT x.role::text INTO role FROM user_roles x WHERE x.user_id=u AND x.partner_id IS NULL AND x.role IN ('SUPER_ADMIN','OPERATIONS_ADMIN') ORDER BY x.role LIMIT 1;
 IF role IS NULL THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('session_result:'||_session));
 SELECT * INTO se FROM session_start_event WHERE session_key=_session ORDER BY version DESC LIMIT 1;
 IF se.id IS NULL OR se.status<>'in-progress' THEN RAISE EXCEPTION 'SESSION_NOT_AUTHORIZED'; END IF;
 IF cardinality(session_start_missing())>0 THEN RAISE EXCEPTION 'PREREQUISITES_UNAVAILABLE'; END IF;
 IF cat.ord>1 AND EXISTS(SELECT 1 FROM session_result_catalog() p WHERE p.ord<cat.ord AND NOT EXISTS(SELECT 1 FROM session_result_record r WHERE r.session_key=_session AND r.suite_key=p.suite_key)) THEN RAISE EXCEPTION 'ORDER_REQUIRED'; END IF;
 SELECT coalesce(max(version),0) INTO v FROM session_result_record WHERE session_key=_session AND suite_key=_suite; IF v<>_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 INSERT INTO session_result_record(session_key,suite_key,version,expected,status,result_label,blocker_reason,next_action,environment_label,evidence_label,source_session_version,owner_role,recorder) VALUES(_session,_suite,v+1,cat.expected,_status,_result_label,_blocker_reason,_next_action,'Signed-in preview','Independent human session result review',se.version,role,u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'version',row.version,'correlation_id',row.correlation_id);
END $$;
CREATE FUNCTION public.session_result_confirm(_id uuid,_slot int,_outcome text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); r session_result_record; role text; other_role text; row session_result_review;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF; PERFORM care_require_strong();
 IF _slot IS NULL OR _slot NOT IN (1,2) OR coalesce(_outcome,'') NOT IN ('confirmed','concern') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 SELECT * INTO r FROM session_result_record WHERE id=_id; IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('session_result:'||r.session_key));
 IF r.version<>(SELECT max(version) FROM session_result_record WHERE session_key=r.session_key AND suite_key=r.suite_key) THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 IF r.recorder=u THEN RAISE EXCEPTION 'SECOND_REVIEWER_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM session_result_review WHERE record_id=r.id AND (review_slot=_slot OR reviewer=u)) THEN RAISE EXCEPTION 'DUPLICATE_REVIEW'; END IF;
 SELECT x.role::text INTO role FROM user_roles x WHERE x.user_id=u AND x.partner_id IS NULL AND x.role IN ('SUPER_ADMIN','OPERATIONS_ADMIN') ORDER BY x.role LIMIT 1;
 IF role IS NULL THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 SELECT v.reviewer_role INTO other_role FROM session_result_review v WHERE v.record_id=r.id AND v.review_slot=CASE WHEN _slot=1 THEN 2 ELSE 1 END;
 IF other_role IS NOT NULL AND other_role=role THEN RAISE EXCEPTION 'ROLE_SEPARATION_REQUIRED'; END IF;
 IF _outcome='confirmed' AND r.status='passed' AND cardinality(session_start_missing())>0 THEN RAISE EXCEPTION 'PREREQUISITES_UNAVAILABLE'; END IF;
 INSERT INTO session_result_review(record_id,review_slot,outcome,reviewer,reviewer_role) VALUES(r.id,_slot,_outcome,u,role) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'correlation_id',row.correlation_id);
END $$;
CREATE FUNCTION public.session_result_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); sk text; cat record; se session_start_event; r session_result_record; missing text[]; suites jsonb; sessions jsonb:='[]'; st text; reason text; rev1 session_result_review; rev2 session_result_review; passed boolean; recon jsonb; reopened jsonb; blk record; had_passed boolean; n int;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF; PERFORM care_require_strong();
 missing:=session_start_missing();
 FOREACH sk IN ARRAY ARRAY['primary-human-session','follow-up-human-session'] LOOP
  SELECT * INTO se FROM session_start_event WHERE session_key=sk ORDER BY version DESC LIMIT 1;
  suites:='[]';
  FOR cat IN SELECT * FROM session_result_catalog() ORDER BY ord LOOP
   SELECT * INTO r FROM session_result_record WHERE session_key=sk AND suite_key=cat.suite_key ORDER BY version DESC LIMIT 1;
   rev1:=NULL; rev2:=NULL;
   IF r.id IS NOT NULL THEN SELECT * INTO rev1 FROM session_result_review WHERE record_id=r.id AND review_slot=1; SELECT * INTO rev2 FROM session_result_review WHERE record_id=r.id AND review_slot=2; END IF;
   passed:=coalesce(r.id IS NOT NULL AND session_result_passed(r.id) AND cardinality(missing)=0,false);
   st:=CASE WHEN r.id IS NULL THEN 'unverified' WHEN rev1.outcome='concern' OR rev2.outcome='concern' OR r.status='concern' THEN 'concern' WHEN r.status IN ('failed','blocked') THEN r.status WHEN passed THEN 'passed' ELSE 'unverified' END;
   reason:=CASE WHEN r.id IS NULL AND (se.id IS NULL OR se.status<>'in-progress') THEN 'Session not authorized'
    WHEN r.id IS NULL AND EXISTS(SELECT 1 FROM session_result_catalog() p WHERE p.ord<cat.ord AND NOT EXISTS(SELECT 1 FROM session_result_record x WHERE x.session_key=sk AND x.suite_key=p.suite_key)) THEN 'Prerequisite suite outstanding'
    WHEN r.id IS NULL THEN 'Result not recorded'
    WHEN st='concern' THEN 'Concern raised' WHEN st='failed' OR st='blocked' THEN r.blocker_reason
    WHEN st='passed' THEN 'No blocker recorded'
    WHEN cardinality(missing)>0 THEN 'Session not authorized' ELSE 'Independent review outstanding' END;
   suites:=suites||jsonb_build_array(jsonb_build_object('ord',cat.ord,'suite_key',cat.suite_key,'expected',cat.expected,'artifact',cat.artifact,'blocker',cat.blocker,'check_id',cat.check_id,'status',st,'reason',reason,'record',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'version',r.version,'status',r.status,'result_label',r.result_label,'blocker_reason',r.blocker_reason,'next_action',r.next_action,'evidence_label',r.evidence_label,'environment_label',r.environment_label,'source_session_version',r.source_session_version,'owner_role',r.owner_role,'mine',r.recorder=u,'created_at',r.created_at,'correlation_id',r.correlation_id,'review1',CASE WHEN rev1.id IS NULL THEN NULL ELSE jsonb_build_object('outcome',rev1.outcome,'reviewer_role',rev1.reviewer_role,'mine',rev1.reviewer=u,'created_at',rev1.created_at,'correlation_id',rev1.correlation_id) END,'review2',CASE WHEN rev2.id IS NULL THEN NULL ELSE jsonb_build_object('outcome',rev2.outcome,'reviewer_role',rev2.reviewer_role,'mine',rev2.reviewer=u,'created_at',rev2.created_at,'correlation_id',rev2.correlation_id) END) END));
  END LOOP;
  sessions:=sessions||jsonb_build_array(jsonb_build_object('session_key',sk,'session_status',coalesce(se.status,'unavailable'),'session_version',coalesce(se.version,0),'authorized',coalesce(se.status='in-progress',false),'suites',suites,
   'counts',(SELECT jsonb_build_object('passed',count(*) FILTER(WHERE s->>'status'='passed'),'failed',count(*) FILTER(WHERE s->>'status'='failed'),'blocked',count(*) FILTER(WHERE s->>'status'='blocked'),'concern',count(*) FILTER(WHERE s->>'status'='concern'),'unverified',count(*) FILTER(WHERE s->>'status'='unverified')) FROM jsonb_array_elements(suites) s)));
 END LOOP;
 -- Dependent blockers: derived only, never written back. 'reopened' means a previously confirmed-passed result was superseded by a non-passed or stale latest version; 'open' means never satisfied; 'satisfied' never closes the owner action.
 reopened:='[]';
 FOR blk IN SELECT blocker,array_agg(suite_key ORDER BY ord) suite_list FROM session_result_catalog() GROUP BY blocker LOOP
  had_passed:=EXISTS(SELECT 1 FROM session_result_record rr WHERE rr.suite_key=ANY(blk.suite_list) AND session_result_passed(rr.id));
  reopened:=reopened||jsonb_build_array(jsonb_build_object('blocker',blk.blocker,'suites',to_jsonb(blk.suite_list),'state',CASE
   WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(sessions) sess WHERE NOT EXISTS(SELECT 1 FROM session_result_catalog() c WHERE c.blocker=blk.blocker AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(sess->'suites') s WHERE s->>'suite_key'=c.suite_key AND s->>'status'='passed'))) THEN 'satisfied'
   WHEN had_passed THEN 'reopened' ELSE 'open' END,'closure_granted',false));
 END LOOP;
 -- Reconciliation against the existing registers: redacted counts only, never auto-closing.
 recon:=jsonb_build_array(
  jsonb_build_object('register','Final validation evidence snapshot','expected',12,'observed',(SELECT count(*) FROM (SELECT DISTINCT ON (check_key) vs.*,(SELECT o.outcome FROM validation_snapshot_review o WHERE o.record_id=vs.id) oc FROM validation_snapshot_record vs ORDER BY check_key,version DESC) l WHERE l.status='passed' AND l.oc='confirmed' AND EXISTS(SELECT 1 FROM validation_snapshot_review o WHERE o.record_id=l.id AND o.reviewer<>l.recorder)),'next_action','Reconcile counts before session completion'),
  jsonb_build_object('register','Final release evidence bundle','expected',20,'observed',(SELECT count(*) FROM (SELECT DISTINCT ON (register) ra.* FROM release_artifact_snapshot ra ORDER BY register,version DESC) l WHERE l.observed_status='passed' AND EXISTS(SELECT 1 FROM release_artifact_review v WHERE v.snapshot_id=l.id AND v.outcome='confirmed' AND v.reviewer<>l.recorder)),'next_action','Reconcile counts before session completion'),
  jsonb_build_object('register','Owner action closure board','expected',14,'observed',(SELECT count(*) FROM (SELECT DISTINCT ON (blocker_key) ocr.* FROM owner_closure_record ocr ORDER BY blocker_key,version DESC) l WHERE l.status='closed' AND EXISTS(SELECT 1 FROM owner_closure_review v WHERE v.record_id=l.id AND v.outcome='closed' AND v.reviewer<>l.recorder)),'next_action','Reconcile counts before session completion'),
  jsonb_build_object('register','Readiness change and decision ledger','expected',(SELECT count(*) FROM (SELECT DISTINCT ON (blocker_key) ocr2.* FROM owner_closure_record ocr2 ORDER BY blocker_key,version DESC) l WHERE l.status='closed'),'observed',(SELECT count(*) FROM readiness_decision_event WHERE decision='closure-confirmed'),'next_action','Reconcile counts before session completion'),
  jsonb_build_object('register','Human review sign-off console','expected',0,'observed',(SELECT count(*) FROM review_rounds g WHERE human_review_status(g.round)='approved'),'next_action','No action required'));
 SELECT jsonb_agg(x||jsonb_build_object('match',(x->>'expected')::int=(x->>'observed')::int)) INTO recon FROM jsonb_array_elements(recon) x;
 RETURN jsonb_build_object('missing_prerequisites',to_jsonb(missing),'sessions',sessions,'dependent_blockers',reopened,'reconciliation',recon,'readiness_claimed',false);
END $$;
REVOKE ALL ON FUNCTION public.session_result_record_save(text,text,int,text,text,text,text),public.session_result_confirm(uuid,int,text),public.session_result_console() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.session_result_record_save(text,text,int,text,text,text,text),public.session_result_confirm(uuid,int,text),public.session_result_console() TO authenticated;
COMMENT ON TABLE public.session_result_record IS 'Redacted human session result metadata only. Never starts a session or runs tests. No release authority.';
COMMENT ON TABLE public.session_result_review IS 'Two-reviewer independent confirmation of redacted session results. No release authority.';
