CREATE TABLE public.operational_notification_preferences(user_id uuid NOT NULL,event_type text NOT NULL,enabled boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,event_type));
GRANT SELECT ON public.operational_notification_preferences TO authenticated;
GRANT ALL ON public.operational_notification_preferences TO service_role;
ALTER TABLE public.operational_notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_preferences ON public.operational_notification_preferences FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE TABLE public.operational_notifications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipient_user_id uuid NOT NULL,partner_id uuid,location_id uuid,
 source_kind text NOT NULL,source_id uuid NOT NULL,source_event_id uuid NOT NULL,event_type text NOT NULL,
 template_version integer NOT NULL DEFAULT 1,payload jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','suppressed','sent_placeholder','failed','manual_review')),
 retry_count integer NOT NULL DEFAULT 0 CHECK(retry_count BETWEEN 0 AND 3),idempotency_key text NOT NULL UNIQUE,
 correlation_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz,next_retry_at timestamptz);
GRANT SELECT ON public.operational_notifications TO authenticated;
GRANT ALL ON public.operational_notifications TO service_role;
ALTER TABLE public.operational_notifications ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.operational_notification_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),notification_id uuid REFERENCES public.operational_notifications(id),actor_user_id uuid,action text NOT NULL,from_status text,to_status text,reason_code text NOT NULL,correlation_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.operational_notification_history TO authenticated;
GRANT ALL ON public.operational_notification_history TO service_role;
ALTER TABLE public.operational_notification_history ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.operational_notification_operations(key uuid PRIMARY KEY,actor uuid NOT NULL,intent jsonb NOT NULL,result jsonb NOT NULL);
GRANT ALL ON public.operational_notification_operations TO service_role;
ALTER TABLE public.operational_notification_operations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER notification_history_immutable BEFORE UPDATE OR DELETE ON public.operational_notification_history FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER notification_operations_immutable BEFORE UPDATE OR DELETE ON public.operational_notification_operations FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE INDEX notification_recipient_time ON public.operational_notifications(recipient_user_id,created_at DESC);
CREATE FUNCTION public.notification_template(_event text) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN _event IN ('partner_application','document_request','doctor_change','consultation_request','mcs_handoff','certificate_status','credit_anomaly','sla_reminder') THEN jsonb_build_object('event_type',_event,'version',1,'preview',replace(_event,'_',' ')||' status updated') ELSE NULL END $$;
CREATE FUNCTION public.notification_admin(_u uuid,_p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT _u IS NOT NULL AND partner_review_scope(_u,_p) $$;
CREATE FUNCTION public.notification_source_access(_kind text,_id uuid,_p uuid,_l uuid,_u uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF _u IS NULL THEN RETURN false; END IF;
 IF _kind='application' THEN RETURN partner_application_access(_id,_u); END IF;
 IF _kind='request' THEN RETURN consultation_request_access(_id,_u); END IF;
 IF _kind='certificate' THEN RETURN certificate_read(_id,_u); END IF;
 IF _kind='handoff' THEN RETURN EXISTS(SELECT 1 FROM care_mcs_handoffs h WHERE h.id=_id AND (notification_admin(_u,h.partner_id) OR partner_customer_write(_u,h.partner_id,h.location_id))); END IF;
 IF _kind IN ('doctor','assignment') THEN RETURN notification_admin(_u,_p) OR EXISTS(SELECT 1 FROM doctors d LEFT JOIN doctor_assignments a ON a.doctor_id=d.id WHERE d.auth_user_id=_u AND ((_kind='doctor' AND d.id=_id) OR (_kind='assignment' AND a.id=_id)) AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=_u AND r.role='DOCTOR' AND r.status='ACTIVE')); END IF;
 RETURN notification_admin(_u,_p);
END $$;
CREATE FUNCTION public.notification_visible(_n public.operational_notifications,_u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT (_n.recipient_user_id=_u OR notification_admin(_u,_n.partner_id)) AND notification_source_access(_n.source_kind,_n.source_id,_n.partner_id,_n.location_id,_u) $$;
CREATE POLICY notification_read ON public.operational_notifications FOR SELECT TO authenticated USING(notification_visible(operational_notifications,auth.uid()));
CREATE POLICY notification_history_read ON public.operational_notification_history FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM operational_notifications n WHERE n.id=notification_id AND notification_visible(n,auth.uid())));
CREATE FUNCTION public.notification_content_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'IMMUTABLE_NOTIFICATION'; END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['status','retry_count','updated_at','read_at','next_retry_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','retry_count','updated_at','read_at','next_retry_at']) THEN RAISE EXCEPTION 'IMMUTABLE_NOTIFICATION'; END IF;
 IF notification_template(NEW.event_type) IS NULL OR NEW.template_version<>1 OR jsonb_typeof(NEW.payload)<>'object' OR EXISTS(SELECT 1 FROM jsonb_each(NEW.payload) WHERE key NOT IN ('state','previous_state') OR jsonb_typeof(value)<>'string' OR value#>>'{}' !~ '^[A-Za-z_]{1,64}$') THEN RAISE EXCEPTION 'UNSAFE_NOTIFICATION_PAYLOAD'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER notification_content_guard BEFORE INSERT OR UPDATE OR DELETE ON public.operational_notifications FOR EACH ROW EXECUTE FUNCTION public.notification_content_guard();
CREATE FUNCTION public.notification_enqueue(_kind text,_id uuid,_event_id uuid,_event text,_p uuid,_l uuid,_state text,_previous text,_correlation uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE candidate uuid; nid uuid; n integer:=0; corr uuid:=coalesce(_correlation,_event_id); delivery text;
BEGIN
 IF notification_template(_event) IS NULL THEN RAISE EXCEPTION 'EVENT_NOT_APPROVED'; END IF;
 FOR candidate IN SELECT DISTINCT u FROM (
 SELECT user_id u FROM user_roles WHERE status='ACTIVE' AND role IN ('OPERATIONS_ADMIN','SUPER_ADMIN','PARTNER_OWNER','PARTNER_MANAGER','PARTNER_STAFF','DOCTOR')
 UNION SELECT owner_user_id FROM partner_applications WHERE _kind='application' AND id=_id
 UNION SELECT auth_user_id FROM doctors WHERE _kind='doctor' AND id=_id) recipients WHERE u IS NOT NULL LOOP
 IF NOT notification_source_access(_kind,_id,_p,_l,candidate) THEN CONTINUE; END IF;
 delivery:=CASE WHEN coalesce((SELECT enabled FROM operational_notification_preferences WHERE user_id=candidate AND event_type=_event),true) THEN 'queued' ELSE 'suppressed' END;
 nid:=NULL;
 INSERT INTO operational_notifications(recipient_user_id,partner_id,location_id,source_kind,source_id,source_event_id,event_type,payload,status,idempotency_key,correlation_id)
 VALUES(candidate,_p,_l,_kind,_id,_event_id,_event,jsonb_strip_nulls(jsonb_build_object('state',_state,'previous_state',_previous)),delivery,_event||':'||_event_id||':'||candidate,corr) ON CONFLICT(idempotency_key) DO NOTHING RETURNING id INTO nid;
 IF nid IS NOT NULL THEN n:=n+1; INSERT INTO operational_notification_history(notification_id,action,to_status,reason_code,correlation_id) VALUES(nid,'enqueue',delivery,CASE WHEN delivery='suppressed' THEN 'preference_disabled' ELSE 'event_recorded' END,corr); END IF;
 END LOOP; RETURN n;
END $$;
CREATE FUNCTION public.notification_event_capture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k text; eid uuid:=NEW.id; sid uuid; ev text; p uuid; l uuid; s text; prev text; corr uuid; app partner_applications; req consultation_requests; h care_mcs_handoffs; cert care_certificates; assignment doctor_assignments; doc doctors;
BEGIN
 IF TG_TABLE_NAME='partner_application_events' THEN
 SELECT * INTO app FROM partner_applications WHERE id=NEW.application_id; k:='application';sid:=app.id;p:=coalesce(app.scope_partner_id,app.partner_id);s:=NEW.to_state;prev:=NEW.from_state;ev:=CASE WHEN NEW.action IN ('REVIEW_DOCUMENT','REQUEST_DOCUMENTS') OR s='NEED_MORE_DOCUMENTS' THEN 'document_request' ELSE 'partner_application' END;
 ELSIF TG_TABLE_NAME='consultation_request_events' THEN
 SELECT * INTO req FROM consultation_requests WHERE id=NEW.request_id;k:='request';sid:=req.id;p:=req.partner_id;l:=req.location_id;s:=NEW.to_state;prev:=NEW.from_state;corr:=NEW.correlation_id;ev:='consultation_request';
 ELSIF TG_TABLE_NAME='care_mcs_handoff_events' THEN
 SELECT * INTO h FROM care_mcs_handoffs WHERE id=NEW.handoff_id;k:='handoff';sid:=h.id;p:=h.partner_id;l:=h.location_id;s:=NEW.to_state;prev:=NEW.from_state;corr:=NEW.correlation_id;ev:='mcs_handoff';
 ELSIF TG_TABLE_NAME='care_certificate_events' THEN
 SELECT * INTO cert FROM care_certificates WHERE id=NEW.certificate_id;SELECT * INTO req FROM consultation_requests WHERE id=cert.request_id;k:='certificate';sid:=cert.id;p:=req.partner_id;l:=req.location_id;s:=NEW.to_state;prev:=NEW.from_state;corr:=NEW.correlation_id;ev:='certificate_status';
 ELSIF TG_TABLE_NAME='audit_log' THEN
 IF NEW.action LIKE 'DOCTOR_%' AND NEW.entity_type IN ('doctor','doctor_assignment') THEN
 ev:='doctor_change';sid:=NEW.entity_id::uuid;s:=NEW.action;p:=NEW.partner_id;k:=CASE WHEN NEW.entity_type='doctor' THEN 'doctor' ELSE 'assignment' END;
 IF k='assignment' THEN SELECT * INTO assignment FROM doctor_assignments WHERE id=sid;p:=assignment.partner_id;l:=assignment.location_id; ELSE SELECT * INTO doc FROM doctors WHERE id=sid;l:=doc.location_id; END IF;
 ELSIF NEW.action='PARTNER_INTAKE_SCREEN' AND NEW.metadata->>'status' IN ('BLOCKED','MANUAL_REVIEW') THEN k:='anomaly';sid:=NEW.entity_id::uuid;p:=NEW.partner_id;s:=NEW.metadata->>'status';ev:='credit_anomaly';
 ELSIF NEW.action IN ('CREDIT_MANUAL_REVIEW','COVERAGE_MANUAL_REVIEW','CREDIT_RECONCILIATION_REQUIRED') THEN k:='anomaly';sid:=NEW.id;p:=NEW.partner_id;s:='manual_review';ev:='credit_anomaly';
 ELSE RETURN NEW; END IF;
 END IF;
 IF sid IS NOT NULL THEN PERFORM notification_enqueue(k,sid,eid,ev,p,l,s,prev,corr); END IF; RETURN NEW;
END $$;
CREATE TRIGGER notification_application AFTER INSERT ON public.partner_application_events FOR EACH ROW EXECUTE FUNCTION public.notification_event_capture();
CREATE TRIGGER notification_request AFTER INSERT ON public.consultation_request_events FOR EACH ROW EXECUTE FUNCTION public.notification_event_capture();
CREATE TRIGGER notification_handoff AFTER INSERT ON public.care_mcs_handoff_events FOR EACH ROW EXECUTE FUNCTION public.notification_event_capture();
CREATE TRIGGER notification_certificate AFTER INSERT ON public.care_certificate_events FOR EACH ROW EXECUTE FUNCTION public.notification_event_capture();
CREATE TRIGGER notification_audit AFTER INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.notification_event_capture();
CREATE FUNCTION public.notification_command(_op text,_args jsonb,_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); oldop operational_notification_operations; n operational_notifications; result jsonb; dest text; reason text; event text; enabled_value boolean;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF _key IS NULL THEN RAISE EXCEPTION 'KEY_REQUIRED'; END IF;
 IF _op NOT IN ('preference','read','unread','suppress','retry','manual_review') OR jsonb_typeof(_args)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(_args) k WHERE k NOT IN ('id','event_type','enabled','reason')) THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_key::text,0));
 SELECT * INTO oldop FROM operational_notification_operations WHERE key=_key;
 IF oldop.key IS NOT NULL THEN IF oldop.actor<>u OR oldop.intent<>jsonb_build_object('op',_op,'args',_args) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF; RETURN oldop.result; END IF;
 IF _op='preference' THEN
 event:=_args->>'event_type'; IF notification_template(event) IS NULL OR jsonb_typeof(_args->'enabled')<>'boolean' THEN RAISE EXCEPTION 'INVALID_PREFERENCE'; END IF;
 enabled_value:=(_args->>'enabled')::boolean;
 INSERT INTO operational_notification_preferences(user_id,event_type,enabled) VALUES(u,event,enabled_value) ON CONFLICT(user_id,event_type) DO UPDATE SET enabled=excluded.enabled,updated_at=now();
 IF NOT enabled_value THEN
 FOR n IN SELECT * FROM operational_notifications WHERE recipient_user_id=u AND event_type=event AND status='queued' FOR UPDATE LOOP
 UPDATE operational_notifications SET status='suppressed',updated_at=now() WHERE id=n.id;
 INSERT INTO operational_notification_history(notification_id,actor_user_id,action,from_status,to_status,reason_code,correlation_id) VALUES(n.id,u,'preference',n.status,'suppressed','preference_disabled',_key);
 END LOOP; END IF;
 result:=jsonb_build_object('event_type',event,'enabled',enabled_value);
 ELSE
 SELECT * INTO n FROM operational_notifications WHERE id=(_args->>'id')::uuid FOR UPDATE;
 IF n.id IS NULL OR NOT notification_visible(n,u) THEN RAISE EXCEPTION 'NOTIFICATION_SCOPE_REQUIRED'; END IF;
 IF _op IN ('read','unread') THEN
 IF n.recipient_user_id<>u THEN RAISE EXCEPTION 'RECIPIENT_REQUIRED'; END IF;
 UPDATE operational_notifications SET read_at=CASE WHEN _op='read' THEN now() ELSE NULL END,updated_at=now() WHERE id=n.id;
 dest:=n.status;reason:='recipient_read_state';
 ELSE
 IF NOT notification_admin(u,n.partner_id) THEN RAISE EXCEPTION 'ADMIN_SCOPE_REQUIRED'; END IF;
 reason:=_args->>'reason';IF reason IS NULL OR reason NOT IN ('operator_suppression','retry_requested','requires_review') THEN RAISE EXCEPTION 'REASON_CODE_REQUIRED'; END IF;
 IF _op='suppress' THEN dest:='suppressed';
 ELSIF _op='manual_review' THEN dest:='manual_review';
 ELSIF _op='retry' THEN
 IF n.status NOT IN ('suppressed','failed','manual_review') THEN RAISE EXCEPTION 'RETRY_STATE_REQUIRED'; END IF;
 IF n.next_retry_at>now() THEN RAISE EXCEPTION 'RETRY_NOT_DUE'; END IF;
 IF NOT coalesce((SELECT enabled FROM operational_notification_preferences WHERE user_id=n.recipient_user_id AND event_type=n.event_type),true) THEN RAISE EXCEPTION 'PREFERENCE_DISABLED'; END IF;
 IF NOT notification_source_access(n.source_kind,n.source_id,n.partner_id,n.location_id,n.recipient_user_id) THEN RAISE EXCEPTION 'RECIPIENT_SCOPE_REVOKED'; END IF;
 IF n.retry_count>=3 THEN RAISE EXCEPTION 'RETRY_LIMIT'; END IF;
 dest:=CASE WHEN n.retry_count+1>=3 THEN 'manual_review' ELSE 'queued' END;
 UPDATE operational_notifications SET retry_count=retry_count+1,next_retry_at=now()+make_interval(secs=>60*(1<<n.retry_count)) WHERE id=n.id;
 ELSE RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
 UPDATE operational_notifications SET status=dest,updated_at=now() WHERE id=n.id;
 END IF;
 INSERT INTO operational_notification_history(notification_id,actor_user_id,action,from_status,to_status,reason_code,correlation_id) VALUES(n.id,u,_op,n.status,dest,reason,_key);
 result:=jsonb_build_object('id',n.id,'status',dest);
 END IF;
 INSERT INTO audit_log(actor_user_id,partner_id,location_id,action,entity_type,entity_id,metadata) VALUES(u,n.partner_id,n.location_id,'NOTIFICATION_'||upper(_op),'operational_notification',coalesce(n.id::text,event),jsonb_build_object('correlation_id',_key));
 INSERT INTO operational_notification_operations VALUES(_key,u,jsonb_build_object('op',_op,'args',_args),result); RETURN result;
