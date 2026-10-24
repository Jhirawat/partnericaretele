-- Canonical content and commercial approval workspace: redacted approval metadata only,
-- append-only and versioned. A category is approved only after a different signed-in reviewer
-- approves its latest version; nothing here publishes content or makes any claim live.
CREATE TABLE public.content_approval(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lineage uuid NOT NULL,version int NOT NULL CHECK(version>0),category text NOT NULL CHECK(category IN ('clinic_facts','contact_channels','wording_th_en','pricing','terms','privacy_wording','medical_claims','testimonials','certification_claims')),surface text NOT NULL CHECK(surface IN ('/','/partner-apply','/care-demo','site-wide')),canonical_source text NOT NULL CHECK(canonical_source IN ('available','missing')),status text NOT NULL CHECK(status IN ('pending','available','blocked','unverified')),owner_role text NOT NULL CHECK(owner_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),reviewer_role text NOT NULL CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),evidence_ref text NOT NULL CHECK(char_length(evidence_ref) BETWEEN 3 AND 120),required_action text NOT NULL CHECK(required_action IN ('Supply canonical source for independent review','Record independent approval of canonical source','Resolve reviewer concern','Confirm canonical source availability')),review_date date,recorder uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(lineage,version));
CREATE TABLE public.content_approval_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),approval_id uuid NOT NULL REFERENCES public.content_approval(id),outcome text NOT NULL CHECK(outcome IN ('approved','concern')),reviewer uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(approval_id,reviewer));
GRANT SELECT ON public.content_approval,public.content_approval_reviews TO authenticated;GRANT ALL ON public.content_approval,public.content_approval_reviews TO service_role;
ALTER TABLE public.content_approval ENABLE ROW LEVEL SECURITY;ALTER TABLE public.content_approval_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_approval,public.content_approval_reviews FROM PUBLIC,anon;REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.content_approval,public.content_approval_reviews FROM authenticated;
CREATE TRIGGER content_approval_immutable BEFORE UPDATE OR DELETE ON public.content_approval FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER content_approval_reviews_immutable BEFORE UPDATE OR DELETE ON public.content_approval_reviews FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE POLICY content_approval_read ON public.content_approval FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE POLICY content_approval_reviews_read ON public.content_approval_reviews FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE FUNCTION public.content_approval_record(_lineage uuid,_category text,_surface text,_canonical text,_status text,_owner text,_reviewer text,_ref text,_action text,_date date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();l uuid:=coalesce(_lineage,gen_random_uuid());v int;prev content_approval;row content_approval;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _category IS NULL OR _category<>ALL(ARRAY['clinic_facts','contact_channels','wording_th_en','pricing','terms','privacy_wording','medical_claims','testimonials','certification_claims']) OR _surface IS NULL OR _surface<>ALL(ARRAY['/','/partner-apply','/care-demo','site-wide'])
  OR _canonical IS NULL OR _canonical NOT IN ('available','missing') OR _status IS NULL OR _status NOT IN ('pending','available','blocked','unverified')
  OR _owner IS NULL OR _owner NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN') OR _reviewer IS NULL OR _reviewer NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN')
  OR _action IS NULL OR _action NOT IN ('Supply canonical source for independent review','Record independent approval of canonical source','Resolve reviewer concern','Confirm canonical source availability')
  OR content_unsafe(_ref) OR char_length(btrim(coalesce(_ref,''))) NOT BETWEEN 3 AND 120
  OR _date>current_date THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('content_approval:'||l::text));
 SELECT * INTO prev FROM content_approval WHERE lineage=l ORDER BY version DESC LIMIT 1;
 IF _lineage IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF FOUND AND (prev.category<>_category OR prev.surface<>_surface) THEN RAISE EXCEPTION 'CATEGORY_MISMATCH';END IF;
 v:=coalesce(prev.version,0)+1;
 INSERT INTO content_approval(lineage,version,category,surface,canonical_source,status,owner_role,reviewer_role,evidence_ref,required_action,review_date,recorder) VALUES(l,v,_category,_surface,_canonical,_status,_owner,_reviewer,btrim(_ref),_action,_date,u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'lineage',row.lineage,'version',row.version,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
CREATE FUNCTION public.content_approval_review(_id uuid,_outcome text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();e content_approval;row content_approval_reviews;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _outcome IS NULL OR _outcome NOT IN ('approved','concern') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 SELECT * INTO e FROM content_approval WHERE id=_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF e.recorder=u THEN RAISE EXCEPTION 'SECOND_REVIEWER_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM content_approval x WHERE x.lineage=e.lineage AND x.version>e.version) THEN RAISE EXCEPTION 'STALE_VERSION';END IF;
 INSERT INTO content_approval_reviews(approval_id,outcome,reviewer) VALUES(e.id,_outcome,u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
REVOKE ALL ON FUNCTION public.content_approval_record(uuid,text,text,text,text,text,text,text,text,date),public.content_approval_review(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.content_approval_record(uuid,text,text,text,text,text,text,text,text,date),public.content_approval_review(uuid,text) TO authenticated;
CREATE FUNCTION public.content_approval_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'lineage',e.lineage,'version',e.version,'category',e.category,'surface',e.surface,'canonical_source',e.canonical_source,'status',e.status,'owner_role',e.owner_role,'reviewer_role',e.reviewer_role,'evidence_ref',e.evidence_ref,'required_action',e.required_action,'review_date',e.review_date,'correlation_id',e.correlation_id,'created_at',e.created_at,'mine',e.recorder=u,
  'latest',NOT EXISTS(SELECT 1 FROM content_approval x WHERE x.lineage=e.lineage AND x.version>e.version),
  'reviews',coalesce((SELECT jsonb_agg(jsonb_build_object('outcome',r.outcome,'independent',r.reviewer<>e.recorder,'mine',r.reviewer=u,'created_at',r.created_at,'correlation_id',r.correlation_id) ORDER BY r.created_at) FROM content_approval_reviews r WHERE r.approval_id=e.id),'[]'::jsonb)) ORDER BY e.category,e.lineage,e.version) FROM content_approval e),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.content_approval_console() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.content_approval_console() TO authenticated;
