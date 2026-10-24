CREATE TABLE public.care_mcs_handoffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE REFERENCES public.consultation_requests(id),
 partner_id uuid NOT NULL REFERENCES public.partners(id),
 location_id uuid NOT NULL REFERENCES public.locations(id),
 state text NOT NULL DEFAULT 'ready_to_create' CHECK(state IN ('ready_to_create','entering_mcs','case_created','links_ready','patient_link_sent','waiting_connection','connected','certificate_pending','certificate_uploaded','closed','blocked','manual_review','cancelled')),
 mcs_case_id text,
 patient_link text,
 doctor_link text,
 operator_user_id uuid,
 packet jsonb NOT NULL DEFAULT '{}',
 created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.care_mcs_handoffs TO authenticated;
GRANT ALL ON public.care_mcs_handoffs TO service_role;
ALTER TABLE public.care_mcs_handoffs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.care_mcs_handoff_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 handoff_id uuid NOT NULL REFERENCES public.care_mcs_handoffs(id),
 from_state text,
 to_state text NOT NULL,
 actor_user_id uuid NOT NULL,
 reason text NOT NULL,
 correlation_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.care_mcs_handoff_events TO authenticated;
GRANT ALL ON public.care_mcs_handoff_events TO service_role;
ALTER TABLE public.care_mcs_handoff_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.care_mcs_handoff_operations (
 correlation_id uuid PRIMARY KEY,
 actor_user_id uuid NOT NULL,
 operation text NOT NULL,
 target_id uuid NOT NULL,
 args jsonb NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.care_mcs_handoff_operations TO service_role;
ALTER TABLE public.care_mcs_handoff_operations ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.mcs_handoff_access(_id uuid,_u uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT _u IS NOT NULL AND EXISTS(SELECT 1 FROM care_mcs_handoffs h
  JOIN consultation_requests r ON r.id=h.request_id
  LEFT JOIN consultations c ON c.id=r.consultation_id
  WHERE h.id=_id AND (partner_customer_write(_u,h.partner_id,h.location_id) OR partner_review_scope(_u,h.partner_id)
  OR EXISTS(SELECT 1 FROM doctors d WHERE d.id=c.assigned_doctor_id AND d.auth_user_id=_u)))
 $$;
REVOKE ALL ON FUNCTION public.mcs_handoff_access(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcs_handoff_access(uuid,uuid) TO authenticated,service_role;

CREATE POLICY mcs_handoff_read ON public.care_mcs_handoffs FOR SELECT TO authenticated USING(mcs_handoff_access(id,auth.uid()));
CREATE POLICY mcs_handoff_event_read ON public.care_mcs_handoff_events FOR SELECT TO authenticated USING(mcs_handoff_access(handoff_id,auth.uid()));
CREATE TRIGGER mcs_handoff_events_immutable BEFORE UPDATE OR DELETE ON public.care_mcs_handoff_events FOR EACH ROW EXECUTE FUNCTION public.partner_intake_immutable();
CREATE TRIGGER mcs_handoff_operations_immutable BEFORE UPDATE OR DELETE ON public.care_mcs_handoff_operations FOR EACH ROW EXECUTE FUNCTION public.partner_intake_immutable();

CREATE FUNCTION public.mcs_handoff_event(_id uuid,_from text,_to text,_reason text,_key uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h care_mcs_handoffs;
BEGIN
 SELECT * INTO h FROM care_mcs_handoffs WHERE id=_id;
 INSERT INTO care_mcs_handoff_events(handoff_id,from_state,to_state,actor_user_id,reason,correlation_id) VALUES(_id,_from,_to,auth.uid(),_reason,_key);
 INSERT INTO audit_log(actor_user_id,partner_id,location_id,action,entity_type,entity_id,metadata)
 VALUES(auth.uid(),h.partner_id,h.location_id,'MCS_HANDOFF_TRANSITION','care_mcs_handoff',_id::text,
 jsonb_build_object('from',_from,'to',_to,'reason',_reason,'correlation_id',_key,'at',now(),'request_id',h.request_id));
END $$;
REVOKE ALL ON FUNCTION public.mcs_handoff_event(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.mcs_handoff_packet(_request uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r consultation_requests; i partner_intakes; c consultations; p patients; l locations;
BEGIN
 SELECT * INTO r FROM consultation_requests WHERE id=_request;
 SELECT * INTO i FROM partner_intakes WHERE id=r.intake_id;
 SELECT * INTO c FROM consultations WHERE id=r.consultation_id;
 SELECT * INTO p FROM patients WHERE id=r.patient_id;
 SELECT * INTO l FROM locations WHERE id=r.location_id;
 RETURN jsonb_build_object(
  'requestId',r.id,'consultationId',r.consultation_id,
  'customerName',btrim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),
  'branchName',l.name,'careKind',c.care_kind,'scheduledAt',c.scheduled_at,
  'screeningPassed',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(i.gates,'[]'::jsonb)) g WHERE g->>'result' IS DISTINCT FROM 'PASS'),
  'consentRecorded',coalesce(i.evidence->>'telemedicineConsent','false')='true' AND coalesce(i.evidence->>'privacyConsent','false')='true');
END $$;
REVOKE ALL ON FUNCTION public.mcs_handoff_packet(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.mcs_handoff_command(_op text,_id uuid,_args jsonb,_key uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); h care_mcs_handoffs; r consultation_requests; prev care_mcs_handoff_operations;
 target text; result jsonb; why text:=btrim(coalesce(_args->>'reason','')); canwrite boolean; canreview boolean;
 caseid text; plink text; dlink text; operator uuid;
 next_ok boolean; terminal text[]:=ARRAY['closed','cancelled'];
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF _key IS NULL OR _id IS NULL OR jsonb_typeof(_args) IS DISTINCT FROM 'object' OR length(_args::text)>4000 OR length(why) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'REASON_CORRELATION_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('mcs-handoff:'||_key,0));
 IF _op='CREATE' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('mcs-handoff-request:'||_id,0));
  SELECT * INTO r FROM consultation_requests WHERE id=_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  canwrite:=coalesce(partner_customer_write(u,r.partner_id,r.location_id),false);
  canreview:=coalesce(partner_review_scope(u,r.partner_id),false);
  IF NOT (canwrite OR canreview) THEN RAISE EXCEPTION 'SCOPE_REQUIRED'; END IF;
  IF canreview THEN PERFORM care_require_strong(); END IF;
  IF r.state NOT IN ('accepted','scheduled','in_consultation','completed') THEN RAISE EXCEPTION 'REQUEST_NOT_READY_FOR_HANDOFF'; END IF;
 ELSE
  SELECT * INTO h FROM care_mcs_handoffs WHERE id=_id;
  IF h.id IS NULL THEN RAISE EXCEPTION 'HANDOFF_NOT_FOUND'; END IF;
  canwrite:=coalesce(partner_customer_write(u,h.partner_id,h.location_id),false);
  canreview:=coalesce(partner_review_scope(u,h.partner_id),false);
  IF NOT (canwrite OR canreview) THEN RAISE EXCEPTION 'SCOPE_REQUIRED'; END IF;
  IF canreview THEN PERFORM care_require_strong(); END IF;
 END IF;
 SELECT * INTO prev FROM care_mcs_handoff_operations WHERE correlation_id=_key;
 IF FOUND THEN
  IF prev.actor_user_id<>u OR prev.operation<>_op OR prev.target_id<>_id OR prev.args<>_args THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN prev.result;
 END IF;
 IF _op='CREATE' THEN
  INSERT INTO care_mcs_handoffs(request_id,partner_id,location_id,state,packet,created_by,operator_user_id)
  VALUES(r.id,r.partner_id,r.location_id,'ready_to_create',mcs_handoff_packet(r.id),u,u)
  ON CONFLICT(request_id) DO NOTHING RETURNING * INTO h;
  IF h.id IS NULL THEN RAISE EXCEPTION 'HANDOFF_EXISTS'; END IF;
  PERFORM mcs_handoff_event(h.id,NULL,'ready_to_create',why,_key);
 ELSIF _op='ASSIGN' THEN
  IF h.state=ANY(terminal) THEN RAISE EXCEPTION 'HANDOFF_TERMINAL'; END IF;
  operator:=(_args->>'operatorId')::uuid;
  IF operator IS NULL OR NOT (coalesce(partner_customer_write(operator,h.partner_id,h.location_id),false) OR coalesce(partner_review_scope(operator,h.partner_id),false)) THEN RAISE EXCEPTION 'OPERATOR_SCOPE_REQUIRED'; END IF;
  UPDATE care_mcs_handoffs SET operator_user_id=operator,updated_at=now() WHERE id=h.id;
  PERFORM mcs_handoff_event(h.id,h.state,h.state,why||' (operator assigned)',_key);
 ELSIF _op='CANCEL' THEN
  IF h.state=ANY(terminal) THEN RAISE EXCEPTION 'HANDOFF_TERMINAL'; END IF;
  UPDATE care_mcs_handoffs SET state='cancelled',updated_at=now() WHERE id=h.id;
  PERFORM mcs_handoff_event(h.id,h.state,'cancelled',why,_key);
 ELSIF _op='ADVANCE' THEN
  target:=_args->>'to';
  IF target IS NULL OR target NOT IN ('ready_to_create','entering_mcs','case_created','links_ready','patient_link_sent','waiting_connection','connected','certificate_pending','certificate_uploaded','closed','blocked','manual_review') THEN RAISE EXCEPTION 'UNKNOWN_TARGET'; END IF;
  IF h.state=ANY(terminal) THEN RAISE EXCEPTION 'HANDOFF_TERMINAL'; END IF;
  IF target=h.state THEN NULL;
  ELSE
   next_ok:=CASE h.state
    WHEN 'ready_to_create' THEN target IN ('entering_mcs','blocked','manual_review')
    WHEN 'entering_mcs' THEN target IN ('case_created','blocked','manual_review')
    WHEN 'case_created' THEN target IN ('links_ready','blocked','manual_review')
    WHEN 'links_ready' THEN target IN ('patient_link_sent','blocked','manual_review')
    WHEN 'patient_link_sent' THEN target IN ('waiting_connection','blocked','manual_review')
    WHEN 'waiting_connection' THEN target IN ('connected','blocked','manual_review')
    WHEN 'connected' THEN target IN ('certificate_pending','closed','blocked','manual_review')
    WHEN 'certificate_pending' THEN target IN ('certificate_uploaded','blocked','manual_review')
    WHEN 'certificate_uploaded' THEN target IN ('closed','blocked','manual_review')
    WHEN 'blocked' THEN target NOT IN ('closed')
    WHEN 'manual_review' THEN target NOT IN ('closed')
    ELSE false END;
   IF NOT next_ok THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
   caseid:=nullif(btrim(coalesce(_args->>'mcsCaseId','')),' ');
   plink:=nullif(btrim(coalesce(_args->>'patientLink','')),' ');
   dlink:=nullif(btrim(coalesce(_args->>'doctorLink','')),' ');
   IF caseid IS NOT NULL AND length(caseid) NOT BETWEEN 3 AND 64 THEN RAISE EXCEPTION 'INVALID_CASE_ID'; END IF;
   IF (plink IS NOT NULL AND plink !~ '^https://') OR (dlink IS NOT NULL AND dlink !~ '^https://') THEN RAISE EXCEPTION 'SECURE_LINK_REQUIRED'; END IF;
   UPDATE care_mcs_handoffs SET
    mcs_case_id=coalesce(caseid,mcs_case_id),
    patient_link=coalesce(plink,patient_link),
    doctor_link=coalesce(dlink,doctor_link),
    updated_at=now() WHERE id=h.id RETURNING * INTO h;
   IF target IN ('case_created','links_ready') AND h.mcs_case_id IS NULL THEN RAISE EXCEPTION 'CASE_ID_REQUIRED'; END IF;
   IF target='links_ready' AND (h.patient_link IS NULL OR h.doctor_link IS NULL) THEN RAISE EXCEPTION 'LINKS_REQUIRED'; END IF;
   IF target='certificate_uploaded' AND h.state<>'certificate_pending' THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
   UPDATE care_mcs_handoffs SET state=target,updated_at=now() WHERE id=h.id;
   PERFORM mcs_handoff_event(h.id,h.state,target,why,_key);
  END IF;
 ELSE
  RAISE EXCEPTION 'UNKNOWN_OPERATION';
 END IF;
 SELECT jsonb_build_object('id',id,'requestId',request_id,'state',state,'mcsCaseId',mcs_case_id) INTO result FROM care_mcs_handoffs WHERE id=(CASE WHEN _op='CREATE' THEN h.id ELSE _id END);
 INSERT INTO care_mcs_handoff_operations(correlation_id,actor_user_id,operation,target_id,args,result) VALUES(_key,u,_op,_id,_args,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mcs_handoff_command(text,uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcs_handoff_command(text,uuid,jsonb,uuid) TO authenticated;