CREATE TABLE public.review_rounds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 round integer NOT NULL UNIQUE CHECK(round>0),
 opened_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()
);
GRANT SELECT ON public.review_rounds TO authenticated;
GRANT ALL ON public.review_rounds TO service_role;
ALTER TABLE public.review_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_rounds_read ON public.review_rounds FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
REVOKE ALL ON public.review_rounds FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.review_rounds FROM authenticated;
CREATE TRIGGER review_rounds_immutable BEFORE UPDATE OR DELETE ON public.review_rounds FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TABLE public.review_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 round integer NOT NULL REFERENCES public.review_rounds(round),
 decision text NOT NULL CHECK(decision IN ('approve','concern')),
 reason text NOT NULL CHECK(reason IN ('blockers_resolved','evidence_confirmed','prerequisites_available','concern_blocker_open','concern_evidence_unconfirmed','concern_prerequisite_missing','concern_scope')),
 reviewer_role text NOT NULL CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),
 reviewer uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 UNIQUE(round,reviewer)
);
GRANT SELECT ON public.review_decisions TO authenticated;
GRANT ALL ON public.review_decisions TO service_role;
ALTER TABLE public.review_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_decisions_read ON public.review_decisions FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
REVOKE ALL ON public.review_decisions FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.review_decisions FROM authenticated;
CREATE TRIGGER review_decisions_immutable BEFORE UPDATE OR DELETE ON public.review_decisions FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE FUNCTION public.human_review_status(_round integer) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE
  WHEN EXISTS(SELECT 1 FROM review_decisions d WHERE d.round=_round AND d.decision='concern') THEN 'concern'
  WHEN (SELECT count(DISTINCT d.reviewer_role) FROM review_decisions d WHERE d.round=_round AND d.decision='approve')>=2 THEN 'approved'
  WHEN _round < (SELECT max(r.round) FROM review_rounds r) THEN 'closed'
  ELSE 'open' END
$$;
CREATE FUNCTION public.human_review_open_round() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); cur int; r review_rounds;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM care_require_strong();
 IF NOT EXISTS(SELECT 1 FROM user_roles x WHERE x.user_id=u AND x.partner_id IS NULL AND x.role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('human-review:round',0));
 SELECT max(rr.round) INTO cur FROM review_rounds rr;
 IF cur IS NOT NULL AND public.human_review_status(cur)='open' THEN RAISE EXCEPTION 'ROUND_ALREADY_OPEN'; END IF;
 INSERT INTO review_rounds(round,opened_by) VALUES(coalesce(cur,0)+1,u) RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'round',r.round,'correlation_id',r.correlation_id);
END $$;
CREATE FUNCTION public.human_review_decide(_decision text,_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); role text; cur int; opener uuid; r review_decisions;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM care_require_strong();
 IF coalesce(_decision,'') NOT IN ('approve','concern')
  OR coalesce(_reason,'') NOT IN ('blockers_resolved','evidence_confirmed','prerequisites_available','concern_blocker_open','concern_evidence_unconfirmed','concern_prerequisite_missing','concern_scope') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 SELECT x.role::text INTO role FROM user_roles x WHERE x.user_id=u AND x.partner_id IS NULL AND x.role IN ('SUPER_ADMIN','OPERATIONS_ADMIN') ORDER BY x.role LIMIT 1;
 IF role IS NULL THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('human-review:round',0));
 SELECT max(rr.round) INTO cur FROM review_rounds rr;
 IF cur IS NULL OR public.human_review_status(cur)<>'open' THEN RAISE EXCEPTION 'STALE_ROUND'; END IF;
 SELECT rr.opened_by INTO opener FROM review_rounds rr WHERE rr.round=cur;
 IF opener=u THEN RAISE EXCEPTION 'REVIEWER_SEPARATION'; END IF;
 INSERT INTO review_decisions(round,decision,reason,reviewer_role,reviewer) VALUES(cur,_decision,_reason,role,u) RETURNING * INTO r;
 RETURN jsonb_build_object('id',r.id,'round',r.round,'correlation_id',r.correlation_id);
END $$;
CREATE FUNCTION public.human_review_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM care_require_strong();
 RETURN jsonb_build_object(
  'rounds',coalesce((SELECT jsonb_agg(jsonb_build_object('round',rr.round,'status',public.human_review_status(rr.round),'opened_at',rr.created_at,'mine',rr.opened_by=u,'correlation_id',rr.correlation_id) ORDER BY rr.round) FROM review_rounds rr),'[]'::jsonb),
  'decisions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'round',d.round,'decision',d.decision,'reason',d.reason,'reviewer_role',d.reviewer_role,'mine',d.reviewer=u,'created_at',d.created_at,'correlation_id',d.correlation_id) ORDER BY d.round,d.created_at) FROM review_decisions d),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.human_review_status(integer),public.human_review_open_round(),public.human_review_decide(text,text),public.human_review_console() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.human_review_open_round(),public.human_review_decide(text,text),public.human_review_console() TO authenticated;