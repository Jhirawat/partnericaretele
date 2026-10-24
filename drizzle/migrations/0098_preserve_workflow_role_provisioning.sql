-- Keep existing JWT-derived doctor/partner commands intact; direct writes remain Superadmin/MFA RLS restricted.
CREATE OR REPLACE FUNCTION public.staff_role_security_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r public.user_roles; BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 IF auth.uid() IS NOT NULL AND (r.role IN ('SUPER_ADMIN','OPERATIONS_ADMIN','FINANCE_ADMIN','COMPLIANCE_AUDITOR') OR (TG_OP='UPDATE' AND OLD.role IN ('SUPER_ADMIN','OPERATIONS_ADMIN','FINANCE_ADMIN','COMPLIANCE_AUDITOR'))) AND (NOT public.care_super(auth.uid()) OR coalesce(auth.jwt()->>'aal','aal1')<>'aal2') THEN RAISE EXCEPTION 'SUPER_MFA_REQUIRED'; END IF;
 IF TG_OP<>'DELETE' AND NEW.role='SUPER_ADMIN' AND NEW.partner_id IS NOT NULL THEN RAISE EXCEPTION 'GLOBAL_SUPER_REQUIRED'; END IF;
 RETURN r; END $$;