-- Redacted immutable handoff evidence only; never grants release authority or sends anything.
CREATE TABLE public.review_handoff_snapshot (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_version integer GENERATED ALWAYS AS IDENTITY UNIQUE,
 packet_version integer NOT NULL REFERENCES public.human_packet_version(packet_version),
 manifest jsonb NOT NULL, fingerprint text NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{32}$'),
 decision_state text NOT NULL CHECK(decision_state IN ('blocked','awaiting-review','two-person-recorded')),
 blocker_count integer NOT NULL CHECK(blocker_count BETWEEN 0 AND 14), prerequisite_count integer NOT NULL CHECK(prerequisite_count BETWEEN 0 AND 7), artifact_count integer NOT NULL CHECK(artifact_count BETWEEN 0 AND 20), discrepancy_count integer NOT NULL CHECK(discrepancy_count BETWEEN 0 AND 99999),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(packet_version,fingerprint)
);
GRANT SELECT ON public.review_handoff_snapshot TO authenticated;
GRANT ALL ON public.review_handoff_snapshot TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.review_handoff_snapshot_source_version_seq TO service_role;
ALTER TABLE public.review_handoff_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_handoff_snapshot_read ON public.review_handoff_snapshot FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.review_handoff_snapshot FROM authenticated;
CREATE TRIGGER review_handoff_snapshot_immutable BEFORE UPDATE OR DELETE ON public.review_handoff_snapshot FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TABLE public.review_handoff_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), snapshot_id uuid NOT NULL REFERENCES public.review_handoff_snapshot(id),
 root_id uuid REFERENCES public.review_handoff_event(id), handoff_type text NOT NULL CHECK(handoff_type IN ('created','shared','acknowledged','returned','concern','expired')),
 recipient_role text NOT NULL CHECK(recipient_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')), sender_role text NOT NULL CHECK(sender_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')), reviewer_role text CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),
 actor uuid NOT NULL, reason text NOT NULL CHECK(reason IN ('review-requested','receipt-confirmed','evidence-changed','blockers-open','review-concern','window-expired')),
 next_action text NOT NULL CHECK(next_action IN ('independent-review','resolve-source','retain-history')),
 packet_label text NOT NULL DEFAULT 'Final human review packet' CHECK(packet_label='Final human review packet'),
 evidence_label text NOT NULL DEFAULT 'Redacted handoff evidence' CHECK(evidence_label='Redacted handoff evidence'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), CHECK(sender_role<>recipient_role)
);
GRANT SELECT ON public.review_handoff_event TO authenticated;
GRANT ALL ON public.review_handoff_event TO service_role;
ALTER TABLE public.review_handoff_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_handoff_event_read ON public.review_handoff_event FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.review_handoff_event FROM authenticated;
CREATE TRIGGER review_handoff_event_immutable BEFORE UPDATE OR DELETE ON public.review_handoff_event FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE UNIQUE INDEX review_handoff_one_ack ON public.review_handoff_event(root_id) WHERE handoff_type='acknowledged';
-- Project only fixed catalogue labels, versions, derived states and revision fingerprints. No raw evidence.
CREATE FUNCTION public.review_handoff_state() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE m jsonb:=golive_evidence_matrix_console(); st jsonb:=human_packet_state(); manifest jsonb; v int; disc int; approved boolean;
BEGIN
 SELECT max(packet_version) INTO v FROM human_packet_version;
 SELECT coalesce(jsonb_agg(x ORDER BY x->>'key'),'[]') INTO manifest FROM (
 SELECT jsonb_build_object('key','artifact:'||(a->>'register'),'version',a->'source_version','status',a->>'status','revision',a->>'fingerprint') x FROM jsonb_array_elements(m->'bundle'->'sources') a
 UNION ALL SELECT jsonb_build_object('key','blocker:'||(a->>'key'),'version',coalesce(a->'record'->'version','0'::jsonb),'status',a->>'status','revision',md5(coalesce((a->'reasons')::text,''))) FROM jsonb_array_elements(m->'ledger'->'current') a
 UNION ALL SELECT jsonb_build_object('key','validation:'||(a->>'key'),'version',coalesce(a->'record'->'version','0'::jsonb),'status',a->>'status','revision',md5(coalesce(a->'record'->>'review_outcome',''))) FROM jsonb_array_elements(m->'validation') a
 UNION ALL SELECT jsonb_build_object('key','gate:'||(a->>'key'),'version',coalesce(a->'record'->'version','0'::jsonb),'status',a->>'status','revision',md5((a->'missing')::text)) FROM jsonb_array_elements(m->'gate') a
 UNION ALL SELECT jsonb_build_object('key','result:'||(s->>'session_key')||':'||(a->>'suite_key'),'version',coalesce(a->'record'->'version','0'::jsonb),'status',a->>'status','revision',md5(concat_ws(':',a->'record'->>'source_session_version',a->'record'->'review1'->>'outcome',a->'record'->'review2'->>'outcome'))) FROM jsonb_array_elements(m->'results'->'sessions') s CROSS JOIN LATERAL jsonb_array_elements(s->'suites') a
 UNION ALL SELECT jsonb_build_object('key','packet-review','version',coalesce(v,0),'status',CASE WHEN count(*) FILTER(WHERE decision='approve')=2 AND count(*) FILTER(WHERE decision='concern')=0 THEN 'passed' ELSE 'unverified' END,'revision',md5(coalesce(string_agg(decision||':'||reviewer_role,',' ORDER BY reviewer_role),''))) FROM human_packet_decision WHERE packet_version=v
 ) q;
 SELECT count(*) INTO disc FROM jsonb_array_elements(manifest) x WHERE x->>'status' NOT IN ('passed','closed');
 disc:=disc+(st->>'open_prerequisites')::int;
 approved:=(st->>'open_blockers')::int=0 AND (st->>'open_prerequisites')::int=0 AND (st->>'unpassed_artifacts')::int=0 AND disc=0;
 RETURN jsonb_build_object('packet_version',coalesce(v,0),'packet_current',coalesce((SELECT fingerprint=st->>'fingerprint' FROM human_packet_version WHERE packet_version=v),false),'manifest',manifest,'fingerprint',md5(manifest::text||st::text),'decision_state',CASE WHEN approved THEN 'two-person-recorded' WHEN (st->>'open_blockers')::int+(st->>'open_prerequisites')::int+(st->>'unpassed_artifacts')::int>0 THEN 'blocked' ELSE 'awaiting-review' END,'blocker_count',(st->>'open_blockers')::int,'prerequisite_count',(st->>'open_prerequisites')::int,'artifact_count',(st->>'unpassed_artifacts')::int,'discrepancy_count',disc);
