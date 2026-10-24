-- Phase 1 step 4: therapists, qualifications, service eligibility, availability.

CREATE TYPE public.therapist_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');
CREATE TYPE public.employment_type AS ENUM ('EMPLOYEE', 'FREELANCE', 'CONTRACT');

CREATE TABLE public.therapists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  home_location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  auth_user_id UUID,
  staff_code TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  display_name TEXT,
  phone TEXT,
  email TEXT,
  employment_type public.employment_type NOT NULL DEFAULT 'EMPLOYEE',
  status public.therapist_status NOT NULL DEFAULT 'ACTIVE',
  languages TEXT[] NOT NULL DEFAULT ARRAY['th'],
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (partner_id, staff_code)
);

CREATE TABLE public.therapist_qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id UUID NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  issuer TEXT,
  reference TEXT,
  issued_on DATE,
  expires_on DATE,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.therapist_service_eligibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id UUID NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  skill_level INTEGER NOT NULL DEFAULT 1 CHECK (skill_level BETWEEN 1 AND 5),
  UNIQUE (therapist_id, service_id)
);

CREATE TABLE public.therapist_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id UUID NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CHECK (end_time > start_time)
);

CREATE TABLE public.therapist_time_off (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id UUID NOT NULL REFERENCES public.therapists(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX idx_therapists_partner ON public.therapists(partner_id);
CREATE INDEX idx_therapist_avail ON public.therapist_availability(therapist_id, weekday);

CREATE TRIGGER therapists_updated BEFORE UPDATE ON public.therapists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.therapist_partner(_therapist_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT partner_id FROM public.therapists WHERE id = _therapist_id;
$$;

CREATE OR REPLACE FUNCTION public.is_self_therapist(_user_id UUID, _therapist_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.therapists WHERE id = _therapist_id AND auth_user_id = _user_id);
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.therapists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.therapist_qualifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.therapist_service_eligibility TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.therapist_availability TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.therapist_time_off TO authenticated;
GRANT ALL ON public.therapists TO service_role;
GRANT ALL ON public.therapist_qualifications TO service_role;
GRANT ALL ON public.therapist_service_eligibility TO service_role;
GRANT ALL ON public.therapist_availability TO service_role;
GRANT ALL ON public.therapist_time_off TO service_role;

ALTER TABLE public.therapists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_service_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_time_off ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read therapists in scope" ON public.therapists FOR SELECT TO authenticated
  USING (public.can_read_partner(auth.uid(), partner_id) OR auth_user_id = auth.uid());
CREATE POLICY "insert therapists" ON public.therapists FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), partner_id));
CREATE POLICY "update therapists" ON public.therapists FOR UPDATE TO authenticated
  USING (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), partner_id))
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), partner_id));

CREATE POLICY "read qualifications" ON public.therapist_qualifications FOR SELECT TO authenticated
  USING (public.can_read_partner(auth.uid(), public.therapist_partner(therapist_id)) OR public.is_self_therapist(auth.uid(), therapist_id));
CREATE POLICY "write qualifications" ON public.therapist_qualifications FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), public.therapist_partner(therapist_id)));
CREATE POLICY "update qualifications" ON public.therapist_qualifications FOR UPDATE TO authenticated
  USING (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), public.therapist_partner(therapist_id)))
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), public.therapist_partner(therapist_id)));

CREATE POLICY "read eligibility" ON public.therapist_service_eligibility FOR SELECT TO authenticated
  USING (public.can_read_partner(auth.uid(), public.therapist_partner(therapist_id)) OR public.is_self_therapist(auth.uid(), therapist_id));
CREATE POLICY "write eligibility" ON public.therapist_service_eligibility FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), public.therapist_partner(therapist_id)));
CREATE POLICY "delete eligibility" ON public.therapist_service_eligibility FOR DELETE TO authenticated
  USING (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), public.therapist_partner(therapist_id)));

CREATE POLICY "read availability" ON public.therapist_availability FOR SELECT TO authenticated
  USING (public.can_read_partner(auth.uid(), public.therapist_partner(therapist_id)) OR public.is_self_therapist(auth.uid(), therapist_id));
CREATE POLICY "write availability" ON public.therapist_availability FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), public.therapist_partner(therapist_id)));
CREATE POLICY "delete availability" ON public.therapist_availability FOR DELETE TO authenticated
  USING (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), public.therapist_partner(therapist_id)));

CREATE POLICY "read time off" ON public.therapist_time_off FOR SELECT TO authenticated
  USING (public.can_read_partner(auth.uid(), public.therapist_partner(therapist_id)) OR public.is_self_therapist(auth.uid(), therapist_id));
CREATE POLICY "write time off" ON public.therapist_time_off FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), public.therapist_partner(therapist_id)) OR public.is_self_therapist(auth.uid(), therapist_id));
CREATE POLICY "delete time off" ON public.therapist_time_off FOR DELETE TO authenticated
  USING (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), public.therapist_partner(therapist_id)));
