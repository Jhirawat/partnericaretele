CREATE FUNCTION public.care_history(_patient uuid,_page integer DEFAULT 0,_query text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL OR _page<0 OR _page>10000 OR length(_query)>100 OR NOT care_patient_scope(_patient,auth.uid()) THEN RAISE EXCEPTION 'PATIENT_HISTORY_PERMISSION_REQUIRED'; END IF;
 RETURN COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (
  SELECT c.id,c.consultation_id AS reference,c.status,c.scheduled_at,c.completed_at,c.created_at
  FROM consultations c WHERE c.patient_id=_patient AND care_encounter_scope(c.id,auth.uid()) AND c.consultation_id ILIKE '%'||_query||'%'
  ORDER BY c.created_at DESC,c.id LIMIT 25 OFFSET _page*25) x),'[]');
END $$;
REVOKE ALL ON FUNCTION care_history(uuid,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION care_history(uuid,integer,text) TO authenticated;
