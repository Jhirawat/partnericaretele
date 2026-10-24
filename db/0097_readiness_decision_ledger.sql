CREATE TABLE public.readiness_decision_event(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('blocker','artifact')),
 register_key text NOT NULL,
 prior_status text NOT NULL CHECK(prior_status IN ('open','in-progress','awaiting-evidence','ready-for-review','closed','blocked','passed','pending','unverified')),
 new_status text NOT NULL CHECK(new_status IN ('open','in-progress','awaiting-evidence','ready-for-review','closed','blocked','passed','pending','unverified')),
 decision text NOT NULL CHECK(decision IN ('evidence-added','evidence-updated','review-requested','concern','closure-requested','closure-confirmed','reopened')),
 reason text NOT NULL CHECK(reason IN ('Source metadata recorded','Independent source review recorded','Source concern recorded','Current evidence and dependencies confirmed','Prior confirmation no longer current')),
 evidence_label text NOT NULL CHECK(evidence_label='Authoritative readiness metadata event'),
 owner_role text NOT NULL CHECK(owner_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),
 reviewer_role text CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),
 source_version int NOT NULL CHECK(source_version>=0), resulting_version int NOT NULL CHECK(resulting_version>0),
 event_version int NOT NULL CHECK(event_version>0),
 dependency_impact text NOT NULL CHECK(dependency_impact IN ('Recheck mapped dependencies','No source readiness granted')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 UNIQUE(kind,register_key,event_version),
 CHECK((kind='blocker' AND register_key IN ('seo_accessibility','content_claims','access_matrix','verification_campaign','campaign_history','test_prerequisites','protection_evidence','backup_evidence','rollback_drill','privacy_retention','reconciliation','notifications_outbox','sla_controls','owner_action_queue')) OR (kind='artifact' AND register_key IN ('release_readiness','release_evidence','publish_gate','release_runbook','backup_evidence','protection_evidence','content_review','access_matrix','verification_campaign','campaign_history','production_readiness','owner_action_queue','golive_decision_pack','test_session_workspace','human_review_console','content_approval','launch_control','integration_safety','incident_console','evidence_inspector'))),
 CHECK(decision<>'closure-confirmed' OR (kind='blocker' AND new_status='closed' AND reviewer_role IS NOT NULL))
);
GRANT SELECT ON public.readiness_decision_event TO authenticated;
GRANT ALL ON public.readiness_decision_event TO service_role;
ALTER TABLE public.readiness_decision_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY readiness_decision_read ON public.readiness_decision_event FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
REVOKE ALL ON public.readiness_decision_event FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.readiness_decision_event FROM authenticated;
CREATE TRIGGER readiness_decision_immutable BEFORE UPDATE OR DELETE ON public.readiness_decision_event FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE FUNCTION public.readiness_decision_capture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k text; typ text; prior text; state text; decision_label text; reason_label text; v int; source_v int; result_v int; own text; review_role text; e owner_closure_record; a release_artifact_snapshot; row_json jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT release_scope(auth.uid()) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF; PERFORM care_require_strong();
 IF TG_TABLE_NAME IN ('owner_closure_record','owner_closure_review') THEN
  typ:='blocker';
  IF TG_TABLE_NAME='owner_closure_record' THEN e:=NEW; ELSE SELECT * INTO e FROM owner_closure_record WHERE id=NEW.record_id; END IF;
  k:=e.blocker_key; result_v:=e.version;
  SELECT x.role::text INTO own FROM user_roles x WHERE x.user_id=e.recorder AND x.partner_id IS NULL AND x.role IN ('SUPER_ADMIN','OPERATIONS_ADMIN') ORDER BY x.role LIMIT 1;
  IF own IS NULL THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
  IF TG_TABLE_NAME='owner_closure_record' THEN
   SELECT x INTO row_json FROM jsonb_array_elements(owner_closure_console()) x WHERE x->>'key'=k;
   prior:=row_json->>'status'; source_v:=coalesce((row_json->'record'->>'version')::int,0);
   state:=e.status;
   IF e.status='ready-for-review' THEN
    IF EXISTS(SELECT 1 FROM owner_closure_catalog() c,unnest(c.dependencies) d WHERE c.key=k AND NOT owner_closure_valid(d)) THEN state:='awaiting-evidence'; END IF;
   END IF;
   decision_label:=CASE WHEN prior='closed' OR (row_json->'record'->>'reviewed')::boolean THEN 'reopened' WHEN e.status='ready-for-review' THEN 'closure-requested' WHEN source_v=0 THEN 'evidence-added' ELSE 'evidence-updated' END;
   reason_label:=CASE WHEN decision_label='reopened' THEN 'Prior confirmation no longer current' ELSE 'Source metadata recorded' END;
  ELSE
   SELECT x INTO row_json FROM jsonb_array_elements(owner_closure_console()) x WHERE x->>'key'=k;
   prior:=row_json->>'status'; source_v:=e.version; review_role:=NEW.reviewer_role;
   state:=CASE WHEN NEW.outcome='closed' THEN 'closed' ELSE 'blocked' END;
   IF NEW.reviewer=e.recorder OR e.version<>(SELECT max(version) FROM owner_closure_record WHERE blocker_key=k) THEN RAISE EXCEPTION 'STALE_OR_SELF_REVIEW'; END IF;
   IF NEW.outcome='closed' THEN
    IF e.status<>'ready-for-review' OR NOT (owner_closure_evidence(k)->>'eligible')::boolean OR e.source_fingerprint<>owner_closure_evidence(k)->>'fingerprint' THEN RAISE EXCEPTION 'MISSING_EVIDENCE'; END IF;
    IF EXISTS(SELECT 1 FROM owner_closure_catalog() c,unnest(c.dependencies) d WHERE c.key=k AND NOT owner_closure_valid(d)) THEN RAISE EXCEPTION 'DEPENDENCY_OPEN'; END IF;
   END IF;
   decision_label:=CASE WHEN NEW.outcome='closed' THEN 'closure-confirmed' ELSE 'concern' END;
   reason_label:=CASE WHEN NEW.outcome='closed' THEN 'Current evidence and dependencies confirmed' ELSE 'Source concern recorded' END;
  END IF;
 ELSE
  typ:='artifact';
  IF TG_TABLE_NAME='release_artifact_snapshot' THEN a:=NEW; ELSE SELECT * INTO a FROM release_artifact_snapshot WHERE id=NEW.snapshot_id; END IF;
  k:=a.register;result_v:=a.version;
  SELECT x.role::text INTO own FROM user_roles x WHERE x.user_id=a.recorder AND x.partner_id IS NULL AND x.role IN ('SUPER_ADMIN','OPERATIONS_ADMIN') ORDER BY x.role LIMIT 1;
  IF own IS NULL THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
  IF TG_TABLE_NAME='release_artifact_snapshot' THEN
   SELECT observed_status,version INTO prior,source_v FROM release_artifact_snapshot WHERE register=k ORDER BY version DESC LIMIT 1;
   prior:=coalesce(prior,'unverified');source_v:=coalesce(source_v,0);state:=a.observed_status;
   decision_label:=CASE WHEN source_v=0 THEN 'evidence-added' ELSE 'evidence-updated' END;reason_label:='Source metadata recorded';
  ELSE
   prior:=a.observed_status;source_v:=a.version;state:=CASE WHEN NEW.outcome='concern' THEN 'blocked' ELSE 'unverified' END;
   review_role:=NEW.reviewer_role;
   IF NEW.reviewer=a.recorder OR a.version<>(SELECT max(version) FROM release_artifact_snapshot WHERE register=k) OR a.source_fingerprint<>release_bundle_source(k)->>'fingerprint' THEN RAISE EXCEPTION 'STALE_OR_SELF_REVIEW'; END IF;
   decision_label:=CASE WHEN NEW.outcome='concern' THEN 'concern' ELSE 'review-requested' END;
   reason_label:=CASE WHEN NEW.outcome='concern' THEN 'Source concern recorded' ELSE 'Independent source review recorded' END;
  END IF;
 END IF;
 IF review_role IS NOT NULL AND NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND partner_id IS NULL AND role::text=review_role) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('readiness_decision:'||typ||':'||k));
 SELECT coalesce(max(event_version),0)+1 INTO v FROM readiness_decision_event WHERE kind=typ AND register_key=k;
 INSERT INTO readiness_decision_event(kind,register_key,prior_status,new_status,decision,reason,evidence_label,owner_role,reviewer_role,source_version,resulting_version,event_version,dependency_impact,correlation_id)
 VALUES(typ,k,prior,state,decision_label,reason_label,'Authoritative readiness metadata event',own,review_role,source_v,result_v,v,CASE WHEN typ='blocker' THEN 'Recheck mapped dependencies' ELSE 'No source readiness granted' END,NEW.correlation_id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.readiness_decision_capture() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER readiness_decision_owner_record BEFORE INSERT ON public.owner_closure_record FOR EACH ROW EXECUTE FUNCTION public.readiness_decision_capture();
CREATE TRIGGER readiness_decision_owner_review BEFORE INSERT ON public.owner_closure_review FOR EACH ROW EXECUTE FUNCTION public.readiness_decision_capture();
CREATE TRIGGER readiness_decision_artifact_record BEFORE INSERT ON public.release_artifact_snapshot FOR EACH ROW EXECUTE FUNCTION public.readiness_decision_capture();
CREATE TRIGGER readiness_decision_artifact_review BEFORE INSERT ON public.release_artifact_review FOR EACH ROW EXECUTE FUNCTION public.readiness_decision_capture();
CREATE FUNCTION public.readiness_decision_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT release_scope(auth.uid()) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;PERFORM care_require_strong();
 RETURN jsonb_build_object('events',coalesce((SELECT jsonb_agg(to_jsonb(e)-'id' ORDER BY created_at,event_version) FROM readiness_decision_event e),'[]'::jsonb),'current',owner_closure_console());
END $$;
REVOKE ALL ON FUNCTION public.readiness_decision_console() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.readiness_decision_console() TO authenticated;
COMMENT ON TABLE public.readiness_decision_event IS 'Redacted audit only. No source readiness authority. History begins at installation; no inferred historical events.';
