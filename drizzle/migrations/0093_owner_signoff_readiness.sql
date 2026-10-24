-- Read-only owner summary. Existing immutable source workflows remain the only sign-off authority.
CREATE FUNCTION public.owner_signoff_readiness_console() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); integrity jsonb; results jsonb; sessions jsonb;
BEGIN
 IF u IS NULL OR NOT public.release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM public.care_require_strong();
 integrity:=public.release_archive_integrity_console();
 results:=public.session_result_console();
 SELECT coalesce(jsonb_agg(jsonb_build_object('session_key',s->>'session_key','authorized',(s->>'authorized')::boolean,'session_version',(s->>'session_version')::integer) ORDER BY s->>'session_key'),'[]'::jsonb)
 INTO sessions FROM jsonb_array_elements(results->'sessions') s;
 RETURN jsonb_build_object('integrity',integrity,'sessions',sessions,'readiness_claimed',false);
END $$;
REVOKE ALL ON FUNCTION public.owner_signoff_readiness_console() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.owner_signoff_readiness_console() TO authenticated;