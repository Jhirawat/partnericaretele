CREATE TABLE public.care_clinician_payables (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), consultation_id uuid NOT NULL UNIQUE REFERENCES public.consultations(id),
 doctor_id uuid NOT NULL REFERENCES public.doctors(id), amount_minor bigint NOT NULL CHECK(amount_minor>0),
 contract_reference text NOT NULL, approved_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.care_clinician_payables ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.care_clinician_payables FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.care_clinician_payables TO authenticated;
CREATE POLICY care_payables_read ON public.care_clinician_payables FOR SELECT TO authenticated USING(care_finance(auth.uid()));
CREATE FUNCTION public.care_patient_scope(_p uuid,_u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM patients p WHERE p.id=_p AND (p.auth_user_id=_u OR care_finance(_u) OR care_platform(_u) OR can_manage_partner(_u,p.partner_id)
 OR EXISTS(SELECT 1 FROM consultations c JOIN care_branch_permissions b ON b.location_id=c.care_location_id AND b.partner_id=c.partner_id WHERE c.patient_id=p.id AND b.user_id=_u AND b.queue_allowed)
 OR EXISTS(SELECT 1 FROM consultations c JOIN doctors d ON d.id=c.assigned_doctor_id WHERE c.patient_id=p.id AND d.auth_user_id=_u AND is_active_doctor(_u))))
$$;

