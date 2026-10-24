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
 IF _key='content_claims' THEN
  FOREACH k IN ARRAY ARRAY['clinic_facts','contact_channels','wording_th_en','pricing','terms','privacy_wording','medical_claims','testimonials','certification_claims'] LOOP
   IF NOT EXISTS(SELECT 1 FROM content_approval t WHERE t.category=k AND NOT EXISTS(SELECT 1 FROM content_approval z WHERE z.lineage=t.lineage AND z.version>t.version)) OR EXISTS(SELECT 1 FROM content_approval t WHERE t.category=k AND NOT EXISTS(SELECT 1 FROM content_approval z WHERE z.lineage=t.lineage AND z.version>t.version) AND (t.status<>'available' OR t.canonical_source<>'available' OR t.review_date IS NULL OR NOT EXISTS(SELECT 1 FROM content_approval_reviews v WHERE v.approval_id=t.id AND v.outcome='approved' AND v.reviewer<>t.recorder) OR EXISTS(SELECT 1 FROM content_approval_reviews v WHERE v.approval_id=t.id AND v.outcome='concern'))) THEN RETURN false; END IF;
  END LOOP;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.owner_closure_source_gate(text) FROM PUBLIC,anon,authenticated;
DO $migration$
DECLARE definition text; name text; locks text:=' LOCK TABLE public.release_artifact_snapshot,public.release_artifact_review,public.test_prerequisites,public.test_prerequisite_reviews,public.owner_action_items,public.owner_action_reviews,public.campaign_runs,public.campaign_results,public.campaign_result_confirmations,public.launch_control_item,public.launch_control_review,public.backup_evidence,public.backup_evidence_confirmations,public.protection_evidence,public.protection_evidence_confirmations,public.content_review,public.content_review_acks,public.content_approval,public.content_approval_reviews,public.access_audit,public.access_audit_confirmations,public.integration_safety_item,public.integration_safety_review,public.release_review_acks,public.release_drill_runs IN SHARE MODE;';
BEGIN
 SELECT pg_get_functiondef('public.owner_closure_catalog()'::regprocedure) INTO definition;
 definition:=replace(definition,'''owner_action_queue'',''Owner action queue'',ARRAY[]::text[],ARRAY[''owner_action_queue''],ARRAY[''access_controls''],ARRAY[''publish_owner'']','''owner_action_queue'',''Owner action queue'',ARRAY[]::text[],ARRAY[''owner_action_queue''],ARRAY[''access_controls''],ARRAY[''superadmin_account'',''second_reviewer'',''preview_access'',''protection_evidence'',''backup_evidence'',''clinic_facts'',''contact_details'',''pricing_terms'',''claims_review'',''publish_owner'']');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.owner_closure_evidence(text)'::regprocedure) INTO definition;
 definition:=replace(definition,' RETURN jsonb_build_object(''fingerprint''',' IF NOT owner_closure_source_gate(_key) THEN reasons:=array_append(reasons,''Authoritative source coverage or independent review outstanding''); END IF;'||chr(10)||' RETURN jsonb_build_object(''fingerprint''');
 EXECUTE definition;
 FOREACH name IN ARRAY ARRAY['public.owner_closure_record_version(text,integer,text,text,text,text)','public.owner_closure_confirm(uuid,text)'] LOOP
  SELECT pg_get_functiondef(name::regprocedure) INTO definition;
  definition:=replace(definition,' PERFORM pg_advisory_xact_lock(hashtext(''owner_closure_board''));',' PERFORM pg_advisory_xact_lock(hashtext(''owner_closure_board''));'||chr(10)||locks);
  EXECUTE definition;
 END LOOP;
END $migration$;