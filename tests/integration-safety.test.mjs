import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createTestDb,actor,uuid} from './care-db.mjs';
const MIGRATIONS=['0055_certificate_workflow','0056_certificate_storage_defence','0057_operations_console','0058_operations_evidence_private_grants','0059_notification_outbox','0060_notification_explicit_private_grants','0061_notification_anomaly_capture','0062_operational_sla','0063_sla_explicit_private_grants','0064_privacy_lifecycle','0065_privacy_sla_notification_scope','0066_financial_reconciliation','0067_financial_explicit_private_grants','0068_financial_projection_defence','0069_release_readiness','0070_release_evidence','0071_release_review_acks','0072_release_drill_runs','0073_backup_evidence_register','0074_backup_unsafe_word_boundary','0075_protection_evidence_register','0076_content_review_register','0077_access_matrix_audit','0078_verification_campaign_runs','0079_production_test_readiness','0080_owner_action_queue','0081_golive_decision_pack','0084_human_review_signoff','0088_launch_day_control','0089_integration_provider_safety'];
test('integration and provider safety register',async t=>{
const db=await createTestDb();t.after(()=>db.close());for(const f of MIGRATIONS)await db.exec(await readFile(`db/${f}.sql`,'utf8'));
const su=uuid(29001),ops=uuid(29002),ops2=uuid(29008),scoped=uuid(29003),partner=uuid(29004),doctor=uuid(29006),other=uuid(29007),org=uuid(29005);
await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name,status,care_credit_model) VALUES('${org}','ISR-A','Synthetic','Synthetic','ACTIVE','LOTS_V1');INSERT INTO user_roles(user_id,role,partner_id) VALUES('${su}','SUPER_ADMIN',null),('${ops}','OPERATIONS_ADMIN',null),('${ops2}','OPERATIONS_ADMIN',null),('${other}','SUPER_ADMIN',null),('${scoped}','OPERATIONS_ADMIN','${org}'),('${partner}','PARTNER_OWNER','${org}'),('${doctor}','DOCTOR','${org}');`);
const as=async(u,fn,role='authenticated',aal='aal2')=>{await actor(db,u,aal,role);await db.exec('SET ROLE '+role);try{return await fn()}finally{await db.exec('RESET ROLE')}};
const record=(category='payment',status='disabled',ref='Disabled-state evidence label',capability='Payment capability label',action='Record disabled-state evidence for independent review',blocker=null,date=null,lineage=null)=>db.query('SELECT integration_safety_record($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) r',[lineage,category,capability,'preview',status,'SUPER_ADMIN','OPERATIONS_ADMIN',ref,action,blocker,date]).then(x=>x.rows[0].r);
const confirm=(id,outcome='confirmed')=>db.query('SELECT integration_safety_confirm($1,$2) r',[id,outcome]).then(x=>x.rows[0].r);
const read=()=>db.query('SELECT integration_safety_console() r').then(x=>x.rows[0].r);
await t.test('signed-out, tenant roles, unrelated accounts, MFA denied and direct writes forbidden',async()=>{
 for(const u of [scoped,partner,doctor,uuid(29999)]){await assert.rejects(as(u,read),/RELEASE_SCOPE_REQUIRED/);await assert.rejects(as(u,()=>record()),/RELEASE_SCOPE_REQUIRED/);assert.equal((await as(u,()=>db.query('SELECT * FROM integration_safety_item'))).rows.length,0);}
 await assert.rejects(as(null,read,'anon'),/permission denied/);
 await assert.rejects(as(su,read,'authenticated','aal1'),/MFA/);await assert.rejects(as(su,()=>record(),'authenticated','aal1'),/MFA/);
 for(const table of ['integration_safety_item','integration_safety_review'])for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal((await db.query(`SELECT has_table_privilege('authenticated','public.${table}','${privilege}') ok`)).rows[0].ok,false);
});
await t.test('closed vocabulary only; unsafe text and future dates refused',async()=>{
 for(const bad of [()=>record('stripe'),()=>record('payment','active'),()=>record('payment','disabled','ask ops@example.com'),()=>record('payment','disabled','ok','see https://hooks.x.test/abc'),()=>record('payment','disabled','ok','call +66 81 234 5678'),()=>record('payment','disabled','ok','Payment capability label','Connect now'),()=>record('payment','disabled','ok','Payment capability label','Record disabled-state evidence for independent review','token 123456789012'),()=>record('payment','disabled','ok','apikey sk_live_123456789012'),()=>record('payment','disabled','ok','Payment capability label','Record disabled-state evidence for independent review',null,'2999-01-01')])await assert.rejects(as(su,bad),/INVALID_ARGUMENTS/);
 assert.deepEqual(await as(su,read),[]);
});
await t.test('versioning, category stability, reviewer separation and stale-version rejection',async()=>{
 const v1=await as(su,()=>record());assert.equal(v1.version,1);
 await assert.rejects(as(su,()=>confirm(v1.id)),/SECOND_REVIEWER_REQUIRED/);
 await as(ops,()=>confirm(v1.id,'confirmed'));
 await assert.rejects(as(ops,()=>confirm(v1.id)),/unique|duplicate/i);
 await assert.rejects(as(ops,()=>record('email','disabled','Disabled-state evidence label','Payment capability label','Record disabled-state evidence for independent review',null,null,v1.lineage)),/CATEGORY_MISMATCH/);
 const v2=await as(ops,()=>record('payment','unconnected','Disabled-state evidence label','Payment capability label','Record disabled-state evidence for independent review',null,'2026-10-21',v1.lineage));
 assert.equal(v2.version,2);
 await assert.rejects(as(other,()=>confirm(v1.id)),/STALE_VERSION/);
 await as(su,()=>confirm(v2.id,'concern'));
 const view=await as(other,read);
 assert.equal(view.length,2);
 const latest=view.find(e=>e.version===2);
 assert.equal(latest.latest,true);assert.equal(view.find(e=>e.version===1).latest,false);
 assert.equal(latest.reviews[0].outcome,'concern');
 const output=JSON.stringify(view);for(const u of [su,ops,ops2,other])assert.equal(output.includes(u),false);
});
await t.test('append-only and versioned: records are never edited or deleted',async()=>{
 for(const sql of [`UPDATE integration_safety_item SET status='approved'`,`DELETE FROM integration_safety_item`,`UPDATE integration_safety_review SET outcome='confirmed'`,`DELETE FROM integration_safety_review`])await assert.rejects(db.query(sql),/immutable/i);
 const view=await as(su,read);
 assert.deepEqual(view.map(x=>x.version).sort(),[1,2]);
});
});
