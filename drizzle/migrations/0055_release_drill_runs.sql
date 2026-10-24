-- Simulation-only rollback drill history: append-only, synthetic flag enforced, redacted text. Never touches production data.
CREATE TABLE public.release_drill_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),scenario text NOT NULL CHECK(scenario IN ('frontend_regression','failed_migration','credit_anomaly','certificate_exposure','restore_verification')),synthetic boolean NOT NULL DEFAULT true CHECK(synthetic),expected text NOT NULL CHECK(char_length(expected) BETWEEN 3 AND 300),observed text NOT NULL CHECK(char_length(observed) BETWEEN 3 AND 300),status text NOT NULL CHECK(status IN ('passed','failed','blocked')),evidence_ref text NOT NULL CHECK(char_length(evidence_ref) BETWEEN 3 AND 120),next_action text NOT NULL CHECK(char_length(next_action) BETWEEN 3 AND 300),actor uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp());
GRANT SELECT ON public.release_drill_runs TO authenticated;GRANT ALL ON public.release_drill_runs TO service_role;ALTER TABLE public.release_drill_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.release_drill_runs FROM PUBLIC,anon;REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.release_drill_runs FROM authenticated;
CREATE TRIGGER release_drill_runs_immutable BEFORE UPDATE OR DELETE ON public.release_drill_runs FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE POLICY release_drill_runs_read ON public.release_drill_runs FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE FUNCTION public.release_drill_record(_scenario text,_synthetic boolean,_expected text,_observed text,_status text,_evidence text,_next text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();row release_drill_runs;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _synthetic IS DISTINCT FROM true THEN RAISE EXCEPTION 'SYNTHETIC_ONLY';END IF;
 IF _scenario IS NULL OR _scenario<>ALL(ARRAY['frontend_regression','failed_migration','credit_anomaly','certificate_exposure','restore_verification']) OR _status IS NULL OR _status NOT IN ('passed','failed','blocked')
  OR release_unsafe_text(coalesce(_expected,'')) OR release_unsafe_text(coalesce(_observed,'')) OR release_unsafe_text(coalesce(_evidence,'')) OR release_unsafe_text(coalesce(_next,''))
  OR char_length(btrim(coalesce(_expected,'')))<3 OR char_length(btrim(coalesce(_observed,'')))<3 OR char_length(btrim(coalesce(_evidence,'')))<3 OR char_length(btrim(coalesce(_next,'')))<3
  OR char_length(_expected)>300 OR char_length(_observed)>300 OR char_length(_evidence)>120 OR char_length(_next)>300 THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 INSERT INTO release_drill_runs(scenario,expected,observed,status,evidence_ref,next_action,actor) VALUES(_scenario,btrim(_expected),btrim(_observed),_status,btrim(_evidence),btrim(_next),u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
REVOKE ALL ON FUNCTION public.release_drill_record(text,boolean,text,text,text,text,text) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.release_drill_record(text,boolean,text,text,text,text,text) TO authenticated;
CREATE FUNCTION public.release_drill_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('scenario',scenario,'expected',expected,'observed',observed,'status',status,'evidence_ref',evidence_ref,'next_action',next_action,'correlation_id',correlation_id,'created_at',created_at,'mine',actor=u) ORDER BY created_at DESC) FROM release_drill_runs),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.release_drill_console() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.release_drill_console() TO authenticated;