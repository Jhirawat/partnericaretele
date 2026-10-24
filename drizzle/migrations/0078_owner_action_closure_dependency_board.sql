CREATE FUNCTION public.owner_closure_catalog() RETURNS TABLE(key text,label text,checks text[],artifacts text[],checklists text[],owner_actions text[],dependencies text[]) LANGUAGE sql IMMUTABLE SET search_path=public AS $$ VALUES
('seo_accessibility','Public SEO and accessibility readiness',ARRAY['seo-public','seo-private-noindex','a11y-mobile','a11y-contrast'],ARRAY['verification_campaign','publish_gate'],ARRAY['dns_domain_seo','public_routes'],ARRAY['publish_owner'],ARRAY['test_prerequisites']),
('content_claims','Content and claims review',ARRAY['content-review'],ARRAY['content_review','content_approval'],ARRAY['content_claims'],ARRAY['clinic_facts','contact_details','pricing_terms','claims_review'],ARRAY['test_prerequisites','owner_action_queue']),
('access_matrix','Access matrix audit',ARRAY['matrix-live'],ARRAY['access_matrix'],ARRAY['auth_guards','access_controls'],ARRAY['superadmin_account','second_reviewer','preview_access'],ARRAY['test_prerequisites','owner_action_queue']),
('verification_campaign','Unified verification campaign',ARRAY['seo-public','seo-private-noindex','a11y-mobile','a11y-contrast','redirect-signed-out','matrix-live','isolation-tenant','doctor-scope','screening-gates','credit-invariants','mcs-manual','certificates-private','outbox-disabled','sla-clock','privacy-retention','reconciliation','audit-append-only','protection-evidence','backup-evidence','content-review','rollback-drill','no-external'],ARRAY['verification_campaign'],ARRAY['credits','monitoring','no_external_calls'],ARRAY['publish_owner'],ARRAY['seo_accessibility','content_claims','access_matrix','campaign_history','protection_evidence','backup_evidence','rollback_drill','privacy_retention','reconciliation','notifications_outbox','sla_controls']),
('campaign_history','Persistent campaign history',ARRAY['audit-append-only'],ARRAY['campaign_history'],ARRAY['monitoring'],ARRAY['superadmin_account','preview_access'],ARRAY['test_prerequisites']),
('test_prerequisites','Production test prerequisites',ARRAY[]::text[],ARRAY['production_readiness'],ARRAY['access_controls'],ARRAY['publish_owner'],ARRAY[]::text[]),
('protection_evidence','Migration, RLS and storage evidence',ARRAY['protection-evidence'],ARRAY['protection_evidence'],ARRAY['protection_evidence'],ARRAY['protection_evidence'],ARRAY['test_prerequisites']),
('backup_evidence','Backup and restore evidence',ARRAY['backup-evidence'],ARRAY['backup_evidence'],ARRAY['backups'],ARRAY['backup_evidence'],ARRAY['test_prerequisites']),
('rollback_drill','Rollback drill',ARRAY['rollback-drill'],ARRAY['release_runbook'],ARRAY['rollback_readiness'],ARRAY['superadmin_account','preview_access'],ARRAY['test_prerequisites','backup_evidence']),
('privacy_retention','Privacy and retention',ARRAY['privacy-retention'],ARRAY['verification_campaign'],ARRAY['privacy_retention'],ARRAY['superadmin_account','second_reviewer','preview_access'],ARRAY['test_prerequisites','protection_evidence']),
('reconciliation','Reconciliation',ARRAY['reconciliation'],ARRAY['verification_campaign'],ARRAY['credits'],ARRAY['superadmin_account','second_reviewer','preview_access'],ARRAY['test_prerequisites','protection_evidence']),
('notifications_outbox','Notifications and outbox disabled',ARRAY['outbox-disabled'],ARRAY['integration_safety','verification_campaign'],ARRAY['notifications_outbox','no_external_calls'],ARRAY['publish_owner'],ARRAY['test_prerequisites']),
('sla_controls','SLA controls',ARRAY['sla-clock'],ARRAY['verification_campaign'],ARRAY['sla_controls'],ARRAY['publish_owner'],ARRAY['test_prerequisites']),
('owner_action_queue','Owner action queue',ARRAY[]::text[],ARRAY['owner_action_queue'],ARRAY['access_controls'],ARRAY['publish_owner'],ARRAY[]::text[]) $$;
REVOKE ALL ON FUNCTION public.owner_closure_catalog() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.owner_closure_catalog() TO authenticated;
CREATE TABLE public.owner_closure_record(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),blocker_key text NOT NULL CHECK(blocker_key IN ('seo_accessibility','content_claims','access_matrix','verification_campaign','campaign_history','test_prerequisites','protection_evidence','backup_evidence','rollback_drill','privacy_retention','reconciliation','notifications_outbox','sla_controls','owner_action_queue')),version int NOT NULL CHECK(version>0),status text NOT NULL CHECK(status IN ('open','in-progress','awaiting-evidence','ready-for-review','blocked')),reason text NOT NULL CHECK(reason IN ('Source evidence outstanding','Independent review outstanding','Dependency remains open','Owner marked blocked','Evidence assembled for review')),next_action text NOT NULL CHECK(next_action IN ('Resolve source evidence','Resolve dependency first','Request independent closure review','Resolve reviewer concern')),evidence_label text NOT NULL CHECK(evidence_label='Independent current source and artifact review'),source_fingerprint text NOT NULL CHECK(source_fingerprint~'^[a-f0-9]{64}$'),recorder uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),UNIQUE(blocker_key,version));
GRANT SELECT ON public.owner_closure_record TO authenticated; GRANT ALL ON public.owner_closure_record TO service_role;
ALTER TABLE public.owner_closure_record ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_closure_record_read ON public.owner_closure_record FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
CREATE TABLE public.owner_closure_review(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),record_id uuid NOT NULL UNIQUE REFERENCES public.owner_closure_record(id),outcome text NOT NULL CHECK(outcome IN ('closed','concern')),reviewer uuid NOT NULL,reviewer_role text NOT NULL CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid());
GRANT SELECT ON public.owner_closure_review TO authenticated; GRANT ALL ON public.owner_closure_review TO service_role;
ALTER TABLE public.owner_closure_review ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_closure_review_read ON public.owner_closure_review FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
REVOKE ALL ON public.owner_closure_record,public.owner_closure_review FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.owner_closure_record,public.owner_closure_review FROM authenticated;
CREATE TRIGGER owner_closure_record_immutable BEFORE UPDATE OR DELETE ON public.owner_closure_record FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER owner_closure_review_immutable BEFORE UPDATE OR DELETE ON public.owner_closure_review FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE FUNCTION public.owner_closure_evidence(_key text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c record; a text; ch text; g text; e release_artifact_snapshot; r campaign_results; run campaign_runs; x jsonb; parts jsonb:='[]'; reasons text[]:=ARRAY[]::text[];
BEGIN
 SELECT * INTO c FROM owner_closure_catalog() WHERE key=_key; IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 FOREACH a IN ARRAY c.artifacts LOOP
  x:=release_bundle_source(a); SELECT * INTO e FROM release_artifact_snapshot WHERE register=a ORDER BY version DESC LIMIT 1;
  parts:=parts||jsonb_build_array(jsonb_build_object('register',a,'source',x,'snapshot',e.id,'version',e.version,'reviews',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'outcome',v.outcome) ORDER BY v.id),'[]') FROM release_artifact_review v WHERE v.snapshot_id=e.id)));
  IF e.id IS NULL OR e.source_count=0 OR e.source_fingerprint<>x->>'fingerprint' OR e.observed_status='blocked' OR NOT EXISTS(SELECT 1 FROM release_artifact_review v WHERE v.snapshot_id=e.id AND v.outcome='confirmed' AND v.reviewer<>e.recorder) OR EXISTS(SELECT 1 FROM release_artifact_review v WHERE v.snapshot_id=e.id AND v.outcome='concern') THEN reasons:=array_append(reasons,'Current independently reviewed artifact required'); END IF;
 END LOOP;
 FOR a IN SELECT unnest(ARRAY['superadmin_account','second_reviewer','preview_access','protection_evidence','backup_evidence','content_review','publish_owner']) LOOP
  x:=(SELECT jsonb_build_object('id',p.id,'version',p.version,'status',p.status,'expired',p.review_due<current_date,'reviews',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'outcome',v.outcome) ORDER BY v.id),'[]') FROM test_prerequisite_reviews v WHERE v.prerequisite_id=p.id)) FROM test_prerequisites p WHERE prerequisite_key=a ORDER BY version DESC LIMIT 1);
  parts:=parts||jsonb_build_array(jsonb_build_object('prerequisite',a,'state',x));
  IF NOT EXISTS(SELECT 1 FROM test_prerequisites p WHERE p.prerequisite_key=a AND p.version=(SELECT max(z.version) FROM test_prerequisites z WHERE z.prerequisite_key=a) AND p.status='available' AND p.review_due>=current_date AND EXISTS(SELECT 1 FROM test_prerequisite_reviews v WHERE v.prerequisite_id=p.id AND v.outcome='confirmed' AND v.reviewer<>p.recorder) AND NOT EXISTS(SELECT 1 FROM test_prerequisite_reviews v WHERE v.prerequisite_id=p.id AND v.outcome='rejected')) THEN reasons:=array_append(reasons,'Current independently reviewed prerequisite required'); END IF;
 END LOOP;
 IF _key='owner_action_queue' THEN c.owner_actions:=ARRAY['superadmin_account','second_reviewer','preview_access','protection_evidence','backup_evidence','clinic_facts','contact_details','pricing_terms','claims_review','publish_owner']; END IF;
 FOREACH a IN ARRAY c.owner_actions LOOP
  x:=(SELECT jsonb_build_object('id',p.id,'version',p.version,'status',p.status,'expired',p.review_due<current_date,'reviews',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'outcome',v.outcome) ORDER BY v.id),'[]') FROM owner_action_reviews v WHERE v.item_id=p.id)) FROM owner_action_items p WHERE item_key=a ORDER BY version DESC LIMIT 1);
  parts:=parts||jsonb_build_array(jsonb_build_object('owner_action',a,'state',x));
  IF NOT EXISTS(SELECT 1 FROM owner_action_items p WHERE p.item_key=a AND p.version=(SELECT max(z.version) FROM owner_action_items z WHERE z.item_key=a) AND p.status='available' AND p.review_due>=current_date AND EXISTS(SELECT 1 FROM owner_action_reviews v WHERE v.item_id=p.id AND v.outcome='confirmed' AND v.reviewer<>p.recorder) AND NOT EXISTS(SELECT 1 FROM owner_action_reviews v WHERE v.item_id=p.id AND v.outcome='rejected')) THEN reasons:=array_append(reasons,'Current independently reviewed owner action required'); END IF;
 END LOOP;
 FOREACH ch IN ARRAY c.checks LOOP
  SELECT t.* INTO r FROM campaign_results t JOIN campaign_runs z ON z.id=t.run_id WHERE t.check_id=ch ORDER BY z.run_no DESC LIMIT 1;
  SELECT * INTO run FROM campaign_runs WHERE id=r.run_id;
  parts:=parts||jsonb_build_array(jsonb_build_object('check',ch,'result',r.id,'status',r.status,'simulated',r.simulated,'reviews',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'outcome',v.outcome) ORDER BY v.id),'[]') FROM campaign_result_confirmations v WHERE v.result_id=r.id)));
  IF r.id IS NULL OR r.simulated OR run.simulated OR r.status<>'unverified' OR NOT EXISTS(SELECT 1 FROM campaign_result_confirmations v WHERE v.result_id=r.id AND v.outcome='confirmed' AND v.reviewer<>run.recorder) OR EXISTS(SELECT 1 FROM campaign_result_confirmations v WHERE v.result_id=r.id AND v.outcome='rejected') THEN reasons:=array_append(reasons,'Real independently reviewed verification check required'); END IF;
 END LOOP;
 FOREACH g IN ARRAY c.checklists LOOP
  x:=(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'version',t.version,'status',t.status,'date',t.review_date,'reviews',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'outcome',v.outcome) ORDER BY v.id),'[]') FROM launch_control_review v WHERE v.item_id=t.id)) ORDER BY t.id),'[]') FROM launch_control_item t WHERE t.checklist_group=g AND t.phase='preflight' AND NOT EXISTS(SELECT 1 FROM launch_control_item z WHERE z.lineage=t.lineage AND z.version>t.version));
  parts:=parts||jsonb_build_array(jsonb_build_object('checklist',g,'state',x));
  IF jsonb_array_length(x)=0 OR EXISTS(SELECT 1 FROM launch_control_item t WHERE t.checklist_group=g AND t.phase='preflight' AND NOT EXISTS(SELECT 1 FROM launch_control_item z WHERE z.lineage=t.lineage AND z.version>t.version) AND (t.status NOT IN ('ready','complete') OR t.review_date IS NULL OR NOT EXISTS(SELECT 1 FROM launch_control_review v WHERE v.item_id=t.id AND v.outcome='confirmed' AND v.reviewer<>t.recorder) OR EXISTS(SELECT 1 FROM launch_control_review v WHERE v.item_id=t.id AND v.outcome='concern'))) THEN reasons:=array_append(reasons,'Current independently reviewed preflight checklist required'); END IF;
 END LOOP;
 RETURN jsonb_build_object('fingerprint',encode(sha256(convert_to(parts::text,'UTF8')),'hex'),'eligible',cardinality(reasons)=0,'reasons',to_jsonb(ARRAY(SELECT DISTINCT v FROM unnest(reasons) v ORDER BY v)));
