-- ===== Enums =====
CREATE TYPE public.webhook_processing_status AS ENUM ('RECEIVED','PROCESSING','PROCESSED','FAILED','IGNORED');
CREATE TYPE public.credit_txn_type AS ENUM ('PURCHASE','RESERVE','CONSUME','RELEASE','ADJUSTMENT','REFUND');
CREATE TYPE public.credit_order_status AS ENUM ('PENDING','AWAITING_PAYMENT','PAID','CANCELLED');
CREATE TYPE public.membership_status AS ENUM ('PENDING','ACTIVE','EXPIRED','CANCELLED');
CREATE TYPE public.notification_channel AS ENUM ('EMAIL','WHATSAPP','LINE');
CREATE TYPE public.notification_status AS ENUM ('QUEUED','SENT','DELIVERED','FAILED','SKIPPED');
CREATE TYPE public.conflict_status AS ENUM ('OPEN','RESOLVED');

-- ===== Platform settings =====
CREATE TABLE public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings readable by staff" ON public.platform_settings FOR SELECT TO authenticated
  USING (public.is_platform_staff(auth.uid()));
CREATE POLICY "settings writable by platform admins" ON public.platform_settings FOR ALL TO authenticated
  USING (public.can_write_platform(auth.uid())) WITH CHECK (public.can_write_platform(auth.uid()));
GRANT INSERT, UPDATE ON public.platform_settings TO authenticated;

INSERT INTO public.platform_settings (key, value) VALUES
  ('mcs', '{"enabled": false, "mode": "MOCK", "replay_window_seconds": 300}'::jsonb),
  ('credits', '{"consume_on": "COMPLETED", "release_on_cancel": true, "reserve_quantity": 1}'::jsonb);

-- ===== Webhook events =====
CREATE TABLE public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'MCS',
  external_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_hash TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processing_status public.webhook_processing_status NOT NULL DEFAULT 'RECEIVED',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE UNIQUE INDEX webhook_events_provider_event_idx ON public.webhook_events (provider, external_event_id);
CREATE INDEX webhook_events_received_idx ON public.webhook_events (received_at DESC);
GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook events readable by staff" ON public.webhook_events FOR SELECT TO authenticated
  USING (public.is_platform_staff(auth.uid()));

