-- Phase 1 step 7: commission plans, rules, snapshots, therapist earnings,
-- plus location scoping on the audit trail.

CREATE TYPE public.commission_basis AS ENUM ('PERCENT_OF_SERVICE', 'FIXED_PER_SERVICE', 'PERCENT_OF_NET');
CREATE TYPE public.earning_status AS ENUM ('PENDING', 'APPROVED', 'PAID', 'VOID');

CREATE TABLE public.commission_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, code)
);

CREATE TABLE public.commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.commission_plans(id) ON DELETE CASCADE,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
  service_category public.service_category,
  basis public.commission_basis NOT NULL DEFAULT 'PERCENT_OF_SERVICE',
  rate NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (rate >= 0),
  fixed_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (fixed_amount >= 0),
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.commission_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_item_id UUID NOT NULL REFERENCES public.booking_items(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.commission_plans(id) ON DELETE SET NULL,
  rule_id UUID REFERENCES public.commission_rules(id) ON DELETE SET NULL,
  basis public.commission_basis NOT NULL,
  rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  fixed_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  base_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  computed_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_item_id)
);

CREATE TABLE public.therapist_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id UUID NOT NULL REFERENCES public.therapists(id) ON DELETE RESTRICT,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  booking_item_id UUID REFERENCES public.booking_items(id) ON DELETE SET NULL,
  snapshot_id UUID REFERENCES public.commission_snapshots(id) ON DELETE SET NULL,
  currency TEXT NOT NULL DEFAULT 'THB',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status public.earning_status NOT NULL DEFAULT 'PENDING',
  earned_on DATE NOT NULL DEFAULT CURRENT_DATE,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX idx_commission_rules_plan ON public.commission_rules(plan_id);
CREATE INDEX idx_earnings_therapist ON public.therapist_earnings(therapist_id, earned_on DESC);

CREATE TRIGGER commission_plans_updated BEFORE UPDATE ON public.commission_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.plan_partner(_plan_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT partner_id FROM public.commission_plans WHERE id = _plan_id;
$$;

GRANT SELECT, INSERT, UPDATE ON public.commission_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_rules TO authenticated;
GRANT SELECT ON public.commission_snapshots TO authenticated;
GRANT SELECT, UPDATE ON public.therapist_earnings TO authenticated;
GRANT ALL ON public.commission_plans TO service_role;
GRANT ALL ON public.commission_rules TO service_role;
GRANT ALL ON public.commission_snapshots TO service_role;
GRANT ALL ON public.therapist_earnings TO service_role;

ALTER TABLE public.commission_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read commission plans" ON public.commission_plans FOR SELECT TO authenticated
  USING (public.can_read_finance(auth.uid(), partner_id));
CREATE POLICY "insert commission plans" ON public.commission_plans FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), partner_id));
CREATE POLICY "update commission plans" ON public.commission_plans FOR UPDATE TO authenticated
  USING (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), partner_id))
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), partner_id));

CREATE POLICY "read commission rules" ON public.commission_rules FOR SELECT TO authenticated
  USING (public.can_read_finance(auth.uid(), public.plan_partner(plan_id)));
CREATE POLICY "insert commission rules" ON public.commission_rules FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), public.plan_partner(plan_id)));
CREATE POLICY "delete commission rules" ON public.commission_rules FOR DELETE TO authenticated
  USING (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), public.plan_partner(plan_id)));

CREATE POLICY "read commission snapshots" ON public.commission_snapshots FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.booking_items bi
    WHERE bi.id = booking_item_id
      AND (public.can_read_finance(auth.uid(), public.booking_partner(bi.booking_id))
           OR public.is_self_therapist(auth.uid(), bi.therapist_id))
  ));

CREATE POLICY "read therapist earnings" ON public.therapist_earnings FOR SELECT TO authenticated
  USING (public.can_read_finance(auth.uid(), partner_id) OR public.is_self_therapist(auth.uid(), therapist_id));
CREATE POLICY "approve therapist earnings" ON public.therapist_earnings FOR UPDATE TO authenticated
  USING (public.can_read_finance(auth.uid(), partner_id))
  WITH CHECK (public.can_read_finance(auth.uid(), partner_id));
