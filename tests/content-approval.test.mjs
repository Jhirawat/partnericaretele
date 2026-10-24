import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createTestDb,actor,uuid} from './care-db.mjs';
const MIGRATIONS=['0055_certificate_workflow','0056_certificate_storage_defence','0057_operations_console','0058_operations_evidence_private_grants','0059_notification_outbox','0060_notification_explicit_private_grants','0061_notification_anomaly_capture','0062_operational_sla','0063_sla_explicit_private_grants','0064_privacy_lifecycle','0065_privacy_sla_notification_scope','0066_financial_reconciliation','0067_financial_explicit_private_grants','0068_financial_projection_defence','0069_release_readiness','0070_release_evidence','0071_release_review_acks','0072_release_drill_runs','0073_backup_evidence_register','0074_backup_unsafe_word_boundary','0075_protection_evidence_register','0076_content_review_register','0077_access_matrix_audit','0078_verification_campaign_runs','0079_production_test_readiness','0080_owner_action_queue','0081_golive_decision_pack','0084_human_review_signoff','0086_content_approval_workspace','0087_content_approval_console_mfa'];
test('canonical content and commercial approval workspace',async t=>{
const db=await createTestDb();t.after(()=>db.close());for(const f of MIGRATIONS)await db.exec(await readFile(`db/${f}.sql`,'utf8'));
const su=uuid(28001),ops=uuid(28002),ops2=uuid(28008),scoped=uuid(28003),partner=uuid(28004),doctor=uuid(28006),other=uuid(28007),org=uuid(28005);
await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name,status,care_credit_model) VALUES('${org}','CCA-A','Synthetic','Synthetic','ACTIVE','LOTS_V1');INSERT INTO user_roles(user_id,role,partner_id) VALUES('${su}','SUPER_ADMIN',null),('${ops}','OPERATIONS_ADMIN',null),('${ops2}','OPERATIONS_ADMIN',null),('${other}','SUPER_ADMIN',null),('${scoped}','OPERATIONS_ADMIN','${org}'),('${partner}','PARTNER_OWNER','${org}'),('${doctor}','DOCTOR','${org}');`);
const as=async(u,fn,role='authenticated',aal='aal2')=>{await actor(db,u,aal,role);await db.exec('SET ROLE '+role);try{return await fn()}finally{await db.exec('RESET ROLE')}};
const record=(category='clinic_facts',surface='/',canonical='available',status='available',ref='Canonical source document reference',action='Record independent approval of canonical source',date='2026-10-20',lineage=null)=>db.query('SELECT content_approval_record($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) r',[lineage,category,surface,canonical,status,'SUPER_ADMIN','OPERATIONS_ADMIN',ref,action,date]).then(x=>x.rows[0].r);
const review=(id,outcome='approved')=>db.query('SELECT content_approval_review($1,$2) r',[id,outcome]).then(x=>x.rows[0].r);
const read=()=>db.query('SELECT content_approval_console() r').then(x=>x.rows[0].r);
await t.test('signed-out, tenant roles, unrelated accounts, MFA denied and direct writes forbidden',async()=>{
 for(const u of [scoped,partner,doctor,uuid(28999)]){await assert.rejects(as(u,read),/RELEASE_SCOPE_REQUIRED/);await assert.rejects(as(u,()=>record()),/RELEASE_SCOPE_REQUIRED/);assert.equal((await as(u,()=>db.query('SELECT * FROM content_approval'))).rows.length,0);}
 await assert.rejects(as(null,read,'anon'),/permission denied/);
 await assert.rejects(as(su,read,'authenticated','aal1'),/MFA/);await assert.rejects(as(su,()=>record(),'authenticated','aal1'),/MFA/);
 for(const table of ['content_approval','content_approval_reviews'])for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal((await db.query(`SELECT has_table_privilege('authenticated','public.${table}','${privilege}') ok`)).rows[0].ok,false);
});
await t.test('closed vocabulary only; unsafe text and future dates refused',async()=>{
 for(const bad of [()=>record('facts'),()=>record('clinic_facts','/admin'),()=>record('clinic_facts','/','present'),()=>record('clinic_facts','/','available','approved'),()=>record('clinic_facts','/','available','available','ask ops@example.com'),()=>record('clinic_facts','/','available','available','see https://x.test'),()=>record('clinic_facts','/','available','available','call +66 81 234 5678'),()=>record('clinic_facts','/','available','available','ok','Do a thing'),()=>record('clinic_facts','/','available','available','ok','Record independent approval of canonical source','2999-01-01')])await assert.rejects(as(su,bad),/INVALID_ARGUMENTS/);
 assert.deepEqual(await as(su,read),[]);
});
await t.test('versioning, category stability, reviewer separation and stale-version rejection',async()=>{
 const v1=await as(su,()=>record());assert.equal(v1.version,1);
 await assert.rejects(as(su,()=>review(v1.id)),/SECOND_REVIEWER_REQUIRED/);
 await as(ops,()=>review(v1.id,'approved'));
 await assert.rejects(as(ops,()=>review(v1.id)),/unique|duplicate/i);
 await assert.rejects(as(ops,()=>record('pricing','/', 'available','available','Canonical source document reference','Record independent approval of canonical source','2026-10-20',v1.lineage)),/CATEGORY_MISMATCH/);
 const v2=await as(ops,()=>record('clinic_facts','/','available','available','Canonical source document reference','Record independent approval of canonical source','2026-10-21',v1.lineage));
 assert.equal(v2.version,2);
 await assert.rejects(as(other,()=>review(v1.id)),/STALE_VERSION/);
 await as(su,()=>review(v2.id,'concern'));
 const view=await as(other,read);
 assert.equal(view.length,2);
 const latest=view.find(e=>e.version===2);
 assert.equal(latest.latest,true);assert.equal(view.find(e=>e.version===1).latest,false);
 assert.equal(latest.reviews[0].outcome,'concern');
 const output=JSON.stringify(view);for(const u of [su,ops,ops2,other])assert.equal(output.includes(u),false);
});
await t.test('append-only and versioned: records are never edited or deleted',async()=>{
 for(const sql of [`UPDATE content_approval SET status='available'`,`DELETE FROM content_approval`,`UPDATE content_approval_reviews SET outcome='approved'`,`DELETE FROM content_approval_reviews`])await assert.rejects(db.query(sql),/immutable/i);
 const view=await as(su,read);
 assert.deepEqual(view.map(x=>x.version).sort(),[1,2]);
});
});
