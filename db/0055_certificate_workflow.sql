-- Private, manually supplied certificates. No issuance, clinical or economic side effects.
CREATE TABLE public.care_certificates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE REFERENCES public.consultation_requests(id),
 state text NOT NULL DEFAULT 'certificate_pending' CHECK(state IN ('certificate_pending','certificate_uploaded','certificate_reviewed','forwarded','rejected','manual_review')),
 current_revision_id uuid,
 channel text CHECK(channel IN ('PARTNER','CUSTOMER_MANUAL')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.care_certificates TO authenticated;
GRANT ALL ON public.care_certificates TO service_role;
ALTER TABLE public.care_certificates ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.care_certificate_revisions (
 id uuid PRIMARY KEY, certificate_id uuid NOT NULL REFERENCES public.care_certificates(id),
 storage_path text NOT NULL UNIQUE, mime_type text NOT NULL CHECK(mime_type IN ('application/pdf','image/jpeg','image/png')),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 uploaded_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.care_certificate_revisions TO authenticated;
GRANT ALL ON public.care_certificate_revisions TO service_role;
ALTER TABLE public.care_certificate_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_certificates ADD CONSTRAINT certificate_current_revision_fk FOREIGN KEY(current_revision_id) REFERENCES public.care_certificate_revisions(id);
CREATE TABLE public.care_certificate_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), certificate_id uuid NOT NULL REFERENCES public.care_certificates(id),
 revision_id uuid REFERENCES public.care_certificate_revisions(id), operation text NOT NULL,
 from_state text, to_state text NOT NULL, actor_user_id uuid NOT NULL,
 reason text NOT NULL, correlation_id uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.care_certificate_events TO authenticated;
GRANT ALL ON public.care_certificate_events TO service_role;
ALTER TABLE public.care_certificate_events ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.care_certificate_operations (
 key uuid PRIMARY KEY, actor uuid NOT NULL, intent jsonb NOT NULL, result jsonb NOT NULL
);
GRANT ALL ON public.care_certificate_operations TO service_role;
ALTER TABLE public.care_certificate_operations ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.certificate_scope(_request uuid,_u uuid,_mode text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT _u IS NOT NULL AND EXISTS(SELECT 1 FROM consultation_requests r JOIN consultations c ON c.id=r.consultation_id
 WHERE r.id=_request AND r.state='completed' AND c.status='COMPLETED' AND (
 partner_review_scope(_u,r.partner_id) OR (_mode IN ('WRITE','READ') AND EXISTS(
 SELECT 1 FROM doctors d WHERE d.id=c.assigned_doctor_id AND d.auth_user_id=_u
 AND consultation_request_doctor(d.id,r.partner_id,r.location_id)))
 OR (_mode='PARTNER' AND partner_customer_write(_u,r.partner_id,r.location_id))));
$$;
REVOKE ALL ON FUNCTION public.certificate_scope(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.certificate_scope(uuid,uuid,text) TO authenticated;
CREATE FUNCTION public.certificate_read(_id uuid,_u uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM care_certificates d WHERE d.id=_id AND (
 certificate_scope(d.request_id,_u,'READ') OR
 (d.state='forwarded' AND d.channel='PARTNER' AND certificate_scope(d.request_id,_u,'PARTNER'))));
$$;
CREATE FUNCTION public.certificate_file_read(_path text,_u uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM care_certificate_revisions v JOIN care_certificates d ON d.id=v.certificate_id
 WHERE v.storage_path=_path AND (certificate_scope(d.request_id,_u,'READ') OR
 (d.current_revision_id=v.id AND d.state='forwarded' AND d.channel='PARTNER' AND certificate_scope(d.request_id,_u,'PARTNER'))));
$$;
REVOKE ALL ON FUNCTION public.certificate_read(uuid,uuid),public.certificate_file_read(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.certificate_read(uuid,uuid),public.certificate_file_read(text,uuid) TO authenticated;
CREATE POLICY certificate_read ON public.care_certificates FOR SELECT TO authenticated USING(public.certificate_read(id,auth.uid()));
CREATE POLICY certificate_revision_read ON public.care_certificate_revisions FOR SELECT TO authenticated USING(public.certificate_file_read(storage_path,auth.uid()));
CREATE POLICY certificate_event_read ON public.care_certificate_events FOR SELECT TO authenticated USING(public.certificate_read(certificate_id,auth.uid()));
-- No authenticated upload/update/delete policy: validated uploads occur only in the authorized server handler.
CREATE POLICY certificate_storage_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='care-certificates' AND public.certificate_file_read(name,auth.uid()));
CREATE TRIGGER certificate_revision_immutable BEFORE UPDATE OR DELETE ON public.care_certificate_revisions FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER certificate_event_immutable BEFORE UPDATE OR DELETE ON public.care_certificate_events FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER certificate_operation_immutable BEFORE UPDATE OR DELETE ON public.care_certificate_operations FOR EACH ROW EXECUTE FUNCTION public.care_immutable();

CREATE FUNCTION public.certificate_command(_op text,_id uuid,_args jsonb,_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d care_certificates; r consultation_requests; v care_certificate_revisions; prior care_certificate_operations;
 result jsonb; intent jsonb; old_state text; reason text; rev uuid; ext text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
 PERFORM care_require_strong();
 IF _key IS NULL OR jsonb_typeof(_args)<>'object' OR octet_length(_args::text)>4000 THEN RAISE EXCEPTION 'INVALID_INTENT'; END IF;
 reason:=btrim(_args->>'reason');
 IF reason IS NULL OR length(reason)<3 OR length(reason)>1000 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('certificate:'||_key::text,0));
 intent:=jsonb_build_object('op',_op,'id',_id,'args',_args);
 IF _op='OPEN' THEN SELECT * INTO r FROM consultation_requests WHERE id=_id FOR UPDATE;
 ELSE SELECT * INTO d FROM care_certificates WHERE id=_id FOR UPDATE; SELECT * INTO r FROM consultation_requests WHERE id=d.request_id; END IF;
 IF r.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF NOT certificate_scope(r.id,auth.uid(),CASE WHEN _op IN ('REVIEW','REJECT','FORWARD','MANUAL_REVIEW') THEN 'ADMIN' ELSE 'WRITE' END)
 AND NOT (_op='DOWNLOAD' AND certificate_read(d.id,auth.uid())) THEN RAISE EXCEPTION 'CERTIFICATE_SCOPE_REQUIRED'; END IF;
 SELECT * INTO prior FROM care_certificate_operations WHERE key=_key;
 IF FOUND THEN
  IF prior.actor<>auth.uid() OR prior.intent<>intent THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN prior.result;
 END IF;
 IF _op='OPEN' THEN
  INSERT INTO care_certificates(request_id) VALUES(r.id) ON CONFLICT(request_id) DO NOTHING;
  SELECT * INTO d FROM care_certificates WHERE request_id=r.id FOR UPDATE;
 ELSE
  old_state:=d.state;
 END IF;
 IF _op='PREPARE' THEN
  IF COALESCE(_args->>'mimeType','') NOT IN ('application/pdf','image/png','image/jpeg') OR COALESCE((_args->>'sizeBytes')::integer,0) NOT BETWEEN 1 AND 5242880
  OR COALESCE(_args->>'sha256','') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'INVALID_FILE'; END IF;
  rev:=(_args->>'revisionId')::uuid;
  ext:=CASE _args->>'mimeType' WHEN 'application/pdf' THEN 'pdf' WHEN 'image/png' THEN 'png' ELSE 'jpg' END;
  INSERT INTO care_certificate_revisions(id,certificate_id,storage_path,mime_type,size_bytes,sha256,uploaded_by)
  VALUES(rev,d.id,d.id::text||'/'||rev::text||'.'||ext,_args->>'mimeType',(_args->>'sizeBytes')::integer,_args->>'sha256',auth.uid()) RETURNING * INTO v;
 ELSIF _op='UPLOAD' THEN
  SELECT * INTO v FROM care_certificate_revisions WHERE id=(_args->>'revisionId')::uuid AND certificate_id=d.id AND uploaded_by=auth.uid();
  IF EXISTS(SELECT 1 FROM care_certificate_events WHERE revision_id=v.id AND operation='UPLOAD') THEN
   RETURN jsonb_build_object('id',d.id,'state',d.state);
  END IF;
  IF v.id IS NULL OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='care-certificates' AND o.name=v.storage_path
    AND (o.metadata->>'size')::bigint=v.size_bytes AND o.metadata->>'mimetype'=v.mime_type) THEN RAISE EXCEPTION 'VALIDATED_FILE_REQUIRED'; END IF;
  UPDATE care_certificates SET current_revision_id=v.id,state='certificate_uploaded',channel=NULL,updated_at=now() WHERE id=d.id RETURNING * INTO d;
 ELSIF _op='REVIEW' THEN
  IF d.state NOT IN ('certificate_uploaded','manual_review') OR d.current_revision_id IS NULL THEN RAISE EXCEPTION 'REVIEW_NOT_READY'; END IF;
  UPDATE care_certificates SET state='certificate_reviewed',updated_at=now() WHERE id=d.id RETURNING * INTO d;
 ELSIF _op='REJECT' THEN
  IF d.current_revision_id IS NULL THEN RAISE EXCEPTION 'FILE_REQUIRED'; END IF;
  UPDATE care_certificates SET state='rejected',channel=NULL,updated_at=now() WHERE id=d.id RETURNING * INTO d;
 ELSIF _op='MANUAL_REVIEW' THEN
  UPDATE care_certificates SET state='manual_review',channel=NULL,updated_at=now() WHERE id=d.id RETURNING * INTO d;
 ELSIF _op='FORWARD' THEN
  IF d.state<>'certificate_reviewed' OR COALESCE(_args->>'channel','') NOT IN ('PARTNER','CUSTOMER_MANUAL') THEN RAISE EXCEPTION 'REVIEW_REQUIRED'; END IF;
  UPDATE care_certificates SET state='forwarded',channel=_args->>'channel',updated_at=now() WHERE id=d.id RETURNING * INTO d;
 ELSIF _op='DOWNLOAD' THEN
  SELECT * INTO v FROM care_certificate_revisions WHERE id=d.current_revision_id;
  IF v.id IS NULL OR NOT certificate_file_read(v.storage_path,auth.uid()) THEN RAISE EXCEPTION 'FILE_ACCESS_DENIED'; END IF;
 ELSE
  IF _op<>'OPEN' THEN RAISE EXCEPTION 'UNKNOWN_OPERATION'; END IF;
 END IF;
 result:=jsonb_build_object('id',d.id,'state',d.state,'revisionId',v.id,'path',v.storage_path,'mimeType',v.mime_type);
 INSERT INTO care_certificate_events(certificate_id,revision_id,operation,from_state,to_state,actor_user_id,reason,correlation_id)
 VALUES(d.id,COALESCE(v.id,d.current_revision_id),_op,old_state,d.state,auth.uid(),reason,_key);
 INSERT INTO audit_log(actor_user_id,partner_id,action,entity_type,entity_id,metadata)
 VALUES(auth.uid(),r.partner_id,'CERTIFICATE_'||_op,'care_certificate',d.id::text,jsonb_build_object('correlation_id',_key,'from',old_state,'to',d.state));
 INSERT INTO care_certificate_operations VALUES(_key,auth.uid(),intent,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.certificate_command(text,uuid,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.certificate_command(text,uuid,jsonb,uuid) TO authenticated;