END $$;
REVOKE ALL ON FUNCTION public.owner_closure_evidence(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.owner_closure_valid(_key text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE e owner_closure_record; d text; c record; proof jsonb;
BEGIN
 SELECT * INTO e FROM owner_closure_record WHERE blocker_key=_key ORDER BY version DESC LIMIT 1;
 IF e.id IS NULL OR e.status<>'ready-for-review' OR NOT EXISTS(SELECT 1 FROM owner_closure_review v WHERE v.record_id=e.id AND v.outcome='closed' AND v.reviewer<>e.recorder) THEN RETURN false; END IF;
 proof:=owner_closure_evidence(_key); IF NOT (proof->>'eligible')::boolean OR e.source_fingerprint<>proof->>'fingerprint' THEN RETURN false; END IF;
 SELECT * INTO c FROM owner_closure_catalog() WHERE key=_key;
 FOREACH d IN ARRAY c.dependencies LOOP IF NOT owner_closure_valid(d) THEN RETURN false; END IF; END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.owner_closure_valid(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.owner_closure_record_version(_key text,_version int,_status text,_reason text,_next text,_evidence text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); v int; proof jsonb; row owner_closure_record;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF; PERFORM care_require_strong();
 IF NOT EXISTS(SELECT 1 FROM owner_closure_catalog() WHERE key=_key) OR _version IS NULL OR _version<0 OR _status IS NULL OR _status NOT IN ('open','in-progress','awaiting-evidence','ready-for-review','blocked') OR _reason IS NULL OR _reason NOT IN ('Source evidence outstanding','Independent review outstanding','Dependency remains open','Owner marked blocked','Evidence assembled for review') OR _next IS NULL OR _next NOT IN ('Resolve source evidence','Resolve dependency first','Request independent closure review','Resolve reviewer concern') OR _evidence IS DISTINCT FROM 'Independent current source and artifact review' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('owner_closure_board'));
 SELECT coalesce(max(version),0) INTO v FROM owner_closure_record WHERE blocker_key=_key; IF v<>_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 IF owner_closure_valid(_key) THEN RAISE EXCEPTION 'DUPLICATE_CLOSURE'; END IF;
 proof:=owner_closure_evidence(_key);
 IF _status='ready-for-review' AND NOT (proof->>'eligible')::boolean THEN RAISE EXCEPTION 'MISSING_EVIDENCE'; END IF;
 INSERT INTO owner_closure_record(blocker_key,version,status,reason,next_action,evidence_label,source_fingerprint,recorder) VALUES(_key,v+1,_status,_reason,_next,_evidence,proof->>'fingerprint',u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'version',row.version,'correlation_id',row.correlation_id);
END $$;
CREATE FUNCTION public.owner_closure_confirm(_id uuid,_outcome text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); e owner_closure_record; d text; c record; proof jsonb; role text; row owner_closure_review;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF; PERFORM care_require_strong();
 IF _outcome IS NULL OR _outcome NOT IN ('closed','concern') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('owner_closure_board'));
 SELECT * INTO e FROM owner_closure_record WHERE id=_id; IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 IF e.version<>(SELECT max(version) FROM owner_closure_record WHERE blocker_key=e.blocker_key) THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 IF e.recorder=u THEN RAISE EXCEPTION 'SECOND_REVIEWER_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM owner_closure_review WHERE record_id=e.id) THEN RAISE EXCEPTION 'DUPLICATE_CLOSURE'; END IF;
 proof:=owner_closure_evidence(e.blocker_key);
 IF e.source_fingerprint<>proof->>'fingerprint' THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 IF _outcome='closed' THEN
  IF e.status<>'ready-for-review' OR NOT (proof->>'eligible')::boolean THEN RAISE EXCEPTION 'MISSING_EVIDENCE'; END IF;
  SELECT * INTO c FROM owner_closure_catalog() WHERE key=e.blocker_key;
  FOREACH d IN ARRAY c.dependencies LOOP IF NOT owner_closure_valid(d) THEN RAISE EXCEPTION 'DEPENDENCY_OPEN'; END IF; END LOOP;
 END IF;
 SELECT x.role::text INTO role FROM user_roles x WHERE x.user_id=u AND x.partner_id IS NULL AND x.role IN ('SUPER_ADMIN','OPERATIONS_ADMIN') ORDER BY x.role LIMIT 1;
 INSERT INTO owner_closure_review(record_id,outcome,reviewer,reviewer_role) VALUES(e.id,_outcome,u,role) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'correlation_id',row.correlation_id);
