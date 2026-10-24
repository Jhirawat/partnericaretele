-- ADDITIVE, REVIEW FIRST. Reuse existing wallet/ledger/consultations/memberships; no balance conversion.
ALTER TABLE public.partners ADD COLUMN care_credit_model text NOT NULL DEFAULT 'LEGACY_PENDING' CHECK(care_credit_model IN ('LEGACY_PENDING','LOTS_V1'));
ALTER TABLE public.consultations ADD COLUMN care_model boolean NOT NULL DEFAULT false;
ALTER TABLE public.consultations ADD COLUMN care_location_id uuid REFERENCES public.locations(id);
ALTER TABLE public.consultations ADD COLUMN care_membership_id uuid REFERENCES public.memberships(id);
ALTER TABLE public.consultations ADD COLUMN care_payment_id uuid;
ALTER TABLE public.consultations ADD COLUMN care_kind text CHECK(care_kind IN ('PARTNER','ANNUAL','DIRECT'));
ALTER TABLE public.memberships ADD COLUMN care_terms jsonb;
ALTER TABLE public.memberships ADD COLUMN care_channel text CHECK(care_channel IN ('DIRECT','PARTNER'));
ALTER TABLE public.memberships ADD COLUMN care_sponsor_id uuid REFERENCES public.partners(id);
ALTER TABLE public.memberships ADD COLUMN care_activation_id text UNIQUE;
ALTER TABLE public.memberships ADD COLUMN care_collector text;
ALTER TABLE public.memberships ADD COLUMN care_used integer NOT NULL DEFAULT 0 CHECK(care_used BETWEEN 0 AND 12);
ALTER TABLE public.patients ADD COLUMN service_reminder_consent boolean NOT NULL DEFAULT false;
ALTER TABLE public.patients ADD COLUMN marketing_consent boolean NOT NULL DEFAULT false;
CREATE TABLE public.care_terms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version text NOT NULL UNIQUE, settings jsonb NOT NULL,
 active boolean NOT NULL DEFAULT false, approved_by uuid, approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX care_one_active_terms ON public.care_terms((active)) WHERE active;
INSERT INTO public.care_terms(version,settings) VALUES ('care-2026-proposed', '{
 "packs":{"25":1000000,"50":2000000,"100":4000000},"starter":50,"credit_expiry_months":24,
 "retail_minor":60000,"annual_minor":600000,"annual_units":12,"annual_months":12,"currency":"THB",
 "terms_approved":false,"tax_approved":false,"refund_approved":false,"no_show_approved":false,
 "hold_expiry_approved":false,"cancel_approved":false,"technical_failure_approved":false,
 "hold_survives_expiry":true,"clinician_estimate_minor":30000,"out_of_hours_enabled":false,
 "rewards_enabled":false,"clinical_live":false,"manual_clinical_enabled":false,
 "accounting_approved":false,"email_enabled":false,"gateway_enabled":false
 }');
