-- Phase 1 step 5: bookings. Bookings stay separate from clinical consultations
-- and link to one by nullable consultation_id so the MCS credit lifecycle is untouched.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE public.booking_status AS ENUM ('DRAFT', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE public.booking_channel AS ENUM ('WALK_IN', 'ONLINE', 'PHONE', 'HOTEL', 'CORPORATE', 'PARTNER');

CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code TEXT NOT NULL UNIQUE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  consultation_id UUID REFERENCES public.consultations(id) ON DELETE SET NULL,
  status public.booking_status NOT NULL DEFAULT 'CONFIRMED',
  channel public.booking_channel NOT NULL DEFAULT 'WALK_IN',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  currency TEXT NOT NULL DEFAULT 'THB',
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  cancellation_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE public.booking_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  therapist_id UUID REFERENCES public.therapists(id) ON DELETE SET NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  cancelled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE public.booking_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_item_id UUID NOT NULL REFERENCES public.booking_items(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1,
  UNIQUE (booking_item_id, resource_id)
);

-- Double-booking prevention for therapists and rooms on live items.
ALTER TABLE public.booking_items
  ADD CONSTRAINT booking_items_no_therapist_overlap
  EXCLUDE USING gist (
    therapist_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (cancelled = false AND therapist_id IS NOT NULL);

ALTER TABLE public.booking_items
  ADD CONSTRAINT booking_items_no_room_overlap
  EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (cancelled = false AND room_id IS NOT NULL);

CREATE INDEX idx_bookings_partner_time ON public.bookings(partner_id, starts_at DESC);
CREATE INDEX idx_bookings_location_time ON public.bookings(location_id, starts_at DESC);
CREATE INDEX idx_bookings_patient ON public.bookings(patient_id);
CREATE INDEX idx_booking_items_booking ON public.booking_items(booking_id);

CREATE TRIGGER bookings_updated BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.booking_partner(_booking_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT partner_id FROM public.bookings WHERE id = _booking_id;
$$;

CREATE OR REPLACE FUNCTION public.is_own_booking(_user_id UUID, _booking_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    JOIN public.patients p ON p.id = b.patient_id
    WHERE b.id = _booking_id AND p.auth_user_id = _user_id
  );
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_resources TO authenticated;
GRANT ALL ON public.bookings TO service_role;
GRANT ALL ON public.booking_items TO service_role;
GRANT ALL ON public.booking_resources TO service_role;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read bookings in scope" ON public.bookings FOR SELECT TO authenticated
  USING (
    public.can_read_partner(auth.uid(), partner_id)
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.auth_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.booking_items bi
      JOIN public.therapists t ON t.id = bi.therapist_id
      WHERE bi.booking_id = bookings.id AND t.auth_user_id = auth.uid()
    )
  );
CREATE POLICY "insert bookings" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.belongs_to_partner(auth.uid(), partner_id));
CREATE POLICY "update bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (public.can_write_platform(auth.uid()) OR public.belongs_to_partner(auth.uid(), partner_id))
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.belongs_to_partner(auth.uid(), partner_id));

CREATE POLICY "read booking items" ON public.booking_items FOR SELECT TO authenticated
  USING (
    public.can_read_partner(auth.uid(), public.booking_partner(booking_id))
    OR public.is_own_booking(auth.uid(), booking_id)
    OR public.is_self_therapist(auth.uid(), therapist_id)
  );
CREATE POLICY "insert booking items" ON public.booking_items FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.belongs_to_partner(auth.uid(), public.booking_partner(booking_id)));
CREATE POLICY "update booking items" ON public.booking_items FOR UPDATE TO authenticated
  USING (public.can_write_platform(auth.uid()) OR public.belongs_to_partner(auth.uid(), public.booking_partner(booking_id)))
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.belongs_to_partner(auth.uid(), public.booking_partner(booking_id)));

CREATE POLICY "read booking resources" ON public.booking_resources FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.booking_items bi
    WHERE bi.id = booking_item_id
      AND public.can_read_partner(auth.uid(), public.booking_partner(bi.booking_id))
  ));
CREATE POLICY "write booking resources" ON public.booking_resources FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.booking_items bi
    WHERE bi.id = booking_item_id
      AND (public.can_write_platform(auth.uid()) OR public.belongs_to_partner(auth.uid(), public.booking_partner(bi.booking_id)))
  ));
