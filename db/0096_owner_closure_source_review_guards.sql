CREATE OR REPLACE FUNCTION public.owner_closure_catalog() RETURNS TABLE(key text,label text,checks text[],artifacts text[],checklists text[],owner_actions text[],dependencies text[]) LANGUAGE sql IMMUTABLE SET search_path=public AS $$ VALUES ('seo_accessibility','Public SEO and accessibility readiness',ARRAY['seo-public','seo-private-noindex','a11y-mobile','a11y-contrast']::text[],ARRAY['verification_campaign','publish_gate']::text[],ARRAY['dns_domain_seo','public_routes']::text[],ARRAY['publish_owner']::text[],ARRAY['test_prerequisites']::text[]),('content_claims','Content and claims review',ARRAY['content-review']::text[],ARRAY['content_review','content_approval']::text[],ARRAY['content_claims']::text[],ARRAY['clinic_facts','contact_details','pricing_terms','claims_review']::text[],ARRAY['test_prerequisites','owner_action_queue']::text[]),('access_matrix','Access matrix audit',ARRAY['matrix-live']::text[],ARRAY['access_matrix']::text[],ARRAY['auth_guards','access_controls']::text[],ARRAY['superadmin_account','second_reviewer','preview_access']::text[],ARRAY['test_prerequisites','owner_action_queue']::text[]),('verification_campaign','Unified verification campaign',ARRAY['seo-public','seo-private-noindex','a11y-mobile','a11y-contrast','redirect-signed-out','matrix-live','isolation-tenant','doctor-scope','screening-gates','credit-invariants','mcs-manual','certificates-private','outbox-disabled','sla-clock','privacy-retention','reconciliation','audit-append-only','protection-evidence','backup-evidence','content-review','rollback-drill','no-external']::text[],ARRAY['verification_campaign']::text[],ARRAY['credits','monitoring','no_external_calls']::text[],ARRAY['publish_owner']::text[],ARRAY['seo_accessibility','content_claims','access_matrix','campaign_history','protection_evidence','backup_evidence','rollback_drill','privacy_retention','reconciliation','notifications_outbox','sla_controls']::text[]),('campaign_history','Persistent campaign history',ARRAY['audit-append-only']::text[],ARRAY['campaign_history']::text[],ARRAY['monitoring']::text[],ARRAY['superadmin_account','preview_access']::text[],ARRAY['test_prerequisites']::text[]),('test_prerequisites','Production test prerequisites',ARRAY[]::text[],ARRAY['production_readiness']::text[],ARRAY['access_controls']::text[],ARRAY['publish_owner']::text[],ARRAY[]::text[]),('protection_evidence','Migration, RLS and storage evidence',ARRAY['protection-evidence']::text[],ARRAY['protection_evidence']::text[],ARRAY['protection_evidence']::text[],ARRAY['protection_evidence']::text[],ARRAY['test_prerequisites']::text[]),('backup_evidence','Backup and restore evidence',ARRAY['backup-evidence']::text[],ARRAY['backup_evidence']::text[],ARRAY['backups']::text[],ARRAY['backup_evidence']::text[],ARRAY['test_prerequisites']::text[]),('rollback_drill','Rollback drill',ARRAY['rollback-drill']::text[],ARRAY['release_runbook']::text[],ARRAY['rollback_readiness']::text[],ARRAY['superadmin_account','preview_access']::text[],ARRAY['test_prerequisites','backup_evidence']::text[]),('privacy_retention','Privacy and retention',ARRAY['privacy-retention']::text[],ARRAY['verification_campaign']::text[],ARRAY['privacy_retention']::text[],ARRAY['superadmin_account','second_reviewer','preview_access']::text[],ARRAY['test_prerequisites','protection_evidence']::text[]),('reconciliation','Reconciliation',ARRAY['reconciliation']::text[],ARRAY['verification_campaign']::text[],ARRAY['credits']::text[],ARRAY['superadmin_account','second_reviewer','preview_access']::text[],ARRAY['test_prerequisites','protection_evidence']::text[]),('notifications_outbox','Notifications and outbox disabled',ARRAY['outbox-disabled']::text[],ARRAY['integration_safety','verification_campaign']::text[],ARRAY['notifications_outbox','no_external_calls']::text[],ARRAY['publish_owner']::text[],ARRAY['test_prerequisites']::text[]),('sla_controls','SLA controls',ARRAY['sla-clock']::text[],ARRAY['verification_campaign']::text[],ARRAY['sla_controls']::text[],ARRAY['publish_owner']::text[],ARRAY['test_prerequisites']::text[]),('owner_action_queue','Owner action queue',ARRAY[]::text[],ARRAY['owner_action_queue']::text[],ARRAY['access_controls']::text[],ARRAY['superadmin_account','second_reviewer','preview_access','protection_evidence','backup_evidence','clinic_facts','contact_details','pricing_terms','claims_review','publish_owner']::text[],ARRAY[]::text[]) $$;
REVOKE ALL ON FUNCTION public.owner_closure_catalog() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.owner_closure_catalog() TO authenticated;
CREATE FUNCTION public.owner_closure_source_gate(_key text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE tbl text; reviews text; fk text; column_key text; required text[]; success text; conditions text; good boolean; k text;
BEGIN
 CASE _key
 WHEN 'content_claims' THEN tbl:='content_review';reviews:='content_review_acks';fk:='review_id';column_key:='item_type';required:=ARRAY['clinic_facts','contact','wording','price_terms','privacy_wording','medical_claims','review_claims','certification_claims'];success:='acknowledged';conditions:='t.status<>''blocked'' AND t.review_date IS NOT NULL';
 WHEN 'access_matrix' THEN tbl:='access_audit';reviews:='access_audit_confirmations';fk:='audit_id';column_key:='item_key';required:=ARRAY['public_view_anon','auth_view_anon','customer_login','partner_own_org','partner_other_org','doctor_assigned','doctor_recruit_partner','doctor_recruit_ops','mcs_handoff_ops','mcs_handoff_partner','ops_console_scoped','ops_console_partner','superadmin_console','superadmin_console_ops','evidence_record_superadmin','evidence_record_scoped','runbook_drill_superadmin','runbook_drill_anon','gate_read_superadmin','gate_read_anon','gate_publish_any','private_index_any'];success:='confirmed';conditions:='t.status<>''blocked''';
 WHEN 'backup_evidence' THEN tbl:='backup_evidence';reviews:='backup_evidence_confirmations';fk:='evidence_id';column_key:='lineage';required:=NULL;success:='confirmed';conditions:='t.status<>''blocked'' AND t.restore_result=''success'' AND t.backup_date IS NOT NULL AND t.retention_days IS NOT NULL AND t.restore_test_date IS NOT NULL';
 WHEN 'protection_evidence' THEN tbl:='protection_evidence';reviews:='protection_evidence_confirmations';fk:='evidence_id';column_key:='lineage';required:=NULL;success:='confirmed';conditions:='t.status<>''blocked'' AND t.applied_date IS NOT NULL AND t.migration_history=''matched'' AND t.rls_result=''all_enabled'' AND t.protected_tables=''all_protected'' AND t.storage_policy=''private''';
 WHEN 'notifications_outbox' THEN tbl:='integration_safety_item';reviews:='integration_safety_review';fk:='item_id';column_key:='category';required:=ARRAY['email','sms','push_notifications','webhooks'];success:='confirmed';conditions:='t.status IN (''disabled'',''unconnected'') AND t.review_date IS NOT NULL';
 WHEN 'seo_accessibility' THEN
  FOREACH k IN ARRAY ARRAY['keyboard_focus','contrast','device_performance'] LOOP
   IF (SELECT count(DISTINCT reviewer) FROM (SELECT DISTINCT ON (reviewer) * FROM release_review_acks WHERE item_key=k ORDER BY reviewer,round DESC) latest WHERE outcome='acknowledged')<2 OR EXISTS(SELECT 1 FROM (SELECT DISTINCT ON (reviewer) * FROM release_review_acks WHERE item_key=k ORDER BY reviewer,round DESC) latest WHERE outcome='concern') THEN RETURN false; END IF;
  END LOOP; RETURN true;
 WHEN 'campaign_history' THEN RETURN EXISTS(SELECT 1 FROM campaign_runs WHERE NOT simulated) AND NOT (SELECT simulated FROM campaign_runs ORDER BY run_no DESC LIMIT 1);
 ELSE RETURN true;
 END CASE;
 IF required IS NULL THEN EXECUTE format('SELECT array_agg(DISTINCT %I::text) FROM public.%I',column_key,tbl) INTO required; END IF;
 IF cardinality(required) IS NULL OR cardinality(required)=0 THEN RETURN false; END IF;
 FOREACH k IN ARRAY required LOOP
  EXECUTE format('SELECT count(*)>0 AND bool_and((%s) AND EXISTS(SELECT 1 FROM public.%I v WHERE v.%I=t.id AND v.outcome=$2 AND v.reviewer<>t.recorder) AND NOT EXISTS(SELECT 1 FROM public.%I v WHERE v.%I=t.id AND v.outcome IN (''concern'',''rejected''))) FROM public.%I t WHERE t.%I::text=$1 AND NOT EXISTS(SELECT 1 FROM public.%I z WHERE z.lineage=t.lineage AND z.version>t.version)',conditions,reviews,fk,reviews,fk,tbl,column_key,tbl) INTO good USING k,success;
  IF NOT coalesce(good,false) THEN RETURN false; END IF;
 END LOOP;
 -- All canonical categories remain distinct; source availability is not replaced by a bundle review.
 IF _key='content_claims' THEN
  FOREACH k IN ARRAY ARRAY['clinic_facts','contact_channels','wording_th_en','pricing','terms','privacy_wording','medical_claims','testimonials','certification_claims'] LOOP
   IF NOT EXISTS(SELECT 1 FROM content_approval t WHERE t.category=k AND NOT EXISTS(SELECT 1 FROM content_approval z WHERE z.lineage=t.lineage AND z.version>t.version)) OR EXISTS(SELECT 1 FROM content_approval t WHERE t.category=k AND NOT EXISTS(SELECT 1 FROM content_approval z WHERE z.lineage=t.lineage AND z.version>t.version) AND (t.status<>'available' OR t.canonical_source<>'available' OR t.review_date IS NULL OR NOT EXISTS(SELECT 1 FROM content_approval_reviews v WHERE v.approval_id=t.id AND v.outcome='approved' AND v.reviewer<>t.recorder) OR EXISTS(SELECT 1 FROM content_approval_reviews v WHERE v.approval_id=t.id AND v.outcome='concern'))) THEN RETURN false; END IF;
  END LOOP;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.owner_closure_source_gate(text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.owner_closure_evidence(_key text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c record; a text; ch text; g text; e release_artifact_snapshot; r campaign_results; run campaign_runs; x jsonb; parts jsonb:='[]'; reasons text[]:=ARRAY[]::text[];
BEGIN
 SELECT * INTO c FROM owner_closure_catalog() WHERE key=_key; IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 -- Source fingerprints include full readiness source/review history. Date expiry invalidates old closures without history rewrites.
 FOREACH a IN ARRAY c.artifacts LOOP
  x:=release_bundle_source(a); SELECT * INTO e FROM release_artifact_snapshot WHERE register=a ORDER BY version DESC LIMIT 1;
  parts:=parts||jsonb_build_array(jsonb_build_object('register',a,'source',x,'snapshot',e.id,'version',e.version,'reviews',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'outcome',v.outcome) ORDER BY v.id),'[]') FROM release_artifact_review v WHERE v.snapshot_id=e.id)));
  IF e.id IS NULL OR e.source_count=0 OR e.source_fingerprint<>x->>'fingerprint' OR e.observed_status='blocked' OR NOT EXISTS(SELECT 1 FROM release_artifact_review v WHERE v.snapshot_id=e.id AND v.outcome='confirmed' AND v.reviewer<>e.recorder) OR EXISTS(SELECT 1 FROM release_artifact_review v WHERE v.snapshot_id=e.id AND v.outcome='concern') THEN reasons:=array_append(reasons,'Current independently reviewed artifact required'); END IF;
 END LOOP;
 -- All seven availability prerequisites must be latest, independently confirmed and unexpired.
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
 -- Existing preflight checklist reviews are required; post-publish plans cannot supply closure evidence.
 FOREACH g IN ARRAY c.checklists LOOP
  x:=(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'version',t.version,'status',t.status,'date',t.review_date,'reviews',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'outcome',v.outcome) ORDER BY v.id),'[]') FROM launch_control_review v WHERE v.item_id=t.id)) ORDER BY t.id),'[]') FROM launch_control_item t WHERE t.checklist_group=g AND t.phase='preflight' AND NOT EXISTS(SELECT 1 FROM launch_control_item z WHERE z.lineage=t.lineage AND z.version>t.version));
  parts:=parts||jsonb_build_array(jsonb_build_object('checklist',g,'state',x));
  IF jsonb_array_length(x)=0 OR EXISTS(SELECT 1 FROM launch_control_item t WHERE t.checklist_group=g AND t.phase='preflight' AND NOT EXISTS(SELECT 1 FROM launch_control_item z WHERE z.lineage=t.lineage AND z.version>t.version) AND (t.status NOT IN ('ready','complete') OR t.review_date IS NULL OR NOT EXISTS(SELECT 1 FROM launch_control_review v WHERE v.item_id=t.id AND v.outcome='confirmed' AND v.reviewer<>t.recorder) OR EXISTS(SELECT 1 FROM launch_control_review v WHERE v.item_id=t.id AND v.outcome='concern'))) THEN reasons:=array_append(reasons,'Current independently reviewed preflight checklist required'); END IF;
 END LOOP;
 IF NOT owner_closure_source_gate(_key) THEN reasons:=array_append(reasons,'Authoritative source coverage or independent review outstanding'); END IF;
 RETURN jsonb_build_object('fingerprint',encode(sha256(convert_to(parts::text,'UTF8')),'hex'),'eligible',cardinality(reasons)=0,'reasons',to_jsonb(ARRAY(SELECT DISTINCT v FROM unnest(reasons) v ORDER BY v)));
