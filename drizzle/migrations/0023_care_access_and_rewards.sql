CREATE TABLE public.care_reward_allocations (
 reservation_id uuid NOT NULL REFERENCES public.care_reward_reservations(id), entry_id uuid NOT NULL REFERENCES public.care_reward_entries(id),
 points integer NOT NULL CHECK(points>0), PRIMARY KEY(reservation_id,entry_id)
);
ALTER TABLE public.care_reward_entries ADD COLUMN source_entry_id uuid REFERENCES public.care_reward_entries(id);
ALTER TABLE public.care_reward_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.care_reward_allocations FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.care_rewards_available(_p uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(sum(e.delta+COALESCE((SELECT sum(d.delta) FROM care_reward_entries d WHERE d.source_entry_id=e.id),0)
 -COALESCE((SELECT sum(a.points) FROM care_reward_allocations a JOIN care_reward_reservations r ON r.id=a.reservation_id WHERE a.entry_id=e.id AND r.state='RESERVED'),0)),0)::int
 FROM care_reward_entries e WHERE e.partner_id=_p AND e.delta>0 AND (e.expires_at IS NULL OR e.expires_at>now())
$$;
CREATE FUNCTION public.care_reward_command(_op text,_args jsonb,_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_variable
DECLARE u uuid:=auth.uid(); org uuid:=(_args->>'partnerId')::uuid; rid uuid:=NULLIF(_args->>'id','')::uuid;
 settings jsonb; rules jsonb; r care_reward_reservations; old care_operations; e record;
 points integer; left_points integer; take integer; free integer; result jsonb; reference text:=_args->>'reference';
BEGIN
 IF u IS NULL OR length(COALESCE(_key,''))<8 THEN RAISE EXCEPTION 'AUTHENTICATION_OR_KEY_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_key,0));
 SELECT * INTO old FROM care_operations WHERE key=_key;
 IF FOUND THEN IF old.actor<>u OR old.operation<>('REWARD_'||_op) OR old.request<>_args THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF; RETURN old.result; END IF;
 SELECT t.settings INTO settings FROM care_terms t WHERE active;
 rules:=settings->'reward_rules';
 IF _op='REVERSE' THEN
  PERFORM care_require_strong(); IF NOT care_finance(u) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO e FROM care_reward_entries WHERE id=(_args->>'entryId')::uuid AND delta>0;
  IF NOT FOUND THEN RAISE EXCEPTION 'EARNING_NOT_FOUND'; END IF;
  org:=e.partner_id; rules:=e.rules_snapshot;
 END IF;
 IF _op IN ('FULFIL','RELEASE') THEN
  SELECT * INTO r FROM care_reward_reservations WHERE care_reward_reservations.id=rid;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF;
  rules:=r.rules_snapshot;
 END IF;
 IF NOT (rules ?& ARRAY['approved','regulated_excluded','allowlist','mode','earning_minor_per_point','point_value_minor','cap_percent','expiry_months','earn_cap_points','minimum_spend_minor']) OR (_op IN ('EARN','RESERVE') AND NOT COALESCE((settings->>'rewards_enabled')::boolean,false)) OR NOT COALESCE((rules->>'approved')::boolean,false)
  OR NOT COALESCE((rules->>'regulated_excluded')::boolean,false) OR rules->'allowlist' IS NULL
  OR rules->>'mode'<>'MANUAL_NO_COUPON' OR (rules->>'earning_minor_per_point')::bigint<=0 OR (rules->>'point_value_minor')::bigint<=0
  OR (rules->>'cap_percent')::int NOT BETWEEN 1 AND 100 OR (rules->>'expiry_months')::int NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'REWARDS_NOT_APPROVED'; END IF;
 IF _op IN ('EARN','FULFIL','RELEASE','REVERSE') THEN PERFORM care_require_strong(); IF NOT care_finance(u) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 ELSE IF NOT can_manage_partner(u,org) THEN RAISE EXCEPTION 'PARTNER_OWNER_REQUIRED'; END IF; END IF;
 IF _op IN ('FULFIL','RELEASE') THEN
  SELECT * INTO r FROM care_reward_reservations WHERE care_reward_reservations.id=rid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_NOT_FOUND'; END IF; org:=r.partner_id;
 END IF;
 PERFORM 1 FROM partners WHERE partners.id=org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORG_NOT_FOUND'; END IF;
 IF _op IN ('EARN','RESERVE') AND NOT (rules->'allowlist' ? (_args->>'productCode')) THEN RAISE EXCEPTION 'PRODUCT_NOT_ELIGIBLE'; END IF;
 IF _op='EARN' THEN
  IF length(COALESCE(reference,''))<3 OR length(COALESCE(_args->>'evidence',''))<3 THEN RAISE EXCEPTION 'VERIFIED_STORE_EVIDENCE_REQUIRED'; END IF;
  points:=LEAST(((_args->>'eligibleSpendMinor')::bigint/(rules->>'earning_minor_per_point')::bigint)::int,(rules->>'earn_cap_points')::int);
  IF points<=0 THEN RAISE EXCEPTION 'INVALID_EARNING'; END IF;
  IF EXISTS(SELECT 1 FROM care_reward_entries WHERE event_key='store:'||reference) THEN RAISE EXCEPTION 'STORE_EVENT_ALREADY_POSTED'; END IF;
  INSERT INTO care_reward_entries(partner_id,delta,event_key,reason,actor,expires_at,eligible_spend_minor,rules_snapshot)
  VALUES(org,points,'store:'||reference,'Verified eligible store spend',u,now()+make_interval(months=>(rules->>'expiry_months')::int),(_args->>'eligibleSpendMinor')::bigint,rules);
  result:=jsonb_build_object('awarded',points);
 ELSIF _op='REVERSE' THEN
  IF length(COALESCE(reference,''))<3 OR length(COALESCE(_args->>'evidence',''))<3 OR length(COALESCE(_args->>'reason',''))<3 THEN RAISE EXCEPTION 'VERIFIED_RETURN_EVIDENCE_REQUIRED'; END IF;
  points:=LEAST(e.delta,((_args->>'returnedEligibleSpendMinor')::bigint/(rules->>'earning_minor_per_point')::bigint)::int);
  SELECT e.delta+COALESCE((SELECT sum(delta) FROM care_reward_entries WHERE source_entry_id=e.id),0)-COALESCE((SELECT sum(a.points) FROM care_reward_allocations a JOIN care_reward_reservations rr ON rr.id=a.reservation_id WHERE a.entry_id=e.id AND rr.state='RESERVED'),0) INTO free;
  IF points<=0 OR points>free OR (_args->>'returnedEligibleSpendMinor')::bigint>e.eligible_spend_minor THEN RAISE EXCEPTION 'REWARDS_HELD_SPENT_OR_INVALID_RETURN_REVIEW_REQUIRED'; END IF;
  INSERT INTO care_reward_entries(partner_id,delta,event_key,reason,actor,source_entry_id,rules_snapshot)
  VALUES(org,-points,'return:'||reference,_args->>'reason',u,e.id,rules);
  result:=jsonb_build_object('reversed',points);
 ELSIF _op='RESERVE' THEN
  points:=(_args->>'points')::int;
  IF points<=0 OR points>care_rewards_available(org) OR (_args->>'eligibleSpendMinor')::bigint<(rules->>'minimum_spend_minor')::bigint
   OR points::bigint*(rules->>'point_value_minor')::bigint>((_args->>'eligibleSpendMinor')::bigint*(rules->>'cap_percent')::int/100)
   OR COALESCE((_args->>'stacking')::boolean,false) THEN RAISE EXCEPTION 'REWARD_BALANCE_OR_DISCOUNT_LIMIT'; END IF;
  INSERT INTO care_reward_reservations(partner_id,points,product_code,discount_minor,rules_snapshot) VALUES(org,points,_args->>'productCode',points::bigint*(rules->>'point_value_minor')::bigint,rules) RETURNING care_reward_reservations.id INTO rid;
  left_points:=points;
  FOR e IN SELECT * FROM care_reward_entries WHERE partner_id=org AND delta>0 AND (expires_at IS NULL OR expires_at>now()) ORDER BY expires_at NULLS LAST,created_at,id FOR UPDATE LOOP
   SELECT e.delta+COALESCE((SELECT sum(delta) FROM care_reward_entries WHERE source_entry_id=e.id),0)-COALESCE((SELECT sum(a.points) FROM care_reward_allocations a JOIN care_reward_reservations rr ON rr.id=a.reservation_id WHERE a.entry_id=e.id AND rr.state='RESERVED'),0) INTO free;
   take:=LEAST(free,left_points);
   IF take>0 THEN INSERT INTO care_reward_allocations VALUES(rid,e.id,take); left_points:=left_points-take; END IF;
   EXIT WHEN left_points=0;
  END LOOP;
  IF left_points<>0 THEN RAISE EXCEPTION 'REWARDS_RECONCILIATION_REQUIRED'; END IF;
  result:=jsonb_build_object('id',rid,'status','RESERVED','method','Manual approval and fulfilment — store not connected','account_bound_partner_id',org);
 ELSIF _op='FULFIL' THEN
  IF r.state='FULFILLED' AND r.fulfilment_reference=reference THEN result:=jsonb_build_object('id',rid,'status','FULFILLED');
  ELSE
   IF r.state<>'RESERVED' OR length(COALESCE(reference,''))<3 OR length(COALESCE(_args->>'evidence',''))<3 THEN RAISE EXCEPTION 'VERIFIED_FULFILMENT_REQUIRED'; END IF;
   FOR e IN SELECT * FROM care_reward_allocations WHERE reservation_id=rid LOOP
    INSERT INTO care_reward_entries(partner_id,delta,event_key,reason,actor,source_entry_id)
    VALUES(org,-e.points,'redeem:'||rid||':'||e.entry_id,'Verified manual discount fulfilment',u,e.entry_id);
   END LOOP;
   UPDATE care_reward_reservations SET state='FULFILLED',fulfilment_reference=reference WHERE care_reward_reservations.id=rid;
   result:=jsonb_build_object('id',rid,'status','FULFILLED');
  END IF;
 ELSIF _op='RELEASE' THEN
  IF r.state<>'RESERVED' OR NOT COALESCE((_args->>'couponCannotBeUsed')::boolean,false) OR length(COALESCE(reference,''))<3 THEN RAISE EXCEPTION 'UNUSABLE_DISCOUNT_CONFIRMATION_REQUIRED'; END IF;
  UPDATE care_reward_reservations SET state='RELEASED',coupon_invalidated=true WHERE care_reward_reservations.id=rid;
  result:=jsonb_build_object('id',rid,'status','RELEASED');
 ELSE RAISE EXCEPTION 'UNKNOWN_REWARD_OPERATION'; END IF;
 INSERT INTO care_operations(key,operation,actor,request,result) VALUES(_key,'REWARD_'||_op,u,_args,result);
 INSERT INTO care_audit(actor,partner_id,action,entity_id,details) VALUES(u,org,'REWARD_'||_op,rid::text,jsonb_build_object('reference',reference,'key',_key));
 RETURN result;
END $$;

CREATE FUNCTION public.care_clinical_access(_c uuid,_u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM consultations c JOIN patients p ON p.id=c.patient_id
 LEFT JOIN doctors d ON d.id=c.assigned_doctor_id WHERE c.id=_c AND (p.auth_user_id=_u OR (d.auth_user_id=_u AND is_active_doctor(_u))))
$$;
CREATE FUNCTION public.care_document_access(_d uuid,_u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM care_documents d WHERE d.id=_d AND (care_clinical_access(d.consultation_id,_u)
 OR EXISTS(SELECT 1 FROM care_document_grants g WHERE g.document_id=d.id AND g.user_id=_u AND g.expires_at>now())))
$$;
CREATE FUNCTION public.care_finance_scope(_p uuid,_u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT care_finance(_u) OR can_manage_partner(_u,_p)
$$;
CREATE FUNCTION public.care_ops_scope(_p uuid,_u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT care_finance(_u) OR care_platform(_u) OR belongs_to_partner(_u,_p)
$$;
CREATE POLICY care_terms_read ON public.care_terms FOR SELECT TO authenticated USING(true);
CREATE POLICY care_permissions_read ON public.care_branch_permissions FOR SELECT TO authenticated USING(user_id=auth.uid() OR can_manage_partner(auth.uid(),partner_id) OR care_super(auth.uid()));
CREATE POLICY care_payment_read ON public.care_payments FOR SELECT TO authenticated USING(care_finance_scope(partner_id,auth.uid()) OR created_by=auth.uid());
CREATE POLICY care_lot_read ON public.care_credit_lots FOR SELECT TO authenticated USING(care_ops_scope(partner_id,auth.uid()));
CREATE POLICY care_hold_read ON public.care_holds FOR SELECT TO authenticated USING(care_ops_scope(partner_id,auth.uid()) OR care_clinical_access(consultation_id,auth.uid()));
CREATE POLICY care_usage_read ON public.care_annual_usage FOR SELECT TO authenticated USING(care_clinical_access(consultation_id,auth.uid()) OR EXISTS(SELECT 1 FROM memberships m WHERE m.id=membership_id AND care_ops_scope(m.care_sponsor_id,auth.uid())));
CREATE POLICY care_refund_read ON public.care_refunds FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM care_payments p WHERE p.id=payment_id AND care_finance_scope(p.partner_id,auth.uid())));
CREATE POLICY care_rewards_read ON public.care_reward_entries FOR SELECT TO authenticated USING(care_finance_scope(partner_id,auth.uid()));
CREATE POLICY care_redemption_read ON public.care_reward_reservations FOR SELECT TO authenticated USING(care_finance_scope(partner_id,auth.uid()));
CREATE POLICY care_document_read ON public.care_documents FOR SELECT TO authenticated USING(care_document_access(id,auth.uid()));
CREATE POLICY care_grant_read ON public.care_document_grants FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY care_reminder_read ON public.care_reminders FOR SELECT TO authenticated USING(care_ops_scope(partner_id,auth.uid()) OR EXISTS(SELECT 1 FROM patients p WHERE p.id=patient_id AND p.auth_user_id=auth.uid()));
CREATE POLICY care_escalation_read ON public.care_escalations FOR SELECT TO authenticated USING(requested_by=auth.uid() OR care_platform(auth.uid()));
CREATE POLICY care_audit_read ON public.care_audit FOR SELECT TO authenticated USING(care_finance_scope(partner_id,auth.uid()));

-- Permissive policies OR together: remove ALL old clinical policies, including finance/shop access.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('consultation_notes','patient_intakes') LOOP
  EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
 END LOOP;
END $$;
CREATE POLICY care_notes_read ON public.consultation_notes FOR SELECT TO authenticated USING(care_clinical_access(consultation_id,auth.uid()));
CREATE POLICY care_notes_write ON public.consultation_notes FOR INSERT TO authenticated WITH CHECK(is_active_doctor(auth.uid()) AND care_clinical_access(consultation_id,auth.uid()));
CREATE POLICY care_notes_update ON public.consultation_notes FOR UPDATE TO authenticated USING(is_active_doctor(auth.uid()) AND care_clinical_access(consultation_id,auth.uid())) WITH CHECK(is_active_doctor(auth.uid()) AND care_clinical_access(consultation_id,auth.uid()));
CREATE POLICY care_intakes_read ON public.patient_intakes FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM patients p WHERE p.id=patient_id AND p.auth_user_id=auth.uid()) OR EXISTS(SELECT 1 FROM consultations c WHERE c.patient_id=patient_intakes.patient_id AND care_clinical_access(c.id,auth.uid())));
CREATE POLICY care_intakes_insert ON public.patient_intakes FOR INSERT TO authenticated WITH CHECK(submitted_by=auth.uid() AND (EXISTS(SELECT 1 FROM patients p WHERE p.id=patient_id AND p.auth_user_id=auth.uid()) OR EXISTS(SELECT 1 FROM consultations c WHERE c.patient_id=patient_intakes.patient_id AND is_active_doctor(auth.uid()) AND care_clinical_access(c.id,auth.uid()))));

