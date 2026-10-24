ALTER TYPE public.consultation_status ADD VALUE IF NOT EXISTS 'NO_SHOW';

INSERT INTO public.platform_settings (key, value) VALUES ('clinic_system_mode', '"INTERNAL"'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TYPE public.doctor_status AS ENUM ('PENDING','ACTIVE','SUSPENDED');

CREATE TABLE public.doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE,
  full_name text NOT NULL,
  license_number text NOT NULL UNIQUE,
  license_expires_on date,
  specialty text,
  phone text,
  email text,
  status public.doctor_status NOT NULL DEFAULT 'PENDING',
  availability text,
  location_id uuid REFERENCES public.locations(id),
  signature_url text,
  consultation_fee numeric NOT NULL DEFAULT 0,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.doctors TO authenticated;
GRANT ALL ON public.doctors TO service_role;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doctors readable by signed-in users" ON public.doctors FOR SELECT TO authenticated USING (true);
CREATE POLICY "platform admins manage doctors" ON public.doctors FOR ALL TO authenticated
  USING (public.can_write_platform(auth.uid())) WITH CHECK (public.can_write_platform(auth.uid()));
CREATE POLICY "doctor edits own contact" ON public.doctors FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid()) WITH CHECK (auth_user_id = auth.uid());

-- Doctors may not self-approve or change license/status
CREATE OR REPLACE FUNCTION public.doctors_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_write_platform(auth.uid()) AND auth.uid() IS NOT NULL THEN
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.license_number IS DISTINCT FROM OLD.license_number
       OR NEW.license_expires_on IS DISTINCT FROM OLD.license_expires_on OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
      RAISE EXCEPTION 'DOCTOR_FIELDS_ADMIN_ONLY';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER doctors_guard BEFORE UPDATE ON public.doctors FOR EACH ROW EXECUTE FUNCTION public.doctors_guard();

CREATE OR REPLACE FUNCTION public.is_active_doctor(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.doctors WHERE auth_user_id = _user_id AND status = 'ACTIVE'
    AND (license_expires_on IS NULL OR license_expires_on >= current_date))
$$;

CREATE TABLE public.patient_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  consent_type text NOT NULL DEFAULT 'TELEMEDICINE',
  version text NOT NULL DEFAULT 'v1',
  accepted boolean NOT NULL DEFAULT true,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.patient_consents TO authenticated;
GRANT ALL ON public.patient_consents TO service_role;
ALTER TABLE public.patient_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consents readable" ON public.patient_consents FOR SELECT TO authenticated USING (
  public.can_write_platform(auth.uid()) OR public.is_active_doctor(auth.uid())
  OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND (p.auth_user_id = auth.uid() OR (p.partner_id IS NOT NULL AND public.belongs_to_partner(auth.uid(), p.partner_id)))));
CREATE POLICY "consents insertable" ON public.patient_consents FOR INSERT TO authenticated WITH CHECK (
  public.can_write_platform(auth.uid())
  OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND (p.auth_user_id = auth.uid() OR (p.partner_id IS NOT NULL AND public.belongs_to_partner(auth.uid(), p.partner_id)))));

CREATE TABLE public.patient_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  chief_complaint text NOT NULL,
  medical_history text,
  current_medications text,
  allergies text,
  submitted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.patient_intakes TO authenticated;
GRANT ALL ON public.patient_intakes TO service_role;
ALTER TABLE public.patient_intakes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intakes readable" ON public.patient_intakes FOR SELECT TO authenticated USING (
  public.can_write_platform(auth.uid()) OR public.is_active_doctor(auth.uid())
  OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND (p.auth_user_id = auth.uid() OR (p.partner_id IS NOT NULL AND public.belongs_to_partner(auth.uid(), p.partner_id)))));
CREATE POLICY "intakes insertable" ON public.patient_intakes FOR INSERT TO authenticated WITH CHECK (
  public.can_write_platform(auth.uid())
  OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND (p.auth_user_id = auth.uid() OR (p.partner_id IS NOT NULL AND public.belongs_to_partner(auth.uid(), p.partner_id)))));

ALTER TABLE public.consultations ADD COLUMN assigned_doctor_id uuid REFERENCES public.doctors(id);
ALTER TABLE public.consultations ADD COLUMN external_video_link text;
ALTER TABLE public.consultations ADD COLUMN system_mode text NOT NULL DEFAULT 'INTERNAL';

CREATE OR REPLACE FUNCTION public.consultation_consent_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status::text = 'STARTED' AND OLD.status::text <> 'STARTED' THEN
    IF NOT EXISTS (SELECT 1 FROM public.patient_consents c WHERE c.patient_id = NEW.patient_id AND c.accepted) THEN
      RAISE EXCEPTION 'PATIENT_CONSENT_REQUIRED';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER consultation_consent_guard BEFORE UPDATE ON public.consultations FOR EACH ROW EXECUTE FUNCTION public.consultation_consent_guard();

CREATE POLICY "assigned doctor reads consultations" ON public.consultations FOR SELECT TO authenticated
  USING (assigned_doctor_id IN (SELECT id FROM public.doctors WHERE auth_user_id = auth.uid()));
CREATE POLICY "assigned doctor updates consultations" ON public.consultations FOR UPDATE TO authenticated
  USING (assigned_doctor_id IN (SELECT id FROM public.doctors WHERE auth_user_id = auth.uid()))
  WITH CHECK (assigned_doctor_id IN (SELECT id FROM public.doctors WHERE auth_user_id = auth.uid()));