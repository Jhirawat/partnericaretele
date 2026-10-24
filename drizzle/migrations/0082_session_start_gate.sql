CREATE TABLE public.session_start_event(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_key text NOT NULL CHECK(session_key IN ('primary-human-session','follow-up-human-session')),version int NOT NULL CHECK(version>0),status text NOT NULL CHECK(status IN ('unavailable','blocked','ready-for-start','in-progress','completed','concern')),environment_label text NOT NULL CHECK(environment_label='Signed-in preview'),suite_group text NOT NULL CHECK(suite_group IN ('Role and access suites','Data protection suites','Content and release suites','Full human verification campaign')),evidence_label text NOT NULL CHECK(evidence_label='Independent session authorization review'),blocker_reason text NOT NULL CHECK(blocker_reason IN ('No blocker recorded','Prerequisites unavailable','Independent review outstanding','Explicit human start outstanding','Environment unavailable','Concern raised')),next_action text NOT NULL CHECK(next_action IN ('Confirm missing prerequisites','Request independent start review','Start session manually','Record completion','Resolve concern','No action required')),source_validation_version int NOT NULL CHECK(source_validation_version>=0),owner_role text NOT NULL CHECK(owner_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),recorder uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(session_key,version),CHECK((status IN ('ready-for-start','in-progress','completed'))=(blocker_reason IN ('No blocker recorded','Explicit human start outstanding','Independent review outstanding'))));
CREATE TABLE public.session_start_review(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),event_id uuid NOT NULL REFERENCES public.session_start_event(id),outcome text NOT NULL CHECK(outcome IN ('confirmed','concern')),reviewer uuid NOT NULL,reviewer_role text NOT NULL CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(event_id));
GRANT SELECT ON public.session_start_event,public.session_start_review TO authenticated;
GRANT ALL ON public.session_start_event,public.session_start_review TO service_role;
ALTER TABLE public.session_start_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_start_review ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.session_start_event,public.session_start_review FROM PUBLIC,anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.session_start_event,public.session_start_review FROM authenticated;
CREATE POLICY session_start_event_read ON public.session_start_event FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
CREATE POLICY session_start_review_read ON public.session_start_review FOR SELECT TO authenticated USING(public.release_scope(auth.uid()) AND auth.jwt()->>'aal'='aal2');
CREATE TRIGGER session_start_event_immutable BEFORE UPDATE OR DELETE ON public.session_start_event FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER session_start_review_immutable BEFORE UPDATE OR DELETE ON public.session_start_review FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE FUNCTION public.session_start_missing() RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(array_agg(k ORDER BY o),'{}') FROM unnest(ARRAY['superadmin_account','second_reviewer','preview_access','protection_evidence','backup_evidence','content_review','publish_owner']) WITH ORDINALITY AS x(k,o)
 WHERE NOT EXISTS(SELECT 1 FROM (SELECT * FROM test_prerequisites p WHERE p.prerequisite_key=x.k ORDER BY version DESC LIMIT 1) l
  WHERE l.status='available' AND l.review_due>=current_date
   AND EXISTS(SELECT 1 FROM test_prerequisite_reviews r WHERE r.prerequisite_id=l.id AND r.outcome='confirmed' AND r.reviewer<>l.recorder)
   AND NOT EXISTS(SELECT 1 FROM test_prerequisite_reviews r WHERE r.prerequisite_id=l.id AND r.outcome='rejected'))
