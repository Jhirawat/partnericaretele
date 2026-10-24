-- Launch-Day Control Center: redacted planning and evidence metadata only, append-only and
-- versioned. An item counts as confirmed only after a different signed-in reviewer confirms
-- its latest version; nothing here publishes, deploys, or calls external services.
CREATE TABLE public.launch_control_item(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lineage uuid NOT NULL,version int NOT NULL CHECK(version>0),checklist_group text NOT NULL CHECK(checklist_group IN ('dns_domain_seo','public_routes','auth_guards','content_claims','access_controls','protection_evidence','backups','privacy_retention','credits','notifications_outbox','sla_controls','monitoring','rollback_readiness','no_external_calls')),phase text NOT NULL CHECK(phase IN ('preflight','post_publish')),release_candidate text NOT NULL CHECK(char_length(release_candidate) BETWEEN 3 AND 80),environment text NOT NULL CHECK(environment IN ('preview','production_candidate')),planned_window text NOT NULL CHECK(planned_window IN ('unscheduled','tentative','owner_confirmed')),rollback_trigger text NOT NULL CHECK(rollback_trigger IN ('none','data_integrity','auth_regression','payment_error','privacy_breach','availability_loss')),status text NOT NULL CHECK(status IN ('planned','blocked','ready','complete')),owner_role text NOT NULL CHECK(owner_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),reviewer_role text NOT NULL CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),evidence_ref text NOT NULL CHECK(char_length(evidence_ref) BETWEEN 3 AND 120),required_action text NOT NULL CHECK(required_action IN ('Record preflight evidence for independent review','Record independent confirmation of preflight item','Resolve reviewer concern','Confirm rollback stop conditions reviewed')),blocker_reason text CHECK(blocker_reason IS NULL OR char_length(blocker_reason) BETWEEN 3 AND 200),review_date date,recorder uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(lineage,version));
CREATE TABLE public.launch_control_review(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),item_id uuid NOT NULL REFERENCES public.launch_control_item(id),outcome text NOT NULL CHECK(outcome IN ('confirmed','concern')),reviewer uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(item_id,reviewer));
GRANT SELECT ON public.launch_control_item,public.launch_control_review TO authenticated;GRANT ALL ON public.launch_control_item,public.launch_control_review TO service_role;
ALTER TABLE public.launch_control_item ENABLE ROW LEVEL SECURITY;ALTER TABLE public.launch_control_review ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.launch_control_item,public.launch_control_review FROM PUBLIC,anon;REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.launch_control_item,public.launch_control_review FROM authenticated;
CREATE TRIGGER launch_control_item_immutable BEFORE UPDATE OR DELETE ON public.launch_control_item FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER launch_control_review_immutable BEFORE UPDATE OR DELETE ON public.launch_control_review FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE POLICY launch_control_item_read ON public.launch_control_item FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE POLICY launch_control_review_read ON public.launch_control_review FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE FUNCTION public.launch_control_record(_lineage uuid,_group text,_phase text,_candidate text,_environment text,_window text,_trigger text,_status text,_owner text,_reviewer text,_ref text,_action text,_blocker text,_date date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();l uuid:=coalesce(_lineage,gen_random_uuid());v int;prev launch_control_item;row launch_control_item;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _group IS NULL OR _group<>ALL(ARRAY['dns_domain_seo','public_routes','auth_guards','content_claims','access_controls','protection_evidence','backups','privacy_retention','credits','notifications_outbox','sla_controls','monitoring','rollback_readiness','no_external_calls'])
  OR _phase IS NULL OR _phase NOT IN ('preflight','post_publish')
  OR _environment IS NULL OR _environment NOT IN ('preview','production_candidate')
  OR _window IS NULL OR _window NOT IN ('unscheduled','tentative','owner_confirmed')
  OR _trigger IS NULL OR _trigger NOT IN ('none','data_integrity','auth_regression','payment_error','privacy_breach','availability_loss')
  OR _status IS NULL OR _status NOT IN ('planned','blocked','ready','complete')
  OR _owner IS NULL OR _owner NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN') OR _reviewer IS NULL OR _reviewer NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN')
  OR _action IS NULL OR _action NOT IN ('Record preflight evidence for independent review','Record independent confirmation of preflight item','Resolve reviewer concern','Confirm rollback stop conditions reviewed')
  OR content_unsafe(_candidate) OR char_length(btrim(coalesce(_candidate,''))) NOT BETWEEN 3 AND 80
  OR content_unsafe(_ref) OR char_length(btrim(coalesce(_ref,''))) NOT BETWEEN 3 AND 120
  OR (_blocker IS NOT NULL AND (content_unsafe(_blocker) OR char_length(btrim(_blocker)) NOT BETWEEN 3 AND 200))
  OR _date>current_date THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('launch_control:'||l::text));
 SELECT * INTO prev FROM launch_control_item WHERE lineage=l ORDER BY version DESC LIMIT 1;
 IF _lineage IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF FOUND AND (prev.checklist_group<>_group OR prev.phase<>_phase) THEN RAISE EXCEPTION 'GROUP_MISMATCH';END IF;
 v:=coalesce(prev.version,0)+1;
 INSERT INTO launch_control_item(lineage,version,checklist_group,phase,release_candidate,environment,planned_window,rollback_trigger,status,owner_role,reviewer_role,evidence_ref,required_action,blocker_reason,review_date,recorder) VALUES(l,v,_group,_phase,btrim(_candidate),_environment,_window,_trigger,_status,_owner,_reviewer,btrim(_ref),_action,CASE WHEN _blocker IS NULL THEN NULL ELSE btrim(_blocker) END,_date,u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'lineage',row.lineage,'version',row.version,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
CREATE FUNCTION public.launch_control_confirm(_id uuid,_outcome text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();e launch_control_item;row launch_control_review;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _outcome IS NULL OR _outcome NOT IN ('confirmed','concern') THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 SELECT * INTO e FROM launch_control_item WHERE id=_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF e.recorder=u THEN RAISE EXCEPTION 'SECOND_REVIEWER_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM launch_control_item x WHERE x.lineage=e.lineage AND x.version>e.version) THEN RAISE EXCEPTION 'STALE_VERSION';END IF;
 INSERT INTO launch_control_review(item_id,outcome,reviewer) VALUES(e.id,_outcome,u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
REVOKE ALL ON FUNCTION public.launch_control_record(uuid,text,text,text,text,text,text,text,text,text,text,text,text,date),public.launch_control_confirm(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.launch_control_record(uuid,text,text,text,text,text,text,text,text,text,text,text,text,date),public.launch_control_confirm(uuid,text) TO authenticated;
CREATE FUNCTION public.launch_control_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'lineage',e.lineage,'version',e.version,'checklist_group',e.checklist_group,'phase',e.phase,'release_candidate',e.release_candidate,'environment',e.environment,'planned_window',e.planned_window,'rollback_trigger',e.rollback_trigger,'status',e.status,'owner_role',e.owner_role,'reviewer_role',e.reviewer_role,'evidence_ref',e.evidence_ref,'required_action',e.required_action,'blocker_reason',e.blocker_reason,'review_date',e.review_date,'correlation_id',e.correlation_id,'created_at',e.created_at,'mine',e.recorder=u,
  'latest',NOT EXISTS(SELECT 1 FROM launch_control_item x WHERE x.lineage=e.lineage AND x.version>e.version),
  'reviews',coalesce((SELECT jsonb_agg(jsonb_build_object('outcome',r.outcome,'independent',r.reviewer<>e.recorder,'mine',r.reviewer=u,'created_at',r.created_at,'correlation_id',r.correlation_id) ORDER BY r.created_at) FROM launch_control_review r WHERE r.item_id=e.id),'[]'::jsonb)) ORDER BY e.checklist_group,e.phase,e.lineage,e.version) FROM launch_control_item e),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.launch_control_console() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.launch_control_console() TO authenticated;
