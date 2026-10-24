REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.doctor_assignments FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.doctor_availability FROM authenticated, anon;
REVOKE ALL ON public.doctor_assignments FROM anon;
REVOKE ALL ON public.doctor_availability FROM anon;