$$;
REVOKE ALL ON FUNCTION public.session_start_missing() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.session_start_record(_session text,_version int,_status text,_suite_group text,_blocker_reason text,_next_action text,_source_validation_version int) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); v int; role text; p session_start_event; pr session_start_review; row session_start_event;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF; PERFORM care_require_strong();
 IF _session IS NULL OR _session NOT IN ('primary-human-session','follow-up-human-session') OR _version IS NULL OR _version<0 OR _status IS NULL OR _status NOT IN ('unavailable','blocked','ready-for-start','in-progress','completed','concern') OR _suite_group IS NULL OR _suite_group NOT IN ('Role and access suites','Data protection suites','Content and release suites','Full human verification campaign') OR _blocker_reason IS NULL OR _blocker_reason NOT IN ('No blocker recorded','Prerequisites unavailable','Independent review outstanding','Explicit human start outstanding','Environment unavailable','Concern raised') OR _next_action IS NULL OR _next_action NOT IN ('Confirm missing prerequisites','Request independent start review','Start session manually','Record completion','Resolve concern','No action required') OR _source_validation_version IS NULL OR _source_validation_version<0 OR _source_validation_version>(SELECT coalesce(max(version),0) FROM validation_snapshot_record) OR access_unsafe(_session) OR access_unsafe(_suite_group) OR access_unsafe(_blocker_reason) OR access_unsafe(_next_action) THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 IF (_status IN ('ready-for-start','in-progress','completed'))<>(_blocker_reason IN ('No blocker recorded','Explicit human start outstanding','Independent review outstanding')) THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 SELECT x.role::text INTO role FROM user_roles x WHERE x.user_id=u AND x.partner_id IS NULL AND x.role IN ('SUPER_ADMIN','OPERATIONS_ADMIN') ORDER BY x.role LIMIT 1;
 IF role IS NULL THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('session_start:'||_session));
 SELECT coalesce(max(version),0) INTO v FROM session_start_event WHERE session_key=_session; IF v<>_version THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 SELECT * INTO p FROM session_start_event WHERE session_key=_session AND version=v; SELECT * INTO pr FROM session_start_review WHERE event_id=p.id;
 IF _status IN ('ready-for-start','in-progress') AND cardinality(session_start_missing())>0 THEN RAISE EXCEPTION 'PREREQUISITES_UNAVAILABLE'; END IF;
 IF _status='in-progress' AND NOT coalesce(p.status='ready-for-start' AND pr.outcome='confirmed' AND pr.reviewer<>p.recorder,false) THEN RAISE EXCEPTION 'START_AUTHORIZATION_REQUIRED'; END IF;
 IF _status='in-progress' AND p.suite_group IS DISTINCT FROM _suite_group THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 IF _status='completed' AND (p.id IS NULL OR p.status<>'in-progress') THEN RAISE EXCEPTION 'ORDER_REQUIRED'; END IF;
 INSERT INTO session_start_event(session_key,version,status,environment_label,suite_group,evidence_label,blocker_reason,next_action,source_validation_version,owner_role,recorder) VALUES(_session,v+1,_status,'Signed-in preview',_suite_group,'Independent session authorization review',_blocker_reason,_next_action,_source_validation_version,role,u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'version',row.version,'correlation_id',row.correlation_id);
END $$;
CREATE FUNCTION public.session_start_confirm(_id uuid,_outcome text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); e session_start_event; role text; row session_start_review;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF; PERFORM care_require_strong();
 IF _outcome IS NULL OR _outcome NOT IN ('confirmed','concern') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 SELECT * INTO e FROM session_start_event WHERE id=_id; IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('session_start:'||e.session_key));
 IF e.version<>(SELECT max(version) FROM session_start_event WHERE session_key=e.session_key) THEN RAISE EXCEPTION 'STALE_VERSION'; END IF;
 IF e.recorder=u THEN RAISE EXCEPTION 'SECOND_REVIEWER_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM session_start_review WHERE event_id=e.id) THEN RAISE EXCEPTION 'DUPLICATE_REVIEW'; END IF;
 SELECT x.role::text INTO role FROM user_roles x WHERE x.user_id=u AND x.partner_id IS NULL AND x.role IN ('SUPER_ADMIN','OPERATIONS_ADMIN') AND x.role::text<>e.owner_role ORDER BY x.role LIMIT 1;
 IF role IS NULL THEN RAISE EXCEPTION 'ROLE_SEPARATION_REQUIRED'; END IF;
 IF _outcome='confirmed' AND e.status='ready-for-start' AND cardinality(session_start_missing())>0 THEN RAISE EXCEPTION 'PREREQUISITES_UNAVAILABLE'; END IF;
 INSERT INTO session_start_review(event_id,outcome,reviewer,reviewer_role) VALUES(e.id,_outcome,u,role) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'correlation_id',row.correlation_id);
