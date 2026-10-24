-- Consultation notes + AI-generated structured case summaries
CREATE TABLE public.consultation_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  author_user_id UUID,
  notes TEXT NOT NULL,
  summary JSONB,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX consultation_notes_consultation_idx ON public.consultation_notes (consultation_id);
CREATE INDEX consultation_notes_partner_idx ON public.consultation_notes (partner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.consultation_notes TO authenticated;
GRANT ALL ON public.consultation_notes TO service_role;
ALTER TABLE public.consultation_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes readable in scope" ON public.consultation_notes FOR SELECT TO authenticated
  USING (public.is_platform_staff(auth.uid()) OR public.belongs_to_partner(partner_id, auth.uid()));

CREATE POLICY "notes insert in scope" ON public.consultation_notes FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(partner_id, auth.uid()));

CREATE POLICY "notes update in scope" ON public.consultation_notes FOR UPDATE TO authenticated
  USING (public.can_write_platform(auth.uid()) OR public.can_manage_partner(partner_id, auth.uid()))
  WITH CHECK (public.can_write_platform(auth.uid()) OR public.can_manage_partner(partner_id, auth.uid()));

CREATE POLICY "notes delete by super admin" ON public.consultation_notes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'SUPER_ADMIN'::public.app_role));

CREATE TRIGGER consultation_notes_updated BEFORE UPDATE ON public.consultation_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Partner account management: platform staff need to read profiles to assign access
CREATE POLICY "staff read profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_platform_staff(auth.uid()));

-- Partner access assignment (role grants) by platform admins
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

CREATE POLICY "admins assign roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.can_write_platform(auth.uid()));

CREATE POLICY "admins update roles" ON public.user_roles FOR UPDATE TO authenticated
  USING (public.can_write_platform(auth.uid()))
  WITH CHECK (public.can_write_platform(auth.uid()));

CREATE POLICY "super admin delete roles" ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'SUPER_ADMIN'::public.app_role));