END $$;
CREATE FUNCTION public.owner_closure_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); c record; e owner_closure_record; proof jsonb; reasons text[]; d text; state text; rows jsonb:='[]'; reviewed timestamptz;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF; PERFORM care_require_strong();
 FOR c IN SELECT * FROM owner_closure_catalog() LOOP
  SELECT * INTO e FROM owner_closure_record WHERE blocker_key=c.key ORDER BY version DESC LIMIT 1;
  proof:=owner_closure_evidence(c.key); reasons:=ARRAY(SELECT jsonb_array_elements_text(proof->'reasons'));
  FOREACH d IN ARRAY c.dependencies LOOP IF NOT owner_closure_valid(d) THEN reasons:=array_append(reasons,'Dependency remains open: '||d); END IF; END LOOP;
  IF e.id IS NULL THEN reasons:=array_append(reasons,'Action version not recorded');
  ELSIF e.source_fingerprint<>proof->>'fingerprint' THEN reasons:=array_append(reasons,'Source evidence changed; new action version required'); END IF;
  IF EXISTS(SELECT 1 FROM owner_closure_review WHERE record_id=e.id AND outcome='concern') THEN reasons:=array_append(reasons,'Independent reviewer concern'); END IF;
  state:=CASE WHEN owner_closure_valid(c.key) THEN 'closed' WHEN e.id IS NULL THEN 'open' WHEN e.source_fingerprint<>proof->>'fingerprint' OR EXISTS(SELECT 1 FROM owner_closure_review WHERE record_id=e.id AND outcome='concern') THEN 'blocked' ELSE e.status END;
  IF state='ready-for-review' AND cardinality(reasons)>0 THEN state:='awaiting-evidence'; END IF;
  IF state<>'closed' THEN reasons:=array_append(reasons,'Explicit independent closure outstanding'); END IF;
  SELECT max(created_at) INTO reviewed FROM owner_closure_review WHERE record_id=e.id AND outcome='closed' AND state='closed';
  rows:=rows||jsonb_build_array(jsonb_build_object('key',c.key,'status',state,'eligible',(proof->>'eligible')::boolean,'reasons',to_jsonb(reasons),'record',CASE WHEN e.id IS NULL THEN NULL ELSE jsonb_build_object('id',e.id,'version',e.version,'status',e.status,'reason',e.reason,'next_action',e.next_action,'evidence_label',e.evidence_label,'mine',e.recorder=u,'created_at',e.created_at,'correlation_id',e.correlation_id,'reviewed',EXISTS(SELECT 1 FROM owner_closure_review WHERE record_id=e.id)) END,'last_reviewed',reviewed));
 END LOOP;
 RETURN rows;
END $$;
REVOKE ALL ON FUNCTION public.owner_closure_record_version(text,int,text,text,text,text),public.owner_closure_confirm(uuid,text),public.owner_closure_console() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_closure_record_version(text,int,text,text,text,text),public.owner_closure_confirm(uuid,text),public.owner_closure_console() TO authenticated;