CREATE FUNCTION public.care_read(_org uuid DEFAULT NULL,_page integer DEFAULT 0,_query text DEFAULT '',_filter text DEFAULT 'ALL') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid:=auth.uid(); org uuid:=_org; result jsonb; finance boolean; BEGIN
 IF u IS NULL OR _page<0 OR length(_query)>100 OR _filter NOT IN ('ALL','EXPIRING','EXPIRED','ACTIVE') THEN RAISE EXCEPTION 'INVALID_READ'; END IF;
 IF org IS NULL THEN SELECT id INTO org FROM partners WHERE care_ops_scope(id,u) ORDER BY display_name LIMIT 1; END IF;
 IF org IS NOT NULL AND NOT care_ops_scope(org,u) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 finance:=care_finance_scope(org,u);
 result:=jsonb_build_object(
 'organisations',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'name',display_name,'model',care_credit_model)),'[]') FROM partners WHERE care_ops_scope(id,u)),
 'organisationId',org,'isFinance',care_finance(u),'isAdmin',care_super(u),'isOwner',can_manage_partner(u,org),
 'terms',(SELECT to_jsonb(t) FROM care_terms t ORDER BY active DESC,created_at DESC LIMIT 1),
 'integrations',jsonb_build_object('clinical','Demo — clinical integration not connected','payments','Manual transfer — authorised finance verification','store','Manual approval and fulfilment — store not connected','email','Disconnected','line','Disconnected','whatsapp','Disconnected','sms','Disconnected'),
 'position',jsonb_build_object('available',care_available(org),'reserved',(SELECT count(*) FROM care_holds WHERE partner_id=org AND state='RESERVED' AND lot_id IS NOT NULL),
  'used',(SELECT COALESCE(sum(used),0) FROM care_credit_lots WHERE partner_id=org),
  'expired',(SELECT COALESCE(sum(granted-used-voided-(SELECT count(*) FROM care_holds h WHERE h.lot_id=l.id AND h.state='RESERVED')),0) FROM care_credit_lots l WHERE partner_id=org AND expires_at<=now()),
  'expiring',(SELECT COALESCE(sum(granted-used-voided-(SELECT count(*) FROM care_holds h WHERE h.lot_id=l.id AND h.state='RESERVED')),0) FROM care_credit_lots l WHERE partner_id=org AND expires_at>now() AND expires_at<=now()+interval '30 days'),
  'monthUsed',(SELECT count(*) FROM care_holds WHERE partner_id=org AND state='CONSUMED' AND lot_id IS NOT NULL AND resolved_at>=date_trunc('month',now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'),
  'recent30DaysUsed',(SELECT count(*) FROM care_holds WHERE partner_id=org AND state='CONSUMED' AND lot_id IS NOT NULL AND resolved_at>=now()-interval '30 days'),
  'annualRemaining',(SELECT COALESCE(sum(12-care_used),0) FROM memberships WHERE care_sponsor_id=org AND status='ACTIVE' AND expires_at>now()),
  'rewards',CASE WHEN finance THEN care_rewards_available(org) ELSE NULL END),
 'branches',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') FROM locations l WHERE l.partner_id=org AND (can_manage_partner(u,org) OR care_platform(u) OR care_finance(u) OR EXISTS(SELECT 1 FROM care_branch_permissions b WHERE b.user_id=u AND b.location_id=l.id))),
 'staff',CASE WHEN can_manage_partner(u,org) OR care_super(u) THEN (SELECT COALESCE(jsonb_agg(jsonb_build_object('userId',user_id,'role',role,'status',status)),'[]') FROM user_roles WHERE partner_id=org) ELSE '[]'::jsonb END,
 'patients',(SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]') FROM (
  SELECT p.id,p.first_name,p.last_name,p.service_reminder_consent,p.marketing_consent,
   (SELECT jsonb_agg(jsonb_build_object('id',m.id,'starts_at',m.starts_at,'expires_at',m.expires_at,'used',m.care_used,'reserved',(SELECT count(*) FROM care_holds h WHERE h.membership_id=m.id AND h.state='RESERVED'),'status',m.status,'channel',m.care_channel,'sponsor',m.care_sponsor_id)) FROM memberships m WHERE m.patient_id=p.id AND m.care_terms IS NOT NULL) AS annual
  FROM patients p WHERE p.partner_id=org AND care_patient_scope(p.id,u) AND (p.first_name||' '||p.last_name) ILIKE '%'||_query||'%'
  AND (_filter='ALL' OR EXISTS(SELECT 1 FROM memberships m WHERE m.patient_id=p.id AND m.care_terms IS NOT NULL AND CASE _filter WHEN 'EXPIRING' THEN m.expires_at>now() AND m.expires_at<=now()+interval '30 days' WHEN 'EXPIRED' THEN m.expires_at<=now() ELSE m.status='ACTIVE' AND m.expires_at>now() END))
  ORDER BY p.last_name,p.first_name,p.id LIMIT 25 OFFSET _page*25) x),
 'queue',(SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT c.id,c.consultation_id,c.patient_id,c.status,c.care_kind,c.care_location_id,c.scheduled_at,c.assigned_doctor_id,c.created_at FROM consultations c WHERE c.partner_id=org AND c.care_model AND care_encounter_scope(c.id,u) ORDER BY c.created_at DESC LIMIT 50) x),
 'payments',CASE WHEN finance THEN (SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,kind,channel,collector,provider,amount_minor,credits,status,external_reference,created_at FROM care_payments WHERE partner_id=org ORDER BY created_at DESC LIMIT 50) x) ELSE '[]'::jsonb END,
 'redemptions',CASE WHEN finance THEN (SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,points,product_code,state,created_at FROM care_reward_reservations WHERE partner_id=org ORDER BY created_at DESC LIMIT 50) x) ELSE '[]'::jsonb END);
 RETURN result;
END $$;
CREATE FUNCTION public.care_patient_portal() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE u uuid:=auth.uid(); BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
 RETURN jsonb_build_object(
 'patients',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'partnerId',p.partner_id,'name',p.first_name||' '||p.last_name,'serviceConsent',p.service_reminder_consent,'marketingConsent',p.marketing_consent)),'[]') FROM patients p WHERE auth_user_id=u),
 'packages',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,'patientId',m.patient_id,'startsAt',starts_at,'expiresAt',expires_at,'used',care_used,'reserved',(SELECT count(*) FROM care_holds h WHERE h.membership_id=m.id AND h.state='RESERVED'),'status',status,'channel',care_channel,'remaining',CASE WHEN m.status='ACTIVE' AND m.expires_at>now() THEN 12-care_used ELSE 0 END,'medicinesIncluded',false,'autoRenew',false)),'[]') FROM memberships m JOIN patients p ON p.id=m.patient_id WHERE p.auth_user_id=u AND m.care_terms IS NOT NULL),
 'encounters',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'reference',consultation_id,'status',status,'scheduledAt',scheduled_at,'completedAt',completed_at)),'[]') FROM consultations c JOIN patients p ON p.id=c.patient_id WHERE p.auth_user_id=u AND care_model),
 'documents',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',d.id,'date',document_date,'kind',kind)),'[]') FROM care_documents d WHERE care_document_access(d.id,u)),
 'reminders',(SELECT COALESCE(jsonb_agg(jsonb_build_object('dueAt',due_at,'purpose',purpose,'status',status)),'[]') FROM care_reminders r JOIN patients p ON p.id=r.patient_id WHERE p.auth_user_id=u));
