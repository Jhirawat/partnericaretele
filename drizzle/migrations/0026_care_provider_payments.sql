-- Optional test gateway. No checkout or live environment is enabled by migration.
ALTER TABLE public.care_payments ADD COLUMN provider_environment text CHECK(provider_environment IN ('sandbox','live'));
ALTER TABLE public.care_payments ADD COLUMN provider_checkout_id text UNIQUE;
CREATE FUNCTION public.care_prepare_checkout(_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p care_payments; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
 SELECT * INTO p FROM care_payments WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR p.created_by<>auth.uid() OR p.collector<>'THAIKANYA' OR p.status<>'PENDING' THEN RAISE EXCEPTION 'CHECKOUT_NOT_AVAILABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM care_terms WHERE id=p.terms_id AND active) THEN RAISE EXCEPTION 'TERMS_NOT_ACTIVE'; END IF;
 UPDATE care_payments SET provider='STRIPE',provider_environment='sandbox' WHERE id=_id;
 RETURN to_jsonb(p)||jsonb_build_object('provider','STRIPE','provider_environment','sandbox');
END $$;
CREATE FUNCTION public.care_provider_payment_event(_event_id text,_type text,_payment_id uuid,_reference text,_amount_minor bigint,_currency text,_livemode boolean,_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p care_payments; old care_payment_events; result jsonb; BEGIN
 IF COALESCE(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'TRUSTED_PROVIDER_SERVER_REQUIRED'; END IF;
 IF length(COALESCE(_event_id,''))<3 OR length(COALESCE(_hash,''))<16 THEN RAISE EXCEPTION 'VERIFIED_EVENT_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('stripe:'||_event_id,0));
 SELECT * INTO old FROM care_payment_events WHERE provider='STRIPE' AND event_id=_event_id;
 IF FOUND THEN
  IF old.payment_id<>_payment_id OR old.payload_hash IS DISTINCT FROM _hash THEN RAISE EXCEPTION 'PROVIDER_EVENT_CONFLICT'; END IF;
  RETURN jsonb_build_object('duplicate',true);
 END IF;
 SELECT * INTO p FROM care_payments WHERE id=_payment_id FOR UPDATE;
 IF NOT FOUND OR p.provider<>'STRIPE' OR p.provider_environment IS NULL OR _livemode<>(p.provider_environment='live') THEN RAISE EXCEPTION 'PAYMENT_ENVIRONMENT_MISMATCH'; END IF;
 IF _currency<>'THB' OR p.amount_minor<>_amount_minor THEN RAISE EXCEPTION 'PAYMENT_AMOUNT_MISMATCH'; END IF;
 IF _type='PAID' THEN
  IF p.provider_checkout_id IS NOT NULL AND p.provider_checkout_id<>_reference THEN RAISE EXCEPTION 'CHECKOUT_OWNERSHIP_MISMATCH'; END IF;
  IF p.status='PENDING' THEN result:=care_settle(p.id,_reference,'SIGNED_STRIPE_EVENT:'||_event_id,NULL,'STRIPE');
  ELSIF p.status='PAID' AND p.external_reference=_reference THEN result:=jsonb_build_object('status','PAID');
  ELSE result:=jsonb_build_object('status',p.status,'ignored','TERMINAL_PAYMENT_STATE'); END IF;
 ELSIF _type IN ('REFUNDED','DISPUTED') THEN
  -- External adverse events freeze new usage. Existing holds are retained and
  -- reconciled by finance; never blindly remove used units or release an encounter.
  UPDATE care_payments SET status='DISPUTED' WHERE id=p.id;
  IF p.membership_id IS NOT NULL THEN UPDATE memberships SET status='CANCELLED' WHERE id=p.membership_id; END IF;
  IF p.kind='CREDITS' THEN PERFORM 1 FROM partners WHERE id=p.partner_id FOR UPDATE; PERFORM care_post(p.partner_id,NULL,'ADJUSTMENT',0,'care:provider-freeze:'||_event_id,NULL,_event_id,jsonb_build_object('payment_id',p.id,'frozen',true)); END IF;
  INSERT INTO integration_conflicts(partner_id,conflict_type,details) VALUES(p.partner_id,'CARE_PAYMENT_'||_type,jsonb_build_object('payment_id',p.id,'event_id',_event_id,'requires_finance_reconciliation',true));
  result:=jsonb_build_object('status','DISPUTED','requires_finance_reconciliation',true);
 ELSE result:=jsonb_build_object('status',p.status,'ignored',true); END IF;
 INSERT INTO care_payment_events(payment_id,provider,event_id,event_type,payload_hash) VALUES(p.id,'STRIPE',_event_id,_type,_hash);
 INSERT INTO care_audit(partner_id,action,entity_id,details) VALUES(p.partner_id,'PROVIDER_'||_type,p.id::text,jsonb_build_object('event_id',_event_id));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION care_prepare_checkout(uuid),care_provider_payment_event(text,text,uuid,text,bigint,text,boolean,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION care_prepare_checkout(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION care_provider_payment_event(text,text,uuid,text,bigint,text,boolean,text) TO service_role;