END $$;
CREATE FUNCTION public.notification_center(_manage boolean DEFAULT false,_status text DEFAULT '',_unread boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); result jsonb;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF _manage AND NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND status='ACTIVE' AND (role='OPERATIONS_ADMIN' OR (role='SUPER_ADMIN' AND partner_id IS NULL))) THEN RAISE EXCEPTION 'ADMIN_SCOPE_REQUIRED'; END IF;
 WITH visible AS (SELECT n.* FROM operational_notifications n WHERE notification_visible(n,u) AND (CASE WHEN _manage THEN notification_admin(u,n.partner_id) ELSE n.recipient_user_id=u END) AND (_status='' OR n.status=_status) AND (NOT _unread OR n.read_at IS NULL)), rows AS (SELECT * FROM visible ORDER BY created_at DESC,id DESC LIMIT 100)
 SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(rows)) FROM rows),'[]'),'total',(SELECT count(*) FROM visible),'unread',(SELECT count(*) FROM operational_notifications n WHERE n.recipient_user_id=u AND n.read_at IS NULL AND notification_visible(n,u)),
 'preferences',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM operational_notification_preferences p WHERE p.user_id=u),'[]'),
 'history',coalesce((SELECT jsonb_agg(to_jsonb(h)) FROM operational_notification_history h WHERE h.notification_id IN (SELECT id FROM rows)),'[]'),'worker',jsonb_build_object('enabled',false,'processed',0,'reason','provider_not_approved')) INTO result; RETURN result;
