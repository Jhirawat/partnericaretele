import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createTestDb,actor,uuid} from './care-db.mjs';
const MIGRATIONS=['0055_certificate_workflow','0056_certificate_storage_defence','0057_operations_console','0058_operations_evidence_private_grants','0059_notification_outbox','0060_notification_explicit_private_grants','0061_notification_anomaly_capture','0062_operational_sla','0063_sla_explicit_private_grants','0064_privacy_lifecycle','0065_privacy_sla_notification_scope','0066_financial_reconciliation','0067_financial_explicit_private_grants','0068_financial_projection_defence','0069_release_readiness','0070_release_evidence','0071_release_review_acks','0072_release_drill_runs','0073_backup_evidence_register','0074_backup_unsafe_word_boundary','0075_protection_evidence_register','0076_content_review_register','0077_access_matrix_audit','0078_verification_campaign_runs','0079_production_test_readiness','0080_owner_action_queue','0081_golive_decision_pack','0084_human_review_signoff'];
test('human review sign-off console register',async t=>{
const db=await createTestDb();t.after(()=>db.close());for(const f of MIGRATIONS)await db.exec(await readFile(`db/${f}.sql`,'utf8'));
const su=uuid(27001),ops=uuid(27002),ops2=uuid(27008),scoped=uuid(27003),partner=uuid(27004),doctor=uuid(27006),other=uuid(27007),org=uuid(27005);
await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name,status,care_credit_model) VALUES('${org}','HRC-A','Synthetic','Synthetic','ACTIVE','LOTS_V1');INSERT INTO user_roles(user_id,role,partner_id) VALUES('${su}','SUPER_ADMIN',null),('${ops}','OPERATIONS_ADMIN',null),('${ops2}','OPERATIONS_ADMIN',null),('${other}','SUPER_ADMIN',null),('${scoped}','OPERATIONS_ADMIN','${org}'),('${partner}','PARTNER_OWNER','${org}'),('${doctor}','DOCTOR','${org}');`);
const as=async(u,fn,role='authenticated',aal='aal2')=>{await actor(db,u,aal,role);await db.exec('SET ROLE '+role);try{return await fn()}finally{await db.exec('RESET ROLE')}};
const open=()=>db.query('SELECT human_review_open_round() r').then(x=>x.rows[0].r);
const decide=(decision,reason)=>db.query('SELECT human_review_decide($1,$2) r',[decision,reason]).then(x=>x.rows[0].r);
const read=()=>db.query('SELECT human_review_console() r').then(x=>x.rows[0].r);
const status=(n)=>db.query('SELECT human_review_status($1) s',[n]).then(x=>x.rows[0].s);
await t.test('signed-out, tenant roles, unrelated accounts, MFA denied and direct writes forbidden',async()=>{
 for(const u of [scoped,partner,doctor,uuid(27999)]){await assert.rejects(as(u,read),/RELEASE_SCOPE_REQUIRED/);await assert.rejects(as(u,open),/RELEASE_SCOPE_REQUIRED/);await assert.rejects(as(u,()=>decide('approve','blockers_resolved')),/RELEASE_SCOPE_REQUIRED/);assert.equal((await as(u,()=>db.query('SELECT * FROM review_rounds'))).rows.length,0);}
 await assert.rejects(as(null,read,'anon'),/permission denied/);
 await assert.rejects(as(su,read,'authenticated','aal1'),/MFA/);await assert.rejects(as(su,open,'authenticated','aal1'),/MFA/);
 for(const table of ['review_rounds','review_decisions'])for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal((await db.query(`SELECT has_table_privilege('authenticated','public.${table}','${privilege}') ok`)).rows[0].ok,false);
});
await t.test('closed vocabulary only; no free text, names, links or credentials can be recorded',async()=>{
 for(const bad of [['approved','blockers_resolved'],['approve','passed'],['approve','ops@example.com'],['approve','https://x.test'],['',''],['approve','']])await assert.rejects(as(su,()=>decide(bad[0],bad[1])),/INVALID_ARGUMENTS|STALE_ROUND/);
 assert.deepEqual(await as(su,read),{rounds:[],decisions:[]});
});
await t.test('one open round at a time; opener cannot self-review; two different roles approve',async()=>{
 const r1=await as(ops,()=>open());assert.equal(r1.round,1);
 await assert.rejects(as(su,open),/ROUND_ALREADY_OPEN/);
 await assert.rejects(as(ops,()=>decide('approve','blockers_resolved')),/REVIEWER_SEPARATION/);
 await as(su,()=>decide('approve','blockers_resolved'));
 assert.equal(await as(su,()=>status(1)),'open');
 await assert.rejects(as(su,()=>decide('approve','evidence_confirmed')),/unique|duplicate/i);
 await as(ops2,()=>decide('approve','evidence_confirmed'));
 assert.equal(await as(su,()=>status(1)),'approved');
 const view=await as(other,read);
 assert.equal(view.decisions[0].reviewer_role,'SUPER_ADMIN');assert.equal(view.decisions[1].reviewer_role,'OPERATIONS_ADMIN');
 const output=JSON.stringify(view);for(const u of [su,ops,ops2,other])assert.equal(output.includes(u),false);
});
await t.test('stale rounds refuse decisions; a concern keeps the round unresolved',async()=>{
 const r2=await as(su,()=>open());assert.equal(r2.round,2);
 await assert.rejects(as(su,()=>decide('approve','blockers_resolved')),/REVIEWER_SEPARATION/);
 await as(ops,()=>decide('concern','concern_blocker_open'));
 assert.equal(await as(su,()=>status(2)),'concern');
 await assert.rejects(as(other,()=>decide('approve','blockers_resolved')),/STALE_ROUND/);
 const r3=await as(ops2,()=>open());assert.equal(r3.round,3);
 await as(su,()=>decide('approve','blockers_resolved'));
 const view=await as(su,read);
 assert.equal(view.decisions.filter(x=>x.round===3).length,1);
 assert.equal(await as(su,()=>status(1)),'approved');
});
await t.test('append-only and versioned: records are never edited or deleted',async()=>{
 for(const sql of [`UPDATE review_rounds SET opened_by=opened_by`,`DELETE FROM review_rounds`,`UPDATE review_decisions SET decision='approve'`,`DELETE FROM review_decisions`])await assert.rejects(db.query(sql),/immutable/i);
 const view=await as(su,read);
 assert.deepEqual(view.rounds.map(x=>x.round),[1,2,3]);
});
});
