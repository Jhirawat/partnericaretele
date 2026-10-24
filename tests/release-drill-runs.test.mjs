import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createTestDb,actor,uuid} from './care-db.mjs';
const MIGRATIONS=['0055_certificate_workflow','0056_certificate_storage_defence','0057_operations_console','0058_operations_evidence_private_grants','0059_notification_outbox','0060_notification_explicit_private_grants','0061_notification_anomaly_capture','0062_operational_sla','0063_sla_explicit_private_grants','0064_privacy_lifecycle','0065_privacy_sla_notification_scope','0066_financial_reconciliation','0067_financial_explicit_private_grants','0068_financial_projection_defence','0069_release_readiness','0070_release_evidence','0071_release_review_acks','0072_release_drill_runs'];
test('simulation-only rollback drill history',async t=>{
const db=await createTestDb();t.after(()=>db.close());for(const f of MIGRATIONS)await db.exec(await readFile(`db/${f}.sql`,'utf8'));
const su=uuid(19001),scoped=uuid(19003),org=uuid(19005);
await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name,status,care_credit_model) VALUES('${org}','DRL-A','Synthetic','Synthetic','ACTIVE','LOTS_V1');INSERT INTO user_roles(user_id,role,partner_id) VALUES('${su}','SUPER_ADMIN',null),('${scoped}','OPERATIONS_ADMIN','${org}');`);
const as=async(u,fn,role='authenticated',aal='aal2')=>{await actor(db,u,aal,role);await db.exec('SET ROLE '+role);try{return await fn()}finally{await db.exec('RESET ROLE')}};
const rec=(syn=true,ev='drill label one',nx='Repeat next quarter',sc='frontend_regression')=>db.query('SELECT release_drill_record($1,$2,$3,$4,$5,$6,$7) r',[sc,syn,'Previous version restored','Counts unchanged','passed',ev,nx]).then(x=>x.rows[0].r);
const counts=()=>db.query('SELECT (SELECT count(*) FROM credit_transactions)+(SELECT count(*) FROM release_signoffs)+(SELECT count(*) FROM release_evidence)+(SELECT count(*) FROM release_review_acks) n').then(x=>x.rows[0].n);
await t.test('scope, MFA, anon and no direct writes',async()=>{
 await assert.rejects(as(scoped,()=>rec()),/RELEASE_SCOPE_REQUIRED/);
 await assert.rejects(as(su,()=>rec(),'authenticated','aal1'),/MFA/);
 await assert.rejects(as(null,()=>db.query('SELECT release_drill_console()'),'anon'),/permission denied/);
 assert.equal((await db.query("SELECT has_table_privilege('authenticated','public.release_drill_runs','INSERT') ok")).rows[0].ok,false);
});
await t.test('synthetic-only and redaction',async()=>{
 await assert.rejects(as(su,()=>rec(false)),/SYNTHETIC_ONLY/);
 for(const e of ['ops@example.com','https://x.example','token abc','0812345678'])await assert.rejects(as(su,()=>rec(true,e)),/INVALID_ARGUMENTS/);
 await assert.rejects(as(su,()=>rec(true,'drill label','next step','drop_database')),/INVALID_ARGUMENTS/);
});
await t.test('append-only and no side effects',async()=>{
 const before=await counts();
 await as(su,()=>rec());await as(su,()=>rec(true,'drill label two'));
 const rows=(await as(su,()=>db.query('SELECT release_drill_console() r'))).rows[0].r;
 assert.equal(rows.length,2);assert.equal(JSON.stringify(rows).includes(su),false);
 await assert.rejects(db.query("UPDATE release_drill_runs SET observed='changed'"),/immutable/i);
 await assert.rejects(db.query('DELETE FROM release_drill_runs'),/immutable/i);
 assert.equal(await counts(),before);
});
});
