-- Phase 1 step 2: physical network (locations, rooms, bookable resources)
-- plus location-scope helper functions used by every later policy.

CREATE TYPE public.location_status AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE public.resource_kind AS ENUM ('EQUIPMENT', 'DEVICE', 'BED', 'VEHICLE', 'OTHER');

CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  country_code TEXT NOT NULL DEFAULT 'TH',
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  phone TEXT,
  opening_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.location_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, code)
);

CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (location_id, code)
);

CREATE TABLE public.resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  kind public.resource_kind NOT NULL DEFAULT 'EQUIPMENT',
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (location_id, code)
);

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS default_location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX idx_locations_partner ON public.locations(partner_id);
CREATE INDEX idx_rooms_location ON public.rooms(location_id);
CREATE INDEX idx_resources_location ON public.resources(location_id);

CREATE TRIGGER locations_updated BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER rooms_updated BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER resources_updated BEFORE UPDATE ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Scope helpers ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_read_partner(_user_id UUID, _partner_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_staff(_user_id) OR public.belongs_to_partner(_user_id, _partner_id);
$$;

CREATE OR REPLACE FUNCTION public.location_partner(_location_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT partner_id FROM public.locations WHERE id = _location_id;
$$;

CREATE OR REPLACE FUNCTION public.can_read_location(_user_id UUID, _location_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_read_partner(_user_id, public.location_partner(_location_id));
$$;

CREATE OR REPLACE FUNCTION public.can_manage_location(_user_id UUID, _location_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_write_platform(_user_id)
      OR public.can_manage_partner(_user_id, public.location_partner(_location_id))
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = _user_id AND ur.status = 'ACTIVE'
          AND ur.role = 'LOCATION_MANAGER'
          AND ur.partner_id = public.location_partner(_location_id)
      );
$$;

-- Grants ---------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resources TO authenticated;
GRANT ALL ON public.locations TO service_role;
GRANT ALL ON public.rooms TO service_role;
GRANT ALL ON public.resources TO service_role;

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read locations in scope" ON public.locations FOR SELECT TO authenticated
  USING (public.can_read_partner(auth.uid(), partner_id));
CREATE POLICY "manage locations" ON public.locations FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), partner_id));
CREATE POLICY "update locations" ON public.locations FOR UPDATE TO authenticated
  USING (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), partner_id))
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), partner_id));

CREATE POLICY "read rooms in scope" ON public.rooms FOR SELECT TO authenticated
  USING (public.can_read_location(auth.uid(), location_id));
CREATE POLICY "insert rooms" ON public.rooms FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_location(auth.uid(), location_id));
CREATE POLICY "update rooms" ON public.rooms FOR UPDATE TO authenticated
  USING (public.can_manage_location(auth.uid(), location_id))
  WITH CHECK (public.can_manage_location(auth.uid(), location_id));

CREATE POLICY "read resources in scope" ON public.resources FOR SELECT TO authenticated
  USING (public.can_read_location(auth.uid(), location_id));
CREATE POLICY "insert resources" ON public.resources FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_location(auth.uid(), location_id));
CREATE POLICY "update resources" ON public.resources FOR UPDATE TO authenticated
  USING (public.can_manage_location(auth.uid(), location_id))
  WITH CHECK (public.can_manage_location(auth.uid(), location_id));
