-- Phase 05: approved immutable service/price/cancellation-policy versions.
-- Additive only. Existing services/service_prices/care_terms untouched.
-- Prices are integer THB minor units (satang). Nothing is activated here.

CREATE TABLE public.care_service_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id),
  service_id uuid REFERENCES public.services(id),
  version integer NOT NULL,
  name text NOT NULL,
  name_th text,
  description text,
  duration_minutes integer NOT NULL DEFAULT 30,
  scope text,
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  currency text NOT NULL DEFAULT 'THB',
  cancellation_policy jsonb NOT NULL DEFAULT '{}',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, service_id, version)
);
CREATE INDEX care_service_versions_current_idx
  ON public.care_service_versions (partner_id, service_id, status, effective_from);

GRANT SELECT ON public.care_service_versions TO authenticated;
GRANT ALL ON public.care_service_versions TO service_role;
ALTER TABLE public.care_service_versions ENABLE ROW LEVEL SECURITY;

-- Read: approved versions visible to org members/staff; drafts only to managers/admin.
CREATE POLICY care_service_versions_read ON public.care_service_versions FOR SELECT TO authenticated
  USING (
    (status = 'APPROVED' AND (public.belongs_to_partner(auth.uid(), partner_id) OR public.is_platform_staff(auth.uid())))
    OR public.can_manage_partner(auth.uid(), partner_id)
    OR public.care_super(auth.uid())
  );
-- No direct writes for authenticated: mutations via the audited command below.

-- Immutability: once APPROVED, content fields cannot change; the only allowed
-- transition is APPROVED -> RETIRED (status field only).
CREATE OR REPLACE FUNCTION public.care_service_version_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'SERVICE_VERSION_IMMUTABLE'; END IF;
  IF OLD.status = 'APPROVED' THEN
    IF NEW.status NOT IN ('APPROVED','RETIRED')
      OR NEW.price_minor IS DISTINCT FROM OLD.price_minor
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.name IS DISTINCT FROM OLD.name
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
      OR NEW.cancellation_policy IS DISTINCT FROM OLD.cancellation_policy
      OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
      OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
    THEN RAISE EXCEPTION 'SERVICE_VERSION_IMMUTABLE'; END IF;
  END IF;
  IF NEW.status = 'APPROVED' AND OLD.status <> 'APPROVED' THEN
    NEW.approved_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER care_service_version_guard BEFORE UPDATE OR DELETE ON public.care_service_versions
  FOR EACH ROW EXECUTE FUNCTION public.care_service_version_guard();

-- Appointments reference an immutable price/policy snapshot.
ALTER TABLE public.consultations ADD COLUMN care_price_snapshot jsonb;
COMMENT ON COLUMN public.consultations.care_price_snapshot IS
  'Immutable snapshot of the service version (name, price_minor, currency, cancellation policy) at booking time.';

-- Audited admin mutation: create a new DRAFT version or approve/retire one.
-- Requires platform admin or owning-org manager + MFA step-up. Actor from auth.uid().
CREATE OR REPLACE FUNCTION public.care_service_version_command(_op text, _args jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid; _id uuid; _v int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
  _org := (_args->>'partner_id')::uuid;
  IF _op = 'CREATE' THEN
    IF NOT (public.care_super(auth.uid()) OR public.can_manage_partner(auth.uid(), _org)) THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
    PERFORM public.care_require_strong();
    SELECT COALESCE(max(version),0)+1 INTO _v FROM public.care_service_versions
      WHERE partner_id=_org AND service_id IS NOT DISTINCT FROM (_args->>'service_id')::uuid;
    INSERT INTO public.care_service_versions
      (partner_id, service_id, version, name, name_th, description, duration_minutes, scope,
       price_minor, currency, cancellation_policy, effective_from, effective_to)
    VALUES (_org, NULLIF(_args->>'service_id','')::uuid, _v,
      _args->>'name', _args->>'name_th', _args->>'description',
      COALESCE((_args->>'duration_minutes')::int,30), _args->>'scope',
      (_args->>'price_minor')::bigint, COALESCE(_args->>'currency','THB'),
      COALESCE(_args->'cancellation_policy','{}'::jsonb),
      COALESCE(NULLIF(_args->>'effective_from','')::timestamptz, now()),
      NULLIF(_args->>'effective_to','')::timestamptz)
    RETURNING id INTO _id;
  ELSIF _op IN ('APPROVE','RETIRE') THEN
    SELECT partner_id INTO _org FROM public.care_service_versions WHERE id=(_args->>'id')::uuid;
    IF _org IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF NOT (public.care_super(auth.uid()) OR public.can_manage_partner(auth.uid(), _org)) THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
    PERFORM public.care_require_strong();
    _id := (_args->>'id')::uuid;
    UPDATE public.care_service_versions
      SET status = CASE WHEN _op='APPROVE' THEN 'APPROVED' ELSE 'RETIRED' END,
          approved_by = CASE WHEN _op='APPROVE' THEN auth.uid() ELSE approved_by END
      WHERE id = _id;
  ELSE
    RAISE EXCEPTION 'UNKNOWN_OP';
  END IF;
  INSERT INTO public.audit_log (actor_user_id, partner_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), _org, 'SERVICE_VERSION_'||_op, 'care_service_versions', _id::text, _args);
  RETURN jsonb_build_object('id', _id, 'op', _op);
END $$;
GRANT EXECUTE ON FUNCTION public.care_service_version_command(text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.care_service_version_guard() FROM PUBLIC, anon, authenticated;

-- Safe catalog read DTO: current approved versions only, safe columns, no drafts.
CREATE OR REPLACE FUNCTION public.care_catalog(_org uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(v)), '[]'::jsonb) FROM (
    SELECT DISTINCT ON (service_id)
      id, service_id, version, name, name_th, description, duration_minutes, scope,
      price_minor, currency, cancellation_policy, effective_from, effective_to
    FROM public.care_service_versions
    WHERE partner_id = _org AND status = 'APPROVED'
      AND effective_from <= now() AND (effective_to IS NULL OR effective_to > now())
    ORDER BY service_id, version DESC
  ) v
$$;
GRANT EXECUTE ON FUNCTION public.care_catalog(uuid) TO authenticated;
