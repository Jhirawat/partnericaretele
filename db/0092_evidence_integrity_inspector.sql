-- Cross-Register Evidence Integrity Inspector: redacted metadata only, append-only and
-- versioned. A real integrity result counts only after a different signed-in reviewer confirms
-- the latest version; nothing here reads production business data, changes permissions,
-- publishes, deploys or calls external services.
CREATE TABLE public.evidence_inspector_item(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lineage uuid NOT NULL,version int NOT NULL CHECK(version>0),rule text NOT NULL CHECK(rule IN ('register_coverage','append_only_versioning','latest_version_selection','stale_version_rejection','reviewer_separation','role_mfa_scope','closed_vocabulary','redaction_secret_rejection','blocker_count_consistency','status_honesty','noindex_auth_guard','simulated_real_separation','no_outbound_calls','cross_register_links')),register text NOT NULL CHECK(register IN ('release_runbook','backup_evidence','protection_evidence','content_review','access_matrix','verification_campaign','campaign_history','production_readiness','owner_action_queue','golive_decision_pack','test_session_workspace','human_review_console','content_approval','launch_control')),expected_result text NOT NULL CHECK(char_length(expected_result) BETWEEN 3 AND 200),observed_status text NOT NULL CHECK(observed_status IN ('passed','pending','blocked','unverified')),blocker_reason text CHECK(blocker_reason IS NULL OR char_length(blocker_reason) BETWEEN 3 AND 200),owner_role text NOT NULL CHECK(owner_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),reviewer_role text NOT NULL CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),evidence_ref text NOT NULL CHECK(char_length(evidence_ref) BETWEEN 3 AND 120),next_action text NOT NULL CHECK(next_action IN ('Record inspector evidence for independent review','Record independent confirmation of integrity result','Resolve reviewer concern','Re-run read-only inspection after owner action')),review_date date,recorder uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(lineage,version));
CREATE TABLE public.evidence_inspector_review(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),item_id uuid NOT NULL REFERENCES public.evidence_inspector_item(id),outcome text NOT NULL CHECK(outcome IN ('confirmed','concern')),reviewer uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(item_id,reviewer));
GRANT SELECT ON public.evidence_inspector_item,public.evidence_inspector_review TO authenticated;GRANT ALL ON public.evidence_inspector_item,public.evidence_inspector_review TO service_role;
ALTER TABLE public.evidence_inspector_item ENABLE ROW LEVEL SECURITY;ALTER TABLE public.evidence_inspector_review ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.evidence_inspector_item,public.evidence_inspector_review FROM PUBLIC,anon;REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.evidence_inspector_item,public.evidence_inspector_review FROM authenticated;
CREATE TRIGGER evidence_inspector_item_immutable BEFORE UPDATE OR DELETE ON public.evidence_inspector_item FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER evidence_inspector_review_immutable BEFORE UPDATE OR DELETE ON public.evidence_inspector_review FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE POLICY evidence_inspector_item_read ON public.evidence_inspector_item FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE POLICY evidence_inspector_review_read ON public.evidence_inspector_review FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE FUNCTION public.evidence_inspector_record(_lineage uuid,_rule text,_register text,_expected text,_observed text,_blocker text,_owner text,_reviewer text,_ref text,_action text,_date date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();l uuid:=coalesce(_lineage,gen_random_uuid());v int;prev evidence_inspector_item;row evidence_inspector_item;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _rule IS NULL OR _rule NOT IN ('register_coverage','append_only_versioning','latest_version_selection','stale_version_rejection','reviewer_separation','role_mfa_scope','closed_vocabulary','redaction_secret_rejection','blocker_count_consistency','status_honesty','noindex_auth_guard','simulated_real_separation','no_outbound_calls','cross_register_links')
  OR _register IS NULL OR _register NOT IN ('release_runbook','backup_evidence','protection_evidence','content_review','access_matrix','verification_campaign','campaign_history','production_readiness','owner_action_queue','golive_decision_pack','test_session_workspace','human_review_console','content_approval','launch_control')
  OR _observed IS NULL OR _observed NOT IN ('passed','pending','blocked','unverified')
  OR _owner IS NULL OR _owner NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN') OR _reviewer IS NULL OR _reviewer NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN')
  OR _action IS NULL OR _action NOT IN ('Record inspector evidence for independent review','Record independent confirmation of integrity result','Resolve reviewer concern','Re-run read-only inspection after owner action')
  OR content_unsafe(_ref) OR char_length(btrim(coalesce(_ref,''))) NOT BETWEEN 3 AND 120
  OR coalesce(_ref,'')~*'\m(patient|medical record|diagnos|prescription|clinical note)' OR coalesce(_blocker,'')~*'\m(patient|medical record|diagnos|prescription|clinical note)' OR coalesce(_expected,'')~*'\m(patient|medical record|diagnos|prescription|clinical note)'
  OR content_unsafe(_expected) OR char_length(btrim(coalesce(_expected,''))) NOT BETWEEN 3 AND 200
  OR (_blocker IS NOT NULL AND (content_unsafe(_blocker) OR char_length(btrim(_blocker)) NOT BETWEEN 3 AND 200))
  OR _date>current_date THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('evidence_inspector:'||l::text));
 SELECT * INTO prev FROM evidence_inspector_item WHERE lineage=l ORDER BY version DESC LIMIT 1;
 IF _lineage IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF FOUND AND (prev.rule<>_rule OR prev.register<>_register) THEN RAISE EXCEPTION 'RULE_MISMATCH';END IF;
 v:=coalesce(prev.version,0)+1;
 INSERT INTO evidence_inspector_item(lineage,version,rule,register,expected_result,observed_status,blocker_reason,owner_role,reviewer_role,evidence_ref,next_action,review_date,recorder) VALUES(l,v,_rule,_register,btrim(_expected),_observed,CASE WHEN _blocker IS NULL THEN NULL ELSE btrim(_blocker) END,_owner,_reviewer,btrim(_ref),_action,_date,u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'lineage',row.lineage,'version',row.version,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
CREATE FUNCTION public.evidence_inspector_confirm(_id uuid,_outcome text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();e evidence_inspector_item;row evidence_inspector_review;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _outcome IS NULL OR _outcome NOT IN ('confirmed','concern') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 SELECT * INTO e FROM evidence_inspector_item WHERE id=_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF e.recorder=u THEN RAISE EXCEPTION 'SECOND_REVIEWER_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM evidence_inspector_item x WHERE x.lineage=e.lineage AND x.version>e.version) THEN RAISE EXCEPTION 'STALE_VERSION';END IF;
 INSERT INTO evidence_inspector_review(item_id,outcome,reviewer) VALUES(e.id,_outcome,u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
REVOKE ALL ON FUNCTION public.evidence_inspector_record(uuid,text,text,text,text,text,text,text,text,text,date),public.evidence_inspector_confirm(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.evidence_inspector_record(uuid,text,text,text,text,text,text,text,text,text,date),public.evidence_inspector_confirm(uuid,text) TO authenticated;
CREATE FUNCTION public.evidence_inspector() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'lineage',e.lineage,'version',e.version,'rule',e.rule,'register',e.register,'expected_result',e.expected_result,'observed_status',e.observed_status,'blocker_reason',e.blocker_reason,'owner_role',e.owner_role,'reviewer_role',e.reviewer_role,'evidence_ref',e.evidence_ref,'next_action',e.next_action,'review_date',e.review_date,'correlation_id',e.correlation_id,'created_at',e.created_at,'mine',e.recorder=u,
  'latest',NOT EXISTS(SELECT 1 FROM evidence_inspector_item x WHERE x.lineage=e.lineage AND x.version>e.version),
  'reviews',coalesce((SELECT jsonb_agg(jsonb_build_object('outcome',r.outcome,'independent',r.reviewer<>e.recorder,'mine',r.reviewer=u,'created_at',r.created_at,'correlation_id',r.correlation_id) ORDER BY r.created_at) FROM evidence_inspector_review r WHERE r.item_id=e.id),'[]'::jsonb)) ORDER BY e.rule,e.register,e.lineage,e.version) FROM evidence_inspector_item e),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.evidence_inspector() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.evidence_inspector() TO authenticated;
