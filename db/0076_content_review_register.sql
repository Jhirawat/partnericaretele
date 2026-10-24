-- Content and claims review register: redacted human review metadata only, append-only and versioned.
-- Never verifies facts automatically; an entry passes only after a different signed-in reviewer acknowledges its latest version.
CREATE TABLE public.content_review(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lineage uuid NOT NULL,version int NOT NULL CHECK(version>0),item_type text NOT NULL CHECK(item_type IN ('clinic_facts','contact','wording','price_terms','privacy_wording','medical_claims','review_claims','certification_claims')),route_scope text NOT NULL CHECK(route_scope IN ('/','/partner-apply','/care-demo','site-wide')),scope_label text NOT NULL CHECK(char_length(scope_label) BETWEEN 3 AND 120),owner_role text NOT NULL CHECK(owner_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),reviewer_role text NOT NULL CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),status text NOT NULL CHECK(status IN ('pending','blocked','unverified')),evidence_ref text NOT NULL CHECK(char_length(evidence_ref) BETWEEN 3 AND 120),decision_reason text NOT NULL CHECK(char_length(decision_reason) BETWEEN 3 AND 300),next_action text NOT NULL CHECK(char_length(next_action) BETWEEN 3 AND 300),review_date date,recorder uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(lineage,version));
CREATE TABLE public.content_review_acks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),review_id uuid NOT NULL REFERENCES public.content_review(id),outcome text NOT NULL CHECK(outcome IN ('acknowledged','concern')),note text NOT NULL CHECK(char_length(note) BETWEEN 3 AND 300),reviewer uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(review_id,reviewer));
GRANT SELECT ON public.content_review,public.content_review_acks TO authenticated;GRANT ALL ON public.content_review,public.content_review_acks TO service_role;
ALTER TABLE public.content_review ENABLE ROW LEVEL SECURITY;ALTER TABLE public.content_review_acks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_review,public.content_review_acks FROM PUBLIC,anon;REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.content_review,public.content_review_acks FROM authenticated;
CREATE TRIGGER content_review_immutable BEFORE UPDATE OR DELETE ON public.content_review FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER content_review_acks_immutable BEFORE UPDATE OR DELETE ON public.content_review_acks FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE POLICY content_review_read ON public.content_review FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE POLICY content_review_acks_read ON public.content_review_acks FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE FUNCTION public.content_unsafe(_t text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT public.backup_unsafe(_t) OR coalesce(_t,'') ~* '\.(pdf|docx?|png|jpe?g)\M|passport|national\s+id|date\s+of\s+birth|\+?\d[\d\s-]{7,}\d' $$;
REVOKE ALL ON FUNCTION public.content_unsafe(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.content_review_record(_lineage uuid,_type text,_route text,_scope text,_owner text,_reviewer text,_status text,_ref text,_reason text,_next text,_date date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();l uuid:=coalesce(_lineage,gen_random_uuid());v int;prev content_review;row content_review;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _type IS NULL OR _type<>ALL(ARRAY['clinic_facts','contact','wording','price_terms','privacy_wording','medical_claims','review_claims','certification_claims']) OR _route IS NULL OR _route<>ALL(ARRAY['/','/partner-apply','/care-demo','site-wide'])
  OR _status IS NULL OR _status NOT IN ('pending','blocked','unverified') OR _owner IS NULL OR _owner NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN') OR _reviewer IS NULL OR _reviewer NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN')
  OR content_unsafe(_scope) OR content_unsafe(_ref) OR content_unsafe(_reason) OR content_unsafe(_next)
  OR char_length(btrim(coalesce(_scope,''))) NOT BETWEEN 3 AND 120 OR char_length(btrim(coalesce(_ref,''))) NOT BETWEEN 3 AND 120 OR char_length(btrim(coalesce(_reason,''))) NOT BETWEEN 3 AND 300 OR char_length(btrim(coalesce(_next,''))) NOT BETWEEN 3 AND 300
  OR _date>current_date THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('content_review:'||l::text));
 SELECT * INTO prev FROM content_review WHERE lineage=l ORDER BY version DESC LIMIT 1;
 IF _lineage IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF FOUND AND (prev.item_type<>_type OR prev.route_scope<>_route) THEN RAISE EXCEPTION 'CLAIM_TYPE_MISMATCH';END IF;
 v:=coalesce(prev.version,0)+1;
 INSERT INTO content_review(lineage,version,item_type,route_scope,scope_label,owner_role,reviewer_role,status,evidence_ref,decision_reason,next_action,review_date,recorder) VALUES(l,v,_type,_route,btrim(_scope),_owner,_reviewer,_status,btrim(_ref),btrim(_reason),btrim(_next),_date,u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'lineage',row.lineage,'version',row.version,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
CREATE FUNCTION public.content_review_ack(_id uuid,_outcome text,_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();e content_review;row content_review_acks;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _outcome IS NULL OR _outcome NOT IN ('acknowledged','concern') OR content_unsafe(_note) OR char_length(btrim(coalesce(_note,''))) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 SELECT * INTO e FROM content_review WHERE id=_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF e.recorder=u THEN RAISE EXCEPTION 'SECOND_REVIEWER_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM content_review x WHERE x.lineage=e.lineage AND x.version>e.version) THEN RAISE EXCEPTION 'STALE_VERSION';END IF;
 INSERT INTO content_review_acks(review_id,outcome,note,reviewer) VALUES(e.id,_outcome,btrim(_note),u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
REVOKE ALL ON FUNCTION public.content_review_record(uuid,text,text,text,text,text,text,text,text,text,date),public.content_review_ack(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.content_review_record(uuid,text,text,text,text,text,text,text,text,text,date),public.content_review_ack(uuid,text,text) TO authenticated;
CREATE FUNCTION public.content_review_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'lineage',e.lineage,'version',e.version,'item_type',e.item_type,'route_scope',e.route_scope,'scope_label',e.scope_label,'owner_role',e.owner_role,'reviewer_role',e.reviewer_role,'status',e.status,'evidence_ref',e.evidence_ref,'decision_reason',e.decision_reason,'next_action',e.next_action,'review_date',e.review_date,'correlation_id',e.correlation_id,'created_at',e.created_at,'mine',e.recorder=u,
  'latest',NOT EXISTS(SELECT 1 FROM content_review x WHERE x.lineage=e.lineage AND x.version>e.version),
  'acks',coalesce((SELECT jsonb_agg(jsonb_build_object('outcome',c.outcome,'independent',c.reviewer<>e.recorder,'mine',c.reviewer=u,'created_at',c.created_at,'correlation_id',c.correlation_id) ORDER BY c.created_at) FROM content_review_acks c WHERE c.review_id=e.id),'[]'::jsonb)) ORDER BY e.item_type,e.lineage,e.version) FROM content_review e),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.content_review_console() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.content_review_console() TO authenticated;