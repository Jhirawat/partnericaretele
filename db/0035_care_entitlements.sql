-- Phase 06: subscription entitlement model.
-- Distinguishes manually-paid Annual Care (auto_renew=false, MANUAL periods) from
-- genuine auto-renew subscriptions (auto_renew=true, STRIPE periods — sync in phase 12).
-- ACTIVE status alone is never sufficient: a paid period must cover the appointment
-- start, the service must be covered, and the quota must not be exhausted.
-- Additive only; existing memberships/usage history untouched. Nothing activated.

CREATE TABLE public.care_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code text NOT NULL,
  version integer NOT NULL,
  name text NOT NULL,
  name_th text,
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  currency text NOT NULL DEFAULT 'THB',
  duration_months integer NOT NULL DEFAULT 12,
  quota integer,                 -- included assessments per period; NULL when unlimited
  unlimited boolean NOT NULL DEFAULT false,
  service_coverage jsonb NOT NULL DEFAULT '[]',  -- covered service_ids; empty = none
  auto_renew boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','APPROVED','RETIRED')),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_code, version)
);
GRANT SELECT ON public.care_plan_versions TO authenticated;
GRANT ALL ON public.care_plan_versions TO service_role;
ALTER TABLE public.care_plan_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY care_plan_versions_read ON public.care_plan_versions FOR SELECT TO authenticated
  USING (status = 'APPROVED' OR public.is_platform_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.care_plan_version_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'PLAN_VERSION_IMMUTABLE'; END IF;
  IF OLD.status = 'APPROVED' THEN
    IF NEW.status NOT IN ('APPROVED','RETIRED')
      OR NEW.price_minor IS DISTINCT FROM OLD.price_minor
      OR NEW.quota IS DISTINCT FROM OLD.quota
      OR NEW.unlimited IS DISTINCT FROM OLD.unlimited
      OR NEW.service_coverage IS DISTINCT FROM OLD.service_coverage
      OR NEW.auto_renew IS DISTINCT FROM OLD.auto_renew
      OR NEW.duration_months IS DISTINCT FROM OLD.duration_months
    THEN RAISE EXCEPTION 'PLAN_VERSION_IMMUTABLE'; END IF;
  END IF;
  IF NEW.status = 'APPROVED' AND OLD.status <> 'APPROVED' THEN NEW.approved_at := now(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER care_plan_version_guard BEFORE UPDATE OR DELETE ON public.care_plan_versions
  FOR EACH ROW EXECUTE FUNCTION public.care_plan_version_guard();

-- Paid periods: entitlement exists only inside a paid period. Consumed usage is
-- never reset at renewal; each period is a separate row.
CREATE TABLE public.care_membership_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES public.memberships(id),
  plan_version_id uuid NOT NULL REFERENCES public.care_plan_versions(id),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  payment_id uuid REFERENCES public.care_payments(id),
  source text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','STRIPE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (membership_id, period_start),
  CHECK (period_end > period_start)
);
CREATE INDEX care_membership_periods_idx ON public.care_membership_periods (membership_id, period_start);
GRANT SELECT ON public.care_membership_periods TO authenticated;
GRANT ALL ON public.care_membership_periods TO service_role;
ALTER TABLE public.care_membership_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY care_membership_periods_read ON public.care_membership_periods FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.memberships m JOIN public.patients p ON p.id = m.patient_id
    WHERE m.id = membership_id AND (
      p.auth_user_id = auth.uid() OR public.is_platform_staff(auth.uid())
      OR public.belongs_to_partner(auth.uid(), p.partner_id)
    )
  ));

