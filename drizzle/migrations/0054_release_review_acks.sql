-- Human review acknowledgements for the publish gate: append-only, one record per reviewer per item and round.
-- Records never change sign-offs, evidence, credit, certificate, privacy or audit data. No external provider.
CREATE TABLE public.release_review_acks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),item_key text NOT NULL CHECK(item_key IN ('wording','clinic_facts','contact','price_terms','claims','keyboard_focus','contrast','device_performance')),outcome text NOT NULL CHECK(outcome IN ('acknowledged','concern')),note text NOT NULL CHECK(char_length(note) BETWEEN 3 AND 300),reviewer uuid NOT NULL,round int NOT NULL DEFAULT 1 CHECK(round>0),correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(item_key,reviewer,round));
GRANT SELECT ON public.release_review_acks TO authenticated;GRANT ALL ON public.release_review_acks TO service_role;ALTER TABLE public.release_review_acks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.release_review_acks FROM PUBLIC,anon;REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.release_review_acks FROM authenticated;
CREATE TRIGGER release_review_acks_immutable BEFORE UPDATE OR DELETE ON public.release_review_acks FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE POLICY release_review_acks_read ON public.release_review_acks FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE FUNCTION public.release_review_ack(_item text,_outcome text,_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();n text:=btrim(coalesce(_note,''));r int;row release_review_acks;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _item IS NULL OR _item<>ALL(ARRAY['wording','clinic_facts','contact','price_terms','claims','keyboard_focus','contrast','device_performance']) OR _outcome IS NULL OR _outcome NOT IN ('acknowledged','concern') OR release_unsafe_text(n) OR char_length(n)<3 OR char_length(n)>300 THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('release_review_ack:'||coalesce(_item,'')));
 SELECT coalesce(max(round),0)+1 INTO r FROM release_review_acks WHERE item_key=_item AND reviewer=u;
 INSERT INTO release_review_acks(item_key,outcome,note,reviewer,round) VALUES(_item,_outcome,n,u,r) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'round',row.round,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
REVOKE ALL ON FUNCTION public.release_review_ack(text,text,text) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.release_review_ack(text,text,text) TO authenticated;
-- Redacted projection: no reviewer identifiers; a stable per-item reviewer ordinal and a "mine" flag only.
CREATE FUNCTION public.release_review_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('item_key',a.item_key,'outcome',a.outcome,'note',a.note,'round',a.round,'correlation_id',a.correlation_id,'created_at',a.created_at,'mine',a.reviewer=u,'reviewer_no',a.rn) ORDER BY a.item_key,a.created_at) FROM (SELECT x.*,dense_rank() OVER (PARTITION BY x.item_key ORDER BY x.reviewer) rn FROM release_review_acks x) a),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.release_review_console() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.release_review_console() TO authenticated;