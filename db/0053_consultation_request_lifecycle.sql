-- Additive workflow layer. Existing credit/Annual/DIRECT mathematics and approval gates remain authoritative.
CREATE TABLE public.consultation_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), intake_id uuid NOT NULL UNIQUE REFERENCES public.partner_intakes(id),
 partner_id uuid NOT NULL REFERENCES public.partners(id), location_id uuid NOT NULL REFERENCES public.locations(id), patient_id uuid NOT NULL REFERENCES public.patients(id),
 consultation_id uuid UNIQUE REFERENCES public.consultations(id),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','submitted','queued','accepted','scheduled','in_consultation','completed','cancelled','rejected','manual_review')),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.consultation_requests TO authenticated;
GRANT ALL ON public.consultation_requests TO service_role;
ALTER TABLE public.consultation_requests ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.consultation_request_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES public.consultation_requests(id),
 from_state text, to_state text NOT NULL, actor_user_id uuid NOT NULL, reason text NOT NULL,
 correlation_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.consultation_request_events TO authenticated;
GRANT ALL ON public.consultation_request_events TO service_role;
ALTER TABLE public.consultation_request_events ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.consultation_request_operations (
 correlation_id uuid PRIMARY KEY, actor_user_id uuid NOT NULL, operation text NOT NULL, target_id uuid NOT NULL,
 args jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.consultation_request_operations TO service_role;
ALTER TABLE public.consultation_request_operations ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.consultation_request_doctor(_doctor uuid,_org uuid,_branch uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM doctors d JOIN doctor_assignments a ON a.doctor_id=d.id
 JOIN user_roles u ON u.user_id=d.auth_user_id AND u.role='DOCTOR' AND u.status='ACTIVE' AND (u.partner_id IS NULL OR u.partner_id=_org)
 JOIN locations l ON l.id=_branch AND l.partner_id=_org AND l.status='ACTIVE'
 JOIN partners p ON p.id=_org AND p.status='ACTIVE'
 WHERE d.id=_doctor AND d.status='ACTIVE' AND d.license_expires_on>=current_date
 AND a.partner_id=_org AND a.status='ACTIVE' AND (a.location_id IS NULL OR a.location_id=_branch) AND partner_workspace_enabled(_org))
 $$;
CREATE FUNCTION public.consultation_request_access(_id uuid,_u uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT _u IS NOT NULL AND EXISTS(SELECT 1 FROM consultation_requests r LEFT JOIN consultations c ON c.id=r.consultation_id
 WHERE r.id=_id AND (partner_customer_write(_u,r.partner_id,r.location_id) OR partner_review_scope(_u,r.partner_id)
 OR EXISTS(SELECT 1 FROM doctors d WHERE d.id=c.assigned_doctor_id AND d.auth_user_id=_u
 AND consultation_request_doctor(d.id,r.partner_id,r.location_id))))
 $$;
REVOKE ALL ON FUNCTION public.consultation_request_doctor(uuid,uuid,uuid),public.consultation_request_access(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.consultation_request_doctor(uuid,uuid,uuid),public.consultation_request_access(uuid,uuid) TO authenticated,service_role;
CREATE POLICY request_read ON public.consultation_requests FOR SELECT TO authenticated USING(consultation_request_access(id,auth.uid()));
CREATE POLICY request_event_read ON public.consultation_request_events FOR SELECT TO authenticated USING(consultation_request_access(request_id,auth.uid()));
CREATE TRIGGER request_events_immutable BEFORE UPDATE OR DELETE ON public.consultation_request_events FOR EACH ROW EXECUTE FUNCTION public.partner_intake_immutable();
CREATE TRIGGER request_operations_immutable BEFORE UPDATE OR DELETE ON public.consultation_request_operations FOR EACH ROW EXECUTE FUNCTION public.partner_intake_immutable();

CREATE FUNCTION public.consultation_request_ready(_intake uuid,_doctor uuid,_submitted boolean DEFAULT false) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i partner_intakes;
BEGIN
 SELECT * INTO i FROM partner_intakes WHERE id=_intake;
 IF i.id IS NULL OR i.status NOT IN ('READY','REQUESTED') OR jsonb_array_length(i.gates)<>4
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(i.gates) g WHERE g->>'result' IS DISTINCT FROM 'PASS')
 OR i.evidence->>'telemedicineConsent' IS DISTINCT FROM 'true' OR i.evidence->>'privacyConsent' IS DISTINCT FROM 'true'
 OR length(btrim(coalesce(i.evidence->>'consentEvidence','')))=0
 OR (NOT _submitted AND (i.evaluated_at<now()-interval '24 hours' OR i.config_id IS DISTINCT FROM (SELECT id FROM partner_screening_configs WHERE partner_id=i.partner_id ORDER BY version DESC LIMIT 1)))
 THEN RAISE EXCEPTION 'SCREENING_REQUIRED'; END IF;
 IF NOT consultation_request_doctor(_doctor,i.partner_id,i.location_id) THEN RAISE EXCEPTION 'DOCTOR_BRANCH_SCOPE_REQUIRED'; END IF;
 IF _submitted AND (NOT EXISTS(SELECT 1 FROM patient_consents WHERE patient_id=i.patient_id AND consent_type='TELEMEDICINE' AND accepted AND version=i.evidence->>'consentVersion')
 OR NOT EXISTS(SELECT 1 FROM patient_consents WHERE patient_id=i.patient_id AND consent_type='PRIVACY' AND accepted AND version=i.evidence->>'consentVersion')) THEN RAISE EXCEPTION 'CONSENT_REQUIRED'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.consultation_request_ready(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.consultation_request_event(_id uuid,_from text,_to text,_reason text,_key uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r consultation_requests;
BEGIN
 SELECT * INTO r FROM consultation_requests WHERE id=_id;
 INSERT INTO consultation_request_events(request_id,from_state,to_state,actor_user_id,reason,correlation_id) VALUES(_id,_from,_to,auth.uid(),_reason,_key);
 INSERT INTO audit_log(actor_user_id,partner_id,location_id,action,entity_type,entity_id,metadata)
 VALUES(auth.uid(),r.partner_id,r.location_id,'REQUEST_TRANSITION','consultation_request',_id::text,
 jsonb_build_object('from',_from,'to',_to,'reason',_reason,'correlation_id',_key,'at',now(),'consultation_id',r.consultation_id));
END $$;
REVOKE ALL ON FUNCTION public.consultation_request_event(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;

-- Guard and synchronize calls from every existing care-command surface, not only the new queue.
CREATE FUNCTION public.consultation_request_consultation_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r consultation_requests; target text; k uuid; why text;
BEGIN
 SELECT * INTO r FROM consultation_requests WHERE consultation_id=NEW.id;
 IF r.id IS NULL THEN RETURN NEW; END IF;
 IF TG_WHEN='BEFORE' THEN
  IF NEW.assigned_doctor_id IS DISTINCT FROM OLD.assigned_doctor_id THEN
   PERFORM consultation_request_ready(r.intake_id,NEW.assigned_doctor_id,true);
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
   IF r.state IN ('completed','cancelled','rejected') THEN RAISE EXCEPTION 'REQUEST_TERMINAL'; END IF;
   IF NEW.status='WAITING' THEN
    IF r.state<>'submitted' THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
    PERFORM consultation_request_ready(r.intake_id,NEW.assigned_doctor_id,true);
   ELSIF NEW.status='STARTED' THEN
    IF r.state NOT IN ('queued','accepted','scheduled') THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
    PERFORM consultation_request_ready(r.intake_id,NEW.assigned_doctor_id,true);
   ELSIF NEW.status='COMPLETED' THEN
    IF r.state<>'in_consultation' THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
    PERFORM consultation_request_ready(r.intake_id,NEW.assigned_doctor_id,true);
   ELSIF NEW.status NOT IN ('CANCELLED','FAILED') THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 target:=CASE NEW.status WHEN 'WAITING' THEN 'queued' WHEN 'STARTED' THEN 'in_consultation' WHEN 'COMPLETED' THEN 'completed' WHEN 'CANCELLED' THEN 'cancelled' WHEN 'FAILED' THEN 'manual_review' ELSE r.state END;
 IF NEW.status IS DISTINCT FROM OLD.status AND target<>r.state THEN
  k:=coalesce(nullif(current_setting('icare.request_correlation',true),'')::uuid,gen_random_uuid());
  why:=coalesce(nullif(current_setting('icare.request_reason',true),''),nullif(NEW.cancellation_reason,''),'Existing care command transition');
  UPDATE consultation_requests SET state=target,updated_at=now() WHERE id=r.id;
  PERFORM consultation_request_event(r.id,r.state,target,why,k);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.consultation_request_consultation_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER request_consultation_guard BEFORE UPDATE ON public.consultations FOR EACH ROW EXECUTE FUNCTION public.consultation_request_consultation_guard();
CREATE TRIGGER request_consultation_sync AFTER UPDATE ON public.consultations FOR EACH ROW EXECUTE FUNCTION public.consultation_request_consultation_guard();

-- Extend only queue permission to scoped reviewers for request-linked cases; no pricing/ledger/state logic changes.
DO $$ DECLARE definition text; needle text:='allowed:=can_manage_partner(u,org) OR care_super(u) OR care_coordinator(u) OR EXISTS'; BEGIN
 definition:=pg_get_functiondef('public.care_command(text,jsonb,text)'::regprocedure);
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'CARE_COMMAND_DEFINITION_MISMATCH'; END IF;
 EXECUTE replace(definition,needle,'allowed:=(partner_review_scope(u,org) AND EXISTS(SELECT 1 FROM consultation_requests WHERE consultation_id=id)) OR can_manage_partner(u,org) OR care_super(u) OR care_coordinator(u) OR EXISTS');
END $$;

-- Existing intake defaults remain PARTNER; selected Annual/DIRECT sources are validated by care_command.
DO $$ DECLARE definition text; needle text:='''kind'',''PARTNER'''; BEGIN
 definition:=pg_get_functiondef('public.partner_intake_command(text,uuid,jsonb)'::regprocedure);
 IF position(needle IN definition)=0 THEN RAISE EXCEPTION 'INTAKE_DEFINITION_MISMATCH'; END IF;
 EXECUTE replace(definition,needle,'''kind'',coalesce(_args->>''kind'',''PARTNER''),''membershipId'',_args->>''membershipId'',''paymentId'',_args->>''paymentId''');
END $$;

-- Enrol new requests even when submitted from the existing intake screen; old history is untouched.
CREATE FUNCTION public.consultation_request_intake_sync() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r consultation_requests; k uuid;
BEGIN
 IF NEW.status='REQUESTED' AND OLD.status IS DISTINCT FROM NEW.status THEN
  INSERT INTO consultation_requests(intake_id,partner_id,location_id,patient_id,consultation_id,state,created_by)
  VALUES(NEW.id,NEW.partner_id,NEW.location_id,NEW.patient_id,NEW.consultation_id,'submitted',auth.uid())
  ON CONFLICT(intake_id) DO NOTHING RETURNING * INTO r;
  IF r.id IS NOT NULL THEN
   k:=coalesce(nullif(current_setting('icare.request_correlation',true),'')::uuid,gen_random_uuid());
   PERFORM consultation_request_event(r.id,NULL,'submitted',NEW.reason,k);
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.consultation_request_intake_sync() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER request_intake_sync AFTER UPDATE ON public.partner_intakes FOR EACH ROW EXECUTE FUNCTION public.consultation_request_intake_sync();

CREATE FUNCTION public.consultation_request_command(_op text,_id uuid,_args jsonb,_key uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); r consultation_requests; i partner_intakes; c consultations; prev consultation_request_operations;
 target text; result jsonb; res jsonb; why text:=btrim(coalesce(_args->>'reason','')); ispartner boolean; reviewer boolean; clinician boolean; scheduled timestamptz;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF _key IS NULL OR _id IS NULL OR jsonb_typeof(_args) IS DISTINCT FROM 'object' OR length(_args::text)>4000 OR length(why) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'REASON_CORRELATION_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('request:'||_key,0));
 IF _op='DRAFT' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('request-intake:'||_id,0));
  SELECT * INTO i FROM partner_intakes WHERE id=_id;
  IF NOT coalesce(partner_customer_write(u,i.partner_id,i.location_id),false) THEN RAISE EXCEPTION 'SCOPE_REQUIRED'; END IF;
  SELECT * INTO r FROM consultation_requests WHERE intake_id=_id;
  IF r.id IS NULL AND i.consultation_id IS NOT NULL THEN SELECT * INTO c FROM consultations WHERE id=i.consultation_id FOR UPDATE; END IF;
 ELSE
  SELECT * INTO r FROM consultation_requests WHERE id=_id;
  IF NOT coalesce(consultation_request_access(r.id,u),false) THEN RAISE EXCEPTION 'SCOPE_REQUIRED'; END IF;
  -- Existing REQUEST locks intake first. Submission uses the same order.
  IF _op='SUBMIT' THEN PERFORM 1 FROM partner_intakes WHERE id=r.intake_id FOR UPDATE; END IF;
 END IF;
 SELECT * INTO prev FROM consultation_request_operations WHERE correlation_id=_key;
 IF FOUND THEN
  IF prev.actor_user_id<>u OR prev.operation<>_op OR prev.target_id<>_id OR prev.args<>_args THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN prev.result;
 END IF;
 -- Consultation first: matches care_command's lock order and avoids wrapper/legacy deadlocks.
 IF r.consultation_id IS NOT NULL THEN SELECT * INTO c FROM consultations WHERE id=r.consultation_id FOR UPDATE; END IF;
 IF r.id IS NOT NULL THEN SELECT * INTO r FROM consultation_requests WHERE id=r.id FOR UPDATE; END IF;
 IF _op='DRAFT' AND r.id IS NULL THEN
  INSERT INTO consultation_requests(intake_id,partner_id,location_id,patient_id,consultation_id,state,created_by)
  VALUES(i.id,i.partner_id,i.location_id,i.patient_id,i.consultation_id,CASE WHEN i.status='REQUESTED' THEN 'submitted' WHEN i.status='READY' THEN 'draft' ELSE 'manual_review' END,u) RETURNING * INTO r;
  IF i.consultation_id IS NOT NULL THEN
   UPDATE consultation_requests SET state=CASE c.status WHEN 'WAITING' THEN 'queued' WHEN 'STARTED' THEN 'in_consultation' WHEN 'COMPLETED' THEN 'completed' WHEN 'CANCELLED' THEN 'cancelled' WHEN 'FAILED' THEN 'manual_review' ELSE 'submitted' END WHERE id=r.id RETURNING * INTO r;
  END IF;
  PERFORM consultation_request_event(r.id,NULL,r.state,why,_key);
 ELSIF _op<>'DRAFT' THEN
  SELECT * INTO i FROM partner_intakes WHERE id=r.intake_id;
  ispartner:=partner_customer_write(u,r.partner_id,r.location_id);reviewer:=partner_review_scope(u,r.partner_id);
  clinician:=EXISTS(SELECT 1 FROM doctors WHERE id=c.assigned_doctor_id AND auth_user_id=u) AND consultation_request_doctor(c.assigned_doctor_id,r.partner_id,r.location_id);
  IF reviewer THEN PERFORM care_require_strong(); END IF;
  PERFORM set_config('icare.request_correlation',_key::text,true);PERFORM set_config('icare.request_reason',why,true);
  target:=CASE _op WHEN 'SUBMIT' THEN 'submitted' WHEN 'QUEUE' THEN 'queued' WHEN 'ACCEPT' THEN 'accepted' WHEN 'SCHEDULE' THEN 'scheduled' WHEN 'START' THEN 'in_consultation' WHEN 'COMPLETE' THEN 'completed' WHEN 'CANCEL' THEN 'cancelled' WHEN 'REJECT' THEN 'rejected' WHEN 'MANUAL_REVIEW' THEN 'manual_review' END;
  IF target IS NULL THEN RAISE EXCEPTION 'UNKNOWN_OPERATION'; END IF;
  IF _op IN ('START','COMPLETE') AND NOT coalesce(clinician,false) THEN RAISE EXCEPTION 'ASSIGNED_CLINICIAN_REQUIRED'; END IF;
  IF _op IN ('QUEUE','ACCEPT','SCHEDULE','REJECT','MANUAL_REVIEW') AND NOT (coalesce(ispartner,false) OR reviewer) THEN RAISE EXCEPTION 'QUEUE_PERMISSION_REQUIRED'; END IF;
  IF _op='SUBMIT' AND NOT coalesce(ispartner,false) THEN RAISE EXCEPTION 'SCOPE_REQUIRED'; END IF;
  IF _op='CANCEL' AND NOT (coalesce(ispartner,false) OR reviewer) THEN RAISE EXCEPTION 'QUEUE_PERMISSION_REQUIRED'; END IF;
  IF r.state=target THEN NULL; -- New-key duplicate, no new economic or event effect.
  ELSIF _op='SUBMIT' THEN
   IF r.state<>'draft' THEN RAISE EXCEPTION 'SCREENING_REQUIRED'; END IF;
   PERFORM consultation_request_ready(i.id,(i.evidence->>'doctorId')::uuid,false);
   res:=partner_intake_command('REQUEST',i.id,_args);
   UPDATE consultation_requests SET consultation_id=(res->>'consultationId')::uuid,state=target,updated_at=now() WHERE id=r.id;
   PERFORM consultation_request_event(r.id,r.state,target,why,_key);
  ELSIF _op IN ('QUEUE','ACCEPT') THEN
   IF r.state NOT IN ('submitted','queued','accepted','scheduled') THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
   PERFORM consultation_request_ready(i.id,c.assigned_doctor_id,true);
   IF r.state='submitted' THEN PERFORM care_command('ACCEPT',jsonb_build_object('id',c.id,'reason',why,'reference',_key::text),'request:'||_key); END IF;
   IF _op='ACCEPT' AND r.state NOT IN ('accepted','scheduled') THEN
    UPDATE consultation_requests SET state='accepted',updated_at=now() WHERE id=r.id;
    PERFORM consultation_request_event(r.id,CASE WHEN r.state='submitted' THEN 'queued' ELSE r.state END,'accepted',why,_key);
   END IF;
  ELSIF _op='SCHEDULE' THEN
   IF r.state NOT IN ('queued','accepted') THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
   scheduled:=(_args->>'scheduledAt')::timestamptz;
   IF scheduled IS NULL OR scheduled<=now() THEN RAISE EXCEPTION 'FUTURE_SCHEDULE_REQUIRED'; END IF;
   PERFORM consultation_request_ready(i.id,c.assigned_doctor_id,true);
   PERFORM pg_advisory_xact_lock(hashtextextended('request-doctor:'||c.assigned_doctor_id,0));
   IF EXISTS(SELECT 1 FROM consultations e JOIN consultation_requests q ON q.consultation_id=e.id WHERE e.id<>c.id AND e.assigned_doctor_id=c.assigned_doctor_id AND q.state IN ('scheduled','in_consultation') AND e.scheduled_at=scheduled) THEN RAISE EXCEPTION 'DOCTOR_SCHEDULE_CONFLICT'; END IF;
   UPDATE consultations SET scheduled_at=scheduled WHERE id=c.id;
   UPDATE consultation_requests SET state=target,updated_at=now() WHERE id=r.id;
   PERFORM consultation_request_event(r.id,r.state,target,why,_key);
  ELSIF _op IN ('START','COMPLETE') THEN
   IF (_op='START' AND r.state NOT IN ('queued','accepted','scheduled')) OR (_op='COMPLETE' AND r.state<>'in_consultation') THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
   PERFORM consultation_request_ready(i.id,c.assigned_doctor_id,true);
   -- Existing manual_clinical_enabled approval remains fail closed; this block never activates it.
   PERFORM care_command(_op,jsonb_build_object('id',c.id,'reason',why,'reference',_key::text),'request:'||_key);
  ELSE
   IF r.state NOT IN ('draft','submitted','queued','accepted','scheduled','manual_review') OR (r.state='manual_review' AND c.status NOT IN ('CREATED','WAITING') AND c.id IS NOT NULL) THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
   IF c.id IS NOT NULL AND c.status NOT IN ('CANCELLED','FAILED') THEN PERFORM care_command('CANCEL',jsonb_build_object('id',c.id,'reason',why,'reference',_key::text),'request:'||_key); END IF;
   SELECT * INTO r FROM consultation_requests WHERE id=r.id;
   IF r.state<>target THEN UPDATE consultation_requests SET state=target,updated_at=now() WHERE id=r.id;PERFORM consultation_request_event(r.id,r.state,target,why,_key); END IF;
  END IF;
 END IF;
 SELECT jsonb_build_object('id',id,'state',state,'consultationId',consultation_id) INTO result FROM consultation_requests WHERE id=r.id;
 INSERT INTO consultation_request_operations(correlation_id,actor_user_id,operation,target_id,args,result) VALUES(_key,u,_op,_id,_args,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.consultation_request_command(text,uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.consultation_request_command(text,uuid,jsonb,uuid) TO authenticated;