-- Phase 1 step 6: payment transactions, refunds and a double-entry ledger.
-- The CareCredit ledger is untouched; this is the cash ledger for wellness sales.

CREATE TYPE public.payment_status AS ENUM ('PENDING', 'AUTHORISED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED');
CREATE TYPE public.payment_channel AS ENUM ('CASH', 'CARD', 'PROMPTPAY', 'BANK_TRANSFER', 'HOTEL_FOLIO', 'CORPORATE_INVOICE', 'ONLINE');
CREATE TYPE public.ledger_account_kind AS ENUM ('ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE', 'EQUITY');

CREATE TABLE public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  reference TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'MANUAL',
  provider_reference TEXT,
  channel public.payment_channel NOT NULL DEFAULT 'CASH',
  status public.payment_status NOT NULL DEFAULT 'PENDING',
  currency TEXT NOT NULL DEFAULT 'THB',
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  captured_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_transaction_id UUID NOT NULL REFERENCES public.payment_transactions(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason TEXT,
  status public.payment_status NOT NULL DEFAULT 'PENDING',
  provider_reference TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ledger_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind public.ledger_account_kind NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  account_id UUID NOT NULL REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT,
  payment_transaction_id UUID REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  entry_group UUID NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  currency TEXT NOT NULL DEFAULT 'THB',
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.ledger_accounts (code, name, kind) VALUES
  ('1000', 'Cash and bank', 'ASSET'),
  ('1100', 'Card settlement receivable', 'ASSET'),
  ('2000', 'Deferred service revenue', 'LIABILITY'),
  ('2100', 'Therapist commission payable', 'LIABILITY'),
  ('4000', 'Service revenue', 'REVENUE'),
  ('5000', 'Payment processing fees', 'EXPENSE');

CREATE INDEX idx_payments_partner ON public.payment_transactions(partner_id, created_at DESC);
CREATE INDEX idx_payments_booking ON public.payment_transactions(booking_id);
CREATE INDEX idx_ledger_entries_group ON public.ledger_entries(entry_group);
CREATE INDEX idx_ledger_entries_partner ON public.ledger_entries(partner_id, created_at DESC);

CREATE TRIGGER payment_transactions_updated BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.can_read_finance(_user_id UUID, _partner_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_staff(_user_id) OR public.can_manage_partner(_user_id, _partner_id);
$$;

GRANT SELECT, INSERT, UPDATE ON public.payment_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.refunds TO authenticated;
GRANT SELECT ON public.ledger_accounts TO authenticated;
GRANT SELECT ON public.ledger_entries TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;
GRANT ALL ON public.refunds TO service_role;
GRANT ALL ON public.ledger_accounts TO service_role;
GRANT ALL ON public.ledger_entries TO service_role;

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read payments in scope" ON public.payment_transactions FOR SELECT TO authenticated
  USING (public.can_read_partner(auth.uid(), partner_id));
CREATE POLICY "insert payments" ON public.payment_transactions FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.belongs_to_partner(auth.uid(), partner_id));
CREATE POLICY "update payments" ON public.payment_transactions FOR UPDATE TO authenticated
  USING (public.can_read_finance(auth.uid(), partner_id))
  WITH CHECK (public.can_read_finance(auth.uid(), partner_id));

CREATE POLICY "read refunds" ON public.refunds FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.payment_transactions pt
    WHERE pt.id = payment_transaction_id AND public.can_read_finance(auth.uid(), pt.partner_id)
  ));
CREATE POLICY "insert refunds" ON public.refunds FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.payment_transactions pt
    WHERE pt.id = payment_transaction_id AND public.can_read_finance(auth.uid(), pt.partner_id)
  ));
CREATE POLICY "update refunds" ON public.refunds FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.payment_transactions pt
    WHERE pt.id = payment_transaction_id AND public.can_read_finance(auth.uid(), pt.partner_id)
  ))
  WITH CHECK (true);

CREATE POLICY "read ledger accounts" ON public.ledger_accounts FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "read ledger entries" ON public.ledger_entries FOR SELECT TO authenticated
  USING (public.can_read_finance(auth.uid(), partner_id));
