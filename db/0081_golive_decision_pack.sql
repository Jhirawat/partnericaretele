-- Redacted final go-live decision sign-offs only; no readiness approval is inferred or auto-promoted.
CREATE TABLE public.decision_signoffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), round integer NOT NULL CHECK(round>0),
 outcome text NOT NULL CHECK(outcome IN ('endorsed','concern')),
 signer_role text NOT NULL CHECK(signer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),
 signer uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), UNIQUE(round,signer)
);
GRANT SELECT ON public.decision_signoffs TO authenticated;
GRANT ALL ON public.decision_signoffs TO service_role;
ALTER TABLE public.decision_signoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY decision_signoffs_read ON public.decision_signoffs FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
REVOKE ALL ON public.decision_signoffs FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.decision_signoffs FROM authenticated;
CREATE TRIGGER decision_signoffs_immutable BEFORE UPDATE OR DELETE ON public.decision_signoffs FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE FUNCTION public.decision_pack_sign(_outcome text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); role text; cur int; r decision_signoffs;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM care_require_strong();
 IF coalesce(_outcome,'') NOT IN ('endorsed','concern') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 SELECT x.role::text INTO role FROM user_roles x WHERE x.user_id=u AND x.partner_id IS NULL AND x.role IN ('SUPER_ADMIN','OPERATIONS_ADMIN') ORDER BY x.role LIMIT 1;
 IF role IS NULL THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('decision-pack:signoff',0));
 SELECT coalesce(max(s.round),1) INTO cur FROM decision_signoffs s;
 IF EXISTS(SELECT 1 FROM decision_signoffs s WHERE s.round=cur AND s.outcome='concern')
  OR (SELECT count(DISTINCT s.signer_role) FROM decision_signoffs s WHERE s.round=cur)>=2 THEN cur:=cur+1; END IF;
 INSERT INTO decision_signoffs(round,outcome,signer_role,signer) VALUES(cur,_outcome,role,u) RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'round',r.round,'correlation_id',r.correlation_id);
END $$;
CREATE FUNCTION public.decision_pack_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM care_require_strong();
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'round',s.round,'outcome',s.outcome,'signer_role',s.signer_role,'mine',s.signer=u,'created_at',s.created_at,'correlation_id',s.correlation_id) ORDER BY s.round,s.created_at) FROM decision_signoffs s),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.decision_pack_sign(text),public.decision_pack_console() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.decision_pack_sign(text),public.decision_pack_console() TO authenticated;
