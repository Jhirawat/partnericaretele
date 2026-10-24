CREATE FUNCTION public.notification_anomaly_capture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p uuid:=NEW.partner_id; state_value text; kind_value text; source uuid;
BEGIN
 IF NEW.action='PARTNER_INTAKE_ASSESS' AND NEW.metadata->>'status' IN ('BLOCKED','MANUAL_REVIEW') THEN
 state_value:='manual_review';kind_value:='anomaly';source:=NEW.id;
 ELSIF NEW.action LIKE 'COVERAGE_%' AND p IS NOT NULL AND EXISTS(SELECT 1 FROM care_credit_lots l WHERE l.partner_id=p AND l.granted-l.used-l.voided-(SELECT count(*) FROM care_holds h WHERE h.lot_id=l.id AND h.state='RESERVED')<0) THEN
 state_value:='credit_anomaly';kind_value:='anomaly';source:=NEW.id;
 ELSE RETURN NEW; END IF;
 PERFORM notification_enqueue(kind_value,source,NEW.id,'credit_anomaly',p,NEW.location_id,state_value,NULL,NEW.id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notification_anomaly_capture() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER notification_anomaly AFTER INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.notification_anomaly_capture();