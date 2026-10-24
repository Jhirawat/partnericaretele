-- Operational-only SLA control plane. No workflow, clinical, ledger or provider writes.
CREATE TABLE public.operational_sla_policies(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),partner_id uuid NOT NULL REFERENCES public.partners(id),location_id uuid REFERENCES public.locations(id),
 kind text NOT NULL CHECK(kind IN ('partner_review','missing_documents','doctor_assignment','consultation_queue','mcs_handoff','certificate_review','manual_review','overdue_followup')),
 version integer NOT NULL,effective_from timestamptz NOT NULL,effective_to timestamptz,
 warning_minutes integer NOT NULL CHECK(warning_minutes>=0),breach_minutes integer NOT NULL CHECK(breach_minutes>warning_minutes),
 clock_mode text NOT NULL CHECK(clock_mode IN ('calendar','business')),timezone text NOT NULL,
 business_days integer[] NOT NULL,opens time NOT NULL,closes time NOT NULL,
 escalation_level integer NOT NULL CHECK(escalation_level BETWEEN 1 AND 5),owner_role public.app_role NOT NULL,
 suppression_from timestamptz,suppression_to timestamptz,maintenance_from timestamptz,maintenance_to timestamptz,
 reason text NOT NULL,created_by uuid NOT NULL,status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','rejected')),reviewed_by uuid,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(partner_id,location_id,kind,version)
);
GRANT SELECT ON public.operational_sla_policies TO authenticated;
GRANT ALL ON public.operational_sla_policies TO service_role;
ALTER TABLE public.operational_sla_policies ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.operational_sla_cases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),partner_id uuid NOT NULL,location_id uuid,kind text NOT NULL,source_id uuid NOT NULL,
 episode text NOT NULL UNIQUE,policy_id uuid REFERENCES public.operational_sla_policies(id),started_at timestamptz NOT NULL,
 state text NOT NULL CHECK(state IN ('on_track','warning','breached','paused','resolved','manual_review')),
 elapsed_minutes numeric NOT NULL DEFAULT 0,paused_at timestamptz,owner_user_id uuid,acknowledged_at timestamptz,source_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.operational_sla_cases TO authenticated;