END $$;
CREATE FUNCTION public.review_handoff_command(_packet int,_source int,_root uuid,_type text,_recipient text,_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); role text; st jsonb; snap review_handoff_snapshot; root review_handoff_event; e review_handoff_event; nxt text;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF; PERFORM care_require_strong();
 role:=human_packet_role(u);
 IF role IS NULL OR _packet IS NULL OR _source IS NULL OR coalesce(_type,'') NOT IN ('created','shared','acknowledged','returned','concern','expired') OR coalesce(_recipient,'') NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN') OR coalesce(_reason,'') NOT IN ('review-requested','receipt-confirmed','evidence-changed','blockers-open','review-concern','window-expired') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 IF (_type IN ('created','shared') AND _reason<>'review-requested') OR (_type='acknowledged' AND _reason<>'receipt-confirmed') OR (_type='returned' AND _reason NOT IN ('evidence-changed','blockers-open')) OR (_type='concern' AND _reason<>'review-concern') OR (_type='expired' AND _reason<>'window-expired') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('human-packet',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('review-handoff',0));
 st:=review_handoff_state();
 IF _packet<>(st->>'packet_version')::int OR NOT (st->>'packet_current')::boolean THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 IF _type='created' THEN
  IF _root IS NOT NULL OR _source<>0 THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
  IF _recipient=role THEN RAISE EXCEPTION 'SELF_HANDOFF'; END IF;
  IF EXISTS(SELECT 1 FROM review_handoff_event h JOIN review_handoff_snapshot s ON s.id=h.snapshot_id WHERE h.handoff_type='created' AND h.actor=u AND s.packet_version=_packet AND s.fingerprint=st->>'fingerprint') THEN RAISE EXCEPTION 'DUPLICATE_HANDOFF'; END IF;
  INSERT INTO review_handoff_snapshot(packet_version,manifest,fingerprint,decision_state,blocker_count,prerequisite_count,artifact_count,discrepancy_count) VALUES(_packet,st->'manifest',st->>'fingerprint',st->>'decision_state',(st->>'blocker_count')::int,(st->>'prerequisite_count')::int,(st->>'artifact_count')::int,(st->>'discrepancy_count')::int) ON CONFLICT(packet_version,fingerprint) DO NOTHING;
  SELECT * INTO snap FROM review_handoff_snapshot WHERE packet_version=_packet AND fingerprint=st->>'fingerprint';
 ELSE
  SELECT * INTO root FROM review_handoff_event WHERE id=_root AND handoff_type='created'; IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
  SELECT * INTO snap FROM review_handoff_snapshot WHERE id=root.snapshot_id;
  IF snap.source_version<>_source OR snap.packet_version<>_packet OR snap.fingerprint<>st->>'fingerprint' THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
  IF _recipient<>root.recipient_role THEN RAISE EXCEPTION 'ROLE_SEPARATION'; END IF;
  IF _type IN ('acknowledged','returned','concern') THEN
   IF u=root.actor OR role=root.sender_role OR role<>root.recipient_role THEN RAISE EXCEPTION 'SELF_HANDOFF'; END IF;
   IF EXISTS(SELECT 1 FROM review_handoff_event WHERE root_id=root.id AND handoff_type='acknowledged') THEN RAISE EXCEPTION 'DUPLICATE_ACKNOWLEDGEMENT'; END IF;
  ELSE IF u<>root.actor OR role<>root.sender_role THEN RAISE EXCEPTION 'ROLE_SEPARATION'; END IF; END IF;
  IF EXISTS(SELECT 1 FROM review_handoff_event WHERE root_id=root.id AND handoff_type IN ('returned','concern','expired')) THEN RAISE EXCEPTION 'HANDOFF_TERMINAL'; END IF;
  IF _type='acknowledged' AND NOT EXISTS(SELECT 1 FROM review_handoff_event WHERE root_id=root.id AND handoff_type='shared') THEN RAISE EXCEPTION 'SHARE_REQUIRED'; END IF;
 END IF;
 nxt:=CASE WHEN _type IN ('returned','concern') THEN 'resolve-source' WHEN _type IN ('acknowledged','expired') THEN 'retain-history' ELSE 'independent-review' END;
 INSERT INTO review_handoff_event(snapshot_id,root_id,handoff_type,recipient_role,sender_role,reviewer_role,actor,reason,next_action) VALUES(snap.id,_root,_type,_recipient,coalesce(root.sender_role,role),CASE WHEN _type IN ('acknowledged','returned','concern') THEN role END,u,_reason,nxt) RETURNING * INTO e;
 RETURN jsonb_build_object('id',e.id,'source_version',snap.source_version,'correlation_id',e.correlation_id);
END $$;
CREATE FUNCTION public.review_handoff_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE st jsonb; u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF; PERFORM care_require_strong(); st:=review_handoff_state();
 RETURN jsonb_build_object('current',st-'fingerprint','role',human_packet_role(u),'snapshots',coalesce((SELECT jsonb_agg((to_jsonb(s)-'fingerprint')||jsonb_build_object('current',s.packet_version=(st->>'packet_version')::int AND s.fingerprint=st->>'fingerprint' AND (st->>'packet_current')::boolean) ORDER BY s.source_version) FROM review_handoff_snapshot s),'[]'),'events',coalesce((SELECT jsonb_agg((to_jsonb(e)-'actor')||jsonb_build_object('mine',e.actor=u) ORDER BY e.created_at,e.id) FROM review_handoff_event e),'[]'),'readiness_claimed',false);
END $$;
REVOKE ALL ON FUNCTION public.review_handoff_state() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.review_handoff_command(int,int,uuid,text,text,text),public.review_handoff_console() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_handoff_command(int,int,uuid,text,text,text),public.review_handoff_console() TO authenticated;
