-- Additive fix: the approval console read must require two-step sign-in like the other
-- release-scope consoles. Replaces the function body only; no table or policy changes.
CREATE OR REPLACE FUNCTION public.content_approval_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'lineage',e.lineage,'version',e.version,'category',e.category,'surface',e.surface,'canonical_source',e.canonical_source,'status',e.status,'owner_role',e.owner_role,'reviewer_role',e.reviewer_role,'evidence_ref',e.evidence_ref,'required_action',e.required_action,'review_date',e.review_date,'correlation_id',e.correlation_id,'created_at',e.created_at,'mine',e.recorder=u,
  'latest',NOT EXISTS(SELECT 1 FROM content_approval x WHERE x.lineage=e.lineage AND x.version>e.version),
  'reviews',coalesce((SELECT jsonb_agg(jsonb_build_object('outcome',r.outcome,'independent',r.reviewer<>e.recorder,'mine',r.reviewer=u,'created_at',r.created_at,'correlation_id',r.correlation_id) ORDER BY r.created_at) FROM content_approval_reviews r WHERE r.approval_id=e.id),'[]'::jsonb)) ORDER BY e.category,e.lineage,e.version) FROM content_approval e),'[]'::jsonb);
END $$;
