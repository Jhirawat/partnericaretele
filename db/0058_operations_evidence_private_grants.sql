-- Explicit revocations also cover environment default privileges.
REVOKE ALL ON public.operations_audit_evidence FROM authenticated,anon;
REVOKE ALL ON FUNCTION public.operations_audit_hash(public.audit_log),public.operations_audit_record(),public.operations_safe_summary(jsonb) FROM authenticated,anon;
GRANT ALL ON public.operations_audit_evidence TO service_role;