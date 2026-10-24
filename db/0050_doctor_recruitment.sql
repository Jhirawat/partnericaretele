-- Phase 1 P0: Doctor recruitment, verification, organization/branch assignment and availability.
-- Additive only. All writes go through doctor_command (JWT-derived actor, row locks, MFA for staff).
CREATE TABLE IF NOT EXISTS public.doctor_assignments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 doctor_id uuid NOT NULL REFERENCES public.doctors(id),
 partner_id uuid NOT NULL REFERENCES public.partners(id),
 location_id uuid REFERENCES public.locations(id),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED')),
 reason text CHECK (reason IS NULL OR length(reason)<=1000),
 assigned_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS doctor_assignments_scope_uq ON public.doctor_assignments(doctor_id,partner_id,coalesce(location_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE TABLE IF NOT EXISTS public.doctor_availability(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 doctor_id uuid NOT NULL REFERENCES public.doctors(id),
 assignment_id uuid NOT NULL REFERENCES public.doctor_assignments(id),
 weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
 start_time time NOT NULL,
 end_time time NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (end_time>start_time)
);
GRANT SELECT ON public.doctor_assignments TO authenticated;
GRANT SELECT ON public.doctor_availability TO authenticated;
GRANT ALL ON public.doctor_assignments TO service_role;
GRANT ALL ON public.doctor_availability TO service_role;
ALTER TABLE public.doctor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_availability ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.doctor_is_self(_doctor uuid,_u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT _u IS NOT NULL AND EXISTS(SELECT 1 FROM doctors WHERE id=_doctor AND auth_user_id=_u)
$$;
CREATE OR REPLACE FUNCTION public.doctor_assignment_visible(_doctor uuid,_u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM doctor_assignments a WHERE a.doctor_id=_doctor AND a.status<>'REVOKED' AND (partner_review_scope(_u,a.partner_id) OR can_read_partner(_u,a.partner_id)))
$$;
REVOKE ALL ON FUNCTION public.doctor_is_self(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.doctor_assignment_visible(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doctor_is_self(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_assignment_visible(uuid,uuid) TO authenticated;

DROP POLICY IF EXISTS doctor_assignments_read ON public.doctor_assignments;
CREATE POLICY doctor_assignments_read ON public.doctor_assignments FOR SELECT TO authenticated
 USING (partner_review_scope(auth.uid(),partner_id) OR doctor_is_self(doctor_id,auth.uid()) OR (status<>'REVOKED' AND can_read_partner(auth.uid(),partner_id)));
DROP POLICY IF EXISTS doctor_availability_read ON public.doctor_availability;
CREATE POLICY doctor_availability_read ON public.doctor_availability FOR SELECT TO authenticated
 USING (EXISTS(SELECT 1 FROM doctor_assignments a WHERE a.id=assignment_id AND (partner_review_scope(auth.uid(),a.partner_id) OR doctor_is_self(a.doctor_id,auth.uid()) OR (a.status='ACTIVE' AND can_read_partner(auth.uid(),a.partner_id)))));
-- Additive read path: organizations and scoped admins see doctors assigned to them.
DROP POLICY IF EXISTS "doctors readable via assignment" ON public.doctors;
CREATE POLICY "doctors readable via assignment" ON public.doctors FOR SELECT TO authenticated USING (doctor_assignment_visible(id,auth.uid()));

CREATE OR REPLACE FUNCTION public.doctor_command(_op text,_id uuid DEFAULT NULL,_args jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); d doctors; a doctor_assignments; v_reason text:=nullif(btrim(_args->>'reason'),''); p uuid; loc uuid; prof uuid; s jsonb; home uuid;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF length(coalesce(v_reason,''))>1000 THEN RAISE EXCEPTION 'INVALID_REASON'; END IF;
 IF _op='SET_AVAILABILITY' THEN
  SELECT * INTO a FROM doctor_assignments WHERE id=_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO d FROM doctors WHERE id=a.doctor_id;
  IF d.auth_user_id IS DISTINCT FROM u THEN RAISE EXCEPTION 'DOCTOR_SELF_REQUIRED'; END IF;
  IF d.status<>'ACTIVE' OR a.status<>'ACTIVE' THEN RAISE EXCEPTION 'ASSIGNMENT_NOT_ACTIVE'; END IF;
  IF jsonb_typeof(_args->'slots') IS DISTINCT FROM 'array' OR jsonb_array_length(_args->'slots')>28 THEN RAISE EXCEPTION 'INVALID_AVAILABILITY'; END IF;
  DELETE FROM doctor_availability WHERE assignment_id=a.id;
  FOR s IN SELECT * FROM jsonb_array_elements(_args->'slots') LOOP
   IF (s->>'weekday') !~ '^[0-6]$' OR (s->>'start') !~ '^\d{2}:\d{2}$' OR (s->>'end') !~ '^\d{2}:\d{2}$' OR (s->>'end')::time<=(s->>'start')::time THEN RAISE EXCEPTION 'INVALID_AVAILABILITY'; END IF;
   INSERT INTO doctor_availability(doctor_id,assignment_id,weekday,start_time,end_time) VALUES(d.id,a.id,(s->>'weekday')::smallint,(s->>'start')::time,(s->>'end')::time);
  END LOOP;
  INSERT INTO audit_log(actor_user_id,partner_id,action,entity_type,entity_id,metadata) VALUES(u,a.partner_id,'DOCTOR_AVAILABILITY_SET','doctor_assignment',a.id::text,jsonb_build_object('slots',jsonb_array_length(_args->'slots')));
  RETURN jsonb_build_object('ok',true);
 END IF;

 -- Every other operation is staff-only, scoped and step-up protected. Partner roles never qualify.
 IF _op='REGISTER' THEN
  loc:=nullif(_args->>'locationId','')::uuid; home:=location_partner(loc);
  IF loc IS NOT NULL AND home IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (can_write_platform(u) OR (home IS NOT NULL AND partner_review_scope(u,home))) THEN RAISE EXCEPTION 'REVIEWER_REQUIRED'; END IF;
  PERFORM care_require_strong();
  IF length(btrim(coalesce(_args->>'fullName','')))<2 OR length(btrim(coalesce(_args->>'licenseNumber','')))<2 OR length(_args->>'fullName')>120 OR length(_args->>'licenseNumber')>60 THEN RAISE EXCEPTION 'INVALID_DOCTOR'; END IF;
  IF nullif(_args->>'email','') IS NOT NULL AND (_args->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'INVALID_DOCTOR'; END IF;
  IF EXISTS(SELECT 1 FROM doctors WHERE lower(license_number)=lower(btrim(_args->>'licenseNumber'))) THEN RAISE EXCEPTION 'LICENSE_ALREADY_REGISTERED'; END IF;
  INSERT INTO doctors(full_name,license_number,license_expires_on,specialty,phone,email,location_id,status)
   VALUES(btrim(_args->>'fullName'),btrim(_args->>'licenseNumber'),nullif(_args->>'licenseExpiresOn','')::date,nullif(left(_args->>'specialty',120),''),nullif(left(_args->>'phone',40),''),nullif(lower(_args->>'email'),''),loc,'PENDING') RETURNING * INTO d;
  INSERT INTO audit_log(actor_user_id,partner_id,action,entity_type,entity_id,metadata) VALUES(u,home,'DOCTOR_REGISTERED','doctor',d.id::text,jsonb_build_object('location_id',loc));
  RETURN to_jsonb(d);
 END IF;

 IF _op IN ('LINK_ACCOUNT','VERIFY','SUSPEND','REINSTATE','REVOKE_ACCESS','ASSIGN') THEN
  SELECT * INTO d FROM doctors WHERE id=_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  home:=location_partner(d.location_id);
  IF _op='ASSIGN' THEN
   p:=(_args->>'partnerId')::uuid; loc:=nullif(_args->>'locationId','')::uuid;
   IF p IS NULL OR NOT EXISTS(SELECT 1 FROM partners WHERE id=p) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
   IF loc IS NOT NULL AND location_partner(loc) IS DISTINCT FROM p THEN RAISE EXCEPTION 'BRANCH_OUTSIDE_ORGANIZATION'; END IF;
   IF NOT partner_review_scope(u,p) THEN RAISE EXCEPTION 'REVIEWER_REQUIRED'; END IF;
   -- A scoped admin may only assign doctors they can already see (home branch in scope or already assigned in scope).
   IF NOT (can_write_platform(u) OR partner_review_scope(u,home) OR doctor_assignment_visible(d.id,u)) THEN RAISE EXCEPTION 'REVIEWER_REQUIRED'; END IF;
   PERFORM care_require_strong();
   IF d.status<>'ACTIVE' THEN RAISE EXCEPTION 'DOCTOR_NOT_ACTIVE'; END IF;
   SELECT * INTO a FROM doctor_assignments WHERE doctor_id=d.id AND partner_id=p AND location_id IS NOT DISTINCT FROM loc FOR UPDATE;
   IF a.id IS NULL THEN
    INSERT INTO doctor_assignments(doctor_id,partner_id,location_id,assigned_by) VALUES(d.id,p,loc,u) RETURNING * INTO a;
   ELSIF a.status='REVOKED' THEN RAISE EXCEPTION 'ASSIGNMENT_REVOKED';
   ELSIF a.status='SUSPENDED' THEN UPDATE doctor_assignments SET status='ACTIVE',reason=NULL,assigned_by=u,updated_at=now() WHERE id=a.id RETURNING * INTO a;
   END IF;
   INSERT INTO audit_log(actor_user_id,partner_id,action,entity_type,entity_id,metadata) VALUES(u,p,'DOCTOR_ASSIGNED','doctor_assignment',a.id::text,jsonb_build_object('doctor_id',d.id,'location_id',loc));
   RETURN to_jsonb(a);
  END IF;
  IF NOT (can_write_platform(u) OR (home IS NOT NULL AND partner_review_scope(u,home))) THEN RAISE EXCEPTION 'REVIEWER_REQUIRED'; END IF;
  PERFORM care_require_strong();
  IF _op='LINK_ACCOUNT' THEN
   IF d.email IS NULL THEN RAISE EXCEPTION 'EMAIL_REQUIRED'; END IF;
   SELECT id INTO prof FROM profiles WHERE lower(email)=lower(d.email) LIMIT 1;
   IF prof IS NULL THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
   IF EXISTS(SELECT 1 FROM doctors WHERE auth_user_id=prof AND id<>d.id) THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_LINKED'; END IF;
   UPDATE doctors SET auth_user_id=prof WHERE id=d.id RETURNING * INTO d;
  ELSIF _op='VERIFY' THEN
   IF d.status NOT IN ('PENDING','SUSPENDED') THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
   IF d.license_expires_on IS NULL OR d.license_expires_on<current_date OR nullif(btrim(coalesce(d.specialty,'')),'') IS NULL THEN RAISE EXCEPTION 'PROFESSIONAL_DETAILS_INCOMPLETE'; END IF;
   IF d.auth_user_id IS NULL THEN RAISE EXCEPTION 'ACCOUNT_NOT_LINKED'; END IF;
   UPDATE doctors SET status='ACTIVE',approved_by=u,approved_at=now() WHERE id=d.id RETURNING * INTO d;
   IF NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=d.auth_user_id AND role='DOCTOR' AND partner_id IS NOT DISTINCT FROM home) THEN
    INSERT INTO user_roles(user_id,role,partner_id,status) VALUES(d.auth_user_id,'DOCTOR',home,'ACTIVE');
   ELSE UPDATE user_roles SET status='ACTIVE' WHERE user_id=d.auth_user_id AND role='DOCTOR' AND partner_id IS NOT DISTINCT FROM home; END IF;
  ELSIF _op='SUSPEND' THEN
   IF d.status<>'ACTIVE' THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
   IF v_reason IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
   UPDATE doctors SET status='SUSPENDED' WHERE id=d.id RETURNING * INTO d;
   UPDATE user_roles SET status='SUSPENDED' WHERE user_id=d.auth_user_id AND role='DOCTOR' AND status='ACTIVE';
  ELSIF _op='REINSTATE' THEN
   _op:='VERIFY'; RETURN doctor_command('VERIFY',_id,_args);
  ELSIF _op='REVOKE_ACCESS' THEN
   IF v_reason IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
   UPDATE doctors SET status='SUSPENDED' WHERE id=d.id RETURNING * INTO d;
   UPDATE doctor_assignments SET status='REVOKED',reason=v_reason,updated_at=now() WHERE doctor_id=d.id AND status<>'REVOKED';
   UPDATE user_roles SET status='REMOVED' WHERE user_id=d.auth_user_id AND role='DOCTOR';
  END IF;
  INSERT INTO audit_log(actor_user_id,partner_id,action,entity_type,entity_id,metadata) VALUES(u,home,'DOCTOR_'||_op,'doctor',d.id::text,jsonb_build_object('reason',v_reason));
  RETURN to_jsonb(d);
 END IF;

 IF _op='SET_ASSIGNMENT' THEN
  SELECT * INTO a FROM doctor_assignments WHERE id=_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT partner_review_scope(u,a.partner_id) THEN RAISE EXCEPTION 'REVIEWER_REQUIRED'; END IF;
  PERFORM care_require_strong();
  IF a.status='REVOKED' THEN RAISE EXCEPTION 'ASSIGNMENT_REVOKED'; END IF;
  IF (_args->>'status') NOT IN ('ACTIVE','SUSPENDED','REVOKED') THEN RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
  IF (_args->>'status')<>'ACTIVE' AND v_reason IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF (_args->>'status')='ACTIVE' AND NOT EXISTS(SELECT 1 FROM doctors WHERE id=a.doctor_id AND status='ACTIVE') THEN RAISE EXCEPTION 'DOCTOR_NOT_ACTIVE'; END IF;
  UPDATE doctor_assignments SET status=_args->>'status',reason=v_reason,updated_at=now() WHERE id=a.id RETURNING * INTO a;
  INSERT INTO audit_log(actor_user_id,partner_id,action,entity_type,entity_id,metadata) VALUES(u,a.partner_id,'DOCTOR_ASSIGNMENT_'||a.status,'doctor_assignment',a.id::text,jsonb_build_object('reason',v_reason));
  RETURN to_jsonb(a);
 END IF;
 RAISE EXCEPTION 'UNKNOWN_OPERATION';
END $$;
REVOKE ALL ON FUNCTION public.doctor_command(text,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.doctor_command(text,uuid,jsonb) TO authenticated;

-- Consultation assignment scope: once a doctor has any organization assignment, a consultation may only be
-- assigned to them within an organization where that assignment is ACTIVE. Unassigned legacy doctors keep prior behaviour.
CREATE OR REPLACE FUNCTION public.consultation_doctor_scope_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.assigned_doctor_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.assigned_doctor_id IS DISTINCT FROM OLD.assigned_doctor_id) THEN
  IF EXISTS(SELECT 1 FROM doctor_assignments WHERE doctor_id=NEW.assigned_doctor_id)
     AND NOT EXISTS(SELECT 1 FROM doctor_assignments WHERE doctor_id=NEW.assigned_doctor_id AND partner_id=NEW.partner_id AND status='ACTIVE') THEN
   RAISE EXCEPTION 'DOCTOR_NOT_ASSIGNED_TO_ORGANIZATION';
  END IF;
 END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS consultation_doctor_scope ON public.consultations;
CREATE TRIGGER consultation_doctor_scope BEFORE INSERT OR UPDATE OF assigned_doctor_id ON public.consultations FOR EACH ROW EXECUTE FUNCTION public.consultation_doctor_scope_guard();
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.doctor_assignments FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.doctor_availability FROM authenticated, anon;
REVOKE ALL ON public.doctor_assignments FROM anon;
REVOKE ALL ON public.doctor_availability FROM anon;