END $$;
CREATE FUNCTION public.session_start_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); k text; e session_start_event; rv session_start_review; missing text[]; state text; reason text; rows jsonb:='[]'; hist jsonb;
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF; PERFORM care_require_strong();
 missing:=session_start_missing();
 FOREACH k IN ARRAY ARRAY['primary-human-session','follow-up-human-session'] LOOP
  e:=NULL; rv:=NULL;
  SELECT * INTO e FROM session_start_event WHERE session_key=k ORDER BY version DESC LIMIT 1;
  SELECT * INTO rv FROM session_start_review WHERE event_id=e.id;
  state:=CASE WHEN e.id IS NULL THEN 'unavailable' WHEN rv.outcome='concern' OR e.status='concern' THEN 'concern'
   WHEN e.status IN ('ready-for-start','in-progress') AND cardinality(missing)>0 THEN 'blocked'
   WHEN e.status='completed' AND NOT coalesce(rv.outcome='confirmed' AND rv.reviewer<>e.recorder,false) THEN 'in-progress'
   ELSE e.status END;
  reason:=CASE WHEN e.id IS NULL THEN (CASE WHEN cardinality(missing)>0 THEN 'Prerequisites unavailable' ELSE 'Independent review outstanding' END)
   WHEN state='concern' THEN 'Concern raised' WHEN state='blocked' AND cardinality(missing)>0 THEN 'Prerequisites unavailable'
   WHEN e.status IN ('ready-for-start','completed') AND rv.id IS NULL THEN 'Independent review outstanding'
   WHEN e.status='ready-for-start' THEN 'Explicit human start outstanding' ELSE e.blocker_reason END;
  SELECT coalesce(jsonb_agg(jsonb_build_object('version',h.version,'status',h.status,'owner_role',h.owner_role,'created_at',h.created_at,'correlation_id',h.correlation_id,'review_outcome',hr.outcome,'reviewer_role',hr.reviewer_role) ORDER BY h.version),'[]') INTO hist FROM session_start_event h LEFT JOIN session_start_review hr ON hr.event_id=h.id WHERE h.session_key=k;
  rows:=rows||jsonb_build_array(jsonb_build_object('key',k,'status',state,'reason',reason,'missing',to_jsonb(missing),'start_authorized',coalesce(e.status='ready-for-start' AND rv.outcome='confirmed' AND rv.reviewer<>e.recorder AND cardinality(missing)=0,false),'history',hist,
   'record',CASE WHEN e.id IS NULL THEN NULL ELSE jsonb_build_object('id',e.id,'version',e.version,'status',e.status,'suite_group',e.suite_group,'environment_label',e.environment_label,'evidence_label',e.evidence_label,'blocker_reason',e.blocker_reason,'next_action',e.next_action,'source_validation_version',e.source_validation_version,'owner_role',e.owner_role,'mine',e.recorder=u,'created_at',e.created_at,'correlation_id',e.correlation_id,'reviewed',rv.id IS NOT NULL,'review_outcome',rv.outcome,'reviewer_role',rv.reviewer_role) END));
 END LOOP;
 RETURN rows;
END $$;
REVOKE ALL ON FUNCTION public.session_start_record(text,int,text,text,text,text,int),public.session_start_confirm(uuid,text),public.session_start_console() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.session_start_record(text,int,text,text,text,text,int),public.session_start_confirm(uuid,text),public.session_start_console() TO authenticated;
COMMENT ON TABLE public.session_start_event IS 'Redacted human session authorization metadata only. Never starts tests automatically. No release authority.';