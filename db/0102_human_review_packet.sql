-- Final human review decision packet: append-only packet versions and decisions. Never publishes or infers readiness.
CREATE TABLE public.human_packet_version (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 packet_version integer NOT NULL UNIQUE CHECK(packet_version>0),
 fingerprint text NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{32}$'),
 open_blockers integer NOT NULL CHECK(open_blockers BETWEEN 0 AND 14),
 open_prerequisites integer NOT NULL CHECK(open_prerequisites BETWEEN 0 AND 7),
 unpassed_artifacts integer NOT NULL CHECK(unpassed_artifacts BETWEEN 0 AND 20),
 opener_role text NOT NULL CHECK(opener_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),
 opened_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()
);
GRANT SELECT ON public.human_packet_version TO authenticated;
GRANT ALL ON public.human_packet_version TO service_role;
ALTER TABLE public.human_packet_version ENABLE ROW LEVEL SECURITY;
CREATE POLICY human_packet_version_read ON public.human_packet_version FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
REVOKE ALL ON public.human_packet_version FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.human_packet_version FROM authenticated;
CREATE TRIGGER human_packet_version_immutable BEFORE UPDATE OR DELETE ON public.human_packet_version FOR EACH ROW EXECUTE FUNCTION public.care_immutable();

CREATE TABLE public.human_packet_decision (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 packet_version integer NOT NULL REFERENCES public.human_packet_version(packet_version),
 decision text NOT NULL CHECK(decision IN ('approve','concern')),
 reason text NOT NULL CHECK(reason IN ('blockers_resolved','evidence_confirmed','prerequisites_available','concern_blocker_open','concern_evidence_unconfirmed','concern_prerequisite_missing','concern_discrepancy','concern_scope')),
 reviewer_role text NOT NULL CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),
 reviewer uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 UNIQUE(packet_version,reviewer), UNIQUE(packet_version,reviewer_role)
);
GRANT SELECT ON public.human_packet_decision TO authenticated;
GRANT ALL ON public.human_packet_decision TO service_role;
ALTER TABLE public.human_packet_decision ENABLE ROW LEVEL SECURITY;
CREATE POLICY human_packet_decision_read ON public.human_packet_decision FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
REVOKE ALL ON public.human_packet_decision FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.human_packet_decision FROM authenticated;
CREATE TRIGGER human_packet_decision_immutable BEFORE UPDATE OR DELETE ON public.human_packet_decision FOR EACH ROW EXECUTE FUNCTION public.care_immutable();

-- Evidence fingerprint from append-only source row counts: any new source evidence makes a packet version stale.
CREATE FUNCTION public.human_packet_state() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE m jsonb:=public.golive_evidence_matrix_console(); fp text;
BEGIN
 fp:=md5(concat_ws(':',(SELECT count(*) FROM release_artifact_snapshot),(SELECT count(*) FROM owner_closure_record),(SELECT count(*) FROM readiness_decision_event),(SELECT count(*) FROM validation_snapshot_record),(SELECT count(*) FROM session_start_event),(SELECT count(*) FROM session_result_record),(SELECT count(*) FROM review_decisions)));
 RETURN jsonb_build_object('fingerprint',fp,
  'open_blockers',14-(SELECT count(*) FROM jsonb_array_elements(m->'ledger'->'current') c WHERE c->>'status'='closed'),
  'open_prerequisites',jsonb_array_length(m->'results'->'missing_prerequisites'),
  'unpassed_artifacts',(SELECT count(*) FROM jsonb_array_elements(m->'bundle'->'sources') s WHERE s->>'status'<>'passed'));
END $$;

CREATE FUNCTION public.human_packet_role(_u uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT x.role::text FROM user_roles x WHERE x.user_id=_u AND x.partner_id IS NULL AND x.role IN ('SUPER_ADMIN','OPERATIONS_ADMIN') ORDER BY x.role LIMIT 1
$$;

CREATE FUNCTION public.human_packet_open() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); role text; st jsonb; cur int; r human_packet_version;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM care_require_strong();
 role:=human_packet_role(u); IF role IS NULL THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('human-packet',0));
 st:=human_packet_state();
 SELECT max(packet_version) INTO cur FROM human_packet_version;
 IF cur IS NOT NULL AND (SELECT fingerprint FROM human_packet_version WHERE packet_version=cur)=st->>'fingerprint' THEN RAISE EXCEPTION 'PACKET_CURRENT'; END IF;
 INSERT INTO human_packet_version(packet_version,fingerprint,open_blockers,open_prerequisites,unpassed_artifacts,opener_role,opened_by)
  VALUES(coalesce(cur,0)+1,st->>'fingerprint',(st->>'open_blockers')::int,(st->>'open_prerequisites')::int,(st->>'unpassed_artifacts')::int,role,u) RETURNING * INTO r;
 RETURN jsonb_build_object('packet_version',r.packet_version,'correlation_id',r.correlation_id);
