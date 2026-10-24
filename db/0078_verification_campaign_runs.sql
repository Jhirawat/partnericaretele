-- Verification campaign history: append-only, versioned, redacted run metadata and check results. Never stores "passed"; real results pass only via a different reviewer's confirmation, simulated results can never be confirmed.
CREATE TABLE public.campaign_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),run_no int GENERATED ALWAYS AS IDENTITY UNIQUE,campaign_version text NOT NULL CHECK(campaign_version ~ '^v[0-9]{1,3}$'),label text NOT NULL CHECK(char_length(label) BETWEEN 3 AND 120),simulated boolean NOT NULL,recorder uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.campaign_results(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),run_id uuid NOT NULL REFERENCES public.campaign_runs(id),check_id text NOT NULL CHECK(check_id IN ('seo-public','seo-private-noindex','a11y-mobile','a11y-contrast','redirect-signed-out','matrix-live','isolation-tenant','doctor-scope','screening-gates','credit-invariants','mcs-manual','certificates-private','outbox-disabled','sla-clock','privacy-retention','reconciliation','audit-append-only','protection-evidence','backup-evidence','content-review','rollback-drill','no-external')),suite text NOT NULL CHECK(char_length(suite) BETWEEN 3 AND 80),scope text NOT NULL CHECK(char_length(scope) BETWEEN 3 AND 120),prerequisite_state text NOT NULL CHECK(char_length(prerequisite_state) BETWEEN 3 AND 200),expected text NOT NULL CHECK(char_length(expected) BETWEEN 3 AND 200),status text NOT NULL CHECK(status IN ('pending','blocked','unverified','failed')),simulated boolean NOT NULL,owner_role text NOT NULL CHECK(owner_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),evidence_ref text NOT NULL CHECK(char_length(evidence_ref) BETWEEN 3 AND 120),next_action text NOT NULL CHECK(char_length(next_action) BETWEEN 3 AND 300),correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(run_id,check_id));
CREATE TABLE public.campaign_result_confirmations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),result_id uuid NOT NULL REFERENCES public.campaign_results(id),outcome text NOT NULL CHECK(outcome IN ('confirmed','rejected')),note text NOT NULL CHECK(char_length(note) BETWEEN 3 AND 300),reviewer uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(result_id,reviewer));
GRANT SELECT ON public.campaign_runs,public.campaign_results,public.campaign_result_confirmations TO authenticated;GRANT ALL ON public.campaign_runs,public.campaign_results,public.campaign_result_confirmations TO service_role;
ALTER TABLE public.campaign_runs ENABLE ROW LEVEL SECURITY;ALTER TABLE public.campaign_results ENABLE ROW LEVEL SECURITY;ALTER TABLE public.campaign_result_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_runs,public.campaign_results,public.campaign_result_confirmations FROM PUBLIC,anon;REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.campaign_runs,public.campaign_results,public.campaign_result_confirmations FROM authenticated;
CREATE TRIGGER campaign_runs_immutable BEFORE UPDATE OR DELETE ON public.campaign_runs FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER campaign_results_immutable BEFORE UPDATE OR DELETE ON public.campaign_results FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER campaign_result_confirmations_immutable BEFORE UPDATE OR DELETE ON public.campaign_result_confirmations FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE POLICY campaign_runs_read ON public.campaign_runs FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE POLICY campaign_results_read ON public.campaign_results FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE POLICY campaign_result_confirmations_read ON public.campaign_result_confirmations FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE FUNCTION public.campaign_run_record(_version text,_label text,_simulated boolean,_results jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();run campaign_runs;r jsonb;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _simulated IS NULL OR _version IS NULL OR _version !~ '^v[0-9]{1,3}$' OR access_unsafe(_label) OR char_length(btrim(coalesce(_label,''))) NOT BETWEEN 3 AND 120
  OR jsonb_typeof(_results)<>'array' OR jsonb_array_length(_results) NOT BETWEEN 1 AND 22 THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 INSERT INTO campaign_runs(campaign_version,label,simulated,recorder) VALUES(_version,btrim(_label),_simulated,u) RETURNING * INTO run;
 FOR r IN SELECT * FROM jsonb_array_elements(_results) LOOP
  IF coalesce(r->>'status','') NOT IN ('pending','blocked','unverified','failed') OR coalesce(r->>'owner_role','') NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN')
   OR access_unsafe(r->>'suite') OR access_unsafe(r->>'scope') OR access_unsafe(r->>'prerequisite_state') OR access_unsafe(r->>'expected') OR access_unsafe(r->>'evidence_ref') OR access_unsafe(r->>'next_action') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
  INSERT INTO campaign_results(run_id,check_id,suite,scope,prerequisite_state,expected,status,simulated,owner_role,evidence_ref,next_action)
   VALUES(run.id,r->>'check_id',btrim(r->>'suite'),btrim(r->>'scope'),btrim(r->>'prerequisite_state'),btrim(r->>'expected'),r->>'status',_simulated,r->>'owner_role',btrim(r->>'evidence_ref'),btrim(r->>'next_action'));
 END LOOP;
 RETURN jsonb_build_object('id',run.id,'run_no',run.run_no,'correlation_id',run.correlation_id,'created_at',run.created_at);
END $$;
CREATE FUNCTION public.campaign_result_confirm(_id uuid,_outcome text,_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();res campaign_results;run campaign_runs;row campaign_result_confirmations;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _outcome IS NULL OR _outcome NOT IN ('confirmed','rejected') OR access_unsafe(_note) OR char_length(btrim(coalesce(_note,''))) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 SELECT * INTO res FROM campaign_results WHERE id=_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF res.simulated THEN RAISE EXCEPTION 'SIMULATED_NOT_CONFIRMABLE';END IF;
 SELECT * INTO run FROM campaign_runs WHERE id=res.run_id;
 IF run.recorder=u THEN RAISE EXCEPTION 'SECOND_REVIEWER_REQUIRED';END IF;
 INSERT INTO campaign_result_confirmations(result_id,outcome,note,reviewer) VALUES(res.id,_outcome,btrim(_note),u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
CREATE FUNCTION public.campaign_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'run_no',g.run_no,'campaign_version',g.campaign_version,'label',g.label,'simulated',g.simulated,'mine',g.recorder=u,'correlation_id',g.correlation_id,'created_at',g.created_at,
  'results',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'check_id',x.check_id,'suite',x.suite,'scope',x.scope,'prerequisite_state',x.prerequisite_state,'expected',x.expected,'status',x.status,'simulated',x.simulated,'owner_role',x.owner_role,'evidence_ref',x.evidence_ref,'next_action',x.next_action,'correlation_id',x.correlation_id,'created_at',x.created_at,
   'confirmations',coalesce((SELECT jsonb_agg(jsonb_build_object('outcome',c.outcome,'independent',c.reviewer<>g.recorder,'mine',c.reviewer=u,'created_at',c.created_at,'correlation_id',c.correlation_id) ORDER BY c.created_at) FROM campaign_result_confirmations c WHERE c.result_id=x.id),'[]'::jsonb)) ORDER BY x.check_id) FROM campaign_results x WHERE x.run_id=g.id),'[]'::jsonb)) ORDER BY g.run_no) FROM campaign_runs g),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.campaign_run_record(text,text,boolean,jsonb),public.campaign_result_confirm(uuid,text,text),public.campaign_console() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.campaign_run_record(text,text,boolean,jsonb),public.campaign_result_confirm(uuid,text,text),public.campaign_console() TO authenticated;