END $$;

CREATE FUNCTION public.care_reconciliation(_org uuid DEFAULT NULL,_export boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE u uuid:=auth.uid(); BEGIN
 IF u IS NULL OR NOT (care_finance(u) OR (_org IS NOT NULL AND can_manage_partner(u,_org))) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 INSERT INTO care_audit(actor,partner_id,action) VALUES(u,_org,CASE WHEN _export THEN 'RECONCILIATION_EXPORT' ELSE 'RECONCILIATION_READ' END);
 RETURN jsonb_build_object('currency','THB','accounting','Subject to accountant approval; service allocation is illustrative, not booked revenue',
 'cashReceivedMinor',(SELECT COALESCE(sum(amount_minor),0) FROM care_payments WHERE collector='THAIKANYA' AND paid_at IS NOT NULL AND (_org IS NULL OR partner_id=_org)),
 'partnerCollectedMinor',(SELECT COALESCE(sum(amount_minor),0) FROM care_payments WHERE collector<>'THAIKANYA' AND paid_at IS NOT NULL AND (_org IS NULL OR partner_id=_org)),
 'refundsMinor',(SELECT COALESCE(sum(r.amount_minor),0) FROM care_refunds r JOIN care_payments p ON p.id=r.payment_id WHERE (_org IS NULL OR p.partner_id=_org)),
 'delivered',(SELECT count(*) FROM care_holds WHERE state='CONSUMED' AND (_org IS NULL OR partner_id=_org)),
 'estimatedClinicianCostMinor',(SELECT COALESCE(sum((h.terms_snapshot->>'clinician_estimate_minor')::bigint),0) FROM care_holds h JOIN consultations c ON c.id=h.consultation_id WHERE h.state='CONSUMED' AND (_org IS NULL OR h.partner_id=_org)),
 'approvedClinicianPayableMinor',(SELECT COALESCE(sum(p.amount_minor),0) FROM care_clinician_payables p JOIN consultations c ON c.id=p.consultation_id WHERE (_org IS NULL OR c.partner_id=_org)),
 'annualUnusedUnits',(SELECT COALESCE(sum(12-care_used),0) FROM memberships WHERE care_terms IS NOT NULL AND status='ACTIVE' AND expires_at>now() AND (_org IS NULL OR care_sponsor_id=_org)),
 'creditPrepaidUnallocatedMinor',(SELECT COALESCE(sum((p.amount_minor*(l.granted-l.used-l.voided))/l.granted),0) FROM care_credit_lots l JOIN care_payments p ON p.id=l.payment_id WHERE p.status='PAID' AND (_org IS NULL OR l.partner_id=_org)),
 'creditServiceAllocationMinor',(SELECT COALESCE(sum((p.amount_minor*l.used)/l.granted),0) FROM care_credit_lots l JOIN care_payments p ON p.id=l.payment_id WHERE p.paid_at IS NOT NULL AND (_org IS NULL OR l.partner_id=_org)),
 'rewardReservedDiscountMinor',(SELECT COALESCE(sum(discount_minor),0) FROM care_reward_reservations WHERE state='RESERVED' AND (_org IS NULL OR partner_id=_org)),
 'annualServiceAllocationMinor',(SELECT COALESCE(sum((p.amount_minor*m.care_used)/12),0) FROM care_payments p JOIN memberships m ON m.id=p.membership_id WHERE p.collector='THAIKANYA' AND p.status='PAID' AND (_org IS NULL OR p.partner_id=_org)),
 'annualPrepaidUnallocatedMinor',(SELECT COALESCE(sum(p.amount_minor-((p.amount_minor*m.care_used)/12)),0) FROM care_payments p JOIN memberships m ON m.id=p.membership_id WHERE p.collector='THAIKANYA' AND p.status='PAID' AND (_org IS NULL OR p.partner_id=_org)),
 'lots',(SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT l.id,l.partner_id,l.payment_id,l.granted,l.used,l.voided,l.expires_at,(SELECT count(*) FROM care_holds h WHERE h.lot_id=l.id AND state='RESERVED') AS held FROM care_credit_lots l WHERE (_org IS NULL OR partner_id=_org)) x),
 'holds',(SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,consultation_id,lot_id,membership_id,payment_id,state FROM care_holds WHERE (_org IS NULL OR partner_id=_org)) x),
 'ledger',(SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,consultation_id,type,quantity,reference_id,idempotency_key,created_at FROM credit_transactions WHERE metadata ? 'lot_id' OR idempotency_key LIKE 'care:%') x WHERE (_org IS NULL OR EXISTS(SELECT 1 FROM credit_transactions ct WHERE ct.id=x.id AND ct.partner_id=_org))),
 'rewards',(SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,partner_id,delta,event_key,source_entry_id,created_at FROM care_reward_entries WHERE (_org IS NULL OR partner_id=_org)) x),
 'payments',(SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]') FROM (SELECT id,partner_id,kind,channel,collector,amount_minor,status,external_reference,membership_id,credit_order_id FROM care_payments WHERE (_org IS NULL OR partner_id=_org)) x));
