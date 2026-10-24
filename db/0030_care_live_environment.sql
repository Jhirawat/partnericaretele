-- Dormant live-payment support (additive). Applied after drizzle 0021-0029.
-- Environment is chosen only by the trusted server (service_role).
ALTER TABLE public.care_payments ADD COLUMN IF NOT EXISTS provider_environment_locked_at timestamptz;

CREATE OR REPLACE FUNCTION public.care_prepare_checkout(_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p care_payments; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
 SELECT * INTO p FROM care_payments WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR p.created_by<>auth.uid() OR p.collector<>'THAIKANYA' OR p.status<>'PENDING' THEN RAISE EXCEPTION 'CHECKOUT_NOT_AVAILABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM care_terms WHERE id=p.terms_id AND active) THEN RAISE EXCEPTION 'TERMS_NOT_ACTIVE'; END IF;
 IF p.provider_environment_locked_at IS NOT NULL AND p.provider_environment<>'sandbox' THEN RAISE EXCEPTION 'PAYMENT_ENVIRONMENT_LOCKED'; END IF;
 UPDATE care_payments SET provider='STRIPE',provider_environment='sandbox' WHERE id=_id;
 RETURN to_jsonb(p)||jsonb_build_object('provider','STRIPE','provider_environment','sandbox');
END $$;

CREATE OR REPLACE FUNCTION public.care_prepare_checkout_server(_id uuid,_user uuid,_environment text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p care_payments; BEGIN
 IF COALESCE(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'TRUSTED_PROVIDER_SERVER_REQUIRED'; END IF;
 IF _user IS NULL OR _environment IS NULL OR _environment NOT IN ('sandbox','live') THEN RAISE EXCEPTION 'INVALID_CHECKOUT_REQUEST'; END IF;
 SELECT * INTO p FROM care_payments WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR p.created_by<>_user OR p.collector<>'THAIKANYA' OR p.status<>'PENDING' THEN RAISE EXCEPTION 'CHECKOUT_NOT_AVAILABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM care_terms WHERE id=p.terms_id AND active) THEN RAISE EXCEPTION 'TERMS_NOT_ACTIVE'; END IF;
 IF p.provider_environment_locked_at IS NOT NULL AND p.provider_environment<>_environment THEN RAISE EXCEPTION 'PAYMENT_ENVIRONMENT_LOCKED'; END IF;
 UPDATE care_payments SET provider='STRIPE',provider_environment=_environment WHERE id=_id;
 RETURN jsonb_build_object('id',p.id,'partner_id',p.partner_id,'kind',p.kind,'amount_minor',p.amount_minor,'currency','THB','provider_environment',_environment);
END $$;

CREATE OR REPLACE FUNCTION public.care_bind_checkout(_id uuid,_environment text,_checkout_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p care_payments; BEGIN
 IF COALESCE(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'TRUSTED_PROVIDER_SERVER_REQUIRED'; END IF;
 SELECT * INTO p FROM care_payments WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR p.status<>'PENDING' OR p.provider_environment IS DISTINCT FROM _environment THEN RAISE EXCEPTION 'PAYMENT_ENVIRONMENT_MISMATCH'; END IF;
 IF p.provider_checkout_id IS NOT NULL AND p.provider_checkout_id<>_checkout_id THEN RAISE EXCEPTION 'CHECKOUT_OWNERSHIP_MISMATCH'; END IF;
 UPDATE care_payments SET provider_checkout_id=_checkout_id,provider_environment_locked_at=COALESCE(provider_environment_locked_at,now()) WHERE id=_id;
END $$;

CREATE OR REPLACE FUNCTION public.care_provider_payment_event_v2(_event_id text,_type text,_payment_id uuid,_reference text,_amount_minor bigint,_currency text,_livemode boolean,_hash text,_partner_id uuid,_environment text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE p care_payments; BEGIN
 IF COALESCE(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'TRUSTED_PROVIDER_SERVER_REQUIRED'; END IF;
 IF _environment IS NULL OR _environment NOT IN ('sandbox','live') OR _livemode<>(_environment='live') THEN RAISE EXCEPTION 'PAYMENT_ENVIRONMENT_MISMATCH'; END IF;
 SELECT * INTO p FROM care_payments WHERE id=_payment_id;
 IF NOT FOUND OR p.provider_environment IS DISTINCT FROM _environment THEN RAISE EXCEPTION 'PAYMENT_ENVIRONMENT_MISMATCH'; END IF;
 IF p.partner_id IS DISTINCT FROM _partner_id THEN RAISE EXCEPTION 'PAYMENT_ORG_MISMATCH'; END IF;
 RETURN care_provider_payment_event(_event_id,_type,_payment_id,_reference,_amount_minor,_currency,_livemode,_hash);
END $$;

REVOKE ALL ON FUNCTION public.care_prepare_checkout_server(uuid,uuid,text), public.care_bind_checkout(uuid,text,text), public.care_provider_payment_event_v2(text,text,uuid,text,bigint,text,boolean,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.care_prepare_checkout_server(uuid,uuid,text), public.care_bind_checkout(uuid,text,text), public.care_provider_payment_event_v2(text,text,uuid,text,bigint,text,boolean,text,uuid,text) TO service_role;
