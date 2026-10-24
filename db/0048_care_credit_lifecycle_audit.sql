-- Partner credit lifecycle audit (2026-10-16). Additive: care_command is
-- re-created with (1) intake coverage validation (kind must be PARTNER/ANNUAL/
-- DIRECT with its required source) and (2) an audit_log entry for every
-- reserve/consume/release recording coverage type, partner-credit units,
-- available balance before/after, reason, reference, actor and idempotency key.
-- Reserve/consume/release ledger maths are unchanged.

CREATE OR REPLACE FUNCTION public.care_coverage_balance(_org uuid,_member uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
  'credits', care_available(_org),
  'annual', (SELECT 12-m.care_used-(SELECT count(*) FROM care_holds h WHERE h.membership_id=m.id AND h.state='RESERVED')::int FROM memberships m WHERE m.id=_member))
$$;

CREATE OR REPLACE FUNCTION public.care_coverage_audit(_action text,_coverage text,_org uuid,_member uuid,_encounter uuid,
 _actor uuid,_before jsonb,_credit boolean,_reason text,_reference text,_key text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _after jsonb:=care_coverage_balance(_org,_member);
BEGIN
 INSERT INTO audit_log(actor_user_id,partner_id,action,entity_type,entity_id,metadata)
 VALUES(_actor,_org,'COVERAGE_'||_action,'care_coverage',_encounter::text,jsonb_build_object(
  'coverage',_coverage,'credit_units',CASE WHEN _credit THEN 1 ELSE 0 END,
  'annual_units',CASE WHEN _member IS NOT NULL THEN 1 ELSE 0 END,'membership_id',_member,
  'balance_before',(_before->>'credits')::int,'balance_after',(_after->>'credits')::int,
  'annual_before',(_before->>'annual')::int,'annual_after',(_after->>'annual')::int,
  'reason',_reason,'reference',_reference,'idempotency_key',_key));
END $$;
REVOKE ALL ON FUNCTION public.care_coverage_balance(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.care_coverage_audit(text,text,uuid,uuid,uuid,uuid,jsonb,boolean,text,text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.care_command(_op text,_args jsonb,_key text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
#variable_conflict use_variable
DECLARE u uuid:=auth.uid(); org uuid:=NULLIF(_args->>'partnerId','')::uuid; patient uuid:=NULLIF(_args->>'patientId','')::uuid;
 id uuid:=NULLIF(_args->>'id','')::uuid; branch uuid:=NULLIF(_args->>'locationId','')::uuid;
 terms care_terms; payment care_payments; encounter consultations; member memberships; hold care_holds; lot care_credit_lots;
 prev care_operations; settings jsonb; result jsonb; units integer; amount bigint; new_id uuid; kind text; channel text;
 needs_credit boolean; bal_before jsonb; allowed boolean; n integer; lim integer; reference text; reason text; d record;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED'; END IF;
 IF length(COALESCE(_key,''))<8 OR length(_key)>200 THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(_key,0));
 SELECT * INTO prev FROM care_operations WHERE key=_key;
 IF FOUND THEN
  IF prev.actor<>u OR prev.operation<>_op OR prev.request<>_args THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN prev.result;
 END IF;
 SELECT * INTO terms FROM care_terms WHERE active;
 reason:=_args->>'reason'; reference:=_args->>'reference';
 IF _op IN ('SAVE_TERMS','ACTIVATE_TERMS','RECONCILE_ORG','BRANCH_PERMISSION','VERIFY_PAYMENT','REFUND','DISPUTE','REWARD_AWARD','REWARD_FULFIL','REWARD_RELEASE','REVERSE') THEN
  PERFORM care_require_strong();
 END IF;

 IF _op='SAVE_TERMS' THEN
  IF NOT care_super(u) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  settings:=_args->'settings';
  IF NOT (settings ?& ARRAY['currency','annual_units','annual_months','credit_expiry_months','retail_minor','annual_minor','clinician_estimate_minor','packs']) OR settings->>'currency'<>'THB' OR (settings->>'annual_units')::int<>12 OR (settings->>'annual_months')::int<>12
   OR (settings->>'credit_expiry_months')::int NOT BETWEEN 1 AND 120
   OR (settings->>'retail_minor')::bigint<=0 OR (settings->>'annual_minor')::bigint<=0
   OR (settings->>'clinician_estimate_minor')::bigint<0
   OR jsonb_typeof(settings->'packs')<>'object' THEN RAISE EXCEPTION 'INVALID_TERMS'; END IF;
  FOR d IN SELECT key,value FROM jsonb_each_text(settings->'packs') LOOP
   IF d.key NOT IN ('25','50','100') OR d.value::bigint<=0 THEN RAISE EXCEPTION 'INVALID_PACK'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_object_keys(settings->'packs'))<>3 THEN RAISE EXCEPTION 'INVALID_PACKS'; END IF;
  IF COALESCE((settings->>'clinical_live')::boolean,false) OR COALESCE((settings->>'gateway_enabled')::boolean,false) THEN RAISE EXCEPTION 'LIVE_ADAPTER_REVIEW_REQUIRED'; END IF;
  INSERT INTO care_terms(version,settings) VALUES(_args->>'version',settings) RETURNING care_terms.id INTO new_id;
  result:=jsonb_build_object('id',new_id,'active',false);
 ELSIF _op='ACTIVATE_TERMS' THEN
  IF NOT care_super(u) OR length(COALESCE(reference,''))<3 THEN RAISE EXCEPTION 'APPROVAL_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('care:terms',0));
  SELECT * INTO terms FROM care_terms t WHERE t.id=id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TERMS_NOT_FOUND'; END IF;
  FOREACH kind IN ARRAY ARRAY['terms_approved','tax_approved','refund_approved','no_show_approved','hold_expiry_approved','cancel_approved','technical_failure_approved'] LOOP
   IF NOT COALESCE((terms.settings->>kind)::boolean,false) THEN RAISE EXCEPTION 'UNAPPROVED_SETTING: %',kind; END IF;
  END LOOP;
  IF terms.settings->'tax_snapshot' IS NULL OR terms.settings->'terms_reference' IS NULL OR terms.settings->'refund_policy' IS NULL THEN RAISE EXCEPTION 'APPROVED_POLICY_SNAPSHOTS_REQUIRED'; END IF;
  IF NOT COALESCE((terms.settings->>'hold_survives_expiry')::boolean,false) THEN RAISE EXCEPTION 'HOLD_EXPIRY_POLICY_NOT_SUPPORTED'; END IF;
  UPDATE care_terms SET active=false WHERE active;
  UPDATE care_terms SET active=true,approved_by=u,approved_at=now() WHERE care_terms.id=terms.id;
  result:=jsonb_build_object('id',terms.id,'active',true);
 ELSIF _op='RECONCILE_ORG' THEN
  IF NOT care_super(u) OR length(COALESCE(reason,''))<3 OR length(COALESCE(reference,''))<3 THEN RAISE EXCEPTION 'RECONCILIATION_APPROVAL_REQUIRED'; END IF;
  PERFORM 1 FROM partners WHERE partners.id=org AND care_credit_model='LEGACY_PENDING' AND credit_balance=(_args->>'expectedLegacyBalance')::int FOR UPDATE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM consultations WHERE partner_id=org AND credit_status='RESERVED') THEN RAISE EXCEPTION 'LEGACY_RECONCILIATION_REQUIRED'; END IF;
  units:=(_args->>'approvedOpeningUnits')::int;
  IF units<0 OR units>1000000 OR terms.id IS NULL THEN RAISE EXCEPTION 'INVALID_OPENING_OR_TERMS'; END IF;
  UPDATE partners SET care_credit_model='LOTS_V1' WHERE partners.id=org;
  INSERT INTO credit_transactions(partner_id,type,quantity,balance_after,idempotency_key,created_by,reference_id,metadata)
  VALUES(org,'ADJUSTMENT',-(_args->>'expectedLegacyBalance')::int,0,'care:legacy-close:'||org,u,reference,
   jsonb_build_object('reason',reason,'basis','LEGACY_PENDING','approved_opening_units',units));
  IF units>0 THEN
   INSERT INTO care_credit_lots(partner_id,granted,expires_at,snapshot,opening_reference)
   VALUES(org,units,(_args->>'openingExpiresAt')::timestamptz,terms.settings,reference);
   PERFORM care_post(org,NULL,'ADJUSTMENT',units,'care:opening:'||org,u,reference,jsonb_build_object('reason',reason,'legacy_balance',_args->'expectedLegacyBalance','approved_opening_units',units));
  ELSE PERFORM care_post(org,NULL,'ADJUSTMENT',0,'care:opening:'||org,u,reference,jsonb_build_object('reason',reason,'basis','LOTS_V1')); END IF;
  result:=jsonb_build_object('partnerId',org,'available',care_available(org));
 ELSIF _op='BRANCH_PERMISSION' THEN
  IF NOT care_super(u) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF NOT EXISTS(SELECT 1 FROM locations WHERE locations.id=branch AND partner_id=org) OR NOT belongs_to_partner((_args->>'userId')::uuid,org) THEN RAISE EXCEPTION 'BRANCH_OWNERSHIP_REQUIRED'; END IF;
  INSERT INTO care_branch_permissions(user_id,partner_id,location_id,queue_allowed,monthly_limit)
  VALUES((_args->>'userId')::uuid,org,branch,(_args->>'queueAllowed')::boolean,NULLIF(_args->>'monthlyLimit','')::int)
  ON CONFLICT(user_id,location_id) DO UPDATE SET queue_allowed=excluded.queue_allowed,monthly_limit=excluded.monthly_limit;
  result:=jsonb_build_object('saved',true);
 ELSIF _op='CREATE_PAYMENT' THEN
  IF terms.id IS NULL THEN RAISE EXCEPTION 'SALES_NOT_ACTIVATED'; END IF;
  kind:=_args->>'kind'; channel:=_args->>'channel';
  IF kind NOT IN ('CREDITS','ANNUAL','DIRECT') OR channel NOT IN ('PARTNER','DIRECT') THEN RAISE EXCEPTION 'INVALID_PURCHASE'; END IF;
  IF kind='CREDITS' THEN
   IF NOT (can_manage_partner(u,org) OR care_finance(u)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
   IF NOT EXISTS(SELECT 1 FROM partners WHERE partners.id=org AND care_credit_model='LOTS_V1' AND status='ACTIVE') THEN RAISE EXCEPTION 'ORG_RECONCILIATION_REQUIRED'; END IF;
   units:=(_args->>'credits')::int; amount:=(terms.settings->'packs'->>units::text)::bigint;
   IF units NOT IN (25,50,100) OR amount IS NULL THEN RAISE EXCEPTION 'INVALID_PACK'; END IF;
   IF NOT EXISTS(SELECT 1 FROM care_credit_lots WHERE partner_id=org) AND units<>50 THEN RAISE EXCEPTION 'STARTER_REQUIRES_50'; END IF;
   channel:='PARTNER'; reference:='THAIKANYA';
  ELSE
   IF NOT EXISTS(SELECT 1 FROM patients p WHERE p.id=patient AND
    (p.auth_user_id=u OR care_finance(u) OR (channel='PARTNER' AND p.partner_id=org AND can_manage_partner(u,org)))) THEN RAISE EXCEPTION 'PATIENT_SCOPE_REQUIRED'; END IF;
   IF EXISTS(SELECT 1 FROM memberships WHERE patient_id=patient AND care_terms IS NOT NULL AND status='ACTIVE' AND expires_at>now()) THEN RAISE EXCEPTION 'PATIENT_ALREADY_COVERED'; END IF;
   IF kind='DIRECT' THEN channel:='DIRECT'; END IF;
   amount:=(terms.settings->>CASE WHEN kind='ANNUAL' THEN 'annual_minor' ELSE 'retail_minor' END)::bigint;
   reference:=CASE WHEN channel='DIRECT' THEN 'THAIKANYA' ELSE _args->>'collector' END;
   IF channel='PARTNER' AND (org IS NULL OR NOT can_manage_partner(u,org) OR length(COALESCE(reference,''))<3) THEN RAISE EXCEPTION 'COLLECTING_MERCHANT_REQUIRED'; END IF;
  END IF;
  INSERT INTO care_payments(partner_id,patient_id,kind,channel,collector,credits,amount_minor,terms_id,snapshot,created_by)
  VALUES(org,patient,kind,channel,reference,units,amount,terms.id,terms.settings||jsonb_build_object('version',terms.version),u) RETURNING care_payments.id INTO new_id;
  result:=jsonb_build_object('id',new_id,'amount_minor',amount,'status','PENDING','provider','MANUAL','collector',reference);
 ELSIF _op='VERIFY_PAYMENT' THEN
  IF NOT care_finance(u) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  result:=care_settle(id,reference,_args->>'evidence',u,'MANUAL');
 ELSIF _op='INTAKE' THEN
  IF NOT EXISTS(SELECT 1 FROM patients p WHERE p.id=patient AND (p.auth_user_id=u OR belongs_to_partner(u,p.partner_id) OR care_platform(u))) THEN RAISE EXCEPTION 'PATIENT_SCOPE_REQUIRED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM patients WHERE patients.id=patient AND partner_id=org) THEN RAISE EXCEPTION 'PATIENT_ORG_MISMATCH'; END IF;
  IF branch IS NOT NULL AND NOT EXISTS(SELECT 1 FROM locations WHERE locations.id=branch AND partner_id=org AND status='ACTIVE') THEN RAISE EXCEPTION 'BRANCH_SCOPE_REQUIRED'; END IF;
  IF NOT (can_manage_partner(u,org) OR care_platform(u) OR EXISTS(SELECT 1 FROM patients WHERE patients.id=patient AND auth_user_id=u) OR EXISTS(SELECT 1 FROM care_branch_permissions WHERE user_id=u AND location_id=branch AND partner_id=org AND queue_allowed)) THEN RAISE EXCEPTION 'BRANCH_SCOPE_REQUIRED'; END IF;
  kind:=_args->>'kind';
  IF kind IS NULL OR kind NOT IN ('PARTNER','ANNUAL','DIRECT') THEN RAISE EXCEPTION 'INVALID_COVERAGE'; END IF;
  IF kind='ANNUAL' AND NULLIF(_args->>'membershipId','') IS NULL THEN RAISE EXCEPTION 'ANNUAL_MEMBERSHIP_REQUIRED'; END IF;
  IF kind='DIRECT' AND NULLIF(_args->>'paymentId','') IS NULL THEN RAISE EXCEPTION 'DIRECT_PAYMENT_REQUIRED'; END IF;
  IF kind<>'ANNUAL' AND NULLIF(_args->>'membershipId','') IS NOT NULL THEN RAISE EXCEPTION 'WRONG_ENCOUNTER_KIND'; END IF;
  INSERT INTO consultations(partner_id,patient_id,status,source,credit_status,care_model,care_location_id,care_kind,care_membership_id,care_payment_id,scheduled_at)
  VALUES(org,patient,'CREATED','PARTNER','NOT_REQUIRED',true,branch,_args->>'kind',NULLIF(_args->>'membershipId','')::uuid,NULLIF(_args->>'paymentId','')::uuid,NULLIF(_args->>'scheduledAt','')::timestamptz) RETURNING consultations.id INTO new_id;
  result:=jsonb_build_object('id',new_id,'status','CREATED','charged',false);
 ELSIF _op IN ('ACCEPT','START','COMPLETE','CANCEL','TECHNICAL_FAILURE','REVERSE') THEN
  SELECT * INTO encounter FROM consultations WHERE consultations.id=id AND care_model FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ENCOUNTER_NOT_FOUND'; END IF;
  org:=encounter.partner_id; patient:=encounter.patient_id; branch:=encounter.care_location_id;
  PERFORM 1 FROM patients p WHERE p.id=patient FOR UPDATE;
  allowed:=can_manage_partner(u,org) OR care_super(u) OR care_coordinator(u) OR EXISTS(SELECT 1 FROM care_branch_permissions WHERE user_id=u AND location_id=branch AND partner_id=org AND queue_allowed);
  IF _op IN ('START','COMPLETE','TECHNICAL_FAILURE','REVERSE') THEN
   IF NOT is_active_doctor(u) OR NOT EXISTS(SELECT 1 FROM doctors WHERE doctors.id=encounter.assigned_doctor_id AND auth_user_id=u) THEN RAISE EXCEPTION 'ASSIGNED_CLINICIAN_REQUIRED'; END IF;
   IF NOT COALESCE((terms.settings->>'manual_clinical_enabled')::boolean,false) OR length(COALESCE(reference,''))<3 THEN RAISE EXCEPTION 'MANUAL_CLINICAL_APPROVAL_REQUIRED'; END IF;
  ELSIF NOT allowed AND NOT (_op='CANCEL' AND EXISTS(SELECT 1 FROM patients WHERE patients.id=patient AND auth_user_id=u)) THEN RAISE EXCEPTION 'QUEUE_PERMISSION_REQUIRED'; END IF;
  IF encounter.care_membership_id IS NOT NULL THEN
   SELECT * INTO member FROM memberships WHERE memberships.id=encounter.care_membership_id FOR UPDATE;
   IF NOT FOUND OR member.patient_id<>patient OR member.care_terms IS NULL THEN RAISE EXCEPTION 'ANNUAL_OWNERSHIP_REQUIRED'; END IF;
   IF member.care_channel='PARTNER' AND member.care_sponsor_id<>org THEN RAISE EXCEPTION 'SPONSOR_MISMATCH'; END IF;
  END IF;
  IF encounter.care_kind='DIRECT' THEN SELECT * INTO payment FROM care_payments p WHERE p.id=encounter.care_payment_id FOR UPDATE; END IF;
  PERFORM 1 FROM partners WHERE partners.id=org FOR UPDATE;
  SELECT * INTO hold FROM care_holds WHERE consultation_id=id FOR UPDATE;
  bal_before:=care_coverage_balance(org,member.id);
  IF _op='ACCEPT' THEN
   IF encounter.status='WAITING' AND hold.state='RESERVED' THEN result:=jsonb_build_object('id',id,'status','WAITING');
   ELSE
    IF encounter.status<>'CREATED' OR hold.id IS NOT NULL OR terms.id IS NULL THEN RAISE EXCEPTION 'INVALID_QUEUE_STATE'; END IF;
    IF COALESCE((_args->>'outOfHours')::boolean,false) OR NOT COALESCE((terms.settings->>'standard_hours_approved')::boolean,false)
     OR terms.settings->'standard_hours' IS NULL
     OR extract(hour FROM COALESCE(encounter.scheduled_at,now()) AT TIME ZONE 'Asia/Bangkok')<(terms.settings->'standard_hours'->>'start')::int
     OR extract(hour FROM COALESCE(encounter.scheduled_at,now()) AT TIME ZONE 'Asia/Bangkok')>=(terms.settings->'standard_hours'->>'end')::int
     OR NOT (terms.settings->'standard_hours'->'days' @> to_jsonb(ARRAY[extract(isodow FROM COALESCE(encounter.scheduled_at,now()) AT TIME ZONE 'Asia/Bangkok')::int])) THEN RAISE EXCEPTION 'OUT_OF_HOURS_UNCONFIGURED'; END IF;
    IF encounter.care_kind='ANNUAL' THEN
     IF member.id IS NULL OR member.status<>'ACTIVE' OR member.starts_at>now() OR member.expires_at<=GREATEST(now(),COALESCE(encounter.scheduled_at,now()))
      OR member.care_used+(SELECT count(*) FROM care_holds WHERE membership_id=member.id AND state='RESERVED')>=12 THEN RAISE EXCEPTION 'ANNUAL_UNAVAILABLE'; END IF;
    ELSIF encounter.care_membership_id IS NOT NULL THEN RAISE EXCEPTION 'WRONG_ENCOUNTER_KIND';
    ELSIF EXISTS(SELECT 1 FROM memberships m WHERE m.patient_id=patient AND m.care_terms IS NOT NULL AND m.status='ACTIVE' AND m.expires_at>now()) THEN RAISE EXCEPTION 'ANNUAL_COVERAGE_MUST_BE_USED'; END IF;
    needs_credit:=encounter.care_kind='PARTNER';  -- ANNUAL (any channel) uses only the Annual Care entitlement
    IF needs_credit THEN
     IF NOT EXISTS(SELECT 1 FROM partners WHERE partners.id=org AND status='ACTIVE' AND care_credit_model='LOTS_V1') THEN RAISE EXCEPTION 'ORG_NOT_READY'; END IF;
     SELECT monthly_limit INTO lim FROM care_branch_permissions WHERE user_id=u AND location_id=branch AND partner_id=org;
     IF lim IS NOT NULL AND (SELECT count(*) FROM care_holds h JOIN consultations c ON c.id=h.consultation_id WHERE c.care_location_id=branch AND h.state IN ('RESERVED','CONSUMED') AND h.created_at>=date_trunc('month',now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok')>=lim THEN RAISE EXCEPTION 'BRANCH_LIMIT_REACHED'; END IF;
     SELECT * INTO lot FROM care_credit_lots l WHERE partner_id=org AND expires_at>now()
      AND (payment_id IS NULL OR EXISTS(SELECT 1 FROM care_payments p WHERE p.id=l.payment_id AND p.status='PAID'))
      AND granted-used-voided>(SELECT count(*) FROM care_holds h WHERE h.lot_id=l.id AND h.state='RESERVED')
      ORDER BY expires_at,purchased_at,l.id LIMIT 1 FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_CREDITS'; END IF;
    END IF;
    IF encounter.care_kind='DIRECT' THEN
     SELECT * INTO payment FROM care_payments WHERE care_payments.id=encounter.care_payment_id FOR UPDATE;
     IF NOT FOUND OR payment.kind<>'DIRECT' OR payment.patient_id<>patient OR payment.status<>'PAID' OR EXISTS(SELECT 1 FROM care_holds WHERE payment_id=payment.id AND state IN ('RESERVED','CONSUMED')) THEN RAISE EXCEPTION 'DIRECT_PAYMENT_UNAVAILABLE'; END IF;
    END IF;
    INSERT INTO care_holds(consultation_id,partner_id,lot_id,membership_id,payment_id,terms_snapshot) VALUES(id,org,lot.id,member.id,payment.id,terms.settings);
    IF lot.id IS NOT NULL THEN PERFORM care_post(org,id,'RESERVE',1,'care:reserve:'||id,u,NULL,jsonb_build_object('lot_id',lot.id)); END IF;
    IF member.id IS NOT NULL THEN INSERT INTO care_annual_usage(membership_id,consultation_id,action,actor) VALUES(member.id,id,'RESERVE',u); END IF;
    UPDATE consultations SET status='WAITING',credit_status=CASE WHEN lot.id IS NOT NULL THEN 'RESERVED'::credit_status ELSE 'NOT_REQUIRED'::credit_status END WHERE consultations.id=id;
    PERFORM care_coverage_audit('RESERVE',encounter.care_kind,org,member.id,id,u,bal_before,lot.id IS NOT NULL,COALESCE(reason,'Queue accepted'),reference,_key);
    result:=jsonb_build_object('id',id,'status','WAITING');
   END IF;
  ELSIF _op='START' THEN
   IF encounter.status='STARTED' THEN result:=jsonb_build_object('id',id,'status','STARTED');
   ELSE
    IF encounter.status<>'WAITING' OR hold.state<>'RESERVED' THEN RAISE EXCEPTION 'INVALID_START_STATE'; END IF;
    UPDATE consultations SET status='STARTED',started_at=now() WHERE consultations.id=id;
    result:=jsonb_build_object('id',id,'status','STARTED');
   END IF;
  ELSIF _op='COMPLETE' THEN
   IF encounter.status='COMPLETED' AND hold.state='CONSUMED' THEN result:=jsonb_build_object('id',id,'status','COMPLETED');
   ELSE
    IF encounter.status<>'STARTED' OR hold.state<>'RESERVED' THEN RAISE EXCEPTION 'INVALID_COMPLETION_STATE'; END IF;
    -- No prescription check: a completed assessment is billable independently.
    UPDATE care_holds SET state='CONSUMED',resolved_at=now() WHERE care_holds.id=hold.id;
    IF hold.lot_id IS NOT NULL THEN UPDATE care_credit_lots SET used=used+1 WHERE care_credit_lots.id=hold.lot_id; PERFORM care_post(org,id,'CONSUME',1,'care:consume:'||id,u,reference,jsonb_build_object('lot_id',hold.lot_id)); END IF;
    IF member.id IS NOT NULL THEN UPDATE memberships SET care_used=care_used+1 WHERE memberships.id=member.id; INSERT INTO care_annual_usage(membership_id,consultation_id,action,actor) VALUES(member.id,id,'CONSUME',u); END IF;
    UPDATE consultations SET status='COMPLETED',completed_at=now(),credit_status=CASE WHEN hold.lot_id IS NOT NULL THEN 'CONSUMED'::credit_status ELSE 'NOT_REQUIRED'::credit_status END WHERE consultations.id=id;
    PERFORM care_coverage_audit('CONSUME',encounter.care_kind,org,member.id,id,u,bal_before,hold.lot_id IS NOT NULL,COALESCE(reason,'Consultation completed'),reference,_key);
    result:=jsonb_build_object('id',id,'status','COMPLETED');
   END IF;
  ELSIF _op='REVERSE' THEN
   IF hold.state<>'CONSUMED' OR length(COALESCE(reason,''))<3 OR NOT COALESCE((terms.settings->>'technical_failure_approved')::boolean,false) THEN RAISE EXCEPTION 'REVERSAL_APPROVAL_REQUIRED'; END IF;
   UPDATE care_holds SET state='REVERSED',resolved_at=now() WHERE care_holds.id=hold.id;
   IF hold.lot_id IS NOT NULL THEN UPDATE care_credit_lots SET used=used-1 WHERE care_credit_lots.id=hold.lot_id; PERFORM care_post(org,id,'ADJUSTMENT',1,'care:reverse:'||id,u,reference,jsonb_build_object('reason',reason,'reverses','care:consume:'||id)); END IF;
   IF member.id IS NOT NULL THEN UPDATE memberships SET care_used=care_used-1 WHERE memberships.id=member.id; INSERT INTO care_annual_usage(membership_id,consultation_id,action,actor) VALUES(member.id,id,'REVERSE',u); END IF;
   result:=jsonb_build_object('id',id,'state','REVERSED');
  ELSE
   IF encounter.status IN ('CANCELLED','FAILED') AND (hold.id IS NULL OR hold.state='RELEASED') THEN result:=jsonb_build_object('id',id,'status',encounter.status);
   ELSE
    IF _op='CANCEL' AND encounter.status NOT IN ('CREATED','WAITING') THEN RAISE EXCEPTION 'CANNOT_CANCEL_AFTER_START'; END IF;
    IF _op='TECHNICAL_FAILURE' AND (encounter.status NOT IN ('WAITING','STARTED') OR NOT COALESCE((terms.settings->>'technical_failure_approved')::boolean,false)) THEN RAISE EXCEPTION 'FAILURE_REVIEW_REQUIRED'; END IF;
    IF length(COALESCE(reason,''))<3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
    UPDATE care_holds SET state='RELEASED',resolved_at=now() WHERE care_holds.id=hold.id AND state='RESERVED';
    IF hold.lot_id IS NOT NULL THEN PERFORM care_post(org,id,'RELEASE',1,'care:release:'||id,u,reference,jsonb_build_object('reason',reason)); END IF;
    IF member.id IS NOT NULL AND hold.id IS NOT NULL THEN INSERT INTO care_annual_usage(membership_id,consultation_id,action,actor) VALUES(member.id,id,'RELEASE',u); END IF;
    UPDATE consultations SET status=CASE WHEN _op='CANCEL' THEN 'CANCELLED'::consultation_status ELSE 'FAILED'::consultation_status END,
     credit_status=CASE WHEN hold.lot_id IS NOT NULL THEN 'RELEASED'::credit_status ELSE 'NOT_REQUIRED'::credit_status END,cancellation_reason=reason WHERE consultations.id=id;
    IF hold.id IS NOT NULL THEN PERFORM care_coverage_audit('RELEASE',encounter.care_kind,org,member.id,id,u,bal_before,hold.lot_id IS NOT NULL,reason,reference,_key||':'||_op); END IF;
    result:=jsonb_build_object('id',id,'released',true);
   END IF;
  END IF;
 ELSIF _op IN ('REFUND','DISPUTE') THEN
  IF NOT care_finance(u) OR length(COALESCE(reason,''))<3 OR length(COALESCE(reference,''))<3 THEN RAISE EXCEPTION 'FINANCE_APPROVAL_REQUIRED'; END IF;
  SELECT * INTO payment FROM care_payments WHERE care_payments.id=id FOR UPDATE;
  IF NOT FOUND OR payment.status<>'PAID' THEN RAISE EXCEPTION 'PAYMENT_NOT_REFUNDABLE'; END IF;
  org:=payment.partner_id;
  IF payment.membership_id IS NOT NULL THEN SELECT * INTO member FROM memberships WHERE memberships.id=payment.membership_id FOR UPDATE; END IF;
  IF org IS NOT NULL THEN PERFORM 1 FROM partners WHERE partners.id=org FOR UPDATE; END IF;
  IF _op='REFUND' THEN
   IF payment.snapshot->>'refund_policy'<>'FULL_UNUSED_ONLY' THEN RAISE EXCEPTION 'REFUND_POLICY_NOT_CONFIGURED'; END IF;
   IF EXISTS(SELECT 1 FROM care_credit_lots l WHERE payment_id=id AND (used>0 OR EXISTS(SELECT 1 FROM care_holds h WHERE h.lot_id=l.id AND h.state='RESERVED')))
    OR member.care_used>0 OR EXISTS(SELECT 1 FROM care_holds WHERE (membership_id=payment.membership_id OR payment_id=id) AND state IN ('RESERVED','CONSUMED'))
    OR EXISTS(SELECT 1 FROM care_reward_entries WHERE payment_id=id) THEN RAISE EXCEPTION 'USED_HELD_OR_REWARD_REFUND_REVIEW_REQUIRED'; END IF;
   UPDATE care_credit_lots SET voided=granted-used WHERE payment_id=id;
   IF payment.membership_id IS NOT NULL THEN UPDATE memberships SET status='CANCELLED' WHERE memberships.id=payment.membership_id; END IF;
   UPDATE care_payments SET status='REFUNDED' WHERE care_payments.id=id;
   INSERT INTO care_refunds(payment_id,amount_minor,reference,reason,actor) VALUES(id,payment.amount_minor,reference,reason,u);
   IF payment.kind='CREDITS' THEN PERFORM care_post(org,NULL,'ADJUSTMENT',-payment.credits,'care:refund:'||id,u,reference,jsonb_build_object('payment_id',id,'reason',reason)); END IF;
  ELSE
   UPDATE care_payments SET status='DISPUTED' WHERE care_payments.id=id;
   IF payment.membership_id IS NOT NULL THEN UPDATE memberships SET status='CANCELLED' WHERE memberships.id=payment.membership_id; END IF;
   IF org IS NOT NULL AND payment.kind='CREDITS' THEN PERFORM care_post(org,NULL,'ADJUSTMENT',0,'care:dispute:'||id,u,reference,jsonb_build_object('payment_id',id,'reason',reason,'frozen',true)); END IF;
  END IF;
  result:=jsonb_build_object('id',id,'status',CASE WHEN _op='REFUND' THEN 'REFUNDED' ELSE 'DISPUTED' END);
 ELSIF _op='REMINDER' THEN
  IF NOT EXISTS(SELECT 1 FROM patients p WHERE p.id=patient AND (care_platform(u) OR can_manage_partner(u,p.partner_id))) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF NOT EXISTS(SELECT 1 FROM patients p WHERE p.id=patient AND CASE WHEN _args->>'purpose'='MARKETING' THEN p.marketing_consent ELSE p.service_reminder_consent END AND p.email IS NOT NULL) THEN RAISE EXCEPTION 'CONSENT_OR_EMAIL_REQUIRED'; END IF;
  SELECT partner_id INTO org FROM patients WHERE patients.id=patient;
  INSERT INTO care_reminders(patient_id,partner_id,due_at,purpose,idempotency_key,created_by)
  VALUES(patient,org,(_args->>'dueAt')::timestamptz,_args->>'purpose',_key,u) RETURNING care_reminders.id INTO new_id;
  result:=jsonb_build_object('id',new_id,'status','QUEUED','delivery','EMAIL_ADAPTER_NOT_CONNECTED');
 ELSIF _op='ESCALATE' THEN
  SELECT * INTO member FROM memberships WHERE memberships.id=id;
  IF NOT FOUND OR NOT (can_manage_partner(u,member.care_sponsor_id) OR care_platform(u) OR EXISTS(SELECT 1 FROM patients WHERE patients.id=member.patient_id AND auth_user_id=u)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF length(COALESCE(reason,''))<3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  org:=member.care_sponsor_id;
  INSERT INTO care_escalations(membership_id,reason,requested_by,proposed_partner_id) VALUES(id,reason,u,NULLIF(_args->>'proposedPartnerId','')::uuid) RETURNING care_escalations.id INTO new_id;
  result:=jsonb_build_object('id',new_id,'status','OPEN','wallet_changed',false);
 ELSE RAISE EXCEPTION 'UNKNOWN_OPERATION';
 END IF;
 INSERT INTO care_operations(key,operation,actor,request,result) VALUES(_key,_op,u,_args,result);
 INSERT INTO care_audit(actor,partner_id,action,entity_id,details) VALUES(u,org,_op,COALESCE(id,new_id)::text,jsonb_build_object('key',_key,'reference',reference,'reason',reason));
 RETURN result;
END $$;
