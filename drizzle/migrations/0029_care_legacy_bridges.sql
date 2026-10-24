-- Keep historical units on the SAME organisation wallet until explicit reconciliation.
-- Stop new legacy purchases; fulfil actual historical orders atomically.
CREATE FUNCTION public.care_settle_historical_order(_id uuid,_reference text,_evidence text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); o credit_orders; balance integer; existing credit_transactions; BEGIN
 PERFORM care_require_strong(); IF NOT care_finance(u) OR length(COALESCE(_reference,''))<3 OR length(COALESCE(_evidence,''))<3 THEN RAISE EXCEPTION 'VERIFIED_FINANCE_EVIDENCE_REQUIRED'; END IF;
 SELECT * INTO o FROM credit_orders WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR o.status='CANCELLED' THEN RAISE EXCEPTION 'HISTORICAL_ORDER_NOT_SETTLEABLE'; END IF;
 SELECT credit_balance INTO balance FROM partners WHERE id=o.partner_id AND care_credit_model='LEGACY_PENDING' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'HISTORICAL_ORDER_RECONCILIATION_REQUIRED'; END IF;
 SELECT * INTO existing FROM credit_transactions WHERE idempotency_key='order:'||o.id;
 IF FOUND THEN RETURN jsonb_build_object('id',o.id,'status','PAID','duplicate',true); END IF;
 IF o.credits<=0 THEN RAISE EXCEPTION 'INVALID_HISTORICAL_QUANTITY'; END IF;
 UPDATE partners SET credit_balance=credit_balance+o.credits WHERE id=o.partner_id;
 INSERT INTO credit_transactions(partner_id,type,quantity,balance_after,idempotency_key,reference_id,created_by,metadata)
 VALUES(o.partner_id,'PURCHASE',o.credits,balance+o.credits,'order:'||o.id,_reference,u,jsonb_build_object('order_code',o.order_code,'evidence',_evidence,'basis','LEGACY_PENDING'));
 UPDATE credit_orders SET status='PAID',approved_by=u,approved_at=now(),payment_reference=_reference WHERE id=o.id;
 INSERT INTO care_audit(actor,partner_id,action,entity_id,details) VALUES(u,o.partner_id,'HISTORICAL_ORDER_SETTLED',o.id::text,jsonb_build_object('reference',_reference));
 RETURN jsonb_build_object('id',o.id,'status','PAID','order_code',o.order_code);
