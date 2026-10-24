import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createTestDb,actor,uuid} from './care-db.mjs';
const MIGRATIONS=['0055_certificate_workflow','0056_certificate_storage_defence','0057_operations_console','0058_operations_evidence_private_grants','0059_notification_outbox','0060_notification_explicit_private_grants','0061_notification_anomaly_capture','0062_operational_sla','0063_sla_explicit_private_grants','0064_privacy_lifecycle','0065_privacy_sla_notification_scope','0066_financial_reconciliation','0067_financial_explicit_private_grants','0068_financial_projection_defence','0069_release_readiness','0070_release_evidence','0071_release_review_acks','0072_release_drill_runs','0073_backup_evidence_register','0074_backup_unsafe_word_boundary','0075_protection_evidence_register','0076_content_review_register'];
test('content and claims review register',async t=>{
const db=await createTestDb();t.after(()=>db.close());for(const f of MIGRATIONS)await db.exec(await readFile(`db/${f}.sql`,'utf8'));
const su=uuid(22001),ops=uuid(22002),scoped=uuid(22003),org=uuid(22005);
await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name,status,care_credit_model) VALUES('${org}','CRV-A','Synthetic','Synthetic','ACTIVE','LOTS_V1');INSERT INTO user_roles(user_id,role,partner_id) VALUES('${su}','SUPER_ADMIN',null),('${ops}','OPERATIONS_ADMIN',null),('${scoped}','OPERATIONS_ADMIN','${org}');`);
const as=async(u,fn,role='authenticated',aal='aal2')=>{await actor(db,u,aal,role);await db.exec('SET ROLE '+role);try{return await fn()}finally{await db.exec('RESET ROLE')}};
const rec=(o={})=>{const a={lineage:null,type:'clinic_facts',route:'/',scope:'Home clinic facts',st:'pending',ref:'review one',reason:'Matches documents',next:'Second admin acknowledges',date:'2026-01-02',...o};return db.query('SELECT content_review_record($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) r',[a.lineage,a.type,a.route,a.scope,'SUPER_ADMIN','OPERATIONS_ADMIN',a.st,a.ref,a.reason,a.next,a.date]).then(x=>x.rows[0].r)};
const ack=(id,o='acknowledged')=>db.query('SELECT content_review_ack($1,$2,$3) r',[id,o,'Reviewed wording']).then(x=>x.rows[0].r);
const counts=()=>db.query('SELECT (SELECT count(*) FROM credit_transactions)+(SELECT count(*) FROM release_signoffs)+(SELECT count(*) FROM release_review_acks)+(SELECT count(*) FROM backup_evidence)+(SELECT count(*) FROM protection_evidence) n').then(x=>x.rows[0].n);
await t.test('scope, MFA, anon and no direct writes',async()=>{
 await assert.rejects(as(scoped,()=>rec()),/RELEASE_SCOPE_REQUIRED/);
 await assert.rejects(as(su,()=>rec(),'authenticated','aal1'),/MFA/);
 await assert.rejects(as(null,()=>db.query('SELECT content_review_console()'),'anon'),/permission denied/);
 for(const tb of ['content_review','content_review_acks'])assert.equal((await db.query(`SELECT has_table_privilege('authenticated','public.${tb}','INSERT') ok`)).rows[0].ok,false);
});
await t.test('redaction, route scope and no automatic pass',async()=>{
 for(const r of ['https://x.example','ops@example.com','+66 81 234 5678','0812345678','licence.pdf','passport scan','token abc'])await assert.rejects(as(su,()=>rec({ref:r})),/INVALID_ARGUMENTS/);
 await assert.rejects(as(su,()=>rec({route:'/dashboard'})),/INVALID_ARGUMENTS/);
 await assert.rejects(as(su,()=>rec({type:'ratings'})),/INVALID_ARGUMENTS/);
 await assert.rejects(as(su,()=>rec({st:'passed'})),/INVALID_ARGUMENTS/);
});
await t.test('versioning, claim-type separation, two-person review, append-only',async()=>{
 const before=await counts();
 const a=await as(su,()=>rec());assert.equal(a.version,1);
 await assert.rejects(as(su,()=>rec({lineage:a.lineage,type:'medical_claims'})),/CLAIM_TYPE_MISMATCH/);
 await assert.rejects(as(su,()=>ack(a.id)),/SECOND_REVIEWER_REQUIRED/);
 const b=await as(su,()=>rec({lineage:a.lineage,ref:'review two'}));assert.equal(b.version,2);
 await assert.rejects(as(ops,()=>ack(a.id)),/STALE_VERSION/);
 await as(ops,()=>ack(b.id,'concern'));
 await assert.rejects(as(ops,()=>ack(b.id)),/duplicate|unique/i);
 const rows=(await as(su,()=>db.query('SELECT content_review_console() r'))).rows[0].r;
 assert.equal(rows.length,2);assert.equal(rows.find(r=>r.latest).acks[0].outcome,'concern');
 assert.equal(JSON.stringify(rows).includes(su)||JSON.stringify(rows).includes(ops),false);
 await assert.rejects(db.query("UPDATE content_review SET status='blocked'"),/immutable/i);
 await assert.rejects(db.query('DELETE FROM content_review_acks'),/immutable/i);
 assert.equal(await counts(),before);
});
});
