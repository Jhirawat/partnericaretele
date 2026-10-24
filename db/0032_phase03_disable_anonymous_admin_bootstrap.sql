-- Phase 03 security hardening: public signup must never grant platform admin.
-- A legitimate owner SUPER_ADMIN (sales@thaikanya.com) already exists, so the
-- anonymous first-signup bootstrap is disabled. If every admin is later
-- removed, the platform fails closed: no visitor can self-appoint. Owner
-- provisioning then requires the owner to grant the role via the Cloud SQL
-- editor (documented prerequisite), never automatic bootstrap.

-- 1. Remove the auto-grant trigger on new profiles.
DROP TRIGGER IF EXISTS profiles_bootstrap_super_admin ON public.profiles;

-- 2. Replace the bootstrap function with a fail-closed no-op (kept so any
--    historical reference does not break; marked deprecated).
CREATE OR REPLACE FUNCTION public.bootstrap_first_super_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- DEPRECATED: anonymous admin bootstrap disabled in Phase 03.
  -- New accounts never receive roles automatically. Roles are granted only
  -- by existing platform admins through user_roles policies, or by the owner
  -- via the Cloud SQL editor if no admin exists.
  RETURN NEW;
END; $$;
COMMENT ON FUNCTION public.bootstrap_first_super_admin() IS 'DEPRECATED: auto admin bootstrap disabled (phase03). Fail-closed no-op.';

-- 3. Trigger functions need no EXECUTE grants from API roles.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bootstrap_first_super_admin() FROM PUBLIC, anon, authenticated;

-- 4. Patient record claiming requires a signed-in session; anon has no
--    business calling it (auth.uid() is NULL for anon).
REVOKE EXECUTE ON FUNCTION public.claim_patient_record(text) FROM anon;
