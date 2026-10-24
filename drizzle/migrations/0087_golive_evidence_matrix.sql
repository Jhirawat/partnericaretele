CREATE FUNCTION public.golive_evidence_matrix_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.release_scope(auth.uid()) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM public.care_require_strong();
 RETURN jsonb_build_object('bundle',public.release_bundle_console(),'ledger',public.readiness_decision_console(),'validation',public.validation_snapshot_console(),'gate',public.session_start_console(),'results',public.session_result_console(),'review',public.human_review_console(),'readiness_claimed',false);
END $$;
REVOKE ALL ON FUNCTION public.golive_evidence_matrix_console() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.golive_evidence_matrix_console() TO authenticated;
COMMENT ON FUNCTION public.golive_evidence_matrix_console() IS 'Read-only single-statement redacted readiness reconciliation. Sources retain append-only history and independent review authority. No writes, automatic closure, release authority or external calls.';