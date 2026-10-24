CREATE OR REPLACE FUNCTION public.incident_record(_lineage uuid,_class text,_severity text,_trigger text,_scope text,_environment text,_status text,_owner text,_reviewer text,_ref text,_action text,_stop text,_blocker text,_date date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
  OR coalesce(_ref,'')~*'\m(patient|medical record|diagnos|prescription|clinical note)' OR coalesce(_blocker,'')~*'\m(patient|medical record|diagnos|prescription|clinical note)'
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
REVOKE ALL ON FUNCTION public.incident_record(uuid,text,text,text,text,text,text,text,text,text,text,text,text,date) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.incident_record(uuid,text,text,text,text,text,text,text,text,text,text,text,text,date) TO authenticated;