-- The very first account to sign up becomes SUPER_ADMIN so the platform can be
-- administered. Every later account starts with no role until granted one.
CREATE OR REPLACE FUNCTION public.bootstrap_first_super_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'SUPER_ADMIN') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'SUPER_ADMIN')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER profiles_bootstrap_super_admin
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.bootstrap_first_super_admin();