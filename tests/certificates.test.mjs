import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestDb,actor,command,uuid} from './care-db.mjs';
test('private manual certificate workflow',async t=>{
 const db=await createTestDb();t.after(()=>db.close());
 const admin=uuid(9700),owner=uuid(9701),doctor=uuid(9702),other=uuid(9703),org=uuid(9710),branch=uuid(9711),doc=uuid(9712);
 await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name,status) VALUES('${org}','MCS-SYN','Synthetic','Synthetic','ACTIVE'),('${uuid(9799)}','MCS-OTHER','Other','Other','ACTIVE');
 INSERT INTO locations(id,partner_id,code,name) VALUES('${branch}','${org}','MCS','Synthetic');
 INSERT INTO user_roles(user_id,role,partner_id) VALUES('${admin}','SUPER_ADMIN',null),('${owner}','PARTNER_OWNER','${org}'),('${doctor}','DOCTOR','${org}'),('${other}','PARTNER_OWNER','${uuid(9799)}');
 INSERT INTO doctors(id,auth_user_id,full_name,license_number,license_expires_on,status) VALUES('${doc}','${doctor}','Synthetic','MCS-LIC','2099-01-01','ACTIVE');
 INSERT INTO doctor_assignments(doctor_id,partner_id,location_id) VALUES('${doc}','${org}','${branch}');`);
 const as=async(u,fn)=>{await db.exec('RESET ROLE');await actor(db,u);await db.exec('SET ROLE authenticated');try{return await fn();}finally{await db.exec('RESET ROLE');}};
 const req=(op,id,args={},key=crypto.randomUUID())=>db.query('SELECT consultation_request_command($1,$2,$3::jsonb,$4) r',[op,id,JSON.stringify({reason:'Synthetic reason',...args}),key]).then(x=>x.rows[0].r);
 const mcs=(op,id,args={},key=crypto.randomUUID())=>db.query('SELECT mcs_handoff_command($1,$2,$3::jsonb,$4) r',[op,id,JSON.stringify({reason:'Synthetic reason',...args}),key]).then(x=>x.rows[0].r);
 const intake=(op,id,args={})=>db.query('SELECT partner_intake_command($1,$2,$3::jsonb) r',[op,id,JSON.stringify(args)]).then(x=>x.rows[0].r);
 const settings={redFlags:['SYN'],exclusions:['SYN'],serviceReasons:['SYN'],jurisdictions:['SYN'],minimumAge:18,consentVersion:'SYN'};
 await as(doctor,()=>intake('CONFIGURE',null,{partnerId:org,settings,reason:'Synthetic rules'}));
 const base=(await db.query('SELECT settings FROM care_terms LIMIT 1')).rows[0].settings;
 await as(admin,async()=>{const terms=await command(db,'SAVE_TERMS',{version:'MCS-SYN',settings:{...base,terms_approved:true,tax_approved:true,refund_approved:true,no_show_approved:true,hold_expiry_approved:true,cancel_approved:true,technical_failure_approved:true,tax_snapshot:{classification:'SYN'},terms_reference:'SYN',refund_policy:'FULL_UNUSED_ONLY',manual_clinical_enabled:true,standard_hours:{start:0,end:24,days:[1,2,3,4,5,6,7]},standard_hours_approved:true}});await command(db,'ACTIVATE_TERMS',{id:terms.id,reference:'SYN'});await command(db,'RECONCILE_ORG',{partnerId:org,expectedLegacyBalance:0,approvedOpeningUnits:10,openingExpiresAt:'2099-01-01',reference:'SYN',reason:'Synthetic only'});});
 const make=async()=>as(owner,async()=>{const c=await intake('CUSTOMER_SAVE',null,{partnerId:org,locationId:branch,firstName:'Synthetic',lastName:'Customer',phone:'0000'});const e={redFlags:[],redFlagsReviewed:true,telemedicineSuitable:true,identityVerified:true,contactVerified:true,age:30,jurisdiction:'SYN',telemedicineConsent:true,privacyConsent:true,consentVersion:'SYN',consentEvidence:'Synthetic verbal evidence',exclusions:[],exclusionsReviewed:true,serviceReason:'SYN',history:'SYN',medicines:'None',allergies:'None',riskFlags:'None',dataComplete:true,communicationReady:true,nextStepReady:true,channel:'PHONE',doctorId:doc,gateReasons:['SYN','SYN','SYN','SYN']};const i=await intake('ASSESS',c.id,{evidence:e,reason:'Synthetic'});return req('DRAFT',i.id);});
 const balance=async()=>(await db.query('SELECT credit_balance FROM partners WHERE id=$1',[org])).rows[0].credit_balance;
 const tx=async(id)=>(await db.query('SELECT type::text FROM credit_transactions WHERE consultation_id=(SELECT consultation_id FROM consultation_requests WHERE id=$1) ORDER BY created_at',[id])).rows.map(x=>x.type);
 const accepted=async()=>{const r=await make();await as(owner,()=>req('SUBMIT',r.id));await as(admin,()=>req('ACCEPT',r.id));return r;};

 await db.exec(await (await import('node:fs/promises')).readFile('db/0055_certificate_workflow.sql','utf8'));
 await db.exec(await (await import('node:fs/promises')).readFile('db/0056_certificate_storage_defence.sql','utf8'));
 for(const file of ['0057_operations_console','0058_operations_evidence_private_grants','0059_notification_outbox','0060_notification_explicit_private_grants','0061_notification_anomaly_capture','0062_operational_sla','0063_sla_explicit_private_grants','0064_privacy_lifecycle','0065_privacy_sla_notification_scope','0066_financial_reconciliation','0067_financial_explicit_private_grants','0068_financial_projection_defence']) await db.exec(await (await import('node:fs/promises')).readFile(`db/${file}.sql`,'utf8'));
 // A broad sibling policy must never widen certificate access.
 await db.exec("CREATE POLICY synthetic_broad_read ON storage.objects FOR SELECT TO authenticated USING(true); CREATE POLICY synthetic_broad_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(true)");
 await db.exec("INSERT INTO storage.buckets(id,name,public) VALUES('care-certificates','care-certificates',false)");
 const cert=(op,id,args={},key=crypto.randomUUID())=>db.query('SELECT certificate_command($1,$2,$3::jsonb,$4) r',[op,id,JSON.stringify({reason:'Synthetic certificate reason',...args}),key]).then(x=>x.rows[0].r);
 const r=await accepted();
 await assert.rejects(as(doctor,()=>cert('OPEN',r.id)),/CERTIFICATE_SCOPE_REQUIRED/);
 await as(doctor,()=>req('START',r.id));await as(doctor,()=>req('COMPLETE',r.id));
 const before=await balance(),beforeTx=await tx(r.id);
 const h=await as(owner,()=>mcs('CREATE',r.id));assert.ok(h.id);
 const d=await as(doctor,()=>cert('OPEN',r.id));assert.equal(d.state,'certificate_pending');
 await t.test('Partners, cross-org users and revoked Doctors cannot upload or review',async()=>{
  for(const u of [owner,other]){await assert.rejects(as(u,()=>cert('PREPARE',d.id)),/CERTIFICATE_SCOPE_REQUIRED/);await assert.rejects(as(u,()=>cert('REVIEW',d.id)),/CERTIFICATE_SCOPE_REQUIRED/);}
  await assert.rejects(as(doctor,()=>cert('REVIEW',d.id)),/CERTIFICATE_SCOPE_REQUIRED/);
  await db.query("UPDATE doctor_assignments SET status='REVOKED' WHERE doctor_id=$1",[doc]);
  await assert.rejects(as(doctor,()=>cert('OPEN',r.id)),/CERTIFICATE_SCOPE_REQUIRED/);
  await db.query("UPDATE doctor_assignments SET status='ACTIVE' WHERE doctor_id=$1",[doc]);
 });
 const prepare=async()=>{const revisionId=crypto.randomUUID();const v=await as(doctor,()=>cert('PREPARE',d.id,{revisionId,mimeType:'application/pdf',sizeBytes:20,sha256:'a'.repeat(64)}));return {revisionId,...v};};
 await t.test('invalid type/size, missing storage and review/forward gates fail closed',async()=>{
  for(const args of [{mimeType:'text/html',sizeBytes:10},{mimeType:'application/pdf',sizeBytes:5242881},{mimeType:'image/png',sizeBytes:0}])await assert.rejects(as(doctor,()=>cert('PREPARE',d.id,{revisionId:crypto.randomUUID(),sha256:'a'.repeat(64),...args})),/INVALID_FILE/);
  await assert.rejects(as(admin,()=>cert('FORWARD',d.id,{channel:'PARTNER'})),/REVIEW_REQUIRED/);
  await assert.rejects(as(admin,()=>cert('REVIEW',d.id)),/REVIEW_NOT_READY/);
  const v=await prepare();await assert.rejects(as(doctor,()=>cert('UPLOAD',d.id,{revisionId:v.revisionId})),/VALIDATED_FILE_REQUIRED/);
 });
 const upload=async()=>{const v=await prepare();await db.query("INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('care-certificates',$1,$2::jsonb)",[v.path,JSON.stringify({size:20,mimetype:'application/pdf'})]);await as(doctor,()=>cert('UPLOAD',d.id,{revisionId:v.revisionId}));return v;};
 await t.test('reviewed forwarding, scoped private storage, replacement and rejection',async()=>{
  const v=await upload();
  assert.equal((await as(owner,()=>db.query("SELECT * FROM storage.objects WHERE bucket_id='care-certificates'"))).rows.length,0);
  const key=crypto.randomUUID();await as(admin,()=>cert('REVIEW',d.id,{},key));await as(admin,()=>cert('REVIEW',d.id,{},key));
  await as(admin,()=>cert('FORWARD',d.id,{channel:'PARTNER'}));
  assert.equal((await as(owner,()=>db.query('SELECT name FROM storage.objects WHERE name=$1',[v.path]))).rows.length,1);
  assert.equal((await as(other,()=>db.query('SELECT * FROM care_certificates'))).rows.length,0);
  const v2=await upload();assert.equal(v2.state,'forwarded');
  assert.equal((await as(owner,()=>db.query('SELECT name FROM storage.objects WHERE name=$1',[v.path]))).rows.length,0);
  await as(admin,()=>cert('REJECT',d.id));await assert.rejects(as(admin,()=>cert('FORWARD',d.id,{channel:'PARTNER'})),/REVIEW_REQUIRED/);
  assert.equal((await db.query('SELECT count(*)::int n FROM care_certificate_revisions WHERE certificate_id=$1',[d.id])).rows[0].n,3);
  await assert.rejects(as(owner,()=>cert('DOWNLOAD',d.id)),/CERTIFICATE_SCOPE_REQUIRED/);
  await as(admin,()=>cert('MANUAL_REVIEW',d.id));await as(admin,()=>cert('REVIEW',d.id));await as(admin,()=>cert('FORWARD',d.id,{channel:'CUSTOMER_MANUAL'}));
  assert.equal((await as(owner,()=>db.query('SELECT * FROM care_certificates'))).rows.length,0);
 });
 await t.test('privacy review does not mutate populated certificate, handoff or financial history',async()=>{
 const pa=uuid(9780),pb=uuid(9781);await db.exec(`INSERT INTO user_roles(user_id,role,partner_id) VALUES('${pa}','OPERATIONS_ADMIN','${org}'),('${pb}','OPERATIONS_ADMIN','${org}');`);
 const patient=(await db.query('SELECT patient_id FROM consultation_requests WHERE id=$1',[r.id])).rows[0].patient_id;
 const snapshot=async()=>{const result={};for(const table of ['care_certificate_events','care_certificate_revisions','care_mcs_handoff_events','credit_transactions','ledger_entries'])result[table]=(await db.query(`SELECT to_jsonb(t) r FROM ${table} t ORDER BY id`)).rows;return result;};const previous=await snapshot();
 const privacy=(op,args)=>db.query('SELECT privacy_command($1,$2::jsonb,$3) r',[op,JSON.stringify({reason:'Synthetic privacy review',...args}),crypto.randomUUID()]).then(x=>x.rows[0].r);
 const id=(await as(pa,()=>privacy('request',{patient_id:patient,kind:'hold'}))).id;await as(pa,()=>privacy('verify',{id,verification_method:'in_person'}));await as(pb,()=>privacy('approve',{id}));await as(pa,()=>privacy('execute',{id,confirm:'APPROVED_ACTION',hold_type:'clinical'}));assert.deepEqual(await snapshot(),previous);
 const exportId=(await as(pa,()=>privacy('request',{patient_id:patient,kind:'export'}))).id;await as(pa,()=>privacy('verify',{id:exportId,verification_method:'in_person'}));await as(pb,()=>privacy('approve',{id:exportId}));const pkg=await as(pa,()=>privacy('package',{id:exportId}));assert.ok(pkg.certificates.length>0);assert.equal(pkg.files_included,false);assert.ok(!JSON.stringify(pkg).includes('storage_path'));assert.ok(!JSON.stringify(pkg).includes('sha256'));assert.deepEqual(await snapshot(),previous);
 });
 await t.test('audit immutability, actual role denials, unchanged credit balances',async()=>{
  const events=(await as(admin,()=>db.query('SELECT * FROM care_certificate_events'))).rows;
  assert.ok(events.length>=10);for(const e of events){assert.ok(e.actor_user_id);assert.ok(e.reason);assert.ok(e.correlation_id);assert.ok(e.created_at);}
  await assert.rejects(db.query("UPDATE care_certificate_events SET reason='erase'"),/IMMUTABLE_HISTORY/);
  await assert.rejects(db.query("DELETE FROM care_certificate_revisions"),/IMMUTABLE_HISTORY/);
  await assert.rejects(as(owner,()=>db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('care-certificates','forged.pdf')")),/row-level security/);
  await assert.rejects(as(owner,()=>db.query("UPDATE care_certificates SET state='certificate_reviewed'")),/permission denied/);
  await actor(db,null,'aal1','anon');await db.exec('SET ROLE anon');await assert.rejects(db.query('SELECT * FROM care_certificates'),/permission denied/);await db.exec('RESET ROLE');
  assert.equal(await balance(),before);assert.deepEqual(await tx(r.id),beforeTx);
 });
});
