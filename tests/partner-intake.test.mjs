import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createTestDb,uuid} from './care-db.mjs';
const db=await createTestDb();after(()=>db.close());
const owner=uuid(9701),other=uuid(9702),staff=uuid(9703),admin=uuid(9704),clinician=uuid(9705),compliance=uuid(9706),p=uuid(9710),q=uuid(9711),l=uuid(9712),otherBranch=uuid(9713),d=uuid(9714);
await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name,status) VALUES('${p}','INT-A','Synthetic A','Synthetic A','ACTIVE'),('${q}','INT-B','Synthetic B','Synthetic B','ACTIVE');
INSERT INTO locations(id,partner_id,code,name) VALUES('${l}','${p}','A','A'),('${otherBranch}','${q}','B','B');
INSERT INTO user_roles(user_id,role,partner_id) VALUES('${owner}','PARTNER_OWNER','${p}'),('${other}','PARTNER_OWNER','${q}'),('${staff}','PARTNER_STAFF','${p}'),('${admin}','OPERATIONS_ADMIN','${p}'),('${clinician}','DOCTOR','${p}'),('${compliance}','COMPLIANCE_AUDITOR',NULL);
INSERT INTO doctors(id,auth_user_id,full_name,license_number,license_expires_on,status) VALUES('${d}','${clinician}','Synthetic Doctor','INT-SYN','2099-01-01','ACTIVE');
INSERT INTO doctor_assignments(doctor_id,partner_id,location_id) VALUES('${d}','${p}','${l}');`);
async function as(u,fn,aal='aal2',role='authenticated'){await db.exec('BEGIN');try{await db.exec(`SET LOCAL ROLE ${role}`);await db.query(`SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true),set_config('request.jwt.claim.aal',$3,true)`,[u??'',role,aal]);const r=await fn();await db.exec('COMMIT');return r;}catch(e){await db.exec('ROLLBACK');throw e;}}
const cmd=(op,id,args={})=>db.query('SELECT partner_intake_command($1,$2,$3::jsonb) r',[op,id,JSON.stringify(args)]).then(r=>r.rows[0].r);
const settings={redFlags:['SYNTHETIC_EMERGENCY'],exclusions:['SYNTHETIC_EXCLUSION'],serviceReasons:['SYNTHETIC_SCOPE'],jurisdictions:['SYNTHETIC_REGION'],minimumAge:18,consentVersion:'SYNTHETIC-v1'};
let customer,ready;
const evidence={redFlags:[],redFlagsReviewed:true,telemedicineSuitable:true,identityVerified:true,contactVerified:true,age:30,guardianVerified:false,jurisdiction:'SYNTHETIC_REGION',telemedicineConsent:true,privacyConsent:true,consentVersion:'SYNTHETIC-v1',consentEvidence:'Synthetic customer verbal consent captured in person at test timestamp',exclusions:[],exclusionsReviewed:true,serviceReason:'SYNTHETIC_SCOPE',history:'Synthetic history',medicines:'None declared',allergies:'None declared',riskFlags:'None declared',dataComplete:true,communicationReady:true,nextStepReady:true,channel:'PHONE',doctorId:d,gateReasons:['Reviewed','Verified','Within configured scope','Ready']};
const assess=(e)=>as(owner,()=>cmd('ASSESS',customer,{evidence:e,reason:'Synthetic intake'}));
test('customer is non-login, scoped and editable only through the command',async()=>{
 await assert.rejects(as(null,()=>cmd('CUSTOMER_SAVE',null,{}),'aal1','anon'),/permission denied/);
 await assert.rejects(as(owner,()=>cmd('CUSTOMER_SAVE',null,{partnerId:q,locationId:otherBranch,firstName:'No',lastName:'Access'})),/PARTNER_BRANCH_REQUIRED/);
 await assert.rejects(as(staff,()=>cmd('CUSTOMER_SAVE',null,{partnerId:p,locationId:l,firstName:'No',lastName:'Permission'})),/PARTNER_BRANCH_REQUIRED/);
 customer=(await as(owner,()=>cmd('CUSTOMER_SAVE',null,{partnerId:p,locationId:l,firstName:'Synthetic',lastName:'Customer',phone:'00000000',auth_user_id:owner}))).id;
 assert.equal((await db.query('SELECT auth_user_id FROM patients WHERE id=$1',[customer])).rows[0].auth_user_id,null);
 assert.equal((await as(other,()=>db.query('SELECT id FROM patients WHERE id=$1',[customer]))).rows.length,0);
 assert.equal((await as(owner,()=>db.query("UPDATE patients SET first_name='Forged' WHERE id=$1 RETURNING id",[customer]))).rows.length,0);
 await assert.rejects(db.query('UPDATE patients SET auth_user_id=$1 WHERE id=$2',[owner,customer]),/CUSTOMER_NON_LOGIN/);
});
test('unconfigured screening fails closed and bypass care INTAKE cannot create a consultation',async()=>{
 const i=await assess(evidence);assert.equal(i.status,'MANUAL_REVIEW');
 await assert.rejects(as(owner,()=>cmd('REQUEST',i.id)),/SCREENING_REQUIRED/);
 await assert.rejects(as(owner,()=>db.query("SELECT care_command('INTAKE',$1::jsonb,$2)",[JSON.stringify({partnerId:p,patientId:customer,locationId:l,kind:'PARTNER'}),crypto.randomUUID()])),/SCREENING_REQUIRED/);
});
test('only assigned clinician/compliance with MFA can publish versioned rules',async()=>{
 await assert.rejects(as(owner,()=>cmd('CONFIGURE',null,{partnerId:p,settings,reason:'Rules'})),/CLINICIAN_COMPLIANCE_REQUIRED/);
 await assert.rejects(as(admin,()=>cmd('CONFIGURE',null,{partnerId:p,settings,reason:'Rules'})),/CLINICIAN_COMPLIANCE_REQUIRED/);
 await assert.rejects(as(clinician,()=>cmd('CONFIGURE',null,{partnerId:p,settings,reason:'Rules'}),'aal1'),/MFA_REQUIRED/);
 await assert.rejects(as(clinician,()=>cmd('CONFIGURE',null,{partnerId:q,settings,reason:'Rules'})),/CLINICIAN_COMPLIANCE_REQUIRED/);
 await as(clinician,()=>cmd('CONFIGURE',null,{partnerId:p,settings,reason:'Synthetic configured rules'}));
 assert.equal((await db.query('SELECT version FROM partner_screening_configs WHERE partner_id=$1',[p])).rows[0].version,1);
});
test('red flag FAIL blocks request and persists an emergency escalation',async()=>{
 const i=await assess({...evidence,redFlags:['SYNTHETIC_EMERGENCY']});assert.equal(i.status,'BLOCKED');
 const r=(await as(owner,()=>db.query('SELECT gates FROM partner_intakes WHERE id=$1',[i.id]))).rows[0];assert.equal(r.gates[0].result,'FAIL');
 assert.equal((await db.query("SELECT count(*)::int n FROM partner_intake_events WHERE intake_id=$1 AND action='EMERGENCY_ESCALATION_OPEN'",[i.id])).rows[0].n,1);
 await assert.rejects(as(owner,()=>cmd('REQUEST',i.id)),/SCREENING_REQUIRED/);
});
test('consent refusal, age/guardian, jurisdiction and identity fail gate 2',async()=>{
 for(const delta of [{telemedicineConsent:false},{privacyConsent:false},{identityVerified:false},{age:17},{jurisdiction:'OUTSIDE'},{consentEvidence:''}]){
  const i=await assess({...evidence,...delta});const row=(await db.query('SELECT gates FROM partner_intakes WHERE id=$1',[i.id])).rows[0];assert.equal(row.gates[1].result,'FAIL');await assert.rejects(as(owner,()=>cmd('REQUEST',i.id)),/SCREENING_REQUIRED/);
 }
 const i=await assess({...evidence,age:17,guardianVerified:true});assert.equal(i.status,'READY');
});
test('scope, exclusion and required history fail gate 3; incomplete communication fails gate 4',async()=>{
 for(const delta of [{exclusions:['SYNTHETIC_EXCLUSION']},{history:''},{medicines:''},{allergies:''},{riskFlags:''},{serviceReason:'OUTSIDE'}]){
  const i=await assess({...evidence,...delta});assert.equal((await db.query('SELECT gates FROM partner_intakes WHERE id=$1',[i.id])).rows[0].gates[2].result,'FAIL');
 }
 for(const delta of [{communicationReady:false},{nextStepReady:false},{doctorId:uuid(9999)}]){
  const i=await assess({...evidence,...delta});assert.equal((await db.query('SELECT gates FROM partner_intakes WHERE id=$1',[i.id])).rows[0].gates[3].result,'FAIL');assert.equal(i.status,'MANUAL_REVIEW');
 }
});
test('all four PASS create exactly one request, consent and no credit effects; Doctor sees assigned case only',async()=>{
 ready=await assess(evidence);assert.equal(ready.status,'READY');
 const before=(await db.query('SELECT credit_balance FROM partners WHERE id=$1',[p])).rows[0].credit_balance;
 const a=await as(owner,()=>cmd('REQUEST',ready.id)),b=await as(owner,()=>cmd('REQUEST',ready.id));assert.equal(a.consultationId,b.consultationId);
 assert.equal((await db.query('SELECT count(*)::int n FROM consultations WHERE patient_id=$1',[customer])).rows[0].n,1);
 assert.equal((await db.query('SELECT count(*)::int n FROM patient_consents WHERE patient_id=$1 AND accepted',[customer])).rows[0].n,2);
 assert.equal((await db.query('SELECT credit_balance FROM partners WHERE id=$1',[p])).rows[0].credit_balance,before);
 assert.equal((await db.query('SELECT count(*)::int n FROM care_holds WHERE consultation_id=$1',[a.consultationId])).rows[0].n,0);
 assert.equal((await as(clinician,()=>db.query('SELECT id FROM partner_intakes WHERE id=$1',[ready.id]))).rows.length,1);
 assert.equal((await as(other,()=>db.query('SELECT id FROM partner_intakes'))).rows.length,0);
 assert.equal((await as(admin,()=>db.query('SELECT id FROM partner_intakes'))).rows.length>0,true);
 await db.query("UPDATE doctor_assignments SET status='REVOKED' WHERE doctor_id=$1",[d]);
 assert.equal((await as(clinician,()=>db.query('SELECT id FROM partner_intakes WHERE id=$1',[ready.id]))).rows.length,0);
});
test('audits and assessments immutable; reviewer cannot override a failed assessment',async()=>{
 const i=await assess({...evidence,privacyConsent:false});
 await as(admin,()=>cmd('REJECT',i.id,{reason:'Consent not provided'}));
 await assert.rejects(as(owner,()=>cmd('REQUEST',i.id)),/SCREENING_REQUIRED/);
 await assert.rejects(as(owner,()=>db.query("UPDATE partner_intakes SET status='READY'")),/permission denied/);
 await assert.rejects(db.query("UPDATE partner_intake_events SET reason='erase'"),/APPEND_ONLY/);
 await assert.rejects(db.query("UPDATE partner_screening_configs SET version=9"),/APPEND_ONLY/);
 await assert.rejects(db.query("UPDATE partner_intakes SET evidence='{}' WHERE id=$1",[i.id]),/ASSESSMENT_IMMUTABLE/);
});
test('stale configuration and customer edits invalidate unused READY assessments',async()=>{
 await db.query("UPDATE doctor_assignments SET status='ACTIVE' WHERE doctor_id=$1",[d]);
 const i=await assess(evidence);
 await as(compliance,()=>cmd('CONFIGURE',null,{partnerId:p,settings,reason:'Synthetic new configuration'}));
 await assert.rejects(as(owner,()=>cmd('REQUEST',i.id)),/SCREENING_REQUIRED/);
 const j=await assess(evidence);
 await as(owner,()=>cmd('CUSTOMER_SAVE',customer,{firstName:'Updated',lastName:'Customer',phone:'0000'}));
 await assert.rejects(as(owner,()=>cmd('REQUEST',j.id)),/SCREENING_REQUIRED/);
});
test('same-branch unassigned Doctor cannot read customer or intake; branch staff requires explicit permission',async()=>{
 const unassigned=uuid(9791),second=uuid(9792);
 await db.exec(`INSERT INTO user_roles(user_id,role,partner_id) VALUES('${unassigned}','DOCTOR','${p}'); INSERT INTO doctors(id,auth_user_id,full_name,license_number,status) VALUES('${second}','${unassigned}','Synthetic unassigned','UNASSIGNED-SYN','ACTIVE'); INSERT INTO doctor_assignments(doctor_id,partner_id,location_id) VALUES('${second}','${p}','${l}');`);
 assert.equal((await as(unassigned,()=>db.query('SELECT patient_id FROM partner_customers'))).rows.length,0);
 assert.equal((await as(unassigned,()=>db.query('SELECT id FROM partner_intakes'))).rows.length,0);
 await db.query('INSERT INTO care_branch_permissions(user_id,partner_id,location_id,queue_allowed) VALUES($1,$2,$3,true)',[staff,p,l]);
 assert.equal((await as(staff,()=>db.query('SELECT patient_id FROM partner_customers'))).rows.length,1);
 await db.query("UPDATE user_roles SET status='SUSPENDED' WHERE user_id=$1",[staff]);
 assert.equal((await as(staff,()=>db.query('SELECT patient_id FROM partner_customers'))).rows.length,0);
});