-- Prevent table/API clients from bypassing the new engine. Trigger uses invoker's
-- current_user; only SECURITY DEFINER owners perform financial writes.
CREATE FUNCTION public.care_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF current_user IN ('authenticated','anon') THEN
  IF TG_TABLE_NAME='partners' AND (NEW.credit_balance IS DISTINCT FROM OLD.credit_balance OR NEW.care_credit_model IS DISTINCT FROM OLD.care_credit_model) THEN RAISE EXCEPTION 'SERVER_LEDGER_ONLY'; END IF;
  IF TG_TABLE_NAME='consultations' AND (NEW.care_model OR (TG_OP='UPDATE' AND OLD.care_model)) THEN RAISE EXCEPTION 'CARE_RPC_ONLY'; END IF;
  IF TG_TABLE_NAME='memberships' AND (NEW.care_terms IS NOT NULL OR (TG_OP='UPDATE' AND OLD.care_terms IS NOT NULL)) THEN RAISE EXCEPTION 'CARE_RPC_ONLY'; END IF;
  IF TG_TABLE_NAME='credit_orders' AND EXISTS(SELECT 1 FROM public.partners WHERE id=NEW.partner_id AND care_credit_model='LOTS_V1') THEN RAISE EXCEPTION 'CARE_RPC_ONLY'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER care_partner_guard BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION care_guard();
