CREATE TABLE public.integration_safety_item(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lineage uuid NOT NULL,version int NOT NULL CHECK(version>0),category text NOT NULL CHECK(category IN ('payment','email','sms','push_notifications','webhooks','analytics_tracking','mcs_clinical','storage','other_provider')),capability text NOT NULL CHECK(char_length(capability) BETWEEN 3 AND 80),environment text NOT NULL CHECK(environment IN ('preview','production_candidate')),status text NOT NULL CHECK(status IN ('disabled','unconnected','blocked','approved')),owner_role text NOT NULL CHECK(owner_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),reviewer_role text NOT NULL CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),evidence_ref text NOT NULL CHECK(char_length(evidence_ref) BETWEEN 3 AND 120),required_action text NOT NULL CHECK(required_action IN ('Record disabled-state evidence for independent review','Record independent confirmation of disabled state','Resolve reviewer concern','Confirm provider remains disabled pending change control')),blocker_reason text CHECK(blocker_reason IS NULL OR char_length(blocker_reason) BETWEEN 3 AND 200),review_date date,recorder uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(lineage,version));
CREATE TABLE public.integration_safety_review(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),item_id uuid NOT NULL REFERENCES public.integration_safety_item(id),outcome text NOT NULL CHECK(outcome IN ('confirmed','concern')),reviewer uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(item_id,reviewer));
GRANT SELECT ON public.integration_safety_item,public.integration_safety_review TO authenticated;GRANT ALL ON public.integration_safety_item,public.integration_safety_review TO service_role;
ALTER TABLE public.integration_safety_item ENABLE ROW LEVEL SECURITY;ALTER TABLE public.integration_safety_review ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_safety_item,public.integration_safety_review FROM PUBLIC,anon;REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.integration_safety_item,public.integration_safety_review FROM authenticated;
CREATE TRIGGER integration_safety_item_immutable BEFORE UPDATE OR DELETE ON public.integration_safety_item FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER integration_safety_review_immutable BEFORE UPDATE OR DELETE ON public.integration_safety_review FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE POLICY integration_safety_item_read ON public.integration_safety_item FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE POLICY integration_safety_review_read ON public.integration_safety_review FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE FUNCTION public.integration_safety_record(_lineage uuid,_category text,_capability text,_environment text,_status text,_owner text,_reviewer text,_ref text,_action text,_blocker text,_date date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();l uuid:=coalesce(_lineage,gen_random_uuid());v int;prev integration_safety_item;row integration_safety_item;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _category IS NULL OR _category<>ALL(ARRAY['payment','email','sms','push_notifications','webhooks','analytics_tracking','mcs_clinical','storage','other_provider'])
  OR _environment IS NULL OR _environment NOT IN ('preview','production_candidate')
  OR _status IS NULL OR _status NOT IN ('disabled','unconnected','blocked','approved')
  OR _owner IS NULL OR _owner NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN') OR _reviewer IS NULL OR _reviewer NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN')
  OR _action IS NULL OR _action NOT IN ('Record disabled-state evidence for independent review','Record independent confirmation of disabled state','Resolve reviewer concern','Confirm provider remains disabled pending change control')
  OR content_unsafe(_capability) OR char_length(btrim(coalesce(_capability,''))) NOT BETWEEN 3 AND 80
  OR content_unsafe(_ref) OR char_length(btrim(coalesce(_ref,''))) NOT BETWEEN 3 AND 120
  OR (_blocker IS NOT NULL AND (content_unsafe(_blocker) OR char_length(btrim(_blocker)) NOT BETWEEN 3 AND 200))
  OR _date>current_date THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('integration_safety:'||l::text));
 SELECT * INTO prev FROM integration_safety_item WHERE lineage=l ORDER BY version DESC LIMIT 1;
 IF _lineage IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF FOUND AND prev.category<>_category THEN RAISE EXCEPTION 'CATEGORY_MISMATCH';END IF;
 v:=coalesce(prev.version,0)+1;
 INSERT INTO integration_safety_item(lineage,version,category,capability,environment,status,owner_role,reviewer_role,evidence_ref,required_action,blocker_reason,review_date,recorder) VALUES(l,v,_category,btrim(_capability),_environment,_status,_owner,_reviewer,btrim(_ref),_action,CASE WHEN _blocker IS NULL THEN NULL ELSE btrim(_blocker) END,_date,u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'lineage',row.lineage,'version',row.version,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
CREATE FUNCTION public.integration_safety_confirm(_id uuid,_outcome text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();e integration_safety_item;row integration_safety_review;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _outcome IS NULL OR _outcome NOT IN ('confirmed','concern') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 SELECT * INTO e FROM integration_safety_item WHERE id=_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF e.recorder=u THEN RAISE EXCEPTION 'SECOND_REVIEWER_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM integration_safety_item x WHERE x.lineage=e.lineage AND x.version>e.version) THEN RAISE EXCEPTION 'STALE_VERSION';END IF;
 INSERT INTO integration_safety_review(item_id,outcome,reviewer) VALUES(e.id,_outcome,u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
REVOKE ALL ON FUNCTION public.integration_safety_record(uuid,text,text,text,text,text,text,text,text,text,date),public.integration_safety_confirm(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.integration_safety_record(uuid,text,text,text,text,text,text,text,text,text,date),public.integration_safety_confirm(uuid,text) TO authenticated;
CREATE FUNCTION public.integration_safety_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'lineage',e.lineage,'version',e.version,'category',e.category,'capability',e.capability,'environment',e.environment,'status',e.status,'owner_role',e.owner_role,'reviewer_role',e.reviewer_role,'evidence_ref',e.evidence_ref,'required_action',e.required_action,'blocker_reason',e.blocker_reason,'review_date',e.review_date,'correlation_id',e.correlation_id,'created_at',e.created_at,'mine',e.recorder=u,
  'latest',NOT EXISTS(SELECT 1 FROM integration_safety_item x WHERE x.lineage=e.lineage AND x.version>e.version),
  'reviews',coalesce((SELECT jsonb_agg(jsonb_build_object('outcome',r.outcome,'independent',r.reviewer<>e.recorder,'mine',r.reviewer=u,'created_at',r.created_at,'correlation_id',r.correlation_id) ORDER BY r.created_at) FROM integration_safety_review r WHERE r.item_id=e.id),'[]'::jsonb)) ORDER BY e.category,e.lineage,e.version) FROM integration_safety_item e),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.integration_safety_console() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.integration_safety_console() TO authenticated;