END $$;
REVOKE ALL ON FUNCTION care_settle_historical_order(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION care_settle_historical_order(uuid,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.apply_credit_transaction(_partner_id uuid,_type public.credit_txn_type,_quantity integer,_idempotency_key text,_consultation_id uuid DEFAULT NULL,_actor uuid DEFAULT NULL,_reference_id text DEFAULT NULL,_metadata jsonb DEFAULT '{}') RETURNS public.credit_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); trusted boolean:=COALESCE(auth.role(),'')='service_role'; c consultations; tx credit_transactions; balance integer; delta integer; BEGIN
 IF u IS NULL AND NOT trusted THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
 SELECT credit_balance INTO balance FROM partners WHERE id=_partner_id AND care_credit_model='LEGACY_PENDING' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CARE_RPC_REQUIRED'; END IF;
 IF _type='PURCHASE' THEN RAISE EXCEPTION 'HISTORICAL_SETTLEMENT_RPC_REQUIRED'; END IF;
 IF _type IN ('ADJUSTMENT','REFUND') THEN
  PERFORM care_require_strong(); IF NOT care_finance(u) OR length(COALESCE(_metadata->>'reason',''))<3 THEN RAISE EXCEPTION 'FINANCE_REASON_REQUIRED'; END IF;
 ELSE
  SELECT * INTO c FROM consultations WHERE id=_consultation_id AND partner_id=_partner_id AND NOT care_model FOR UPDATE;
  IF NOT FOUND OR _quantity<>1 THEN RAISE EXCEPTION 'HISTORICAL_ENCOUNTER_BINDING_REQUIRED'; END IF;
  IF _type='CONSUME' THEN
   IF NOT trusted AND NOT (is_active_doctor(u) AND EXISTS(SELECT 1 FROM doctors WHERE id=c.assigned_doctor_id AND auth_user_id=u)) THEN RAISE EXCEPTION 'ASSIGNED_CLINICIAN_REQUIRED'; END IF;
  ELSIF NOT trusted AND NOT (care_platform(u) OR belongs_to_partner(u,_partner_id) OR (is_active_doctor(u) AND care_clinical_access(c.id,u))) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 END IF;
 SELECT * INTO tx FROM credit_transactions WHERE idempotency_key=_idempotency_key;
 IF FOUND THEN IF tx.partner_id<>_partner_id OR tx.type<>_type OR tx.quantity<>_quantity OR tx.consultation_id IS DISTINCT FROM _consultation_id THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF; RETURN tx; END IF;
 IF _type='RESERVE' AND (c.credit_status<>'NOT_REQUIRED' OR c.status NOT IN ('CREATED','WAITING')) THEN RAISE EXCEPTION 'INVALID_RESERVATION'; END IF;
 IF _type IN ('CONSUME','RELEASE') AND c.credit_status<>'RESERVED' THEN RAISE EXCEPTION 'NO_ACTIVE_RESERVATION'; END IF;
 IF _type='CONSUME' AND c.status<>'COMPLETED' THEN RAISE EXCEPTION 'VERIFIED_COMPLETION_REQUIRED'; END IF;
 IF _type='RELEASE' AND c.status IN ('STARTED','COMPLETED') AND NOT trusted AND NOT is_active_doctor(u) THEN RAISE EXCEPTION 'CLINICAL_RELEASE_REVIEW_REQUIRED'; END IF;
 delta:=CASE _type WHEN 'RESERVE' THEN -1 WHEN 'CONSUME' THEN 0 WHEN 'RELEASE' THEN 1 ELSE _quantity END;
 IF balance+delta<0 THEN RAISE EXCEPTION 'INSUFFICIENT_CREDITS'; END IF;
 UPDATE partners SET credit_balance=balance+delta WHERE id=_partner_id;
 INSERT INTO credit_transactions(partner_id,consultation_id,type,quantity,balance_after,idempotency_key,reference_id,created_by,metadata)
 VALUES(_partner_id,_consultation_id,_type,_quantity,balance+delta,_idempotency_key,_reference_id,u,_metadata) RETURNING * INTO tx;
 IF _type IN ('RESERVE','CONSUME','RELEASE') THEN UPDATE consultations SET credit_status=CASE _type WHEN 'RESERVE' THEN 'RESERVED'::credit_status WHEN 'CONSUME' THEN 'CONSUMED'::credit_status ELSE 'RELEASED'::credit_status END WHERE id=c.id; END IF;
 RETURN tx;
END $$;
CREATE FUNCTION public.care_historical_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF current_user IN ('authenticated','anon') THEN
  IF TG_TABLE_NAME='credit_orders' AND TG_OP='INSERT' THEN RAISE EXCEPTION 'USE_REVIEWED_CARE_PURCHASE'; END IF;
  IF TG_TABLE_NAME='credit_orders' AND TG_OP IN ('UPDATE','DELETE') THEN RAISE EXCEPTION 'VERIFIED_SETTLEMENT_RPC_REQUIRED'; END IF;
  IF TG_TABLE_NAME='consultations' AND TG_OP='UPDATE' AND NOT NEW.care_model AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('STARTED','COMPLETED') THEN
   IF NOT public.is_active_doctor(auth.uid()) OR NOT public.care_clinical_access(NEW.id,auth.uid()) THEN RAISE EXCEPTION 'ASSIGNED_CLINICIAN_REQUIRED'; END IF;
  END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER care_historical_order_guard BEFORE INSERT OR UPDATE OR DELETE ON public.credit_orders FOR EACH ROW EXECUTE FUNCTION care_historical_guard();
CREATE TRIGGER care_historical_clinical_guard BEFORE UPDATE ON public.consultations FOR EACH ROW EXECUTE FUNCTION care_historical_guard();
CREATE FUNCTION public.care_cancel_existing(_id uuid,_reason text,_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c consultations; u uuid:=auth.uid(); BEGIN
 IF u IS NULL OR length(COALESCE(_reason,''))<3 THEN RAISE EXCEPTION 'AUTHENTICATED_REASON_REQUIRED'; END IF;
 SELECT * INTO c FROM consultations WHERE id=_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'ENCOUNTER_NOT_FOUND'; END IF;
 IF c.care_model THEN RETURN care_command('CANCEL',jsonb_build_object('id',_id,'reason',_reason),_key); END IF;
 IF NOT (care_platform(u) OR belongs_to_partner(u,c.partner_id)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 PERFORM 1 FROM partners WHERE id=c.partner_id FOR UPDATE;
 SELECT * INTO c FROM consultations WHERE id=_id FOR UPDATE;
 IF c.status='CANCELLED' THEN RETURN jsonb_build_object('id',c.id,'status','CANCELLED'); END IF;
 IF c.status NOT IN ('CREATED','WAITING') THEN RAISE EXCEPTION 'CANCEL_BEFORE_START_ONLY'; END IF;
 IF c.credit_status='RESERVED' THEN
  PERFORM apply_credit_transaction(c.partner_id,'RELEASE',1,'release:'||c.id,c.id,u,NULL,jsonb_build_object('reason',_reason));
 END IF;
 UPDATE consultations SET status='CANCELLED',cancellation_reason=_reason WHERE id=c.id;
 INSERT INTO care_audit(actor,partner_id,action,entity_id,details) VALUES(u,c.partner_id,'HISTORICAL_ENCOUNTER_CANCELLED',c.id::text,jsonb_build_object('reason',_reason));
 RETURN jsonb_build_object('id',c.id,'status','CANCELLED');
END $$;
REVOKE ALL ON FUNCTION care_cancel_existing(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION care_cancel_existing(uuid,text,text) TO authenticated;