END $$;
CREATE FUNCTION public.notification_sla_scan() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET timezone='UTC' AS $$
DECLARE u uuid:=auth.uid(); r record; eid uuid; n integer:=0;
BEGIN
 IF u IS NULL OR NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND status='ACTIVE' AND (role='OPERATIONS_ADMIN' OR (role='SUPER_ADMIN' AND partner_id IS NULL))) THEN RAISE EXCEPTION 'ADMIN_SCOPE_REQUIRED'; END IF;
 FOR r IN SELECT q.id,q.partner_id,q.location_id,q.state,c.scheduled_at FROM consultation_requests q JOIN consultations c ON c.id=q.consultation_id WHERE notification_admin(u,q.partner_id) AND q.state IN ('scheduled','accepted','queued') AND c.scheduled_at<now() LOOP
 eid:=md5('sla:'||r.id||':'||r.scheduled_at::text)::uuid;n:=n+notification_enqueue('request',r.id,eid,'sla_reminder',r.partner_id,r.location_id,'overdue',NULL,eid);
 END LOOP; RETURN jsonb_build_object('enqueued',n,'threshold','existing_scheduled_at');
END $$;
REVOKE ALL ON FUNCTION public.notification_template(text),public.notification_admin(uuid,uuid),public.notification_source_access(text,uuid,uuid,uuid,uuid),public.notification_visible(public.operational_notifications,uuid),public.notification_content_guard(),public.notification_enqueue(text,uuid,uuid,text,uuid,uuid,text,text,uuid),public.notification_event_capture(),public.notification_command(text,jsonb,uuid),public.notification_center(boolean,text,boolean),public.notification_sla_scan() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.notification_visible(public.operational_notifications,uuid),public.notification_command(text,jsonb,uuid),public.notification_center(boolean,text,boolean),public.notification_sla_scan() TO authenticated;
COMMENT ON FUNCTION public.notification_template(text) IS 'Versioned immutable approved operational template registry; no provider or ordinary-user editing.';