-- Read-only archive metadata projection. No recording, approvals, source mutations or operational calls.
CREATE FUNCTION public.release_archive_integrity_console() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); a jsonb; p jsonb; immutable_ok boolean; separation_ok boolean; duplicate_ok boolean;
BEGIN
 IF u IS NULL OR NOT public.release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED'; END IF;
 PERFORM public.care_require_strong();
 a:=public.review_handoff_console(); p:=public.human_packet_console();
 SELECT count(*)=4 INTO immutable_ok FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('human_packet_version','human_packet_decision','review_handoff_snapshot','review_handoff_event')
 AND EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgfoid='public.care_immutable()'::regprocedure AND (t.tgtype::int & 8)=8 AND (t.tgtype::int & 16)=16);
 SELECT NOT EXISTS(SELECT 1 FROM public.review_handoff_event e JOIN public.review_handoff_event r ON r.id=e.root_id
 WHERE e.handoff_type IN ('acknowledged','returned','concern') AND (e.actor=r.actor OR e.reviewer_role IS DISTINCT FROM r.recipient_role OR e.reviewer_role=r.sender_role))
 AND NOT EXISTS(SELECT 1 FROM public.human_packet_decision d JOIN public.human_packet_version v USING(packet_version) WHERE d.reviewer=v.opened_by)
 INTO separation_ok;
 SELECT NOT EXISTS(SELECT root_id FROM public.review_handoff_event WHERE handoff_type='acknowledged' GROUP BY root_id HAVING count(*)>1)
 AND NOT EXISTS(SELECT packet_version,reviewer_role FROM public.human_packet_decision GROUP BY packet_version,reviewer_role HAVING count(*)>1) INTO duplicate_ok;
 RETURN jsonb_build_object('archive',a,'packet',p,'controls',jsonb_build_object('immutability',immutable_ok,'reviewer_separation',separation_ok,'duplicate_rejection',duplicate_ok),'readiness_claimed',false);
END $$;
REVOKE ALL ON FUNCTION public.release_archive_integrity_console() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.release_archive_integrity_console() TO authenticated;