END $$;

CREATE OR REPLACE FUNCTION public.owner_closure_record_version(_key text,_version int,_status text,_reason text,_next text,_evidence text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); v int; proof jsonb; row owner_closure_record;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF; PERFORM care_require_strong();
 IF NOT EXISTS(SELECT 1 FROM owner_closure_catalog() WHERE key=_key) OR _version IS NULL OR _version<0 OR _status IS NULL OR _status NOT IN ('open','in-progress','awaiting-evidence','ready-for-review','blocked') OR _reason IS NULL OR _reason NOT IN ('Source evidence outstanding','Independent review outstanding','Dependency remains open','Owner marked blocked','Evidence assembled for review') OR _next IS NULL OR _next NOT IN ('Resolve source evidence','Resolve dependency first','Request independent closure review','Resolve reviewer concern') OR _evidence IS DISTINCT FROM 'Independent current source and artifact review' THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('owner_closure_board'));
 LOCK TABLE public.release_artifact_snapshot,public.release_artifact_review,public.test_prerequisites,public.test_prerequisite_reviews,public.owner_action_items,public.owner_action_reviews,public.campaign_runs,public.campaign_results,public.campaign_result_confirmations,public.launch_control_item,public.launch_control_review,public.backup_evidence,public.backup_evidence_confirmations,public.protection_evidence,public.protection_evidence_confirmations,public.content_review,public.content_review_acks,public.content_approval,public.content_approval_reviews,public.access_audit,public.access_audit_confirmations,public.integration_safety_item,public.integration_safety_review,public.release_review_acks,public.release_drill_runs IN SHARE MODE;

 SELECT coalesce(max(version),0) INTO v FROM owner_closure_record WHERE blocker_key=_key; IF v<>_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 IF owner_closure_valid(_key) THEN RAISE EXCEPTION 'DUPLICATE_CLOSURE'; END IF;
 proof:=owner_closure_evidence(_key);
 IF _status='ready-for-review' AND NOT (proof->>'eligible')::boolean THEN RAISE EXCEPTION 'MISSING_EVIDENCE'; END IF;
 INSERT INTO owner_closure_record(blocker_key,version,status,reason,next_action,evidence_label,source_fingerprint,recorder) VALUES(_key,v+1,_status,_reason,_next,_evidence,proof->>'fingerprint',u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'version',row.version,'correlation_id',row.correlation_id);
END $$;
CREATE OR REPLACE FUNCTION public.owner_closure_confirm(_id uuid,_outcome text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); e owner_closure_record; d text; c record; proof jsonb; role text; row owner_closure_review;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF; PERFORM care_require_strong();
 IF _outcome IS NULL OR _outcome NOT IN ('closed','concern') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('owner_closure_board'));
 LOCK TABLE public.release_artifact_snapshot,public.release_artifact_review,public.test_prerequisites,public.test_prerequisite_reviews,public.owner_action_items,public.owner_action_reviews,public.campaign_runs,public.campaign_results,public.campaign_result_confirmations,public.launch_control_item,public.launch_control_review,public.backup_evidence,public.backup_evidence_confirmations,public.protection_evidence,public.protection_evidence_confirmations,public.content_review,public.content_review_acks,public.content_approval,public.content_approval_reviews,public.access_audit,public.access_audit_confirmations,public.integration_safety_item,public.integration_safety_review,public.release_review_acks,public.release_drill_runs IN SHARE MODE;

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