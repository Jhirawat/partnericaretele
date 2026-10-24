-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM (
  'SUPER_ADMIN','OPERATIONS_ADMIN','FINANCE_ADMIN','COMPLIANCE_AUDITOR',
  'PARTNER_OWNER','PARTNER_MANAGER','PARTNER_STAFF','DOCTOR','PATIENT'
);
CREATE TYPE public.partner_status AS ENUM ('PENDING','ACTIVE','SUSPENDED','TERMINATED');
CREATE TYPE public.member_status AS ENUM ('INVITED','ACTIVE','SUSPENDED','REMOVED');
CREATE TYPE public.consultation_status AS ENUM ('CREATED','WAITING','STARTED','COMPLETED','CANCELLED','FAILED');
CREATE TYPE public.consultation_source AS ENUM ('PARTNER','PATIENT','ADMIN','MCS');
CREATE TYPE public.credit_status AS ENUM ('NOT_REQUIRED','RESERVED','CONSUMED','RELEASED');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ PARTNERS ============
CREATE TABLE public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_code TEXT NOT NULL UNIQUE,
  legal_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status public.partner_status NOT NULL DEFAULT 'PENDING',
  country_code TEXT NOT NULL DEFAULT 'TH',
  branch_name TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  credit_balance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partners TO authenticated;
GRANT ALL ON public.partners TO service_role;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES (tenant scoped) ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE,
  status public.member_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_roles_unique ON public.user_roles (user_id, role, COALESCE(partner_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX user_roles_partner_idx ON public.user_roles (partner_id);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role AND status = 'ACTIVE');
$$;

CREATE OR REPLACE FUNCTION public.is_platform_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND status = 'ACTIVE'
      AND role IN ('SUPER_ADMIN','OPERATIONS_ADMIN','FINANCE_ADMIN','COMPLIANCE_AUDITOR')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_platform(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND status = 'ACTIVE'
      AND role IN ('SUPER_ADMIN','OPERATIONS_ADMIN')
  );
$$;

CREATE OR REPLACE FUNCTION public.belongs_to_partner(_user_id UUID, _partner_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND status = 'ACTIVE' AND partner_id = _partner_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_partner(_user_id UUID, _partner_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND status = 'ACTIVE' AND partner_id = _partner_id
      AND role IN ('PARTNER_OWNER','PARTNER_MANAGER')
  );
$$;

-- ============ PATIENTS ============
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_patient_id TEXT NOT NULL UNIQUE DEFAULT ('TK-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  auth_user_id UUID,
  mcs_patient_id TEXT,
  hn TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone_number TEXT,
  whatsapp_number TEXT,
  line_user_id TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'th',
  notify_email BOOLEAN NOT NULL DEFAULT TRUE,
  notify_whatsapp BOOLEAN NOT NULL DEFAULT TRUE,
  notify_line BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX patients_partner_idx ON public.patients (partner_id);
CREATE INDEX patients_auth_user_idx ON public.patients (auth_user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

-- ============ CONSULTATIONS ============
CREATE TABLE public.consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id TEXT NOT NULL UNIQUE DEFAULT ('CN-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  mcs_patient_id TEXT,
  hn_snapshot TEXT,
  doctor_id TEXT,
  status public.consultation_status NOT NULL DEFAULT 'CREATED',
  room_url TEXT,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  source public.consultation_source NOT NULL DEFAULT 'PARTNER',
  external_order_id TEXT,
  credit_status public.credit_status NOT NULL DEFAULT 'NOT_REQUIRED',
  credit_transaction_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX consultations_partner_idx ON public.consultations (partner_id);
CREATE INDEX consultations_patient_idx ON public.consultations (patient_id);
CREATE INDEX consultations_status_idx ON public.consultations (status);
CREATE INDEX consultations_created_idx ON public.consultations (created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.consultations TO authenticated;
GRANT ALL ON public.consultations TO service_role;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;

-- ============ AUDIT LOG ============
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID,
  actor_role public.app_role,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_partner_idx ON public.audit_log (partner_id);
CREATE INDEX audit_log_created_idx ON public.audit_log (created_at DESC);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============ POLICIES ============
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_platform_staff(auth.uid()));
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "roles readable by self or staff" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_staff(auth.uid()) OR public.can_manage_partner(auth.uid(), partner_id));

CREATE POLICY "partners visible to members and staff" ON public.partners FOR SELECT TO authenticated
  USING (public.is_platform_staff(auth.uid()) OR public.belongs_to_partner(auth.uid(), id));
CREATE POLICY "partners created by platform" ON public.partners FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()));
CREATE POLICY "partners updated by platform or owner" ON public.partners FOR UPDATE TO authenticated
  USING (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), id))
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(auth.uid(), id));
CREATE POLICY "partners deleted by super admin" ON public.partners FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'SUPER_ADMIN'));

CREATE POLICY "patients tenant read" ON public.patients FOR SELECT TO authenticated
  USING (public.is_platform_staff(auth.uid()) OR public.belongs_to_partner(auth.uid(), partner_id) OR auth_user_id = auth.uid());
CREATE POLICY "patients tenant insert" ON public.patients FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.belongs_to_partner(auth.uid(), partner_id) OR auth_user_id = auth.uid());
CREATE POLICY "patients tenant update" ON public.patients FOR UPDATE TO authenticated
  USING (public.can_write_platform(auth.uid()) OR public.belongs_to_partner(auth.uid(), partner_id) OR auth_user_id = auth.uid())
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.belongs_to_partner(auth.uid(), partner_id) OR auth_user_id = auth.uid());
CREATE POLICY "patients delete by super admin" ON public.patients FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'SUPER_ADMIN'));

CREATE POLICY "consultations tenant read" ON public.consultations FOR SELECT TO authenticated
  USING (
    public.is_platform_staff(auth.uid())
    OR public.belongs_to_partner(auth.uid(), partner_id)
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = consultations.patient_id AND p.auth_user_id = auth.uid())
  );
CREATE POLICY "consultations tenant insert" ON public.consultations FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.belongs_to_partner(auth.uid(), partner_id));
CREATE POLICY "consultations tenant update" ON public.consultations FOR UPDATE TO authenticated
  USING (public.can_write_platform(auth.uid()) OR public.belongs_to_partner(auth.uid(), partner_id))
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.belongs_to_partner(auth.uid(), partner_id));

CREATE POLICY "audit readable by staff and partner managers" ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_platform_staff(auth.uid()) OR public.can_manage_partner(auth.uid(), partner_id));
CREATE POLICY "audit insert by authenticated actor" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid());

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER partners_updated BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER patients_updated BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER consultations_updated BEFORE UPDATE ON public.consultations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, preferred_language)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'preferred_language', 'en')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();