CREATE TRIGGER care_consultation_guard BEFORE INSERT OR UPDATE ON public.consultations FOR EACH ROW EXECUTE FUNCTION care_guard();
CREATE TRIGGER care_membership_guard BEFORE INSERT OR UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION care_guard();
CREATE TRIGGER care_order_guard BEFORE INSERT OR UPDATE ON public.credit_orders FOR EACH ROW EXECUTE FUNCTION care_guard();
CREATE FUNCTION public.care_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_HISTORY_USE_COMPENSATING_ENTRY'; END $$;
CREATE TRIGGER care_ledger_immutable BEFORE UPDATE OR DELETE ON public.credit_transactions FOR EACH ROW EXECUTE FUNCTION care_immutable();
CREATE TRIGGER care_rewards_immutable BEFORE UPDATE OR DELETE ON public.care_reward_entries FOR EACH ROW EXECUTE FUNCTION care_immutable();
CREATE TRIGGER care_annual_immutable BEFORE UPDATE OR DELETE ON public.care_annual_usage FOR EACH ROW EXECUTE FUNCTION care_immutable();
CREATE TRIGGER care_audit_immutable BEFORE UPDATE OR DELETE ON public.care_audit FOR EACH ROW EXECUTE FUNCTION care_immutable();

ALTER FUNCTION public.apply_credit_transaction(uuid,public.credit_txn_type,integer,text,uuid,uuid,text,jsonb) RENAME TO care_legacy_credit_transaction;
REVOKE ALL ON FUNCTION public.care_legacy_credit_transaction(uuid,public.credit_txn_type,integer,text,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.apply_credit_transaction(_partner_id uuid,_type public.credit_txn_type,_quantity integer,_idempotency_key text,_consultation_id uuid DEFAULT NULL,_actor uuid DEFAULT NULL,_reference_id text DEFAULT NULL,_metadata jsonb DEFAULT '{}') RETURNS public.credit_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE existing credit_transactions; BEGIN
 IF auth.uid() IS NULL AND COALESCE(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
 PERFORM 1 FROM partners WHERE id=_partner_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM partners WHERE id=_partner_id AND care_credit_model='LOTS_V1') THEN RAISE EXCEPTION 'CARE_RPC_REQUIRED'; END IF;
 SELECT * INTO existing FROM credit_transactions WHERE idempotency_key=_idempotency_key;
 IF FOUND AND (existing.partner_id<>_partner_id OR existing.type<>_type OR existing.quantity<>_quantity OR existing.consultation_id IS DISTINCT FROM _consultation_id) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 RETURN care_legacy_credit_transaction(_partner_id,_type,_quantity,_idempotency_key,_consultation_id,_actor,_reference_id,_metadata);
END $$;
-- Public mutation/read entry points only; pure internal helpers inaccessible over RPC.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'care_%' LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,anon,authenticated,service_role';
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION care_command(text,jsonb,text),care_reward_command(text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION care_finance_scope(uuid,uuid),care_ops_scope(uuid,uuid),care_clinical_access(uuid,uuid),care_document_access(uuid,uuid),care_finance(uuid) TO authenticated;
REVOKE ALL ON FUNCTION apply_credit_transaction(uuid,credit_txn_type,integer,text,uuid,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION apply_credit_transaction(uuid,credit_txn_type,integer,text,uuid,uuid,text,jsonb) TO authenticated,service_role;

-- Private document bucket only. Metadata and object ACL both require authorisation.
INSERT INTO storage.buckets(id,name,public) VALUES('care-documents','care-documents',false) ON CONFLICT(id) DO UPDATE SET public=false;
CREATE POLICY care_storage_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='care-documents' AND EXISTS(SELECT 1 FROM public.care_documents d WHERE d.object_path=name AND public.care_document_access(d.id,auth.uid())));

GRANT EXECUTE ON FUNCTION care_super(uuid),care_platform(uuid),care_coordinator(uuid) TO authenticated;
