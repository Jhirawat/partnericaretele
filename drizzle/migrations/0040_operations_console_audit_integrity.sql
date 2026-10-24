CREATE TABLE public.operations_audit_evidence (audit_id uuid PRIMARY KEY REFERENCES public.audit_log(id), fingerprint text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.operations_audit_evidence TO service_role;
ALTER TABLE public.operations_audit_evidence ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.operations_audit_hash(a public.audit_log) RETURNS text LANGUAGE sql STABLE SET search_path=public SET timezone='UTC' AS $$ SELECT encode(sha256(convert_to(to_jsonb(a)::text,'UTF8')),'hex') $$;
INSERT INTO public.operations_audit_evidence(audit_id,fingerprint) SELECT id,public.operations_audit_hash(a) FROM public.audit_log a;
CREATE FUNCTION public.operations_audit_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN INSERT INTO operations_audit_evidence(audit_id,fingerprint) VALUES(NEW.id,operations_audit_hash(NEW)); RETURN NEW; END $$;
CREATE TRIGGER operations_audit_record AFTER INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.operations_audit_record();
CREATE TRIGGER operations_audit_immutable BEFORE UPDATE OR DELETE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER operations_evidence_immutable BEFORE UPDATE OR DELETE ON public.operations_audit_evidence FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
REVOKE UPDATE,DELETE ON public.audit_log FROM authenticated,anon;
CREATE FUNCTION public.operations_safe_summary(v jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT coalesce(jsonb_object_agg(key,value),'{}') FROM jsonb_each(coalesce(v,'{}')) WHERE key IN ('balance_before','balance_after','annual_before','annual_after','credit_units','annual_units','quantity') AND jsonb_typeof(value)='number' $$;
CREATE FUNCTION public.operations_console(_mode text,_filters jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); super boolean; result jsonb; p uuid; b uuid; d uuid; start_at timestamptz; end_at timestamptz; page_n integer; page_size integer:=50;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND role='SUPER_ADMIN' AND partner_id IS NULL AND status='ACTIVE') INTO super;
 IF _mode NOT IN ('admin','super','audit') OR NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND status='ACTIVE' AND (role='OPERATIONS_ADMIN' OR (role='SUPER_ADMIN' AND partner_id IS NULL) OR (_mode='audit' AND role IN ('FINANCE_ADMIN','COMPLIANCE_AUDITOR')))) OR (_mode='super' AND NOT super) THEN RAISE EXCEPTION 'CONSOLE_SCOPE_REQUIRED'; END IF;
 p:=nullif(_filters->>'organization','')::uuid; b:=nullif(_filters->>'branch','')::uuid; d:=nullif(_filters->>'doctor','')::uuid;
 start_at:=nullif(_filters->>'from','')::date; end_at:=nullif(_filters->>'to','')::date + interval '1 day'; page_n:=greatest(1,least(100000,coalesce((_filters->>'page')::int,1)));
 IF _mode='audit' THEN
 WITH scoped AS (
 SELECT a.*, e.fingerprint, e.fingerprint=operations_audit_hash(a) AS verified FROM audit_log a LEFT JOIN operations_audit_evidence e ON e.audit_id=a.id
 WHERE (partner_review_scope(u,a.partner_id) OR EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u AND r.status='ACTIVE' AND r.role IN ('FINANCE_ADMIN','COMPLIANCE_AUDITOR') AND (r.partner_id=a.partner_id OR r.partner_id IS NULL)))
 AND (p IS NULL OR a.partner_id=p) AND (b IS NULL OR a.location_id=b) AND (start_at IS NULL OR a.created_at>=start_at) AND (end_at IS NULL OR a.created_at<end_at)
 AND (coalesce(_filters->>'action','')='' OR a.action=_filters->>'action') AND (coalesce(_filters->>'target','')='' OR a.entity_type=_filters->>'target') AND (coalesce(_filters->>'actor','')='' OR a.actor_user_id::text=_filters->>'actor')
 ), rows AS (
 SELECT id,actor_user_id AS actor,actor_role AS role,partner_id AS organization,location_id AS branch,action,entity_type AS target,CASE WHEN entity_type NOT IN ('patient','customer','clinical_note','consultation_note') AND entity_id ~ '^[a-f0-9-]{36}$' THEN entity_id ELSE '[redacted target]' END AS reference,created_at AS timestamp,
 CASE WHEN metadata ? 'reason' THEN '[redacted free text]' END AS reason,
 CASE WHEN coalesce(metadata->>'correlation_id',metadata->>'key',metadata->>'idempotency_key') ~ '^[a-f0-9-]{36}$' THEN coalesce(metadata->>'correlation_id',metadata->>'key',metadata->>'idempotency_key') ELSE CASE WHEN metadata ?| ARRAY['correlation_id','key','idempotency_key'] THEN '[redacted reference]' END END AS correlation,
 operations_safe_summary(metadata) AS summary,fingerprint,coalesce(verified,false) AS verified
 FROM scoped ORDER BY created_at DESC,id DESC LIMIT page_size OFFSET (page_n-1)*page_size)
 SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(rows)) FROM rows),'[]'),'total',(SELECT count(*) FROM scoped),'page',page_n,'pageSize',page_size,'super',super) INTO result;
 RETURN result;
 END IF;
 WITH orgs AS (SELECT id,display_name,status,care_credit_model FROM partners WHERE partner_review_scope(u,id) AND (p IS NULL OR id=p)),
 branches AS (SELECT l.id,l.partner_id,l.name FROM locations l JOIN orgs o ON o.id=l.partner_id WHERE b IS NULL OR l.id=b),
 requests AS (SELECT r.id,r.partner_id,r.location_id,r.state,r.created_at,r.updated_at,c.assigned_doctor_id,c.credit_status,c.scheduled_at FROM consultation_requests r JOIN orgs o ON o.id=r.partner_id JOIN consultations c ON c.id=r.consultation_id WHERE (b IS NULL OR r.location_id=b) AND (d IS NULL OR c.assigned_doctor_id=d) AND (coalesce(_filters->>'request','')='' OR r.state=_filters->>'request') AND (coalesce(_filters->>'credit','')='' OR c.credit_status::text=_filters->>'credit') AND (start_at IS NULL OR r.created_at>=start_at) AND (end_at IS NULL OR r.created_at<end_at)),
 applications AS (SELECT a.* FROM partner_applications a WHERE partner_review_scope(u,a.scope_partner_id) AND (p IS NULL OR coalesce(a.scope_partner_id,a.partner_id)=p) AND b IS NULL AND d IS NULL AND (start_at IS NULL OR a.created_at>=start_at) AND (end_at IS NULL OR a.created_at<end_at)),
 handoffs AS (SELECT h.id,h.request_id,h.partner_id,h.location_id,h.state,h.updated_at FROM care_mcs_handoffs h JOIN requests r ON r.id=h.request_id WHERE coalesce(_filters->>'handoff','')='' OR h.state=_filters->>'handoff'),
 certificates AS (SELECT c.id,c.request_id,c.state,c.updated_at,r.partner_id,r.location_id FROM care_certificates c JOIN requests r ON r.id=c.request_id WHERE coalesce(_filters->>'certificate','')='' OR c.state=_filters->>'certificate'),
 queue AS (
 SELECT 'application'::text kind,a.id,coalesce(a.scope_partner_id,a.partner_id) organization,null::uuid branch,null::uuid doctor,a.status::text status,a.updated_at timestamp,null::timestamptz due FROM applications a
 UNION ALL SELECT 'document',v.id,coalesce(a.scope_partner_id,a.partner_id),null,null,v.review_status,v.created_at,v.expiry_date::timestamptz FROM partner_application_documents v JOIN applications a ON a.id=v.application_id
 UNION ALL SELECT 'missing_document',a.id,coalesce(a.scope_partner_id,a.partner_id),null,null,'MISSING',a.updated_at,null FROM applications a WHERE NOT EXISTS(SELECT 1 FROM partner_application_documents v WHERE v.application_id=a.id AND v.primary_license AND v.review_status='ACCEPTED' AND (v.expiry_date IS NULL OR v.expiry_date>=current_date))
 UNION ALL SELECT 'doctor',x.id,o.id,x.location_id,x.id,x.status::text,x.updated_at,x.license_expires_on::timestamptz FROM doctors x JOIN orgs o ON o.id=location_partner(x.location_id) WHERE (d IS NULL OR x.id=d) AND (b IS NULL OR x.location_id=b) AND (start_at IS NULL OR x.created_at>=start_at) AND (end_at IS NULL OR x.created_at<end_at)
 UNION ALL SELECT 'doctor',x.id,null,null,x.id,x.status::text,x.updated_at,x.license_expires_on::timestamptz FROM doctors x WHERE x.location_id IS NULL AND can_write_platform(u) AND p IS NULL AND b IS NULL AND (d IS NULL OR x.id=d) AND (start_at IS NULL OR x.created_at>=start_at) AND (end_at IS NULL OR x.created_at<end_at)
 UNION ALL SELECT 'assignment',a.id,a.partner_id,a.location_id,a.doctor_id,a.status,a.updated_at,null FROM doctor_assignments a JOIN orgs o ON o.id=a.partner_id WHERE (d IS NULL OR a.doctor_id=d) AND (b IS NULL OR a.location_id=b) AND (start_at IS NULL OR a.created_at>=start_at) AND (end_at IS NULL OR a.created_at<end_at)
 UNION ALL SELECT 'request',id,partner_id,location_id,assigned_doctor_id,state,updated_at,scheduled_at FROM requests
 UNION ALL SELECT 'handoff',h.id,h.partner_id,h.location_id,r.assigned_doctor_id,h.state,h.updated_at,null FROM handoffs h JOIN requests r ON r.id=h.request_id
 UNION ALL SELECT 'certificate',c.id,c.partner_id,c.location_id,r.assigned_doctor_id,c.state,c.updated_at,null FROM certificates c JOIN requests r ON r.id=c.request_id
 UNION ALL SELECT 'credit',o.id,o.id,null,null,CASE WHEN o.care_credit_model='LEGACY_PENDING' THEN 'RECONCILIATION_REQUIRED' ELSE 'LOT_ANOMALY' END,now(),null FROM orgs o WHERE b IS NULL AND d IS NULL AND coalesce(_filters->>'credit','')='' AND (o.care_credit_model='LEGACY_PENDING' OR EXISTS(SELECT 1 FROM care_credit_lots l WHERE l.partner_id=o.id AND l.granted-l.used-l.voided-(SELECT count(*) FROM care_holds h WHERE h.lot_id=l.id AND h.state='RESERVED')<0))
 UNION ALL SELECT 'intake',i.id,i.partner_id,i.location_id,null,i.status,i.evaluated_at,null FROM partner_intakes i JOIN orgs o ON o.id=i.partner_id WHERE i.status IN ('BLOCKED','MANUAL_REVIEW') AND (b IS NULL OR i.location_id=b) AND d IS NULL AND (start_at IS NULL OR i.evaluated_at>=start_at) AND (end_at IS NULL OR i.evaluated_at<end_at)
 ), filtered AS (SELECT *,extract(epoch FROM now()-timestamp)/3600 AS age_hours,(due IS NOT NULL AND due<now()) AS overdue FROM queue WHERE (coalesce(_filters->>'kind','')='' OR kind=_filters->>'kind') AND (coalesce(_filters->>'status','')='' OR status=_filters->>'status')),
 totals AS (SELECT kind,status,count(*) AS count FROM filtered GROUP BY kind,status),
 health AS (SELECT o.id,o.display_name AS name,o.status,o.care_credit_model AS credit_model,
 (SELECT count(*) FROM requests r WHERE r.partner_id=o.id) requests,
 (SELECT count(*) FROM requests r WHERE r.partner_id=o.id AND r.state='completed') completed,
 (SELECT count(*) FROM handoffs h WHERE h.partner_id=o.id AND h.state NOT IN ('closed','cancelled')) handoff_backlog,
 (SELECT count(*) FROM certificates c WHERE c.partner_id=o.id AND c.state NOT IN ('forwarded','rejected')) certificate_backlog,
 (SELECT count(*) FROM filtered f WHERE f.organization=o.id AND f.overdue) overdue,
 (SELECT count(*) FROM filtered f WHERE f.organization=o.id AND f.kind='document' AND f.due<now()+interval '30 days') expiring_documents,
 (SELECT count(*) FROM doctor_assignments a JOIN doctors x ON x.id=a.doctor_id WHERE a.partner_id=o.id AND a.status='ACTIVE' AND x.status='ACTIVE' AND (b IS NULL OR a.location_id=b) AND (d IS NULL OR a.doctor_id=d)) active_assignments,
 (SELECT count(*) FROM requests r WHERE r.partner_id=o.id AND r.state='in_consultation') busy_requests,
 care_available(o.id) available_credits,
 (SELECT count(*) FROM care_holds h WHERE h.partner_id=o.id AND h.state='RESERVED') reserved_coverage,
 (SELECT count(*) FROM care_holds h WHERE h.partner_id=o.id AND h.state='CONSUMED') consumed_coverage
 FROM orgs o), paged AS (SELECT * FROM filtered ORDER BY overdue DESC,timestamp,id LIMIT page_size OFFSET (page_n-1)*page_size)
 SELECT jsonb_build_object('super',super,'page',page_n,'pageSize',page_size,'total',(SELECT count(*) FROM filtered),'rows',CASE WHEN _mode='super' THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(to_jsonb(paged)) FROM paged),'[]') END,'totals',coalesce((SELECT jsonb_agg(to_jsonb(totals)) FROM totals),'[]'),'organizations',coalesce((SELECT jsonb_agg(to_jsonb(health)) FROM health),'[]'),'branches',coalesce((SELECT jsonb_agg(to_jsonb(branches)) FROM branches),'[]'),'system',jsonb_build_object('clinical_enabled',coalesce((SELECT (settings->>'manual_clinical_enabled')::boolean FROM care_terms WHERE active),false),'mcs','DISCONNECTED','payments','NOT_CHECKED','notifications','DISCONNECTED')) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.operations_console(text,jsonb),public.operations_audit_hash(public.audit_log),public.operations_audit_record(),public.operations_safe_summary(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.operations_console(text,jsonb) TO authenticated;