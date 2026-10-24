import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createTestDb,actor,uuid} from './care-db.mjs';
const MIGRATIONS=['0055_certificate_workflow','0056_certificate_storage_defence','0057_operations_console','0058_operations_evidence_private_grants','0059_notification_outbox','0060_notification_explicit_private_grants','0061_notification_anomaly_capture','0062_operational_sla','0063_sla_explicit_private_grants','0064_privacy_lifecycle','0065_privacy_sla_notification_scope','0066_financial_reconciliation','0067_financial_explicit_private_grants','0068_financial_projection_defence','0069_release_readiness','0070_release_evidence','0071_release_review_acks','0072_release_drill_runs','0073_backup_evidence_register','0074_backup_unsafe_word_boundary','0075_protection_evidence_register','0076_content_review_register','0077_access_matrix_audit','0078_verification_campaign_runs'];
test('verification campaign persistence',async t=>{
const db=await createTestDb();t.after(()=>db.close());for(const f of MIGRATIONS)await db.exec(await readFile(`db/${f}.sql`,'utf8'));
const su=uuid(24001),ops=uuid(24002),scoped=uuid(24003),org=uuid(24005);
await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name,status,care_credit_model) VALUES('${org}','VC-A','Synthetic','Synthetic','ACTIVE','LOTS_V1');INSERT INTO user_roles(user_id,role,partner_id) VALUES('${su}','SUPER_ADMIN',null),('${ops}','OPERATIONS_ADMIN',null),('${scoped}','OPERATIONS_ADMIN','${org}');`);
const as=async(u,fn,role='authenticated',aal='aal2')=>{await actor(db,u,aal,role);await db.exec('SET ROLE '+role);try{return await fn()}finally{await db.exec('RESET ROLE')}};
const res=(o={})=>({check_id:'no-external',suite:'No external calls',scope:'Whole app',prerequisite_state:'none missing',expected:'No requests leave the site',status:'unverified',owner_role:'SUPER_ADMIN',evidence_ref:'campaign note one',next_action:'Run the real check',...o});
const rec=(sim=false,o={},v='v1')=>db.query('SELECT campaign_run_record($1,$2,$3,$4) r',[v,'Campaign run',sim,JSON.stringify([res(o)])]).then(x=>x.rows[0].r);
const ack=id=>db.query('SELECT campaign_result_confirm($1,$2,$3) r',[id,'confirmed','Checked evidence']).then(x=>x.rows[0].r);
const console_=()=>db.query('SELECT campaign_console() r').then(x=>x.rows[0].r);
await t.test('role isolation, MFA, signed-out blocked, no direct writes',async()=>{
 await assert.rejects(as(scoped,()=>rec()),/RELEASE_SCOPE_REQUIRED/);
 await assert.rejects(as(scoped,console_),/RELEASE_SCOPE_REQUIRED/);
 await assert.rejects(as(su,()=>rec(),'authenticated','aal1'),/MFA/);
 await assert.rejects(as(null,console_,'anon'),/permission denied/);
 for(const tb of ['campaign_runs','campaign_results','campaign_result_confirmations'])assert.equal((await db.query(`SELECT has_table_privilege('authenticated','public.${tb}','INSERT') ok`)).rows[0].ok,false);
});
await t.test('redaction and status honesty',async()=>{
 for(const r of ['https://x.example','ops@example.com','0812345678','token abc','passport scan'])await assert.rejects(as(su,()=>rec(false,{evidence_ref:r})),/INVALID_ARGUMENTS/);
 await assert.rejects(as(su,()=>rec(false,{status:'passed'})),/INVALID_ARGUMENTS/);
 await assert.rejects(as(su,()=>rec(false,{check_id:'grant_all'})),/check_id_check/);
 await assert.rejects(as(su,()=>rec(false,{},'latest')),/INVALID_ARGUMENTS/);
});
await t.test('simulated vs real, two-person, versioning, append-only',async()=>{
 const s=await as(su,()=>rec(true));const r=await as(su,()=>rec(false,{},'v2'));
 assert.ok(r.run_no>s.run_no);
 const rows=await as(su,console_);const sim=rows.find(x=>x.id===s.id),real=rows.find(x=>x.id===r.id);
 assert.equal(sim.results[0].simulated,true);assert.equal(real.campaign_version,'v2');
 await assert.rejects(as(ops,()=>ack(sim.results[0].id)),/SIMULATED_NOT_CONFIRMABLE/);
 await assert.rejects(as(su,()=>ack(real.results[0].id)),/SECOND_REVIEWER_REQUIRED/);
 await as(ops,()=>ack(real.results[0].id));
 await assert.rejects(as(ops,()=>ack(real.results[0].id)),/duplicate|unique/i);
 const out=JSON.stringify(await as(su,console_));assert.equal(out.includes(su)||out.includes(ops),false);
 for(const tb of ['campaign_runs','campaign_results','campaign_result_confirmations']){await assert.rejects(db.query(`UPDATE ${tb} SET created_at=now()`),/immutable/i);await assert.rejects(db.query(`DELETE FROM ${tb}`),/immutable/i);}
});
});
