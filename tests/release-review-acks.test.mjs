import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createTestDb,actor,uuid} from './care-db.mjs';
const MIGRATIONS=['0055_certificate_workflow','0056_certificate_storage_defence','0057_operations_console','0058_operations_evidence_private_grants','0059_notification_outbox','0060_notification_explicit_private_grants','0061_notification_anomaly_capture','0062_operational_sla','0063_sla_explicit_private_grants','0064_privacy_lifecycle','0065_privacy_sla_notification_scope','0066_financial_reconciliation','0067_financial_explicit_private_grants','0068_financial_projection_defence','0069_release_readiness','0070_release_evidence','0071_release_review_acks'];
test('publish gate reviewer acknowledgements',async t=>{
const db=await createTestDb();t.after(()=>db.close());for(const f of MIGRATIONS)await db.exec(await readFile(`db/${f}.sql`,'utf8'));
const su=uuid(18001),ops=uuid(18002),scoped=uuid(18003),org=uuid(18005);
await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name,status,care_credit_model) VALUES('${org}','ACK-A','Synthetic','Synthetic','ACTIVE','LOTS_V1');INSERT INTO user_roles(user_id,role,partner_id) VALUES('${su}','SUPER_ADMIN',null),('${ops}','OPERATIONS_ADMIN',null),('${scoped}','OPERATIONS_ADMIN','${org}');`);
const as=async(u,fn,role='authenticated',aal='aal2')=>{await actor(db,u,aal,role);await db.exec('SET ROLE '+role);try{return await fn()}finally{await db.exec('RESET ROLE')}};
const ack=(item='wording',outcome='acknowledged',note='Thai and English labels reviewed')=>db.query('SELECT release_review_ack($1,$2,$3) r',[item,outcome,note]).then(x=>x.rows[0].r);
const view=()=>as(su,()=>db.query('SELECT release_review_console() r')).then(x=>x.rows[0].r);
await t.test('scope, MFA and anon denial',async()=>{
 await assert.rejects(as(scoped,()=>ack()),/RELEASE_SCOPE_REQUIRED/);
 await assert.rejects(as(su,()=>ack(),'authenticated','aal1'),/MFA/);
 await assert.rejects(as(null,()=>db.query('SELECT release_review_console()'),'anon'),/permission denied/);
 assert.equal((await db.query("SELECT has_table_privilege('authenticated','public.release_review_acks','INSERT') ok")).rows[0].ok,false);
});
await t.test('redaction and invalid input refused',async()=>{
 for(const n of ['mail ops@example.com','see https://x.example','token abc','call 0812345678','no'])await assert.rejects(as(su,()=>ack('wording','acknowledged',n)),/INVALID_ARGUMENTS/);
 await assert.rejects(as(su,()=>ack('pricing_live')),/INVALID_ARGUMENTS/);
 await assert.rejects(as(su,()=>ack('wording','passed')),/INVALID_ARGUMENTS/);
});
await t.test('append-only, distinct reviewers, no side effects',async()=>{
 const before=(await db.query('SELECT (SELECT count(*) FROM release_signoffs)+(SELECT count(*) FROM release_evidence) n')).rows[0].n;
 const a=await as(su,()=>ack());assert.equal(a.round,1);
 const b=await as(su,()=>ack('wording','concern','One label still mixed'));assert.equal(b.round,2);
 await as(ops,()=>ack());
 const rows=await view();const w=rows.filter(r=>r.item_key==='wording');
 assert.equal(w.length,3);assert.equal(new Set(w.map(r=>r.reviewer_no)).size,2);
 assert.ok(rows.every(r=>!('reviewer' in r)));assert.equal(JSON.stringify(rows).includes(su),false);
 await assert.rejects(db.query("UPDATE release_review_acks SET note='changed'"),/immutable|IMMUTABLE/i);
 await assert.rejects(db.query('DELETE FROM release_review_acks'),/immutable|IMMUTABLE/i);
 assert.equal((await db.query('SELECT (SELECT count(*) FROM release_signoffs)+(SELECT count(*) FROM release_evidence) n')).rows[0].n,before);
});
});
