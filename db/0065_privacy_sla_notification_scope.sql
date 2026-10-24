-- Resolve SLA reminders to their real customer source without exposing its content.
CREATE OR REPLACE FUNCTION public.privacy_notification_patient(_kind text,_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT patient_id FROM consultation_requests WHERE _kind='request' AND id=_id
UNION ALL SELECT r.patient_id FROM care_certificates c JOIN consultation_requests r ON r.id=c.request_id WHERE _kind='certificate' AND c.id=_id
UNION ALL SELECT r.patient_id FROM care_mcs_handoffs h JOIN consultation_requests r ON r.id=h.request_id WHERE _kind='handoff' AND h.id=_id
UNION ALL SELECT coalesce(r.patient_id,i.patient_id,cr.patient_id,hr.patient_id,f.patient_id) FROM operational_sla_cases s LEFT JOIN consultation_requests r ON r.id=s.source_id LEFT JOIN partner_intakes i ON i.id=s.source_id LEFT JOIN care_certificates c ON c.id=s.source_id LEFT JOIN consultation_requests cr ON cr.id=c.request_id LEFT JOIN care_mcs_handoffs h ON h.id=s.source_id LEFT JOIN consultation_requests hr ON hr.id=h.request_id LEFT JOIN care_followups f ON f.id=s.source_id WHERE _kind='sla' AND s.id=_id LIMIT 1 $$;
CREATE OR REPLACE FUNCTION public.notification_source_access(_kind text,_id uuid,_p uuid,_l uuid,_u uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
IF _u IS NULL OR privacy_blocked(privacy_notification_patient(_kind,_id),'NOTIFICATION') THEN RETURN false;END IF;
IF _kind='sla' THEN RETURN EXISTS(SELECT 1 FROM operational_sla_cases s WHERE s.id=_id AND s.partner_id=_p AND s.location_id IS NOT DISTINCT FROM _l AND sla_scope(_u,s.partner_id,s.location_id));END IF;
IF _kind='application' THEN RETURN partner_application_access(_id,_u);END IF;
IF _kind='request' THEN RETURN consultation_request_access(_id,_u);END IF;
IF _kind='certificate' THEN RETURN certificate_read(_id,_u);END IF;
IF _kind='handoff' THEN RETURN EXISTS(SELECT 1 FROM care_mcs_handoffs h WHERE h.id=_id AND (notification_admin(_u,h.partner_id) OR partner_customer_write(_u,h.partner_id,h.location_id)));END IF;
IF _kind IN ('doctor','assignment') THEN RETURN notification_admin(_u,_p) OR EXISTS(SELECT 1 FROM doctors d LEFT JOIN doctor_assignments a ON a.doctor_id=d.id WHERE d.auth_user_id=_u AND ((_kind='doctor' AND d.id=_id) OR (_kind='assignment' AND a.id=_id)) AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=_u AND r.role='DOCTOR' AND r.status='ACTIVE'));END IF;
RETURN notification_admin(_u,_p);END $$;