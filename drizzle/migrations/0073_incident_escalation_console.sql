CREATE TABLE public.incident_console_item(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lineage uuid NOT NULL,version int NOT NULL CHECK(version>0),incident_class text NOT NULL CHECK(incident_class IN ('data_integrity','auth_access','payment_credits','privacy_retention','availability','notification_outbox','sla_breach','integration_safety','content_claims','rollback_execution')),severity text NOT NULL CHECK(severity IN ('low','medium','high','critical')),trigger_category text NOT NULL CHECK(trigger_category IN ('monitoring_signal','user_report','reviewer_concern','drill_finding','external_notice','other')),affected_scope text NOT NULL CHECK(affected_scope IN ('dns_domain_seo','public_routes','auth_guards','content_claims','access_controls','protection_evidence','backups','privacy_retention','credits','notifications_outbox','sla_controls','monitoring','rollback_readiness','no_external_calls')),environment text NOT NULL CHECK(environment IN ('preview','production_candidate')),status text NOT NULL CHECK(status IN ('open','contained','rollback_recommended','resolved','closed')),owner_role text NOT NULL CHECK(owner_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),reviewer_role text NOT NULL CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),evidence_ref text NOT NULL CHECK(char_length(evidence_ref) BETWEEN 3 AND 120),required_action text NOT NULL CHECK(required_action IN ('Record containment evidence for independent review','Record independent confirmation of status change','Resolve reviewer concern','Recommend rollback per release runbook')),stop_condition text NOT NULL CHECK(stop_condition IN ('none','data_integrity','auth_regression','payment_discrepancy','privacy_breach','availability_loss','reviewer_concern')),blocker_reason text CHECK(blocker_reason IS NULL OR char_length(blocker_reason) BETWEEN 3 AND 200),review_date date,recorder uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(lineage,version));
CREATE TABLE public.incident_console_review(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),item_id uuid NOT NULL REFERENCES public.incident_console_item(id),outcome text NOT NULL CHECK(outcome IN ('confirmed','concern')),reviewer uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(item_id,reviewer));
GRANT SELECT ON public.incident_console_item,public.incident_console_review TO authenticated;GRANT ALL ON public.incident_console_item,public.incident_console_review TO service_role;
ALTER TABLE public.incident_console_item ENABLE ROW LEVEL SECURITY;ALTER TABLE public.incident_console_review ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.incident_console_item,public.incident_console_review FROM PUBLIC,anon;REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.incident_console_item,public.incident_console_review FROM authenticated;
CREATE TRIGGER incident_console_item_immutable BEFORE UPDATE OR DELETE ON public.incident_console_item FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER incident_console_review_immutable BEFORE UPDATE OR DELETE ON public.incident_console_review FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE POLICY incident_console_item_read ON public.incident_console_item FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE POLICY incident_console_review_read ON public.incident_console_review FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE FUNCTION public.incident_record(_lineage uuid,_class text,_severity text,_trigger text,_scope text,_environment text,_status text,_owner text,_reviewer text,_ref text,_action text,_stop text,_blocker text,_date date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();l uuid:=coalesce(_lineage,gen_random_uuid());v int;prev incident_console_item;row incident_console_item;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _class IS NULL OR _class<>ALL(ARRAY['data_integrity','auth_access','payment_credits','privacy_retention','availability','notification_outbox','sla_breach','integration_safety','content_claims','rollback_execution'])
  OR _severity IS NULL OR _severity NOT IN ('low','medium','high','critical')
  OR _trigger IS NULL OR _trigger NOT IN ('monitoring_signal','user_report','reviewer_concern','drill_finding','external_notice','other')
  OR _scope IS NULL OR _scope NOT IN ('dns_domain_seo','public_routes','auth_guards','content_claims','access_controls','protection_evidence','backups','privacy_retention','credits','notifications_outbox','sla_controls','monitoring','rollback_readiness','no_external_calls')
  OR _environment IS NULL OR _environment NOT IN ('preview','production_candidate')
  OR _status IS NULL OR _status NOT IN ('open','contained','rollback_recommended','resolved','closed')
  OR _owner IS NULL OR _owner NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN') OR _reviewer IS NULL OR _reviewer NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN')
  OR _action IS NULL OR _action NOT IN ('Record containment evidence for independent review','Record independent confirmation of status change','Resolve reviewer concern','Recommend rollback per release runbook')
  OR _stop IS NULL OR _stop NOT IN ('none','data_integrity','auth_regression','payment_discrepancy','privacy_breach','availability_loss','reviewer_concern')
  OR content_unsafe(_ref) OR char_length(btrim(coalesce(_ref,''))) NOT BETWEEN 3 AND 120
  OR (_blocker IS NOT NULL AND (content_unsafe(_blocker) OR char_length(btrim(_blocker)) NOT BETWEEN 3 AND 200))
  OR _date>current_date THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('incident_console:'||l::text));
 SELECT * INTO prev FROM incident_console_item WHERE lineage=l ORDER BY version DESC LIMIT 1;
 IF _lineage IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF FOUND AND prev.incident_class<>_class THEN RAISE EXCEPTION 'CLASS_MISMATCH';END IF;
 v:=coalesce(prev.version,0)+1;
 INSERT INTO incident_console_item(lineage,version,incident_class,severity,trigger_category,affected_scope,environment,status,owner_role,reviewer_role,evidence_ref,required_action,stop_condition,blocker_reason,review_date,recorder) VALUES(l,v,_class,_severity,_trigger,_scope,_environment,_status,_owner,_reviewer,btrim(_ref),_action,_stop,CASE WHEN _blocker IS NULL THEN NULL ELSE btrim(_blocker) END,_date,u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'lineage',row.lineage,'version',row.version,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
CREATE FUNCTION public.incident_confirm(_id uuid,_outcome text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();e incident_console_item;row incident_console_review;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _outcome IS NULL OR _outcome NOT IN ('confirmed','concern') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 SELECT * INTO e FROM incident_console_item WHERE id=_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF e.recorder=u THEN RAISE EXCEPTION 'SECOND_REVIEWER_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM incident_console_item x WHERE x.lineage=e.lineage AND x.version>e.version) THEN RAISE EXCEPTION 'STALE_VERSION';END IF;
 INSERT INTO incident_console_review(item_id,outcome,reviewer) VALUES(e.id,_outcome,u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
REVOKE ALL ON FUNCTION public.incident_record(uuid,text,text,text,text,text,text,text,text,text,text,text,text,date),public.incident_confirm(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.incident_record(uuid,text,text,text,text,text,text,text,text,text,text,text,text,date),public.incident_confirm(uuid,text) TO authenticated;
CREATE FUNCTION public.incident_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'lineage',e.lineage,'version',e.version,'incident_class',e.incident_class,'severity',e.severity,'trigger_category',e.trigger_category,'affected_scope',e.affected_scope,'environment',e.environment,'status',e.status,'owner_role',e.owner_role,'reviewer_role',e.reviewer_role,'evidence_ref',e.evidence_ref,'required_action',e.required_action,'stop_condition',e.stop_condition,'blocker_reason',e.blocker_reason,'review_date',e.review_date,'correlation_id',e.correlation_id,'created_at',e.created_at,'mine',e.recorder=u,
  'latest',NOT EXISTS(SELECT 1 FROM incident_console_item x WHERE x.lineage=e.lineage AND x.version>e.version),
  'reviews',coalesce((SELECT jsonb_agg(jsonb_build_object('outcome',r.outcome,'independent',r.reviewer<>e.recorder,'mine',r.reviewer=u,'created_at',r.created_at,'correlation_id',r.correlation_id) ORDER BY r.created_at) FROM incident_console_review r WHERE r.item_id=e.id),'[]'::jsonb)) ORDER BY e.incident_class,e.lineage,e.version) FROM incident_console_item e),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.incident_console() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.incident_console() TO authenticated;