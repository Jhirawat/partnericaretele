import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createTestDb,actor,uuid} from './care-db.mjs';
const MIGRATIONS=['0055_certificate_workflow','0056_certificate_storage_defence','0057_operations_console','0058_operations_evidence_private_grants','0059_notification_outbox','0060_notification_explicit_private_grants','0061_notification_anomaly_capture','0062_operational_sla','0063_sla_explicit_private_grants','0064_privacy_lifecycle','0065_privacy_sla_notification_scope','0066_financial_reconciliation','0067_financial_explicit_private_grants','0068_financial_projection_defence','0069_release_readiness','0070_release_evidence','0071_release_review_acks','0072_release_drill_runs','0073_backup_evidence_register','0074_backup_unsafe_word_boundary'];
test('backup evidence register',async t=>{
const db=await createTestDb();t.after(()=>db.close());for(const f of MIGRATIONS)await db.exec(await readFile(`db/${f}.sql`,'utf8'));
const su=uuid(20001),ops=uuid(20002),scoped=uuid(20003),org=uuid(20005);
await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name,status,care_credit_model) VALUES('${org}','BKP-A','Synthetic','Synthetic','ACTIVE','LOTS_V1');INSERT INTO user_roles(user_id,role,partner_id) VALUES('${su}','SUPER_ADMIN',null),('${ops}','OPERATIONS_ADMIN',null),('${scoped}','OPERATIONS_ADMIN','${org}');`);
const as=async(u,fn,role='authenticated',aal='aal2')=>{await actor(db,u,aal,role);await db.exec('SET ROLE '+role);try{return await fn()}finally{await db.exec('RESET ROLE')}};
const rec=(o={})=>{const a={lineage:null,scope:'Main database',env:'Production',bd:'2026-01-02',ret:30,rd:'2026-01-03',res:'success',ref:'restore drill one',st:'pending',next:'Second admin confirms',...o};return db.query('SELECT backup_evidence_record($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) r',[a.lineage,a.scope,a.env,a.bd,a.ret,a.rd,a.res,'SUPER_ADMIN','OPERATIONS_ADMIN',a.ref,a.st,a.next]).then(x=>x.rows[0].r)};
const confirm=(id,o='confirmed')=>db.query('SELECT backup_evidence_confirm($1,$2,$3) r',[id,o,'Reviewed restore evidence']).then(x=>x.rows[0].r);
const counts=()=>db.query('SELECT (SELECT count(*) FROM credit_transactions)+(SELECT count(*) FROM release_signoffs)+(SELECT count(*) FROM release_evidence)+(SELECT count(*) FROM release_drill_runs) n').then(x=>x.rows[0].n);
await t.test('scope, MFA, anon and no direct writes',async()=>{
 await assert.rejects(as(scoped,()=>rec()),/RELEASE_SCOPE_REQUIRED/);
 await assert.rejects(as(su,()=>rec(),'authenticated','aal1'),/MFA/);
 await assert.rejects(as(null,()=>db.query('SELECT backup_evidence_console()'),'anon'),/permission denied/);
 for(const tb of ['backup_evidence','backup_evidence_confirmations'])assert.equal((await db.query(`SELECT has_table_privilege('authenticated','public.${tb}','INSERT') ok`)).rows[0].ok,false);
});
await t.test('redaction and no automatic pass',async()=>{
 for(const r of ['s3://b/x','https://x.example','pg_dump main','ops@example.com','token abc','0812345678','dump.sql'])await assert.rejects(as(su,()=>rec({ref:r})),/INVALID_ARGUMENTS/);
 await assert.rejects(as(su,()=>rec({st:'passed'})),/INVALID_ARGUMENTS/);
 await assert.rejects(as(su,()=>rec({bd:'2999-01-01'})),/INVALID_ARGUMENTS/);
});
await t.test('versioning, two-person confirmation, append-only, no side effects',async()=>{
 const before=await counts();
 const a=await as(su,()=>rec());assert.equal(a.version,1);
 await assert.rejects(as(su,()=>confirm(a.id)),/SECOND_REVIEWER_REQUIRED/);
 const b=await as(su,()=>rec({lineage:a.lineage,ref:'restore drill two'}));assert.equal(b.version,2);
 await assert.rejects(as(ops,()=>confirm(a.id)),/STALE_VERSION/);
 await as(ops,()=>confirm(b.id));
 await assert.rejects(as(ops,()=>confirm(b.id)),/duplicate|unique/i);
 const rows=(await as(su,()=>db.query('SELECT backup_evidence_console() r'))).rows[0].r;
 assert.equal(rows.length,2);const latest=rows.find(r=>r.latest);assert.equal(latest.confirmations[0].independent,true);
 assert.equal(JSON.stringify(rows).includes(su)||JSON.stringify(rows).includes(ops),false);
 await assert.rejects(db.query("UPDATE backup_evidence SET status='blocked'"),/immutable/i);
 await assert.rejects(db.query('DELETE FROM backup_evidence_confirmations'),/immutable/i);
 assert.equal(await counts(),before);
});
});