-- ===== Integration conflicts =====
CREATE TABLE public.integration_conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  consultation_id UUID REFERENCES public.consultations(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  conflict_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.conflict_status NOT NULL DEFAULT 'OPEN',
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.integration_conflicts TO authenticated;
GRANT ALL ON public.integration_conflicts TO service_role;
ALTER TABLE public.integration_conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conflicts readable by staff and partner" ON public.integration_conflicts FOR SELECT TO authenticated
  USING (public.is_platform_staff(auth.uid()) OR public.belongs_to_partner(auth.uid(), partner_id));
CREATE POLICY "conflicts resolvable by platform" ON public.integration_conflicts FOR UPDATE TO authenticated
  USING (public.can_write_platform(auth.uid())) WITH CHECK (public.can_write_platform(auth.uid()));

-- ===== Credit ledger =====
CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  consultation_id UUID REFERENCES public.consultations(id) ON DELETE SET NULL,
  type public.credit_txn_type NOT NULL,
  quantity INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reference_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX credit_transactions_partner_idx ON public.credit_transactions (partner_id, created_at DESC);
GRANT SELECT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger readable in scope" ON public.credit_transactions FOR SELECT TO authenticated
  USING (public.is_platform_staff(auth.uid()) OR public.belongs_to_partner(auth.uid(), partner_id));

-- Atomic ledger primitive: locks the partner row, enforces balance, is idempotent.
CREATE OR REPLACE FUNCTION public.apply_credit_transaction(
  _partner_id UUID,
  _type public.credit_txn_type,
  _quantity INTEGER,
  _idempotency_key TEXT,
  _consultation_id UUID DEFAULT NULL,
  _actor UUID DEFAULT NULL,
  _reference_id TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS public.credit_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing public.credit_transactions;
  current_balance INTEGER;
  delta INTEGER;
  new_balance INTEGER;
  inserted public.credit_transactions;
BEGIN
  SELECT * INTO existing FROM public.credit_transactions WHERE idempotency_key = _idempotency_key;
  IF FOUND THEN
    RETURN existing;
  END IF;

  IF _quantity <= 0 AND _type IN ('PURCHASE','RESERVE','CONSUME','RELEASE') THEN
    RAISE EXCEPTION 'quantity must be positive for %', _type;
  END IF;

  SELECT credit_balance INTO current_balance FROM public.partners WHERE id = _partner_id FOR UPDATE;
  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'partner not found';
  END IF;

  delta := CASE _type
    WHEN 'PURCHASE' THEN _quantity
    WHEN 'RESERVE' THEN -_quantity
    WHEN 'CONSUME' THEN 0
    WHEN 'RELEASE' THEN _quantity
    ELSE _quantity
  END;

  new_balance := current_balance + delta;
  IF new_balance < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  IF delta <> 0 THEN
    UPDATE public.partners SET credit_balance = new_balance WHERE id = _partner_id;
  END IF;

  INSERT INTO public.credit_transactions
    (partner_id, consultation_id, type, quantity, balance_after, reference_id, idempotency_key, created_by, metadata)
  VALUES
    (_partner_id, _consultation_id, _type, _quantity, new_balance, _reference_id, _idempotency_key, _actor, COALESCE(_metadata, '{}'::jsonb))
  RETURNING * INTO inserted;

  RETURN inserted;
END; $$;

REVOKE ALL ON FUNCTION public.apply_credit_transaction(UUID, public.credit_txn_type, INTEGER, TEXT, UUID, UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_credit_transaction(UUID, public.credit_txn_type, INTEGER, TEXT, UUID, UUID, TEXT, JSONB) TO authenticated, service_role;

-- ===== Credit orders (invoice / manual settlement) =====
CREATE TABLE public.credit_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code TEXT NOT NULL UNIQUE DEFAULT ('ORD-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  package_code TEXT NOT NULL DEFAULT 'PARTNERCARE_1200',
  credits INTEGER NOT NULL DEFAULT 1200,
  amount NUMERIC(12,2) NOT NULL DEFAULT 400000,
  currency TEXT NOT NULL DEFAULT 'THB',
  status public.credit_order_status NOT NULL DEFAULT 'AWAITING_PAYMENT',
  payment_method TEXT NOT NULL DEFAULT 'INVOICE',
  payment_reference TEXT,
  notes TEXT,
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX credit_orders_partner_idx ON public.credit_orders (partner_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.credit_orders TO authenticated;
GRANT ALL ON public.credit_orders TO service_role;
ALTER TABLE public.credit_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders readable in scope" ON public.credit_orders FOR SELECT TO authenticated
  USING (public.is_platform_staff(auth.uid()) OR public.belongs_to_partner(auth.uid(), partner_id));
CREATE POLICY "orders created by platform or partner manager" ON public.credit_orders FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), partner_id));
CREATE POLICY "orders updated by platform" ON public.credit_orders FOR UPDATE TO authenticated
  USING (public.can_write_platform(auth.uid())) WITH CHECK (public.can_write_platform(auth.uid()));
CREATE TRIGGER credit_orders_updated BEFORE UPDATE ON public.credit_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== Membership plans + memberships =====
CREATE TABLE public.membership_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  duration_months INTEGER NOT NULL DEFAULT 12,
  included_consultations INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.membership_plans TO authenticated;
GRANT INSERT, UPDATE ON public.membership_plans TO authenticated;
GRANT ALL ON public.membership_plans TO service_role;
ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans readable by authenticated" ON public.membership_plans FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "plans managed by platform" ON public.membership_plans FOR ALL TO authenticated
  USING (public.can_write_platform(auth.uid())) WITH CHECK (public.can_write_platform(auth.uid()));

INSERT INTO public.membership_plans (code, name, price, duration_months, included_consultations)
VALUES ('TK_ANNUAL_CARE', 'THAIKANYA Annual Care Membership', 3900, 12, 4);

CREATE TABLE public.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.membership_plans(id),
  status public.membership_status NOT NULL DEFAULT 'PENDING',
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  payment_status TEXT NOT NULL DEFAULT 'UNPAID',
  payment_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX memberships_patient_idx ON public.memberships (patient_id);
GRANT SELECT, INSERT, UPDATE ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memberships readable in scope" ON public.memberships FOR SELECT TO authenticated
  USING (
    public.is_platform_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = memberships.patient_id
      AND (p.auth_user_id = auth.uid() OR public.belongs_to_partner(auth.uid(), p.partner_id)))
  );
CREATE POLICY "memberships written by platform" ON public.memberships FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()));
CREATE POLICY "memberships updated by platform" ON public.memberships FOR UPDATE TO authenticated
  USING (public.can_write_platform(auth.uid())) WITH CHECK (public.can_write_platform(auth.uid()));
CREATE TRIGGER memberships_updated BEFORE UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== Notification deliveries =====
CREATE TABLE public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
  consultation_id UUID REFERENCES public.consultations(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  channel public.notification_channel NOT NULL,
  status public.notification_status NOT NULL DEFAULT 'QUEUED',
  destination TEXT,
  template TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'th',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX notification_deliveries_status_idx ON public.notification_deliveries (status, queued_at);
GRANT SELECT ON public.notification_deliveries TO authenticated;
GRANT ALL ON public.notification_deliveries TO service_role;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deliveries readable in scope" ON public.notification_deliveries FOR SELECT TO authenticated
  USING (
    public.is_platform_staff(auth.uid())
    OR public.belongs_to_partner(auth.uid(), partner_id)
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = notification_deliveries.patient_id AND p.auth_user_id = auth.uid())
  );

-- ===== Consultation indexes for history/analytics =====
CREATE INDEX IF NOT EXISTS consultations_status_idx ON public.consultations (status);
CREATE INDEX IF NOT EXISTS consultations_created_idx ON public.consultations (created_at DESC);
CREATE INDEX IF NOT EXISTS consultations_partner_idx ON public.consultations (partner_id);
CREATE INDEX IF NOT EXISTS consultations_patient_idx ON public.consultations (patient_id);
CREATE INDEX IF NOT EXISTS consultations_mcs_idx ON public.consultations (external_order_id);