-- Entitlement check: ACTIVE membership + paid period covering _at + service covered
-- + quota not exhausted (usage counted per period, never reset). Returns a DTO.
CREATE OR REPLACE FUNCTION public.care_entitlement(_patient uuid, _at timestamptz, _service uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _m record; _p record; _v record; _used int;
BEGIN
  SELECT m.id, m.status, m.expires_at INTO _m
  FROM public.memberships m
  WHERE m.patient_id = _patient AND m.status = 'ACTIVE'
  ORDER BY m.expires_at DESC NULLS LAST LIMIT 1;
  IF _m.id IS NULL THEN
    RETURN jsonb_build_object('entitled', false, 'reason', 'NO_ACTIVE_MEMBERSHIP');
  END IF;
  IF _m.expires_at IS NOT NULL AND _m.expires_at <= _at THEN
    RETURN jsonb_build_object('entitled', false, 'reason', 'MEMBERSHIP_EXPIRED', 'membership_id', _m.id);
  END IF;
  SELECT p.* INTO _p FROM public.care_membership_periods p
  WHERE p.membership_id = _m.id AND p.period_start <= _at AND p.period_end > _at
  ORDER BY p.period_start DESC LIMIT 1;
  IF _p.id IS NULL THEN
    RETURN jsonb_build_object('entitled', false, 'reason', 'NO_PAID_PERIOD', 'membership_id', _m.id);
  END IF;
  SELECT * INTO _v FROM public.care_plan_versions WHERE id = _p.plan_version_id;
  IF _v.id IS NULL OR _v.status <> 'APPROVED' THEN
    RETURN jsonb_build_object('entitled', false, 'reason', 'PLAN_NOT_APPROVED', 'membership_id', _m.id);
  END IF;
  IF _service IS NOT NULL AND NOT (_v.service_coverage ? _service::text) THEN
    RETURN jsonb_build_object('entitled', false, 'reason', 'SERVICE_NOT_COVERED', 'membership_id', _m.id);
  END IF;
  IF NOT _v.unlimited THEN
    SELECT count(*) INTO _used FROM public.care_annual_usage u
    JOIN public.consultations c ON c.id = u.consultation_id
    WHERE u.membership_id = _m.id AND u.action = 'CONSUME'
      AND u.created_at >= _p.period_start AND u.created_at < _p.period_end;
    IF _v.quota IS NOT NULL AND _used >= _v.quota THEN
      RETURN jsonb_build_object('entitled', false, 'reason', 'QUOTA_EXHAUSTED',
        'membership_id', _m.id, 'used', _used, 'quota', _v.quota);
    END IF;
    RETURN jsonb_build_object('entitled', true, 'reason', 'OK', 'membership_id', _m.id,
      'period_id', _p.id, 'used', _used, 'quota', _v.quota,
      'auto_renew', _v.auto_renew, 'source', _p.source);
  END IF;
  RETURN jsonb_build_object('entitled', true, 'reason', 'OK', 'membership_id', _m.id,
    'period_id', _p.id, 'unlimited', true, 'auto_renew', _v.auto_renew, 'source', _p.source);
END $$;
GRANT EXECUTE ON FUNCTION public.care_entitlement(uuid, timestamptz, uuid) TO authenticated;

-- Audited manual period recording (staff marks a manual payment received).
-- Stripe periods are written by the verified webhook path (service_role) in phase 12.
CREATE OR REPLACE FUNCTION public.care_record_period(_membership uuid, _plan_version uuid,
  _start timestamptz, _end timestamptz, _payment uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid; _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
  SELECT p.partner_id INTO _org FROM public.memberships m JOIN public.patients p ON p.id = m.patient_id
  WHERE m.id = _membership;
  IF _org IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (public.care_super(auth.uid()) OR public.can_manage_partner(auth.uid(), _org)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  PERFORM public.care_require_strong();
  INSERT INTO public.care_membership_periods (membership_id, plan_version_id, period_start, period_end, payment_id, source)
  VALUES (_membership, _plan_version, _start, _end, _payment, 'MANUAL') RETURNING id INTO _id;
  INSERT INTO public.audit_log (actor_user_id, partner_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), _org, 'MEMBERSHIP_PERIOD_RECORD', 'care_membership_periods', _id::text,
    jsonb_build_object('membership_id', _membership, 'plan_version_id', _plan_version,
      'period_start', _start, 'period_end', _end, 'payment_id', _payment));
  RETURN _id;
END $$;
GRANT EXECUTE ON FUNCTION public.care_record_period(uuid, uuid, timestamptz, timestamptz, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.care_plan_version_guard() FROM PUBLIC, anon, authenticated;