END $$;

CREATE FUNCTION public.human_packet_decide(_version integer,_decision text,_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); role text; st jsonb; cur int; p human_packet_version; r human_packet_decision;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM care_require_strong();
 IF _version IS NULL OR coalesce(_decision,'') NOT IN ('approve','concern')
  OR coalesce(_reason,'') NOT IN ('blockers_resolved','evidence_confirmed','prerequisites_available','concern_blocker_open','concern_evidence_unconfirmed','concern_prerequisite_missing','concern_discrepancy','concern_scope')
  OR (_decision='approve') <> (_reason NOT LIKE 'concern_%') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 role:=human_packet_role(u); IF role IS NULL THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('human-packet',0));
 SELECT max(packet_version) INTO cur FROM human_packet_version;
 IF cur IS NULL OR _version<>cur THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 SELECT * INTO p FROM human_packet_version WHERE packet_version=cur;
 st:=human_packet_state();
 IF p.fingerprint<>st->>'fingerprint' THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 IF p.opened_by=u THEN RAISE EXCEPTION 'REVIEWER_SEPARATION'; END IF;
 IF EXISTS(SELECT 1 FROM human_packet_decision d WHERE d.packet_version=cur AND d.reviewer=u) THEN RAISE EXCEPTION 'DUPLICATE_DECISION'; END IF;
 IF EXISTS(SELECT 1 FROM human_packet_decision d WHERE d.packet_version=cur AND d.reviewer_role=role) THEN RAISE EXCEPTION 'ROLE_SEPARATION'; END IF;
 IF EXISTS(SELECT 1 FROM human_packet_decision d WHERE d.packet_version=cur AND d.decision='concern') THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 IF _decision='approve' AND ((st->>'open_blockers')::int>0 OR (st->>'open_prerequisites')::int>0 OR (st->>'unpassed_artifacts')::int>0) THEN RAISE EXCEPTION 'HARD_BLOCKER_OPEN'; END IF;
 INSERT INTO human_packet_decision(packet_version,decision,reason,reviewer_role,reviewer) VALUES(cur,_decision,_reason,role,u) RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'packet_version',r.packet_version,'correlation_id',r.correlation_id);
END $$;

-- Redacted console: no reviewer identities, only roles and self flags.
CREATE FUNCTION public.human_packet_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); st jsonb;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM care_require_strong();
 st:=human_packet_state();
 RETURN jsonb_build_object(
  'current',jsonb_build_object('open_blockers',(st->>'open_blockers')::int,'open_prerequisites',(st->>'open_prerequisites')::int,'unpassed_artifacts',(st->>'unpassed_artifacts')::int),
  'versions',coalesce((SELECT jsonb_agg(jsonb_build_object('packet_version',v.packet_version,'current',v.fingerprint=st->>'fingerprint','open_blockers',v.open_blockers,'open_prerequisites',v.open_prerequisites,'unpassed_artifacts',v.unpassed_artifacts,'opener_role',v.opener_role,'mine',v.opened_by=u,'created_at',v.created_at,'correlation_id',v.correlation_id) ORDER BY v.packet_version) FROM human_packet_version v),'[]'::jsonb),
  'decisions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'packet_version',d.packet_version,'decision',d.decision,'reason',d.reason,'reviewer_role',d.reviewer_role,'mine',d.reviewer=u,'created_at',d.created_at,'correlation_id',d.correlation_id) ORDER BY d.packet_version,d.created_at) FROM human_packet_decision d),'[]'::jsonb),
  'readiness_claimed',false);
END $$;
REVOKE ALL ON FUNCTION public.human_packet_state(),public.human_packet_role(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.human_packet_open(),public.human_packet_decide(integer,text,text),public.human_packet_console() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.human_packet_open(),public.human_packet_decide(integer,text,text),public.human_packet_console() TO authenticated;
