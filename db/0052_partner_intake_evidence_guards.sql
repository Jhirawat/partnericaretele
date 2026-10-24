CREATE FUNCTION public.partner_intake_evidence_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE g jsonb; BEGIN
IF TG_OP='UPDATE' THEN
IF NEW.evidence IS DISTINCT FROM OLD.evidence OR NEW.gates IS DISTINCT FROM OLD.gates OR NEW.config_id IS DISTINCT FROM OLD.config_id OR NEW.evaluated_by IS DISTINCT FROM OLD.evaluated_by OR NEW.evaluated_at IS DISTINCT FROM OLD.evaluated_at OR NEW.patient_id IS DISTINCT FROM OLD.patient_id OR NEW.partner_id IS DISTINCT FROM OLD.partner_id OR NEW.location_id IS DISTINCT FROM OLD.location_id OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.emergency IS DISTINCT FROM OLD.emergency THEN RAISE EXCEPTION 'ASSESSMENT_IMMUTABLE'; END IF;
ELSE
IF length(btrim(coalesce(NEW.evidence->>'consentEvidence',''))) NOT BETWEEN 1 AND 1000 THEN
 g:=jsonb_set(NEW.gates,'{1,result}','"FAIL"'); NEW.gates:=g;
 IF NEW.status='READY' THEN NEW.status:='MANUAL_REVIEW'; END IF;
END IF;
END IF; RETURN NEW; END $$;
CREATE TRIGGER partner_intake_evidence BEFORE INSERT OR UPDATE ON public.partner_intakes FOR EACH ROW EXECUTE FUNCTION public.partner_intake_evidence_guard();
CREATE FUNCTION public.partner_config_validation_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE k text; BEGIN
IF length(btrim(coalesce(NEW.settings->>'consentVersion',''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_CONFIGURATION'; END IF;
FOREACH k IN ARRAY ARRAY['redFlags','exclusions','serviceReasons','jurisdictions'] LOOP
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.settings->k) x WHERE length(btrim(x#>>'{}')) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'INVALID_CONFIGURATION'; END IF;
END LOOP; RETURN NEW; END $$;
CREATE TRIGGER partner_config_validation BEFORE INSERT ON public.partner_screening_configs FOR EACH ROW EXECUTE FUNCTION public.partner_config_validation_guard();
REVOKE ALL ON FUNCTION public.partner_intake_evidence_guard(),public.partner_config_validation_guard() FROM PUBLIC,anon,authenticated;