-- Corrective: rename the record alias in the dependent-blocker scan; the plpgsql row variable r clashed with the table alias r (SQLSTATE 42702).
CREATE OR REPLACE FUNCTION public.session_result_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); sk text; cat record; se session_start_event; r session_result_record; missing text[]; suites jsonb; sessions jsonb:='[]'; st text; reason text; rev1 session_result_review; rev2 session_result_review; passed boolean; recon jsonb; reopened jsonb; blk record; had_passed boolean;
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
 reopened:='[]';
 FOR blk IN SELECT blocker,array_agg(suite_key ORDER BY ord) suite_list FROM session_result_catalog() GROUP BY blocker LOOP
  had_passed:=EXISTS(SELECT 1 FROM session_result_record rr WHERE rr.suite_key=ANY(blk.suite_list) AND session_result_passed(rr.id));
  reopened:=reopened||jsonb_build_array(jsonb_build_object('blocker',blk.blocker,'suites',to_jsonb(blk.suite_list),'state',CASE
   WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(sessions) sess WHERE NOT EXISTS(SELECT 1 FROM session_result_catalog() c WHERE c.blocker=blk.blocker AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(sess->'suites') s WHERE s->>'suite_key'=c.suite_key AND s->>'status'='passed'))) THEN 'satisfied'
   WHEN had_passed THEN 'reopened' ELSE 'open' END,'closure_granted',false));
 END LOOP;
 recon:=jsonb_build_array(
  jsonb_build_object('register','Final validation evidence snapshot','expected',12,'observed',(SELECT count(*) FROM (SELECT DISTINCT ON (check_key) r.*,(SELECT o.outcome FROM validation_snapshot_review o WHERE o.record_id=r.id) oc FROM validation_snapshot_record r ORDER BY check_key,version DESC) l WHERE l.status='passed' AND l.oc='confirmed' AND EXISTS(SELECT 1 FROM validation_snapshot_review o WHERE o.record_id=l.id AND o.reviewer<>l.recorder)),'next_action','Reconcile counts before session completion'),
  jsonb_build_object('register','Final release evidence bundle','expected',20,'observed',(SELECT count(*) FROM (SELECT DISTINCT ON (register) s.* FROM release_artifact_snapshot s ORDER BY register,version DESC) l WHERE l.observed_status='passed' AND EXISTS(SELECT 1 FROM release_artifact_review v WHERE v.snapshot_id=l.id AND v.outcome='confirmed' AND v.reviewer<>l.recorder)),'next_action','Reconcile counts before session completion'),
  jsonb_build_object('register','Owner action closure board','expected',14,'observed',(SELECT count(*) FROM (SELECT DISTINCT ON (blocker_key) r.* FROM owner_closure_record r ORDER BY blocker_key,version DESC) l WHERE l.status='closed' AND EXISTS(SELECT 1 FROM owner_closure_review v WHERE v.record_id=l.id AND v.outcome='closed' AND v.reviewer<>l.recorder)),'next_action','Reconcile counts before session completion'),
  jsonb_build_object('register','Readiness change and decision ledger','expected',(SELECT count(*) FROM (SELECT DISTINCT ON (blocker_key) r.* FROM owner_closure_record r ORDER BY blocker_key,version DESC) l WHERE l.status='closed'),'observed',(SELECT count(*) FROM readiness_decision_event WHERE decision='closure-confirmed'),'next_action','Reconcile counts before session completion'),
  jsonb_build_object('register','Human review sign-off console','expected',0,'observed',(SELECT count(*) FROM review_rounds g WHERE human_review_status(g.round)='approved'),'next_action','No action required'));
 SELECT jsonb_agg(x||jsonb_build_object('match',(x->>'expected')::int=(x->>'observed')::int)) INTO recon FROM jsonb_array_elements(recon) x;
 RETURN jsonb_build_object('missing_prerequisites',to_jsonb(missing),'sessions',sessions,'dependent_blockers',reopened,'reconciliation',recon,'readiness_claimed',false);
END $$;
REVOKE ALL ON FUNCTION public.session_result_console() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.session_result_console() TO authenticated;