END $$;

CREATE FUNCTION public.care_support_command(_op text,_args jsonb,_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_variable
DECLARE u uuid:=auth.uid(); eid uuid:=NULLIF(_args->>'id','')::uuid; encounter consultations; doc care_documents;
 old care_operations; result jsonb; org uuid; new_id uuid; BEGIN
 IF u IS NULL OR length(COALESCE(_key,''))<8 THEN RAISE EXCEPTION 'AUTHENTICATION_OR_KEY_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_key,0));
 SELECT * INTO old FROM care_operations WHERE key=_key;
 IF FOUND THEN IF old.actor<>u OR old.operation<>_op OR old.request<>_args THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF; RETURN old.result; END IF;
 IF _op='CONSENT' THEN
  IF NOT EXISTS(SELECT 1 FROM patients WHERE id=eid AND auth_user_id=u) THEN RAISE EXCEPTION 'PATIENT_REQUIRED'; END IF;
  UPDATE patients SET service_reminder_consent=(_args->>'service')::boolean,marketing_consent=(_args->>'marketing')::boolean WHERE id=eid;
  INSERT INTO patient_consents(patient_id,consent_type,version,accepted,recorded_by) VALUES(eid,'TELEMEDICINE',_args->>'version',COALESCE((_args->>'telemedicine')::boolean,false),u);
  UPDATE care_reminders SET status='CANCELLED' WHERE patient_id=eid AND status='QUEUED' AND ((purpose='SERVICE' AND NOT (_args->>'service')::boolean) OR (purpose='MARKETING' AND NOT (_args->>'marketing')::boolean));
  result:=jsonb_build_object('saved',true);
 ELSIF _op IN ('ASSIGN','APPROVE_PAYABLE','REGISTER_DOCUMENT') THEN
  SELECT * INTO encounter FROM consultations WHERE id=eid AND care_model FOR UPDATE; org:=encounter.partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENCOUNTER_NOT_FOUND'; END IF;
  IF _op='ASSIGN' THEN
   IF NOT care_platform(u) THEN RAISE EXCEPTION 'COORDINATOR_REQUIRED'; END IF;
   IF NOT EXISTS(SELECT 1 FROM doctors WHERE id=(_args->>'doctorId')::uuid AND status='ACTIVE' AND (license_expires_on IS NULL OR license_expires_on>=current_date)) THEN RAISE EXCEPTION 'AUTHORISED_CLINICIAN_REQUIRED'; END IF;
   IF encounter.status NOT IN ('CREATED','WAITING') THEN RAISE EXCEPTION 'ASSIGNMENT_STATE_CONFLICT'; END IF;
   UPDATE consultations SET assigned_doctor_id=(_args->>'doctorId')::uuid WHERE id=eid;
   result:=jsonb_build_object('id',eid,'assigned',true);
  ELSIF _op='APPROVE_PAYABLE' THEN
   PERFORM care_require_strong();
   IF NOT care_finance(u) OR encounter.status<>'COMPLETED' OR encounter.assigned_doctor_id IS NULL OR length(COALESCE(_args->>'contractReference',''))<3 THEN RAISE EXCEPTION 'CONFIRMED_CONTRACT_REQUIRED'; END IF;
   INSERT INTO care_clinician_payables(consultation_id,doctor_id,amount_minor,contract_reference,approved_by)
   VALUES(eid,encounter.assigned_doctor_id,(_args->>'amountMinor')::bigint,_args->>'contractReference',u) RETURNING id INTO new_id;
   result:=jsonb_build_object('id',new_id);
  ELSE
   IF NOT is_active_doctor(u) OR NOT care_clinical_access(eid,u) OR encounter.status<>'COMPLETED' THEN RAISE EXCEPTION 'ASSIGNED_CLINICIAN_REQUIRED'; END IF;
   IF length(COALESCE(_args->>'providerReference',''))<3 THEN RAISE EXCEPTION 'ACTUAL_DOCUMENT_REFERENCE_REQUIRED'; END IF;
   new_id:=gen_random_uuid();
   INSERT INTO care_documents(id,consultation_id,provider_reference,object_path,document_date,kind)
   VALUES(new_id,eid,_args->>'providerReference',new_id::text||'/document.pdf',(_args->>'documentDate')::timestamptz,_args->>'kind');
   result:=jsonb_build_object('id',new_id,'path',new_id::text||'/document.pdf','bucket','care-documents');
  END IF;
 ELSIF _op IN ('DOCUMENT_ACCESS','GRANT_DOCUMENT') THEN
  SELECT * INTO doc FROM care_documents WHERE id=eid;
  IF NOT FOUND OR NOT care_document_access(eid,u) THEN RAISE EXCEPTION 'DOCUMENT_PERMISSION_REQUIRED'; END IF;
  SELECT partner_id INTO org FROM consultations WHERE id=doc.consultation_id;
  IF _op='GRANT_DOCUMENT' THEN
   PERFORM care_require_strong();
   IF NOT care_clinical_access(doc.consultation_id,u) OR length(COALESCE(_args->>'reason',''))<3 OR (_args->>'expiresAt')::timestamptz<=now() THEN RAISE EXCEPTION 'EXPLICIT_SHARING_APPROVAL_REQUIRED'; END IF;
   INSERT INTO care_document_grants(document_id,user_id,expires_at,granted_by) VALUES(eid,(_args->>'userId')::uuid,(_args->>'expiresAt')::timestamptz,u)
   ON CONFLICT(document_id,user_id) DO UPDATE SET expires_at=excluded.expires_at,granted_by=excluded.granted_by;
   result:=jsonb_build_object('granted',true);
  ELSE result:=jsonb_build_object('path',doc.object_path,'bucket','care-documents','signedSeconds',60); END IF;
 ELSE RAISE EXCEPTION 'UNKNOWN_SUPPORT_OPERATION'; END IF;
 INSERT INTO care_operations(key,operation,actor,request,result) VALUES(_key,_op,u,_args,result);
 INSERT INTO care_audit(actor,partner_id,action,entity_id,details) VALUES(u,org,_op,eid::text,jsonb_build_object('key',_key,'reason',_args->>'reason'));
 RETURN result;
END $$;
CREATE POLICY care_storage_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='care-documents' AND public.is_active_doctor(auth.uid()) AND EXISTS(SELECT 1 FROM public.care_documents d WHERE d.object_path=name AND public.care_clinical_access(d.consultation_id,auth.uid())));
REVOKE ALL ON FUNCTION care_read(uuid,integer,text,text),care_patient_portal(),care_reconciliation(uuid,boolean),care_support_command(text,jsonb,text),care_patient_scope(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION care_read(uuid,integer,text,text),care_patient_portal(),care_reconciliation(uuid,boolean),care_support_command(text,jsonb,text),care_patient_scope(uuid,uuid) TO authenticated;