GRANT ALL ON public.operational_sla_cases TO service_role;
ALTER TABLE public.operational_sla_cases ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.operational_sla_timeline(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid REFERENCES public.operational_sla_cases(id),policy_id uuid REFERENCES public.operational_sla_policies(id),
 partner_id uuid NOT NULL,location_id uuid,actor_user_id uuid NOT NULL,action text NOT NULL,from_state text,to_state text,
 reason text NOT NULL,correlation_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.operational_sla_timeline TO authenticated;
GRANT ALL ON public.operational_sla_timeline TO service_role;
ALTER TABLE public.operational_sla_timeline ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.operational_sla_operations(key uuid PRIMARY KEY,actor uuid NOT NULL,intent jsonb NOT NULL,result jsonb NOT NULL);
GRANT ALL ON public.operational_sla_operations TO service_role;
ALTER TABLE public.operational_sla_operations ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.operational_maintenance(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),partner_id uuid NOT NULL,location_id uuid,starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,
 reason text NOT NULL,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),CHECK(ends_at>starts_at)
);
GRANT SELECT ON public.operational_maintenance TO authenticated;
GRANT ALL ON public.operational_maintenance TO service_role;
ALTER TABLE public.operational_maintenance ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.operational_health_checks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),checked_at timestamptz NOT NULL DEFAULT now(),checked_by uuid NOT NULL,evidence jsonb NOT NULL);
GRANT ALL ON public.operational_health_checks TO service_role;
ALTER TABLE public.operational_health_checks ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.sla_scope(_u uuid,_p uuid,_l uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT _u IS NOT NULL AND partner_review_scope(_u,_p) AND (_l IS NULL OR EXISTS(SELECT 1 FROM locations WHERE id=_l AND partner_id=_p)) $$;
CREATE POLICY sla_policy_read ON public.operational_sla_policies FOR SELECT TO authenticated USING(sla_scope(auth.uid(),partner_id,location_id));
CREATE POLICY sla_case_read ON public.operational_sla_cases FOR SELECT TO authenticated USING(sla_scope(auth.uid(),partner_id,location_id));
CREATE POLICY sla_timeline_read ON public.operational_sla_timeline FOR SELECT TO authenticated USING(sla_scope(auth.uid(),partner_id,location_id));
CREATE POLICY sla_maintenance_read ON public.operational_maintenance FOR SELECT TO authenticated USING(sla_scope(auth.uid(),partner_id,location_id));
CREATE TRIGGER sla_timeline_immutable BEFORE UPDATE OR DELETE ON public.operational_sla_timeline FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER sla_operations_immutable BEFORE UPDATE OR DELETE ON public.operational_sla_operations FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER sla_maintenance_immutable BEFORE UPDATE OR DELETE ON public.operational_maintenance FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER sla_health_immutable BEFORE UPDATE OR DELETE ON public.operational_health_checks FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE FUNCTION public.sla_policy_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF TG_OP='DELETE' OR OLD.status IN ('approved','rejected') OR (to_jsonb(NEW)-ARRAY['status','reviewed_by']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','reviewed_by']) THEN RAISE EXCEPTION 'IMMUTABLE_POLICY_VERSION'; END IF;RETURN NEW;END $$;
CREATE TRIGGER sla_policy_immutable BEFORE UPDATE OR DELETE ON public.operational_sla_policies FOR EACH ROW EXECUTE FUNCTION public.sla_policy_guard();

-- Exact clipped intervals; union subtraction prevents double-counting overlapping pauses/maintenance.
CREATE FUNCTION public.sla_elapsed(_start timestamptz,_end timestamptz,_mode text,_tz text,_days integer[],_open time,_close time,_excluded jsonb DEFAULT '[]') RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE d date; a timestamptz;b timestamptz;span tstzrange;windows tstzmultirange;blocked tstzmultirange;part tstzrange;total numeric:=0;
BEGIN
 IF _end<=_start THEN RETURN 0; END IF;
 IF _mode NOT IN ('calendar','business') OR _close<=_open OR _end-_start>interval '100 years' THEN RAISE EXCEPTION 'INVALID_CLOCK';END IF;
 SELECT coalesce(range_agg(tstzrange((e->>'start')::timestamptz,(e->>'end')::timestamptz,'[)')),'{}'::tstzmultirange) INTO blocked FROM jsonb_array_elements(_excluded)e WHERE (e->>'end')::timestamptz>(e->>'start')::timestamptz;
 IF _mode='calendar' THEN windows:=tstzmultirange(tstzrange(_start,_end,'[)'))-blocked;
 FOR part IN SELECT unnest(windows) LOOP total:=total+extract(epoch FROM upper(part)-lower(part))/60; END LOOP;
 ELSE
 d:=(_start AT TIME ZONE _tz)::date;
 WHILE d<=(_end AT TIME ZONE _tz)::date LOOP
 IF extract(isodow FROM d)::integer=ANY(_days) THEN
 a:=greatest(_start,(d+_open) AT TIME ZONE _tz);b:=least(_end,(d+_close) AT TIME ZONE _tz);
 IF b>a THEN windows:=tstzmultirange(tstzrange(a,b,'[)'))-blocked;FOR part IN SELECT unnest(windows) LOOP total:=total+extract(epoch FROM upper(part)-lower(part))/60;END LOOP;END IF;
 END IF;d:=d+1;
 END LOOP;
 END IF;RETURN total;
END $$;

-- Only operational IDs/status/timestamps; no names, clinical history, document bytes or private URLs.
CREATE FUNCTION public.sla_sources() RETURNS TABLE(kind text,id uuid,partner_id uuid,location_id uuid,started_at timestamptz,active boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT 'partner_review',a.id,coalesce(a.scope_partner_id,a.partner_id),null::uuid,coalesce((SELECT max(e.created_at) FROM partner_application_events e WHERE e.application_id=a.id AND e.from_state IS DISTINCT FROM e.to_state),a.created_at),a.status IN ('SUBMITTED','UNDER_REVIEW') FROM partner_applications a
 UNION ALL SELECT 'missing_documents',a.id,coalesce(a.scope_partner_id,a.partner_id),null,coalesce((SELECT max(e.created_at) FROM partner_application_events e WHERE e.application_id=a.id AND e.from_state IS DISTINCT FROM e.to_state),a.created_at),a.status='NEED_MORE_DOCUMENTS' FROM partner_applications a
 UNION ALL SELECT 'doctor_assignment',a.id,a.partner_id,a.location_id,a.created_at,a.status='SUSPENDED' FROM doctor_assignments a
 UNION ALL SELECT 'doctor_assignment',d.id,l.partner_id,d.location_id,d.created_at,d.status='PENDING' FROM doctors d JOIN locations l ON l.id=d.location_id
 UNION ALL SELECT 'consultation_queue',r.id,r.partner_id,r.location_id,coalesce((SELECT max(e.created_at) FROM consultation_request_events e WHERE e.request_id=r.id AND e.from_state IS DISTINCT FROM e.to_state),r.created_at),r.state IN ('submitted','queued','accepted','scheduled') FROM consultation_requests r
 UNION ALL SELECT 'mcs_handoff',h.id,h.partner_id,h.location_id,coalesce((SELECT max(e.created_at) FROM care_mcs_handoff_events e WHERE e.handoff_id=h.id AND e.from_state IS DISTINCT FROM e.to_state),h.created_at),h.state NOT IN ('closed','cancelled') FROM care_mcs_handoffs h
 UNION ALL SELECT 'certificate_review',c.id,r.partner_id,r.location_id,coalesce((SELECT max(e.created_at) FROM care_certificate_events e WHERE e.certificate_id=c.id AND e.from_state IS DISTINCT FROM e.to_state),c.created_at),c.state IN ('certificate_pending','certificate_uploaded') FROM care_certificates c JOIN consultation_requests r ON r.id=c.request_id
 UNION ALL SELECT 'manual_review',i.id,i.partner_id,i.location_id,i.evaluated_at,i.status IN ('BLOCKED','MANUAL_REVIEW') FROM partner_intakes i
 UNION ALL SELECT 'manual_review',r.id,r.partner_id,r.location_id,coalesce((SELECT max(e.created_at) FROM consultation_request_events e WHERE e.request_id=r.id AND e.from_state IS DISTINCT FROM e.to_state),r.created_at),r.state='manual_review' FROM consultation_requests r
 UNION ALL SELECT 'manual_review',h.id,h.partner_id,h.location_id,coalesce((SELECT max(e.created_at) FROM care_mcs_handoff_events e WHERE e.handoff_id=h.id AND e.from_state IS DISTINCT FROM e.to_state),h.created_at),h.state IN ('manual_review','blocked') FROM care_mcs_handoffs h
 UNION ALL SELECT 'manual_review',c.id,r.partner_id,r.location_id,c.updated_at,c.state='manual_review' FROM care_certificates c JOIN consultation_requests r ON r.id=c.request_id
 UNION ALL SELECT 'overdue_followup',f.id,f.partner_id,null,f.due_at,f.status='SCHEDULED' FROM care_followups f
$$;

CREATE FUNCTION public.sla_log(_case uuid,_policy uuid,_p uuid,_l uuid,_action text,_from text,_to text,_reason text,_key uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 INSERT INTO operational_sla_timeline(case_id,policy_id,partner_id,location_id,actor_user_id,action,from_state,to_state,reason,correlation_id) VALUES(_case,_policy,_p,_l,auth.uid(),_action,_from,_to,_reason,_key);
 INSERT INTO audit_log(actor_user_id,partner_id,location_id,action,entity_type,entity_id,metadata) VALUES(auth.uid(),_p,_l,'SLA_'||upper(_action),'operational_sla',coalesce(_case,_policy)::text,jsonb_build_object('correlation_id',_key));
END $$;

CREATE FUNCTION public.sla_health() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('version','operational_sla_v1','rls_enabled',NOT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity),'private_certificate_bucket',EXISTS(SELECT 1 FROM storage.buckets WHERE id='care-certificates' AND NOT public),'storage_policy_count',(SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'),'outbox_enabled',false,'external_providers','disabled','last_health_check',(SELECT max(checked_at) FROM operational_health_checks),'last_test_check',null,'migration_evidence','catalog_checked_no_ledger_attestation','sla_schema_present',to_regclass('public.operational_sla_policies') IS NOT NULL)
$$;

CREATE FUNCTION public.sla_scan(_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET timezone='UTC' AS $$
DECLARE u uuid:=auth.uid();s record;c operational_sla_cases;p operational_sla_policies;dest text;excluded jsonb;elapsed numeric;episode_value text;event_id uuid;n integer:=0;
BEGIN
 IF u IS NULL OR NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND status='ACTIVE' AND (role='OPERATIONS_ADMIN' OR (role='SUPER_ADMIN' AND partner_id IS NULL))) THEN RAISE EXCEPTION 'ADMIN_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sla_scan',0));
 FOR s IN SELECT * FROM sla_sources() x WHERE x.partner_id IS NOT NULL AND sla_scope(u,x.partner_id,x.location_id) AND x.active AND x.started_at<=now() LOOP
 episode_value:=s.kind||':'||s.id||':'||extract(epoch FROM s.started_at)::text;
 SELECT * INTO c FROM operational_sla_cases WHERE episode=episode_value FOR UPDATE;
 IF c.id IS NULL THEN
 SELECT * INTO p FROM operational_sla_policies WHERE partner_id=s.partner_id AND kind=s.kind AND status='approved' AND (location_id IS NULL OR location_id=s.location_id) AND effective_from<=s.started_at AND (effective_to IS NULL OR effective_to>s.started_at) ORDER BY location_id NULLS LAST,version DESC LIMIT 1;
 INSERT INTO operational_sla_cases(partner_id,location_id,kind,source_id,episode,policy_id,started_at,state) VALUES(s.partner_id,s.location_id,s.kind,s.id,episode_value,p.id,s.started_at,CASE WHEN p.id IS NULL THEN 'manual_review' ELSE 'on_track' END) RETURNING * INTO c;
 PERFORM sla_log(c.id,p.id,c.partner_id,c.location_id,'opened',null,c.state,'source_observed',_key);
 ELSE SELECT * INTO p FROM operational_sla_policies WHERE id=c.policy_id;END IF;
 IF p.id IS NULL THEN dest:='manual_review';elapsed:=0;
 ELSE
 SELECT coalesce(jsonb_agg(x),'[]') INTO excluded FROM (
 SELECT jsonb_build_object('start',t.created_at,'end',coalesce((SELECT min(e.created_at) FROM operational_sla_timeline e WHERE e.case_id=c.id AND e.action='resume' AND e.created_at>=t.created_at),now()))x FROM operational_sla_timeline t WHERE t.case_id=c.id AND t.action='pause'
 UNION ALL SELECT jsonb_build_object('start',m.starts_at,'end',m.ends_at) FROM operational_maintenance m WHERE m.partner_id=c.partner_id AND (m.location_id IS NULL OR m.location_id=c.location_id)
 UNION ALL SELECT jsonb_build_object('start',p.maintenance_from,'end',p.maintenance_to) WHERE p.maintenance_from IS NOT NULL
 )q;
 elapsed:=sla_elapsed(c.started_at,now(),p.clock_mode,p.timezone,p.business_days,p.opens,p.closes,excluded);
 IF c.paused_at IS NOT NULL OR (now()>=p.maintenance_from AND now()<p.maintenance_to) OR EXISTS(SELECT 1 FROM operational_maintenance m WHERE m.partner_id=c.partner_id AND (m.location_id IS NULL OR m.location_id=c.location_id) AND now()>=m.starts_at AND now()<m.ends_at) THEN dest:='paused';
 ELSIF elapsed>=p.breach_minutes THEN dest:='breached';ELSIF elapsed>=p.warning_minutes THEN dest:='warning';ELSE dest:='on_track';END IF;
 END IF;
 IF dest<>c.state THEN
 UPDATE operational_sla_cases SET state=dest,elapsed_minutes=elapsed,updated_at=now() WHERE id=c.id;
 PERFORM sla_log(c.id,c.policy_id,c.partner_id,c.location_id,'clock',c.state,dest,'threshold_evaluated',_key);
 IF dest IN ('warning','breached') AND NOT coalesce(now()>=p.suppression_from AND now()<p.suppression_to,false) THEN
 event_id:=md5('sla:'||c.id||':'||dest)::uuid;
 PERFORM notification_enqueue('sla',c.id,event_id,'sla_reminder',c.partner_id,c.location_id,dest,c.state,_key);
 END IF;
 ELSE UPDATE operational_sla_cases SET elapsed_minutes=elapsed WHERE id=c.id;END IF;n:=n+1;
 END LOOP;
 FOR c IN SELECT * FROM operational_sla_cases x WHERE x.source_active AND sla_scope(u,x.partner_id,x.location_id) AND NOT EXISTS(SELECT 1 FROM sla_sources() src WHERE src.kind=x.kind AND src.id=x.source_id AND src.active AND src.started_at=x.started_at) FOR UPDATE LOOP
 UPDATE operational_sla_cases SET state='resolved',source_active=false,paused_at=null,updated_at=now() WHERE id=c.id;
 PERFORM sla_log(c.id,c.policy_id,c.partner_id,c.location_id,'resolved',c.state,'resolved','source_resolved',_key);
 END LOOP;RETURN jsonb_build_object('evaluated',n,'external_sent',0);
END $$;

CREATE FUNCTION public.sla_command(_op text,_args jsonb,_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();oldop operational_sla_operations;p operational_sla_policies;c operational_sla_cases;pid uuid;lid uuid;rid uuid;reason_value text;dest text;result jsonb;target uuid;owner_role_value app_role;
BEGIN
 IF u IS NULL OR _key IS NULL THEN RAISE EXCEPTION 'AUTH_KEY_REQUIRED';END IF;
 IF _op NOT IN ('propose','submit','approve','reject','pause','resume','acknowledge','reassign','maintenance','scan','health_check') OR jsonb_typeof(_args)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(_args) k WHERE k NOT IN ('id','partner_id','location_id','kind','effective_from','effective_to','warning_minutes','breach_minutes','clock_mode','timezone','business_days','opens','closes','escalation_level','owner_role','suppression_from','suppression_to','maintenance_from','maintenance_to','reason','owner_user_id','starts_at','ends_at')) THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_key::text,0));SELECT * INTO oldop FROM operational_sla_operations WHERE key=_key;
 IF oldop.key IS NOT NULL THEN IF oldop.actor<>u OR oldop.intent<>jsonb_build_object('op',_op,'args',_args) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';END IF;RETURN oldop.result;END IF;
 reason_value:=btrim(_args->>'reason');IF _op NOT IN ('scan','health_check') AND (reason_value IS NULL OR length(reason_value)<3 OR length(reason_value)>500) THEN RAISE EXCEPTION 'REASON_REQUIRED';END IF;
 IF _op='scan' THEN result:=sla_scan(_key);
 ELSIF _op='health_check' THEN
 IF NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND status='ACTIVE' AND role='SUPER_ADMIN' AND partner_id IS NULL) THEN RAISE EXCEPTION 'SUPER_REQUIRED';END IF;
 INSERT INTO operational_health_checks(checked_by,evidence) VALUES(u,sla_health());result:=sla_health();
 ELSIF _op IN ('propose','maintenance') THEN
 pid:=(_args->>'partner_id')::uuid;lid:=nullif(_args->>'location_id','')::uuid;
 IF pid IS NULL OR NOT sla_scope(u,pid,lid) THEN RAISE EXCEPTION 'SLA_SCOPE_REQUIRED';END IF;
 IF _op='maintenance' THEN
 INSERT INTO operational_maintenance(partner_id,location_id,starts_at,ends_at,reason,created_by) VALUES(pid,lid,(_args->>'starts_at')::timestamptz,(_args->>'ends_at')::timestamptz,reason_value,u) RETURNING id INTO rid;
 PERFORM sla_log(null,null,pid,lid,'maintenance',null,'paused',reason_value,_key);
 ELSE
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=_args->>'timezone') OR (_args->>'closes')::time<=(_args->>'opens')::time OR jsonb_typeof(_args->'business_days') IS DISTINCT FROM 'array' OR jsonb_array_length(_args->'business_days')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(_args->'business_days')d WHERE d::integer NOT BETWEEN 1 AND 7) OR (_args->>'effective_to')::timestamptz<=(_args->>'effective_from')::timestamptz OR ((_args->>'suppression_from') IS NULL)<>((_args->>'suppression_to') IS NULL) OR ((_args->>'maintenance_from') IS NULL)<>((_args->>'maintenance_to') IS NULL) OR (_args->>'suppression_to')::timestamptz<=(_args->>'suppression_from')::timestamptz OR (_args->>'maintenance_to')::timestamptz<=(_args->>'maintenance_from')::timestamptz THEN RAISE EXCEPTION 'INVALID_POLICY_CLOCK';END IF;
 owner_role_value:=(_args->>'owner_role')::app_role;IF owner_role_value NOT IN ('OPERATIONS_ADMIN','DOCTOR','PARTNER_MANAGER') THEN RAISE EXCEPTION 'INVALID_OWNER_ROLE';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(pid::text||coalesce(lid::text,'')||(_args->>'kind'),0));
 INSERT INTO operational_sla_policies(partner_id,location_id,kind,version,effective_from,effective_to,warning_minutes,breach_minutes,clock_mode,timezone,business_days,opens,closes,escalation_level,owner_role,suppression_from,suppression_to,maintenance_from,maintenance_to,reason,created_by)
 VALUES(pid,lid,_args->>'kind',coalesce((SELECT max(version)+1 FROM operational_sla_policies WHERE partner_id=pid AND location_id IS NOT DISTINCT FROM lid AND kind=_args->>'kind'),1),(_args->>'effective_from')::timestamptz,(_args->>'effective_to')::timestamptz,(_args->>'warning_minutes')::integer,(_args->>'breach_minutes')::integer,_args->>'clock_mode',_args->>'timezone',ARRAY(SELECT d::integer FROM jsonb_array_elements_text(_args->'business_days')d),(_args->>'opens')::time,(_args->>'closes')::time,(_args->>'escalation_level')::integer,owner_role_value,(_args->>'suppression_from')::timestamptz,(_args->>'suppression_to')::timestamptz,(_args->>'maintenance_from')::timestamptz,(_args->>'maintenance_to')::timestamptz,reason_value,u) RETURNING id INTO rid;
 PERFORM sla_log(null,rid,pid,lid,'propose',null,'draft',reason_value,_key);
 END IF;result:=jsonb_build_object('id',rid);
 ELSIF _op IN ('submit','approve','reject') THEN
 SELECT * INTO p FROM operational_sla_policies WHERE id=(_args->>'id')::uuid FOR UPDATE;
 IF p.id IS NULL OR NOT sla_scope(u,p.partner_id,p.location_id) THEN RAISE EXCEPTION 'SLA_SCOPE_REQUIRED';END IF;
 IF _op='submit' AND p.status='draft' THEN dest:='submitted';
 ELSIF _op IN ('approve','reject') AND p.status='submitted' THEN
 IF p.created_by=u THEN RAISE EXCEPTION 'INDEPENDENT_REVIEW_REQUIRED';END IF;
 dest:=CASE WHEN _op='approve' THEN 'approved' ELSE 'rejected' END;
 IF dest='approved' THEN
 PERFORM pg_advisory_xact_lock(hashtextextended(p.partner_id::text||coalesce(p.location_id::text,'')||p.kind,0));
 IF EXISTS(SELECT 1 FROM operational_sla_policies q WHERE q.partner_id=p.partner_id AND q.location_id IS NOT DISTINCT FROM p.location_id AND q.kind=p.kind AND q.status='approved' AND tstzrange(q.effective_from,q.effective_to,'[)')&&tstzrange(p.effective_from,p.effective_to,'[)')) THEN RAISE EXCEPTION 'OVERLAPPING_POLICY';END IF;
 END IF;
 ELSE RAISE EXCEPTION 'INVALID_POLICY_TRANSITION';END IF;
 UPDATE operational_sla_policies SET status=dest,reviewed_by=CASE WHEN _op='submit' THEN null ELSE u END WHERE id=p.id;
 PERFORM sla_log(null,p.id,p.partner_id,p.location_id,_op,p.status,dest,reason_value,_key);result:=jsonb_build_object('id',p.id,'status',dest);
 ELSE
 SELECT * INTO c FROM operational_sla_cases WHERE id=(_args->>'id')::uuid FOR UPDATE;
 IF c.id IS NULL OR NOT sla_scope(u,c.partner_id,c.location_id) OR NOT c.source_active THEN RAISE EXCEPTION 'SLA_SCOPE_REQUIRED';END IF;dest:=c.state;
 IF _op='pause' THEN IF c.paused_at IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_PAUSED';END IF;UPDATE operational_sla_cases SET paused_at=now(),state='paused' WHERE id=c.id;dest:='paused';
 ELSIF _op='resume' THEN IF c.paused_at IS NULL THEN RAISE EXCEPTION 'NOT_PAUSED';END IF;UPDATE operational_sla_cases SET paused_at=null WHERE id=c.id;
 ELSIF _op='acknowledge' THEN IF c.state NOT IN ('warning','breached','manual_review') THEN RAISE EXCEPTION 'ESCALATION_REQUIRED';END IF;UPDATE operational_sla_cases SET acknowledged_at=now() WHERE id=c.id;
 ELSIF _op='reassign' THEN
 SELECT owner_role INTO owner_role_value FROM operational_sla_policies WHERE id=c.policy_id;target:=(_args->>'owner_user_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=target AND r.status='ACTIVE' AND r.role=owner_role_value AND (r.partner_id=c.partner_id OR (r.partner_id IS NULL AND r.role='OPERATIONS_ADMIN'))) OR (owner_role_value='DOCTOR' AND NOT EXISTS(SELECT 1 FROM doctor_assignments a JOIN doctors d ON d.id=a.doctor_id WHERE d.auth_user_id=target AND d.status='ACTIVE' AND a.status='ACTIVE' AND a.partner_id=c.partner_id AND (c.location_id IS NULL OR a.location_id=c.location_id))) THEN RAISE EXCEPTION 'OWNER_SCOPE_REQUIRED';END IF;
 UPDATE operational_sla_cases SET owner_user_id=target WHERE id=c.id;
 ELSE RAISE EXCEPTION 'INVALID_OPERATION';END IF;
 PERFORM sla_log(c.id,c.policy_id,c.partner_id,c.location_id,_op,c.state,dest,reason_value,_key);result:=jsonb_build_object('id',c.id,'state',dest);
 END IF;
 INSERT INTO operational_sla_operations VALUES(_key,u,jsonb_build_object('op',_op,'args',_args),result);RETURN result;
END $$;

CREATE FUNCTION public.sla_console(_mode text DEFAULT 'admin') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();super boolean;result jsonb;
BEGIN
 SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND role='SUPER_ADMIN' AND partner_id IS NULL AND status='ACTIVE') INTO super;
 IF u IS NULL OR _mode NOT IN ('admin','super','health') OR NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=u AND status='ACTIVE' AND (role='OPERATIONS_ADMIN' OR (role='SUPER_ADMIN' AND partner_id IS NULL))) OR (_mode IN ('super','health') AND NOT super) THEN RAISE EXCEPTION 'ADMIN_REQUIRED';END IF;
 IF _mode='health' THEN RETURN sla_health();END IF;
 WITH scoped AS (SELECT c.* FROM operational_sla_cases c WHERE sla_scope(u,c.partner_id,c.location_id)), totals AS (SELECT state,count(*)::integer count FROM scoped GROUP BY state),rows AS (SELECT id,partner_id,location_id,kind,policy_id,state,elapsed_minutes,started_at,owner_user_id,acknowledged_at FROM scoped ORDER BY CASE state WHEN 'breached' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,started_at LIMIT 100)
 SELECT jsonb_build_object('totals',coalesce((SELECT jsonb_agg(totals) FROM totals),'[]'),'rows',CASE WHEN _mode='super' THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(rows) FROM rows),'[]') END,'policies',CASE WHEN _mode='super' THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(p) FROM operational_sla_policies p WHERE sla_scope(u,p.partner_id,p.location_id)),'[]') END,'timeline',CASE WHEN _mode='super' THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(t) FROM (SELECT * FROM operational_sla_timeline WHERE case_id IN (SELECT id FROM rows) OR policy_id IN (SELECT id FROM operational_sla_policies WHERE sla_scope(u,partner_id,location_id)) ORDER BY created_at DESC LIMIT 200)t),'[]') END,'maintenance',CASE WHEN _mode='super' THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(m) FROM operational_maintenance m WHERE sla_scope(u,m.partner_id,m.location_id)),'[]') END,'organizations',CASE WHEN _mode='super' THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name)) FROM partners p WHERE sla_scope(u,p.id,null)),'[]') END,'branches',CASE WHEN _mode='super' THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'partner_id',l.partner_id,'name',l.name)) FROM locations l WHERE sla_scope(u,l.partner_id,l.id)),'[]') END,'providers_enabled',false,'checked_at',(SELECT max(created_at) FROM operational_sla_timeline),'unconfigured',(SELECT count(*) FROM scoped WHERE policy_id IS NULL),'total',(SELECT count(*) FROM scoped)) INTO result;RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.sla_scope(uuid,uuid,uuid),public.sla_policy_guard(),public.sla_elapsed(timestamptz,timestamptz,text,text,integer[],time,time,jsonb),public.sla_sources(),public.sla_log(uuid,uuid,uuid,uuid,text,text,text,text,uuid),public.sla_health(),public.sla_scan(uuid),public.sla_command(text,jsonb,uuid),public.sla_console(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sla_scope(uuid,uuid,uuid),public.sla_command(text,jsonb,uuid),public.sla_console(text) TO authenticated;