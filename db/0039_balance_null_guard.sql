-- Applied directly through Lovable Cloud SQL editor on 2026-10-08.
-- Security correction after independent inspection of the deployed 0038 function.
-- Existing function privileges and balance DTO are preserved; no data changes.
-- Not stamped into the platform/Drizzle migration journal. Add to project source
-- and isolated real-role regression tests before further feature acceptance.
CREATE OR REPLACE FUNCTION public.care_personal_balance(_patient uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _p record;
BEGIN
  SELECT * INTO _p FROM public.patients WHERE id = _patient;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF auth.uid() IS NULL OR (
    _p.auth_user_id = auth.uid()
    OR public.is_platform_staff(auth.uid())
    OR public.belongs_to_partner(auth.uid(), _p.partner_id)
  ) IS NOT TRUE THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'lot_id', l.id, 'kind', l.kind, 'expires_at', l.expires_at,
      'count_available', l.granted_count - l.used_count - COALESCE(h.q, 0),
      'minor_available', l.granted_minor - l.used_minor - COALESCE(h.m, 0)
    ) ORDER BY l.expires_at), '[]'::jsonb)
    FROM public.care_personal_lots l
    LEFT JOIN (
      SELECT lot_id, sum(quantity) q, sum(amount_minor) m
      FROM public.care_personal_holds WHERE state = 'RESERVED' GROUP BY lot_id
    ) h ON h.lot_id = l.id
    WHERE l.patient_id = _patient AND l.environment = 'live' AND l.expires_at > now()
  );
END $function$;
