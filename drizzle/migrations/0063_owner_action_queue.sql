-- Redacted owner-action metadata only; no campaign execution or readiness approval.
CREATE TABLE public.owner_action_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_key text NOT NULL CHECK(item_key IN ('superadmin_account','second_reviewer','preview_access','protection_evidence','backup_evidence','clinic_facts','contact_details','pricing_terms','claims_review','publish_owner')),
 version integer NOT NULL CHECK(version>0), status text NOT NULL CHECK(status IN ('pending','available','blocked','unverified')),
 owner_role text NOT NULL CHECK(owner_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')), reviewer_role text NOT NULL CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),
 required_action text NOT NULL CHECK(required_action IN ('Arrange global test account','Arrange independent global reviewer','Confirm signed-in preview access','Supply reviewed protection evidence','Supply reviewed restore evidence','Supply reviewed clinic facts','Supply reviewed contact details','Supply reviewed pricing and terms','Complete independent claims review','Confirm manual publish owner')),
 evidence_label text NOT NULL CHECK(evidence_label IN ('Manual availability attestation','Owner handoff review','Independent evidence review')),
 review_due date NOT NULL, recorder uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), UNIQUE(item_key,version)
);
GRANT SELECT ON public.owner_action_items TO authenticated;
GRANT ALL ON public.owner_action_items TO service_role;
ALTER TABLE public.owner_action_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_action_items_read ON public.owner_action_items FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
CREATE TABLE public.owner_action_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL REFERENCES public.owner_action_items(id), outcome text NOT NULL CHECK(outcome IN ('confirmed','rejected')),
 reviewer uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), UNIQUE(item_id,reviewer)
);
GRANT SELECT ON public.owner_action_reviews TO authenticated;
GRANT ALL ON public.owner_action_reviews TO service_role;
ALTER TABLE public.owner_action_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_action_reviews_read ON public.owner_action_reviews FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
REVOKE ALL ON public.owner_action_items, public.owner_action_reviews FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.owner_action_items, public.owner_action_reviews FROM authenticated;
CREATE TRIGGER owner_action_items_immutable BEFORE UPDATE OR DELETE ON public.owner_action_items FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER owner_action_reviews_immutable BEFORE UPDATE OR DELETE ON public.owner_action_reviews FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE FUNCTION public.owner_action_record(_key text,_status text,_evidence text,_due date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); r owner_action_items; a text; o text; v text;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM care_require_strong();
 a:=CASE _key WHEN 'superadmin_account' THEN 'Arrange global test account' WHEN 'second_reviewer' THEN 'Arrange independent global reviewer' WHEN 'preview_access' THEN 'Confirm signed-in preview access' WHEN 'protection_evidence' THEN 'Supply reviewed protection evidence' WHEN 'backup_evidence' THEN 'Supply reviewed restore evidence' WHEN 'clinic_facts' THEN 'Supply reviewed clinic facts' WHEN 'contact_details' THEN 'Supply reviewed contact details' WHEN 'pricing_terms' THEN 'Supply reviewed pricing and terms' WHEN 'claims_review' THEN 'Complete independent claims review' WHEN 'publish_owner' THEN 'Confirm manual publish owner' END;
 o:=CASE WHEN _key IN ('second_reviewer','preview_access') THEN 'OPERATIONS_ADMIN' WHEN _key IN ('superadmin_account','protection_evidence','backup_evidence','clinic_facts','contact_details','pricing_terms','claims_review','publish_owner') THEN 'SUPER_ADMIN' END;
 v:=CASE o WHEN 'SUPER_ADMIN' THEN 'OPERATIONS_ADMIN' WHEN 'OPERATIONS_ADMIN' THEN 'SUPER_ADMIN' END;
 IF a IS NULL OR coalesce(_status,'') NOT IN ('pending','available','blocked','unverified') OR coalesce(_evidence,'') NOT IN ('Manual availability attestation','Owner handoff review','Independent evidence review') OR _due IS NULL THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 IF _status='available' AND _due<current_date THEN RAISE EXCEPTION 'REVIEW_DATE_EXPIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('owner-action:'||_key,0));
 INSERT INTO owner_action_items(item_key,version,status,owner_role,reviewer_role,required_action,evidence_label,review_due,recorder)
 SELECT _key,coalesce(max(version),0)+1,_status,o,v,a,_evidence,_due,u FROM owner_action_items WHERE item_key=_key RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'version',r.version,'correlation_id',r.correlation_id);
END $$;
CREATE FUNCTION public.owner_action_confirm(_id uuid,_outcome text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); r owner_action_items; v int; c owner_action_reviews;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM care_require_strong();
 IF coalesce(_outcome,'') NOT IN ('confirmed','rejected') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 SELECT * INTO r FROM owner_action_items WHERE id=_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('owner-action:'||r.item_key,0));
 SELECT max(version) INTO v FROM owner_action_items WHERE item_key=r.item_key;
 IF r.version<>v THEN RAISE EXCEPTION 'LATEST_VERSION_REQUIRED'; END IF;
 IF r.recorder=u THEN RAISE EXCEPTION 'SECOND_REVIEWER_REQUIRED'; END IF;
 IF _outcome='confirmed' AND (r.status<>'available' OR r.review_due<current_date) THEN RAISE EXCEPTION 'AVAILABILITY_NOT_ATTESTED'; END IF;
 INSERT INTO owner_action_reviews(item_id,outcome,reviewer) VALUES(r.id,_outcome,u) RETURNING * INTO c;
 RETURN jsonb_build_object('id',c.id,'correlation_id',c.correlation_id);
END $$;
CREATE FUNCTION public.owner_action_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM care_require_strong();
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'key',r.item_key,'version',r.version,'status',r.status,'owner_role',r.owner_role,'reviewer_role',r.reviewer_role,'required_action',r.required_action,'evidence_label',r.evidence_label,'review_due',r.review_due,'created_at',r.created_at,'correlation_id',r.correlation_id,'mine',r.recorder=u,'latest',r.version=(SELECT max(x.version) FROM owner_action_items x WHERE x.item_key=r.item_key),
 'reviews',coalesce((SELECT jsonb_agg(jsonb_build_object('outcome',c.outcome,'independent',c.reviewer<>r.recorder,'mine',c.reviewer=u,'created_at',c.created_at,'correlation_id',c.correlation_id) ORDER BY c.created_at) FROM owner_action_reviews c WHERE c.item_id=r.id),'[]'::jsonb)) ORDER BY r.item_key,r.version) FROM owner_action_items r),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.owner_action_record(text,text,text,date),public.owner_action_confirm(uuid,text),public.owner_action_console() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_action_record(text,text,text,date),public.owner_action_confirm(uuid,text),public.owner_action_console() TO authenticated;