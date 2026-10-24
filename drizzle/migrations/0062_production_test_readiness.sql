-- Redacted prerequisite metadata only; no campaign execution or readiness approval.
CREATE TABLE public.test_prerequisites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), prerequisite_key text NOT NULL CHECK(prerequisite_key IN ('superadmin_account','second_reviewer','preview_access','protection_evidence','backup_evidence','content_review','publish_owner')),
 version integer NOT NULL CHECK(version>0), status text NOT NULL CHECK(status IN ('pending','available','blocked','unverified')),
 owner_role text NOT NULL CHECK(owner_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),
 required_action text NOT NULL CHECK(required_action IN ('Arrange global test account','Arrange independent global reviewer','Confirm signed-in preview access','Supply reviewed protection evidence','Supply reviewed restore evidence','Supply reviewed clinic facts and terms','Confirm manual publish owner')),
 evidence_label text NOT NULL CHECK(evidence_label IN ('Manual availability attestation','Owner handoff review','Independent evidence review')),
 review_due date NOT NULL, recorder uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), UNIQUE(prerequisite_key,version)
);
GRANT SELECT ON public.test_prerequisites TO authenticated;
GRANT ALL ON public.test_prerequisites TO service_role;
ALTER TABLE public.test_prerequisites ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_prerequisites_read ON public.test_prerequisites FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
CREATE TABLE public.test_prerequisite_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), prerequisite_id uuid NOT NULL REFERENCES public.test_prerequisites(id), outcome text NOT NULL CHECK(outcome IN ('confirmed','rejected')),
 reviewer uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), UNIQUE(prerequisite_id,reviewer)
);
GRANT SELECT ON public.test_prerequisite_reviews TO authenticated;
GRANT ALL ON public.test_prerequisite_reviews TO service_role;
ALTER TABLE public.test_prerequisite_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_prerequisite_reviews_read ON public.test_prerequisite_reviews FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
REVOKE ALL ON public.test_prerequisites, public.test_prerequisite_reviews FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.test_prerequisites, public.test_prerequisite_reviews FROM authenticated;
CREATE TRIGGER test_prerequisites_immutable BEFORE UPDATE OR DELETE ON public.test_prerequisites FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER test_prerequisite_reviews_immutable BEFORE UPDATE OR DELETE ON public.test_prerequisite_reviews FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE FUNCTION public.test_prerequisite_record(_key text,_status text,_evidence text,_due date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); r test_prerequisites; a text; o text;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM care_require_strong();
 a:=CASE _key WHEN 'superadmin_account' THEN 'Arrange global test account' WHEN 'second_reviewer' THEN 'Arrange independent global reviewer' WHEN 'preview_access' THEN 'Confirm signed-in preview access' WHEN 'protection_evidence' THEN 'Supply reviewed protection evidence' WHEN 'backup_evidence' THEN 'Supply reviewed restore evidence' WHEN 'content_review' THEN 'Supply reviewed clinic facts and terms' WHEN 'publish_owner' THEN 'Confirm manual publish owner' END;
 o:=CASE WHEN _key IN ('second_reviewer','preview_access') THEN 'OPERATIONS_ADMIN' ELSE 'SUPER_ADMIN' END;
 IF a IS NULL OR coalesce(_status,'') NOT IN ('pending','available','blocked','unverified') OR coalesce(_evidence,'') NOT IN ('Manual availability attestation','Owner handoff review','Independent evidence review') OR _due IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 IF _status='available' AND _due<current_date THEN RAISE EXCEPTION 'REVIEW_DATE_EXPIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('test-prerequisite:'||_key,0));
 INSERT INTO test_prerequisites(prerequisite_key,version,status,owner_role,required_action,evidence_label,review_due,recorder)
 SELECT _key,coalesce(max(version),0)+1,_status,o,a,_evidence,_due,u FROM test_prerequisites WHERE prerequisite_key=_key RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'version',r.version,'correlation_id',r.correlation_id);
END $$;
CREATE FUNCTION public.test_prerequisite_confirm(_id uuid,_outcome text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); r test_prerequisites; v int; c test_prerequisite_reviews;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM care_require_strong();
 IF coalesce(_outcome,'') NOT IN ('confirmed','rejected') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 SELECT * INTO r FROM test_prerequisites WHERE id=_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('test-prerequisite:'||r.prerequisite_key,0));
 SELECT max(version) INTO v FROM test_prerequisites WHERE prerequisite_key=r.prerequisite_key;
 IF r.version<>v THEN RAISE EXCEPTION 'LATEST_VERSION_REQUIRED'; END IF;
 IF r.recorder=u THEN RAISE EXCEPTION 'SECOND_REVIEWER_REQUIRED'; END IF;
 IF _outcome='confirmed' AND (r.status<>'available' OR r.review_due<current_date) THEN RAISE EXCEPTION 'AVAILABILITY_NOT_ATTESTED'; END IF;
 INSERT INTO test_prerequisite_reviews(prerequisite_id,outcome,reviewer) VALUES(r.id,_outcome,u) RETURNING * INTO c;
 RETURN jsonb_build_object('id',c.id,'correlation_id',c.correlation_id);
END $$;
CREATE FUNCTION public.test_prerequisite_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM care_require_strong();
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'key',r.prerequisite_key,'version',r.version,'status',r.status,'owner_role',r.owner_role,'required_action',r.required_action,'evidence_label',r.evidence_label,'review_due',r.review_due,'created_at',r.created_at,'correlation_id',r.correlation_id,'mine',r.recorder=u,'latest',r.version=(SELECT max(x.version) FROM test_prerequisites x WHERE x.prerequisite_key=r.prerequisite_key),
 'reviews',coalesce((SELECT jsonb_agg(jsonb_build_object('outcome',c.outcome,'independent',c.reviewer<>r.recorder,'mine',c.reviewer=u,'created_at',c.created_at,'correlation_id',c.correlation_id) ORDER BY c.created_at) FROM test_prerequisite_reviews c WHERE c.prerequisite_id=r.id),'[]'::jsonb)) ORDER BY r.prerequisite_key,r.version) FROM test_prerequisites r),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.test_prerequisite_record(text,text,text,date),public.test_prerequisite_confirm(uuid,text),public.test_prerequisite_console() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.test_prerequisite_record(text,text,text,date),public.test_prerequisite_confirm(uuid,text),public.test_prerequisite_console() TO authenticated;