CREATE TABLE public.care_branch_permissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, partner_id uuid NOT NULL REFERENCES public.partners(id),
 location_id uuid NOT NULL REFERENCES public.locations(id), queue_allowed boolean NOT NULL DEFAULT false,
 monthly_limit integer CHECK(monthly_limit>=0), UNIQUE(user_id,location_id)
);
CREATE TABLE public.care_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid REFERENCES public.partners(id), patient_id uuid REFERENCES public.patients(id),
 kind text NOT NULL CHECK(kind IN ('CREDITS','ANNUAL','DIRECT')), channel text NOT NULL CHECK(channel IN ('DIRECT','PARTNER')),
 collector text NOT NULL, provider text NOT NULL DEFAULT 'MANUAL' CHECK(provider IN ('MANUAL','STRIPE')),
 amount_minor bigint NOT NULL CHECK(amount_minor>0), currency text NOT NULL DEFAULT 'THB' CHECK(currency='THB'),
 credits integer CHECK(credits IN (25,50,100)), terms_id uuid NOT NULL REFERENCES public.care_terms(id), snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','REFUNDED','DISPUTED')),
 external_reference text, evidence_reference text, verified_by uuid,
 credit_order_id uuid REFERENCES public.credit_orders(id), membership_id uuid REFERENCES public.memberships(id),
 created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz,
 UNIQUE(provider,collector,external_reference),
 CHECK((kind='CREDITS' AND partner_id IS NOT NULL AND credits IS NOT NULL) OR (kind<>'CREDITS' AND patient_id IS NOT NULL))
);
ALTER TABLE public.consultations ADD CONSTRAINT care_payment_fk FOREIGN KEY(care_payment_id) REFERENCES public.care_payments(id);
CREATE TABLE public.care_payment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL REFERENCES public.care_payments(id),
 provider text NOT NULL, event_id text NOT NULL, event_type text NOT NULL, payload_hash text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider,event_id)
);
CREATE TABLE public.care_credit_lots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES public.partners(id), payment_id uuid UNIQUE REFERENCES public.care_payments(id),
 granted integer NOT NULL CHECK(granted>0), used integer NOT NULL DEFAULT 0 CHECK(used>=0), voided integer NOT NULL DEFAULT 0 CHECK(voided>=0),
 expires_at timestamptz NOT NULL, purchased_at timestamptz NOT NULL DEFAULT now(), snapshot jsonb NOT NULL,
 opening_reference text, CHECK(used+voided<=granted)
);
CREATE INDEX care_lots_fefo ON public.care_credit_lots(partner_id,expires_at,purchased_at,id);
CREATE TABLE public.care_holds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), consultation_id uuid NOT NULL UNIQUE REFERENCES public.consultations(id),
 partner_id uuid NOT NULL REFERENCES public.partners(id), lot_id uuid REFERENCES public.care_credit_lots(id),
 membership_id uuid REFERENCES public.memberships(id), payment_id uuid REFERENCES public.care_payments(id),
 state text NOT NULL DEFAULT 'RESERVED' CHECK(state IN ('RESERVED','CONSUMED','RELEASED','REVERSED')),
 created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, terms_snapshot jsonb NOT NULL DEFAULT '{}',
 CHECK(lot_id IS NOT NULL OR membership_id IS NOT NULL OR payment_id IS NOT NULL)
);
CREATE INDEX care_active_lot_holds ON public.care_holds(lot_id) WHERE state='RESERVED';
CREATE TABLE public.care_annual_usage (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), membership_id uuid NOT NULL REFERENCES public.memberships(id),
 consultation_id uuid NOT NULL REFERENCES public.consultations(id), action text NOT NULL CHECK(action IN ('RESERVE','CONSUME','RELEASE','REVERSE')),
 actor uuid, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(consultation_id,action)
);
CREATE TABLE public.care_refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL UNIQUE REFERENCES public.care_payments(id),
 amount_minor bigint NOT NULL CHECK(amount_minor>0), reference text NOT NULL UNIQUE, reason text NOT NULL,
 actor uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.care_reward_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES public.partners(id),
 delta integer NOT NULL CHECK(delta<>0), event_key text NOT NULL UNIQUE, payment_id uuid REFERENCES public.care_payments(id),
 reason text NOT NULL, actor uuid NOT NULL, expires_at timestamptz, eligible_spend_minor bigint, rules_snapshot jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.care_reward_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES public.partners(id), points integer NOT NULL CHECK(points>0),
 product_code text NOT NULL, discount_minor bigint NOT NULL DEFAULT 0 CHECK(discount_minor>=0), rules_snapshot jsonb NOT NULL DEFAULT '{}', state text NOT NULL DEFAULT 'RESERVED' CHECK(state IN ('RESERVED','FULFILLED','RELEASED')),
 fulfilment_reference text UNIQUE, coupon_invalidated boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.care_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), consultation_id uuid NOT NULL REFERENCES public.consultations(id),
 provider_reference text NOT NULL UNIQUE, object_path text NOT NULL UNIQUE, document_date timestamptz NOT NULL, kind text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.care_document_grants (
 document_id uuid NOT NULL REFERENCES public.care_documents(id), user_id uuid NOT NULL, expires_at timestamptz NOT NULL,
 granted_by uuid NOT NULL, PRIMARY KEY(document_id,user_id)
);
CREATE TABLE public.care_reminders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), patient_id uuid NOT NULL REFERENCES public.patients(id), partner_id uuid REFERENCES public.partners(id),
 due_at timestamptz NOT NULL, purpose text NOT NULL CHECK(purpose IN ('SERVICE','MARKETING')),
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SENT','FAILED','CANCELLED')),
 channel text NOT NULL DEFAULT 'EMAIL' CHECK(channel='EMAIL'), idempotency_key text NOT NULL UNIQUE,
 sent_at timestamptz, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.care_escalations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), membership_id uuid NOT NULL REFERENCES public.memberships(id), reason text NOT NULL,
 requested_by uuid NOT NULL, proposed_partner_id uuid REFERENCES public.partners(id),
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','REVIEWED','RESOLVED')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.care_operations (
 key text PRIMARY KEY, operation text NOT NULL, actor uuid NOT NULL, request jsonb NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.care_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor uuid, partner_id uuid REFERENCES public.partners(id),
 action text NOT NULL, entity_id text, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
-- New tables have no client mutation privileges. RLS reads added in 0023.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['care_terms','care_branch_permissions','care_payments','care_payment_events','care_credit_lots','care_holds','care_annual_usage','care_refunds','care_reward_entries','care_reward_reservations','care_documents','care_document_grants','care_reminders','care_escalations','care_operations','care_audit'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 END LOOP;
END $$;
