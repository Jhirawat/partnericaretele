import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createTestDb,actor,uuid} from './care-db.mjs';
const MIGRATIONS=['0055_certificate_workflow','0056_certificate_storage_defence','0057_operations_console','0058_operations_evidence_private_grants','0059_notification_outbox','0060_notification_explicit_private_grants','0061_notification_anomaly_capture','0062_operational_sla','0063_sla_explicit_private_grants','0064_privacy_lifecycle','0065_privacy_sla_notification_scope','0066_financial_reconciliation','0067_financial_explicit_private_grants','0068_financial_projection_defence','0069_release_readiness','0070_release_evidence','0071_release_review_acks','0072_release_drill_runs','0073_backup_evidence_register','0074_backup_unsafe_word_boundary','0075_protection_evidence_register','0076_content_review_register','0077_access_matrix_audit','0078_verification_campaign_runs','0079_production_test_readiness','0080_owner_action_queue'];
test('owner action queue register',async t=>{
const db=await createTestDb();t.after(()=>db.close());for(const f of MIGRATIONS)await db.exec(await readFile(`db/${f}.sql`,'utf8'));
const su=uuid(25001),ops=uuid(25002),scoped=uuid(25003),partner=uuid(25004),doctor=uuid(25006),other=uuid(25007),org=uuid(25005);
await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name,status,care_credit_model) VALUES('${org}','OAQ-A','Synthetic','Synthetic','ACTIVE','LOTS_V1');INSERT INTO user_roles(user_id,role,partner_id) VALUES('${su}','SUPER_ADMIN',null),('${ops}','OPERATIONS_ADMIN',null),('${other}','SUPER_ADMIN',null),('${scoped}','OPERATIONS_ADMIN','${org}'),('${partner}','PARTNER_OWNER','${org}'),('${doctor}','DOCTOR','${org}');`);
const as=async(u,fn,role='authenticated',aal='aal2')=>{await actor(db,u,aal,role);await db.exec('SET ROLE '+role);try{return await fn()}finally{await db.exec('RESET ROLE')}};
const rec=(key='superadmin_account',status='available',evidence='Manual availability attestation',due='2099-12-31')=>db.query('SELECT owner_action_record($1,$2,$3,$4) r',[key,status,evidence,due]).then(x=>x.rows[0].r);
const ack=(id,outcome='confirmed')=>db.query('SELECT owner_action_confirm($1,$2) r',[id,outcome]).then(x=>x.rows[0].r);
const read=()=>db.query('SELECT owner_action_console() r').then(x=>x.rows[0].r);
await t.test('signed-out, tenant roles, unrelated accounts, MFA denied and direct writes forbidden',async()=>{
 for(const u of [scoped,partner,doctor,uuid(25999)]){await assert.rejects(as(u,read),/RELEASE_SCOPE_REQUIRED/);await assert.rejects(as(u,rec),/RELEASE_SCOPE_REQUIRED/);assert.equal((await as(u,()=>db.query('SELECT * FROM owner_action_items'))).rows.length,0);}
 await assert.rejects(as(null,read,'anon'),/permission denied/);
 await assert.rejects(as(su,read,'authenticated','aal1'),/MFA/);await assert.rejects(as(su,rec,'authenticated','aal1'),/MFA/);
 for(const table of ['owner_action_items','owner_action_reviews'])for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal((await db.query(`SELECT has_table_privilege('authenticated','public.${table}','${privilege}') ok`)).rows[0].ok,false);
});
await t.test('secret rejection and no free-text authority or automatic availability',async()=>{
 for(const value of ['ops@example.com','https://x.test','password xyz','123456','otp 123456','token abc','certificate contents','Jane Doe','private document','username john'])await assert.rejects(as(su,()=>rec('superadmin_account','available',value)),/INVALID_ARGUMENTS/);
 await assert.rejects(as(su,()=>rec('grant_all')),/INVALID_ARGUMENTS/);
 await assert.rejects(as(su,()=>rec('superadmin_account','passed')),/INVALID_ARGUMENTS/);
 await assert.rejects(as(su,()=>rec('superadmin_account','available',null)),/INVALID_ARGUMENTS/);
 await assert.rejects(as(su,()=>rec('superadmin_account','available','Manual availability attestation','2000-01-01')),/REVIEW_DATE_EXPIRED/);
 assert.deepEqual(await as(su,read),[]);
});
await t.test('owner and reviewer roles are derived from the closed vocabulary',async()=>{
 const r=await as(ops,()=>rec('second_reviewer','pending'));
 const entries=await as(su,read);
 assert.equal(entries[0].owner_role,'OPERATIONS_ADMIN');assert.equal(entries[0].reviewer_role,'SUPER_ADMIN');assert.equal(entries[0].required_action,'Arrange independent global reviewer');
 const c=await as(su,()=>rec('claims_review','pending'));
 const entries2=await as(su,read);const claims=entries2.find(e=>e.key==='claims_review');
 assert.equal(claims.owner_role,'SUPER_ADMIN');assert.equal(claims.reviewer_role,'OPERATIONS_ADMIN');assert.equal(claims.required_action,'Complete independent claims review');
});
await t.test('append-only versions, independent latest reviewer and immutable concerns',async()=>{
 const r=await as(su,rec);await assert.rejects(as(su,()=>ack(r.id)),/SECOND_REVIEWER_REQUIRED/);
 await assert.rejects(as(scoped,()=>ack(r.id)),/RELEASE_SCOPE_REQUIRED/);
 await as(ops,()=>ack(r.id));await assert.rejects(as(ops,()=>ack(r.id)),/unique|duplicate/i);
 let entries=await as(su,read);const latest=entries.find(e=>e.key==='superadmin_account'&&e.latest);assert.equal(latest.reviews[0].independent,true);
 const r2=await as(su,rec);assert.equal(r2.version,2);await assert.rejects(as(other,()=>ack(r.id)),/LATEST_VERSION_REQUIRED/);
 await as(ops,()=>ack(r2.id));await as(other,()=>ack(r2.id,'rejected'));
 entries=await as(su,read);const versions=entries.filter(e=>e.key==='superadmin_account');assert.equal(versions.length,2);assert.equal(versions[0].latest,false);assert.equal(versions[1].latest,true);assert.equal(versions[1].reviews.some(v=>v.outcome==='rejected'),true);
 const pending=await as(su,()=>rec('preview_access','pending'));await assert.rejects(as(ops,()=>ack(pending.id)),/AVAILABILITY_NOT_ATTESTED/);
 const output=JSON.stringify(await as(su,read));assert.equal(output.includes(su)||output.includes(ops)||output.includes(other),false);
 for(const table of ['owner_action_items','owner_action_reviews']){await assert.rejects(db.query(`UPDATE ${table} SET created_at=now()`),/immutable/i);await assert.rejects(db.query(`DELETE FROM ${table}`),/immutable/i);}
});
});
