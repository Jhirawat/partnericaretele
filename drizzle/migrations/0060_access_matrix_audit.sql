-- Access matrix audit: redacted expected-permission evidence, append-only and versioned. Reads and changes no live permission.
CREATE TABLE public.access_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lineage uuid NOT NULL,version int NOT NULL CHECK(version>0),item_key text NOT NULL CHECK(item_key IN ('public_view_anon','auth_view_anon','customer_login','partner_own_org','partner_other_org','doctor_assigned','doctor_recruit_partner','doctor_recruit_ops','mcs_handoff_ops','mcs_handoff_partner','ops_console_scoped','ops_console_partner','superadmin_console','superadmin_console_ops','evidence_record_superadmin','evidence_record_scoped','runbook_drill_superadmin','runbook_drill_anon','gate_read_superadmin','gate_read_anon','gate_publish_any','private_index_any')),expected text NOT NULL CHECK(expected IN ('allow','deny')),required_scope text NOT NULL CHECK(char_length(required_scope) BETWEEN 3 AND 120),sensitivity text NOT NULL CHECK(sensitivity IN ('public','confidential','clinical','restricted','aggregate')),owner_role text NOT NULL CHECK(owner_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),reviewer_role text NOT NULL CHECK(reviewer_role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')),status text NOT NULL CHECK(status IN ('pending','blocked','unverified')),evidence_ref text NOT NULL CHECK(char_length(evidence_ref) BETWEEN 3 AND 120),next_action text NOT NULL CHECK(char_length(next_action) BETWEEN 3 AND 300),recorder uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(lineage,version));
CREATE TABLE public.access_audit_confirmations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),audit_id uuid NOT NULL REFERENCES public.access_audit(id),outcome text NOT NULL CHECK(outcome IN ('confirmed','rejected')),note text NOT NULL CHECK(char_length(note) BETWEEN 3 AND 300),reviewer uuid NOT NULL,correlation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(audit_id,reviewer));
GRANT SELECT ON public.access_audit,public.access_audit_confirmations TO authenticated;GRANT ALL ON public.access_audit,public.access_audit_confirmations TO service_role;
ALTER TABLE public.access_audit ENABLE ROW LEVEL SECURITY;ALTER TABLE public.access_audit_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.access_audit,public.access_audit_confirmations FROM PUBLIC,anon;REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.access_audit,public.access_audit_confirmations FROM authenticated;
CREATE TRIGGER access_audit_immutable BEFORE UPDATE OR DELETE ON public.access_audit FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE TRIGGER access_audit_confirmations_immutable BEFORE UPDATE OR DELETE ON public.access_audit_confirmations FOR EACH ROW EXECUTE FUNCTION public.care_immutable();
CREATE POLICY access_audit_read ON public.access_audit FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE POLICY access_audit_confirmations_read ON public.access_audit_confirmations FOR SELECT TO authenticated USING(public.release_scope(auth.uid()));
CREATE FUNCTION public.access_unsafe(_t text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT public.backup_unsafe(_t) OR coalesce(_t,'') ~* 'passport|national\s+id|date\s+of\s+birth|\+?\d[\d\s-]{7,}\d' $$;
REVOKE ALL ON FUNCTION public.access_unsafe(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.access_audit_record(_lineage uuid,_key text,_expected text,_scope text,_sens text,_owner text,_reviewer text,_status text,_ref text,_next text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();l uuid:=coalesce(_lineage,gen_random_uuid());prev access_audit;row access_audit;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _key IS NULL OR _expected IS NULL OR _expected NOT IN ('allow','deny') OR _sens IS NULL OR _sens NOT IN ('public','confidential','clinical','restricted','aggregate')
  OR _status IS NULL OR _status NOT IN ('pending','blocked','unverified') OR _owner IS NULL OR _owner NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN') OR _reviewer IS NULL OR _reviewer NOT IN ('SUPER_ADMIN','OPERATIONS_ADMIN')
  OR access_unsafe(_scope) OR access_unsafe(_ref) OR access_unsafe(_next)
  OR char_length(btrim(coalesce(_scope,''))) NOT BETWEEN 3 AND 120 OR char_length(btrim(coalesce(_ref,''))) NOT BETWEEN 3 AND 120 OR char_length(btrim(coalesce(_next,''))) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 PERFORM pg_advisory_xact_lock(hashtext('access_audit:'||l::text));
 SELECT * INTO prev FROM access_audit WHERE lineage=l ORDER BY version DESC LIMIT 1;
 IF _lineage IS NOT NULL AND NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF FOUND AND prev.item_key<>_key THEN RAISE EXCEPTION 'ITEM_MISMATCH';END IF;
 INSERT INTO access_audit(lineage,version,item_key,expected,required_scope,sensitivity,owner_role,reviewer_role,status,evidence_ref,next_action,recorder) VALUES(l,coalesce(prev.version,0)+1,_key,_expected,btrim(_scope),_sens,_owner,_reviewer,_status,btrim(_ref),btrim(_next),u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'lineage',row.lineage,'version',row.version,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
CREATE FUNCTION public.access_audit_confirm(_id uuid,_outcome text,_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();e access_audit;row access_audit_confirmations;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED';END IF;
 IF NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 PERFORM care_require_strong();
 IF _outcome IS NULL OR _outcome NOT IN ('confirmed','rejected') OR access_unsafe(_note) OR char_length(btrim(coalesce(_note,''))) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 SELECT * INTO e FROM access_audit WHERE id=_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_ARGUMENTS';END IF;
 IF e.recorder=u THEN RAISE EXCEPTION 'SECOND_REVIEWER_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM access_audit x WHERE x.lineage=e.lineage AND x.version>e.version) THEN RAISE EXCEPTION 'STALE_VERSION';END IF;
 INSERT INTO access_audit_confirmations(audit_id,outcome,note,reviewer) VALUES(e.id,_outcome,btrim(_note),u) RETURNING * INTO row;
 RETURN jsonb_build_object('id',row.id,'correlation_id',row.correlation_id,'created_at',row.created_at);
END $$;
REVOKE ALL ON FUNCTION public.access_audit_record(uuid,text,text,text,text,text,text,text,text,text),public.access_audit_confirm(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.access_audit_record(uuid,text,text,text,text,text,text,text,text,text),public.access_audit_confirm(uuid,text,text) TO authenticated;
CREATE FUNCTION public.access_audit_console() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid();
BEGIN
 IF u IS NULL OR NOT release_scope(u) THEN RAISE EXCEPTION 'RELEASE_SCOPE_REQUIRED';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'lineage',e.lineage,'version',e.version,'item_key',e.item_key,'expected',e.expected,'required_scope',e.required_scope,'sensitivity',e.sensitivity,'owner_role',e.owner_role,'reviewer_role',e.reviewer_role,'status',e.status,'evidence_ref',e.evidence_ref,'next_action',e.next_action,'correlation_id',e.correlation_id,'created_at',e.created_at,'mine',e.recorder=u,
  'latest',NOT EXISTS(SELECT 1 FROM access_audit x WHERE x.lineage=e.lineage AND x.version>e.version),
  'confirmations',coalesce((SELECT jsonb_agg(jsonb_build_object('outcome',c.outcome,'independent',c.reviewer<>e.recorder,'mine',c.reviewer=u,'created_at',c.created_at,'correlation_id',c.correlation_id) ORDER BY c.created_at) FROM access_audit_confirmations c WHERE c.audit_id=e.id),'[]'::jsonb)) ORDER BY e.item_key,e.lineage,e.version) FROM access_audit e),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.access_audit_console() FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.access_audit_console() TO authenticated;