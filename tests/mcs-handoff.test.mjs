import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestDb,actor,command,uuid} from './care-db.mjs';

test('manual MCS handoff: guards, scope, retry safety, certificate flow, credit isolation',async t=>{
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

 await t.test('handoff requires a ready request and scope; packet holds minimum fields only',async()=>{
  const draft=await make();
  await assert.rejects(as(owner,()=>mcs('CREATE',draft.id)),/REQUEST_NOT_READY_FOR_HANDOFF/);
  const r=await accepted();
  await assert.rejects(as(other,()=>mcs('CREATE',r.id)),/SCOPE_REQUIRED/);
  const h=await as(owner,()=>mcs('CREATE',r.id));
  assert.equal(h.state,'ready_to_create');
  const packet=(await db.query('SELECT packet FROM care_mcs_handoffs WHERE id=$1',[h.id])).rows[0].packet;
  assert.deepEqual(Object.keys(packet).sort(),['branchName','careKind','consentRecorded','consultationId','customerName','requestId','scheduledAt','screeningPassed']);
  assert.equal(packet.screeningPassed,true);assert.equal(packet.consentRecorded,true);
  await assert.rejects(as(owner,()=>mcs('CREATE',r.id)),/HANDOFF_EXISTS/);
 });

 await t.test('transition guards: order, case ID, secure links, certificate chain',async()=>{
  const r=await accepted();const h=await as(owner,()=>mcs('CREATE',r.id));
  await assert.rejects(as(owner,()=>mcs('ADVANCE',h.id,{to:'links_ready'})),/INVALID_TRANSITION/);
  await as(owner,()=>mcs('ADVANCE',h.id,{to:'entering_mcs'}));
  await assert.rejects(as(owner,()=>mcs('ADVANCE',h.id,{to:'case_created'})),/CASE_ID_REQUIRED/);
  await assert.rejects(as(owner,()=>mcs('ADVANCE',h.id,{to:'case_created',mcsCaseId:'x'})),/INVALID_CASE_ID/);
  await as(owner,()=>mcs('ADVANCE',h.id,{to:'case_created',mcsCaseId:'MCS-SYN-001'}));
  await assert.rejects(as(owner,()=>mcs('ADVANCE',h.id,{to:'links_ready'})),/LINKS_REQUIRED/);
  await assert.rejects(as(owner,()=>mcs('ADVANCE',h.id,{to:'links_ready',patientLink:'http://insecure.invalid/p',doctorLink:'https://mcs.example.invalid/d'})),/SECURE_LINK_REQUIRED/);
  await as(owner,()=>mcs('ADVANCE',h.id,{to:'links_ready',patientLink:'https://mcs.example.invalid/p/1',doctorLink:'https://mcs.example.invalid/d/1'}));
  await assert.rejects(as(owner,()=>mcs('ADVANCE',h.id,{to:'connected'})),/INVALID_TRANSITION/);
  await as(owner,()=>mcs('ADVANCE',h.id,{to:'patient_link_sent'}));
  await as(owner,()=>mcs('ADVANCE',h.id,{to:'waiting_connection'}));
  await as(owner,()=>mcs('ADVANCE',h.id,{to:'connected'}));
  await assert.rejects(as(owner,()=>mcs('ADVANCE',h.id,{to:'certificate_uploaded'})),/INVALID_TRANSITION/);
  await as(owner,()=>mcs('ADVANCE',h.id,{to:'certificate_pending'}));
  await as(owner,()=>mcs('ADVANCE',h.id,{to:'certificate_uploaded'}));
  await as(owner,()=>mcs('ADVANCE',h.id,{to:'closed'}));
  await assert.rejects(as(owner,()=>mcs('ADVANCE',h.id,{to:'blocked'})),/HANDOFF_TERMINAL/);
  await assert.rejects(as(owner,()=>mcs('CANCEL',h.id)),/HANDOFF_TERMINAL/);
  const events=(await as(owner,()=>db.query('SELECT to_state FROM care_mcs_handoff_events WHERE handoff_id=$1 ORDER BY created_at',[h.id]))).rows.map(x=>x.to_state);
  assert.deepEqual(events,['ready_to_create','entering_mcs','case_created','links_ready','patient_link_sent','waiting_connection','connected','certificate_pending','certificate_uploaded','closed']);
 });

 await t.test('blocked/manual_review recover to an earlier state; cancelled is terminal',async()=>{
  const r=await accepted();const h=await as(admin,()=>mcs('CREATE',r.id));
  await as(admin,()=>mcs('ADVANCE',h.id,{to:'entering_mcs'}));
  await as(admin,()=>mcs('ADVANCE',h.id,{to:'blocked'}));
  await as(admin,()=>mcs('ADVANCE',h.id,{to:'ready_to_create'}));
  await as(admin,()=>mcs('ADVANCE',h.id,{to:'manual_review'}));
  await assert.rejects(as(admin,()=>mcs('ADVANCE',h.id,{to:'closed'})),/INVALID_TRANSITION/);
  await as(admin,()=>mcs('ADVANCE',h.id,{to:'entering_mcs'}));
  await as(admin,()=>mcs('CANCEL',h.id));
  await assert.rejects(as(admin,()=>mcs('ADVANCE',h.id,{to:'ready_to_create'})),/HANDOFF_TERMINAL/);
 });

 await t.test('retry safety: same key replays result, mismatched key conflicts, no duplicate events',async()=>{
  const r=await accepted();const key=crypto.randomUUID();
  const h1=await as(owner,()=>mcs('CREATE',r.id,{},key));
  const h2=await as(owner,()=>mcs('CREATE',r.id,{},key));
  assert.deepEqual(h1,h2);
  await assert.rejects(as(owner,()=>mcs('CREATE',r.id,{reason:'Changed'},key)),/IDEMPOTENCY_CONFLICT/);
  const akey=crypto.randomUUID();
  await as(owner,()=>mcs('ADVANCE',h1.id,{to:'entering_mcs'},akey));
  await as(owner,()=>mcs('ADVANCE',h1.id,{to:'entering_mcs'},akey));
  const count=(await db.query('SELECT count(*)::int n FROM care_mcs_handoff_events WHERE handoff_id=$1',[h1.id])).rows[0].n;
  assert.equal(count,2); // create + one advance; the replayed key added nothing
  const dup=await as(owner,()=>mcs('ADVANCE',h1.id,{to:'entering_mcs'}));
  assert.equal(dup.state,'entering_mcs'); // new-key duplicate is a no-op
  assert.equal((await db.query('SELECT count(*)::int n FROM care_mcs_handoff_events WHERE handoff_id=$1',[h1.id])).rows[0].n,2);
 });

 await t.test('operator assignment requires scope; events and audit are append-only and attributed',async()=>{
  const r=await accepted();const h=await as(owner,()=>mcs('CREATE',r.id));
  await assert.rejects(as(owner,()=>mcs('ASSIGN',h.id,{operatorId:other})),/OPERATOR_SCOPE_REQUIRED/);
  await as(owner,()=>mcs('ASSIGN',h.id,{operatorId:admin}));
  assert.equal((await db.query('SELECT operator_user_id FROM care_mcs_handoffs WHERE id=$1',[h.id])).rows[0].operator_user_id,admin);
  const events=(await as(owner,()=>db.query('SELECT * FROM care_mcs_handoff_events WHERE handoff_id=$1',[h.id]))).rows;
  for(const e of events){assert.ok(e.actor_user_id);assert.ok(e.reason);assert.ok(e.correlation_id);assert.ok(e.created_at);}
  const audit=(await db.query("SELECT * FROM audit_log WHERE entity_type='care_mcs_handoff' AND entity_id=$1",[h.id])).rows;
  assert.ok(audit.length>=events.length);
  await assert.rejects(db.query("UPDATE care_mcs_handoff_events SET reason='erase'"),/APPEND_ONLY/);
  await assert.rejects(as(owner,()=>db.query("UPDATE care_mcs_handoffs SET state='closed'")),/permission denied/);
  const visible=(await as(other,()=>db.query('SELECT * FROM care_mcs_handoffs WHERE id=$1',[h.id]))).rows;
  assert.equal(visible.length,0);
 });

 await t.test('credit lifecycle is untouched by the whole handoff flow',async()=>{
  const r=await accepted();const before=await balance();assert.deepEqual(await tx(r.id),['RESERVE']);
  const h=await as(owner,()=>mcs('CREATE',r.id));
  for(const step of [{to:'entering_mcs'},{to:'case_created',mcsCaseId:'MCS-SYN-002'},{to:'links_ready',patientLink:'https://mcs.example.invalid/p/2',doctorLink:'https://mcs.example.invalid/d/2'},{to:'patient_link_sent'},{to:'waiting_connection'},{to:'connected'}])await as(owner,()=>mcs('ADVANCE',h.id,step));
  assert.equal(await balance(),before);assert.deepEqual(await tx(r.id),['RESERVE']);
  await as(doctor,()=>req('START',r.id));await as(doctor,()=>req('COMPLETE',r.id));
  assert.equal(await balance(),before);assert.deepEqual(await tx(r.id),['RESERVE','CONSUME']);
  await as(owner,()=>mcs('ADVANCE',h.id,{to:'certificate_pending'}));
  await as(owner,()=>mcs('ADVANCE',h.id,{to:'certificate_uploaded'}));
  await as(owner,()=>mcs('ADVANCE',h.id,{to:'closed'}));
  assert.equal(await balance(),before);assert.deepEqual(await tx(r.id),['RESERVE','CONSUME']);
 });
});
