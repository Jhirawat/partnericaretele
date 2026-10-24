import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createTestDb,actor,uuid} from './care-db.mjs';
const MIGRATIONS=['0055_certificate_workflow','0056_certificate_storage_defence','0057_operations_console','0058_operations_evidence_private_grants','0059_notification_outbox','0060_notification_explicit_private_grants','0061_notification_anomaly_capture','0062_operational_sla','0063_sla_explicit_private_grants','0064_privacy_lifecycle','0065_privacy_sla_notification_scope','0066_financial_reconciliation','0067_financial_explicit_private_grants','0068_financial_projection_defence','0069_release_readiness','0070_release_evidence','0071_release_review_acks','0072_release_drill_runs','0073_backup_evidence_register','0074_backup_unsafe_word_boundary','0075_protection_evidence_register','0076_content_review_register','0077_access_matrix_audit','0078_verification_campaign_runs','0079_production_test_readiness','0080_owner_action_queue','0081_golive_decision_pack'];
test('final go-live decision pack sign-off register',async t=>{
const db=await createTestDb();t.after(()=>db.close());for(const f of MIGRATIONS)await db.exec(await readFile(`db/${f}.sql`,'utf8'));
const su=uuid(26001),ops=uuid(26002),scoped=uuid(26003),partner=uuid(26004),doctor=uuid(26006),other=uuid(26007),org=uuid(26005);
await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name,status,care_credit_model) VALUES('${org}','DPK-A','Synthetic','Synthetic','ACTIVE','LOTS_V1');INSERT INTO user_roles(user_id,role,partner_id) VALUES('${su}','SUPER_ADMIN',null),('${ops}','OPERATIONS_ADMIN',null),('${other}','SUPER_ADMIN',null),('${scoped}','OPERATIONS_ADMIN','${org}'),('${partner}','PARTNER_OWNER','${org}'),('${doctor}','DOCTOR','${org}');`);
const as=async(u,fn,role='authenticated',aal='aal2')=>{await actor(db,u,aal,role);await db.exec('SET ROLE '+role);try{return await fn()}finally{await db.exec('RESET ROLE')}};
const sign=(outcome='endorsed')=>db.query('SELECT decision_pack_sign($1) r',[outcome]).then(x=>x.rows[0].r);
const read=()=>db.query('SELECT decision_pack_console() r').then(x=>x.rows[0].r);
await t.test('signed-out, tenant roles, unrelated accounts, MFA denied and direct writes forbidden',async()=>{
 for(const u of [scoped,partner,doctor,uuid(26999)]){await assert.rejects(as(u,read),/RELEASE_SCOPE_REQUIRED/);await assert.rejects(as(u,sign),/RELEASE_SCOPE_REQUIRED/);assert.equal((await as(u,()=>db.query('SELECT * FROM decision_signoffs'))).rows.length,0);}
 await assert.rejects(as(null,read,'anon'),/permission denied/);
 await assert.rejects(as(su,read,'authenticated','aal1'),/MFA/);await assert.rejects(as(su,sign,'authenticated','aal1'),/MFA/);
 for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal((await db.query(`SELECT has_table_privilege('authenticated','public.decision_signoffs','${privilege}') ok`)).rows[0].ok,false);
});
await t.test('closed vocabulary only; no free text can be recorded',async()=>{
 for(const bad of ['approved','passed','ready','ops@example.com','https://x.test',''])await assert.rejects(as(su,()=>sign(bad)),/INVALID_ARGUMENTS/);
 assert.deepEqual(await as(su,read),[]);
});
await t.test('signer role is derived from global roles, not client input',async()=>{
 await as(ops,()=>sign('endorsed'));
 const rows=await as(su,read);
 assert.equal(rows[0].signer_role,'OPERATIONS_ADMIN');assert.equal(rows[0].mine,false);
 assert.equal((await as(ops,read))[0].mine,true);
});
await t.test('append-only rounds close on both roles or a concern; one signature per person per round',async()=>{
 const r1=await as(su,()=>sign('endorsed'));assert.equal(r1.round,1);
 const r2=await as(ops,()=>sign('endorsed'));assert.equal(r2.round,2);
 await assert.rejects(as(ops,()=>sign('endorsed')),/unique|duplicate/i);
 await as(su,()=>sign('concern'));
 const r5=await as(other,()=>sign('concern'));assert.equal(r5.round,3);
 const rows=await as(su,read);assert.equal(rows.length,5);
 assert.deepEqual(rows.map(x=>x.round),[1,1,2,2,3]);
 const output=JSON.stringify(rows);for(const u of [su,ops,other])assert.equal(output.includes(u),false);
 for(const sql of [`UPDATE decision_signoffs SET outcome='endorsed'`,`DELETE FROM decision_signoffs`])await assert.rejects(db.query(sql),/immutable/i);
});
});
