import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createTestDb,actor,uuid} from './care-db.mjs';
const MIGRATIONS=['0055_certificate_workflow','0056_certificate_storage_defence','0057_operations_console','0058_operations_evidence_private_grants','0059_notification_outbox','0060_notification_explicit_private_grants','0061_notification_anomaly_capture','0062_operational_sla','0063_sla_explicit_private_grants','0064_privacy_lifecycle','0065_privacy_sla_notification_scope','0066_financial_reconciliation','0067_financial_explicit_private_grants','0068_financial_projection_defence','0069_release_readiness','0070_release_evidence','0071_release_review_acks','0072_release_drill_runs','0073_backup_evidence_register','0074_backup_unsafe_word_boundary','0075_protection_evidence_register','0076_content_review_register','0077_access_matrix_audit','0078_verification_campaign_runs','0079_production_test_readiness','0080_owner_action_queue','0081_golive_decision_pack','0082_test_session_workspace','0083_test_session_record_fix'];
test('production test session workspace register',async t=>{
const db=await createTestDb();t.after(()=>db.close());for(const f of MIGRATIONS)await db.exec(await readFile(`db/${f}.sql`,'utf8'));
const su=uuid(27001),ops=uuid(27002),scoped=uuid(27003),partner=uuid(27004),doctor=uuid(27006),other=uuid(27007),org=uuid(27005);
await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name,status,care_credit_model) VALUES('${org}','TSW-A','Synthetic','Synthetic','ACTIVE','LOTS_V1');INSERT INTO user_roles(user_id,role,partner_id) VALUES('${su}','SUPER_ADMIN',null),('${ops}','OPERATIONS_ADMIN',null),('${other}','SUPER_ADMIN',null),('${scoped}','OPERATIONS_ADMIN','${org}'),('${partner}','PARTNER_OWNER','${org}'),('${doctor}','DOCTOR','${org}');`);
const as=async(u,fn,role='authenticated',aal='aal2')=>{await actor(db,u,aal,role);await db.exec('SET ROLE '+role);try{return await fn()}finally{await db.exec('RESET ROLE')}};
const record=(suite,status,evidence='Owner handoff review')=>db.query('SELECT test_session_record($1,$2,$3) r',[suite,status,evidence]).then(x=>x.rows[0].r);
const confirm=(id,outcome='confirmed')=>db.query('SELECT test_session_confirm($1,$2) r',[id,outcome]).then(x=>x.rows[0].r);
const read=()=>db.query('SELECT test_session_console() r').then(x=>x.rows[0].r);
await t.test('signed-out, tenant roles, unrelated accounts, MFA denied and direct writes forbidden',async()=>{
 for(const u of [scoped,partner,doctor,uuid(27999)]){await assert.rejects(as(u,read),/RELEASE_SCOPE_REQUIRED/);await assert.rejects(as(u,()=>record('audit','planned')),/RELEASE_SCOPE_REQUIRED/);assert.equal((await as(u,()=>db.query('SELECT * FROM test_sessions'))).rows.length,0);}
 await assert.rejects(as(null,read,'anon'),/permission denied/);
 await assert.rejects(as(su,read,'authenticated','aal1'),/MFA/);await assert.rejects(as(su,()=>record('audit','planned'),'authenticated','aal1'),/MFA/);
 for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal((await db.query(`SELECT has_table_privilege('authenticated','public.test_sessions','${privilege}') ok`)).rows[0].ok,false);
});
await t.test('closed vocabulary only; no free text can be recorded',async()=>{
 for(const bad of [['not-a-suite','planned'],['audit','approved'],['audit','planned','ops@example.com'],['audit',''],['','planned']])await assert.rejects(as(su,()=>record(...bad)),/INVALID_ARGUMENTS/);
 assert.deepEqual(await as(su,read),[]);
});
await t.test('the campaign never runs from the workspace: active, paused and completed are refused',async()=>{
 for(const status of ['active','paused','completed'])await assert.rejects(as(su,()=>record('audit',status)),/CAMPAIGN_NOT_RUNNABLE/);
});
await t.test('start gate: ready needs every mapped prerequisite independently confirmed',async()=>{
 await assert.rejects(as(su,()=>record('role_access','ready')),/PREREQUISITES_UNAVAILABLE/);
 const p1=await as(su,()=>record('role_access','planned'));assert.equal(p1.version,1);
 await db.exec(`INSERT INTO test_prerequisites(prerequisite_key,version,status,owner_role,required_action,evidence_label,review_due,recorder) VALUES('superadmin_account',1,'available','SUPER_ADMIN','Arrange global test account','Manual availability attestation',current_date+30,'${su}'),('preview_access',1,'available','OPERATIONS_ADMIN','Confirm signed-in preview access','Manual availability attestation',current_date+30,'${su}');INSERT INTO test_prerequisite_reviews(prerequisite_id,outcome,reviewer) SELECT id,'confirmed','${ops}' FROM test_prerequisites WHERE prerequisite_key IN ('superadmin_account','preview_access');`);
 const r2=await as(su,()=>record('role_access','ready'));assert.equal(r2.version,2);
 const rows=await as(su,read);const latest=rows.find(x=>x.suite_key==='role_access'&&x.latest);
 assert.equal(latest.status,'ready');assert.equal(latest.prerequisite_state,'none missing');assert.equal(latest.blocker_reason,'Campaign not executed');
});
await t.test('append-only versioning, reviewer separation and immutability',async()=>{
 const rows=await as(su,read);const latest=rows.find(x=>x.suite_key==='role_access'&&x.latest);
 await assert.rejects(as(su,()=>confirm(latest.id)),/SECOND_REVIEWER_REQUIRED/);
 await as(ops,()=>confirm(latest.id,'confirmed'));
 const stale=rows.find(x=>x.suite_key==='role_access'&&!x.latest);
 await assert.rejects(as(other,()=>confirm(stale.id)),/LATEST_VERSION_REQUIRED/);
 await assert.rejects(as(ops,()=>confirm(latest.id,'confirmed')),/unique|duplicate/i);
 const after=await as(su,read);
 assert.equal(after.find(x=>x.suite_key==='role_access'&&x.latest).reviews.length,1);
 const output=JSON.stringify(after);for(const u of [su,ops,other])assert.equal(output.includes(u),false);
 for(const sql of [`UPDATE test_sessions SET status='completed'`,`DELETE FROM test_sessions`,`UPDATE test_session_reviews SET outcome='confirmed'`,`DELETE FROM test_session_reviews`])await assert.rejects(db.query(sql),/immutable/i);
});
});
