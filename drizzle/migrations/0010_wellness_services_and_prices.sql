-- Phase 1 step 3: service catalogue, per-location pricing, resource needs.

CREATE TYPE public.service_category AS ENUM ('MASSAGE', 'SPA', 'AESTHETIC', 'MEDICAL', 'WELLNESS', 'HOME_SERVICE');

CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_th TEXT,
  description TEXT,
  category public.service_category NOT NULL DEFAULT 'WELLNESS',
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  buffer_minutes INTEGER NOT NULL DEFAULT 10,
  requires_room BOOLEAN NOT NULL DEFAULT true,
  requires_therapist BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, code)
);

CREATE TABLE public.service_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'WALK_IN',
  currency TEXT NOT NULL DEFAULT 'THB',
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  valid_from DATE,
  valid_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.service_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  UNIQUE (service_id, resource_id)
);

CREATE INDEX idx_services_partner ON public.services(partner_id);
CREATE INDEX idx_service_prices_service ON public.service_prices(service_id);

CREATE TRIGGER services_updated BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER service_prices_updated BEFORE UPDATE ON public.service_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.service_partner(_service_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT partner_id FROM public.services WHERE id = _service_id;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_prices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_resources TO authenticated;
GRANT ALL ON public.services TO service_role;
GRANT ALL ON public.service_prices TO service_role;
GRANT ALL ON public.service_resources TO service_role;

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read services in scope" ON public.services FOR SELECT TO authenticated
  USING (public.can_read_partner(auth.uid(), partner_id));
CREATE POLICY "insert services" ON public.services FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), partner_id));
CREATE POLICY "update services" ON public.services FOR UPDATE TO authenticated
  USING (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), partner_id))
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), partner_id));

CREATE POLICY "read service prices" ON public.service_prices FOR SELECT TO authenticated
  USING (public.can_read_partner(auth.uid(), public.service_partner(service_id)));
CREATE POLICY "insert service prices" ON public.service_prices FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), public.service_partner(service_id)));
CREATE POLICY "update service prices" ON public.service_prices FOR UPDATE TO authenticated
  USING (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), public.service_partner(service_id)))
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), public.service_partner(service_id)));

CREATE POLICY "read service resources" ON public.service_resources FOR SELECT TO authenticated
  USING (public.can_read_partner(auth.uid(), public.service_partner(service_id)));
CREATE POLICY "write service resources" ON public.service_resources FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), public.service_partner(service_id)));
