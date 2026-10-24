DROP POLICY IF EXISTS "update refunds" ON public.refunds;
CREATE POLICY "update refunds" ON public.refunds FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.payment_transactions pt
    WHERE pt.id = payment_transaction_id AND public.can_read_finance(auth.uid(), pt.partner_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.payment_transactions pt
    WHERE pt.id = payment_transaction_id AND public.can_read_finance(auth.uid(), pt.partner_id)));

-- Trusted read for the patient portal: returns only the caller's own linked record,
-- their consultations, memberships and message history.
CREATE OR REPLACE FUNCTION public.get_my_patient_portal()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p public.patients;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO _p FROM public.patients WHERE auth_user_id = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('patient', null, 'consultations', '[]'::jsonb, 'memberships', '[]'::jsonb, 'messages', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object(
    'patient', jsonb_build_object(
      'id', _p.id, 'external_patient_id', _p.external_patient_id, 'first_name', _p.first_name,
      'last_name', _p.last_name, 'hn', _p.hn, 'email', _p.email, 'phone_number', _p.phone_number,
      'whatsapp_number', _p.whatsapp_number, 'line_user_id', _p.line_user_id,
      'preferred_language', _p.preferred_language, 'notify_email', _p.notify_email,
      'notify_whatsapp', _p.notify_whatsapp, 'notify_line', _p.notify_line),
    'consultations', COALESCE((SELECT jsonb_agg(c ORDER BY c.created_at DESC) FROM (
      SELECT id, consultation_id, status, room_url, scheduled_at, started_at, completed_at, created_at
      FROM public.consultations WHERE patient_id = _p.id ORDER BY created_at DESC LIMIT 50) c), '[]'::jsonb),
    'memberships', COALESCE((SELECT jsonb_agg(m ORDER BY m.created_at DESC) FROM (
      SELECT ms.id, ms.status, ms.starts_at, ms.expires_at, ms.created_at,
             jsonb_build_object('name', mp.name, 'code', mp.code) AS membership_plans
      FROM public.memberships ms LEFT JOIN public.membership_plans mp ON mp.id = ms.plan_id
      WHERE ms.patient_id = _p.id) m), '[]'::jsonb),
    'messages', COALESCE((SELECT jsonb_agg(n ORDER BY n.queued_at DESC) FROM (
      SELECT id, channel, status, template, queued_at, sent_at
      FROM public.notification_deliveries WHERE patient_id = _p.id ORDER BY queued_at DESC LIMIT 50) n), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_patient_portal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_patient_portal() TO authenticated;