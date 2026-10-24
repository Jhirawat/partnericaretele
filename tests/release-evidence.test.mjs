import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createTestDb,actor,uuid} from './care-db.mjs';
const MIGRATIONS=['0055_certificate_workflow','0056_certificate_storage_defence','0057_operations_console','0058_operations_evidence_private_grants','0059_notification_outbox','0060_notification_explicit_private_grants','0061_notification_anomaly_capture','0062_operational_sla','0063_sla_explicit_private_grants','0064_privacy_lifecycle','0065_privacy_sla_notification_scope','0066_financial_reconciliation','0067_financial_explicit_private_grants','0068_financial_projection_defence','0069_release_readiness','0070_release_evidence'];
test('release evidence registry',async t=>{
const db=await createTestDb();t.after(()=>db.close());for(const f of MIGRATIONS)await db.exec(await readFile(`db/${f}.sql`,'utf8'));
const su=uuid(17001),ops=uuid(17002),scoped=uuid(17003),owner=uuid(17004),org=uuid(17005);
await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name,status,care_credit_model) VALUES('${org}','REV-A','Synthetic','Synthetic','ACTIVE','LOTS_V1');INSERT INTO user_roles(user_id,role,partner_id) VALUES('${su}','SUPER_ADMIN',null),('${ops}','OPERATIONS_ADMIN',null),('${scoped}','OPERATIONS_ADMIN','${org}'),('${owner}','PARTNER_OWNER','${org}');`);
const as=async(u,fn,role='authenticated',aal='aal2')=>{await actor(db,u,aal,role);await db.exec('SET ROLE '+role);try{return await fn()}finally{await db.exec('RESET ROLE')}};
const base={item_key:'rls_storage',evidence_type:'manual_production',reference_label:'LIVE-RLS-2026-10-20',next_action:'Second admin reviews live catalog',status:'pending'};
const ev=(args={},key=crypto.randomUUID())=>db.query('SELECT release_evidence_command($1::jsonb,$2) r',[JSON.stringify({...base,...args}),key]).then(x=>x.rows[0].r);
const consoleRows=()=>as(su,()=>db.query('SELECT release_evidence_console() r')).then(x=>x.rows[0].r);
await t.test('scope: only global admins with MFA',async()=>{
 for(const u of [scoped,owner])await assert.rejects(as(u,()=>ev()),/RELEASE_SCOPE_REQUIRED/);
 await assert.rejects(as(owner,()=>db.query('SELECT release_evidence_console()')),/RELEASE_SCOPE_REQUIRED/);
 await assert.rejects(as(null,()=>db.query('SELECT release_evidence_console()'),'anon'),/permission denied/);
 await assert.rejects(as(su,()=>ev(),'authenticated','aal1'),/MFA/);
 assert.equal((await db.query("SELECT has_table_privilege('authenticated','public.release_evidence','INSERT') ok")).rows[0].ok,false);
 assert.equal((await db.query("SELECT has_table_privilege('anon','public.release_evidence','SELECT') ok")).rows[0].ok,false);
 assert.equal((await as(owner,()=>db.query('SELECT count(*)::int n FROM release_evidence'))).rows[0].n,0);
});
await t.test('redaction rejects secrets, links and personal data',async()=>{
 for(const bad of [{reference_label:'ops@example.com'},{next_action:'see https://x.example/doc'},{reference_label:'sb_secret_abcdef'},{next_action:'eyJhbGciOiJIUzI1NiJ9.payload'},{blocked_reason:'-----BEGIN CERTIFICATE-----',status:'blocked'},{next_action:'call 0812345678 now'},{next_action:'id 1-2345-67890-12-3'},{actor:ops}])await assert.rejects(as(su,()=>ev(bad)),/INVALID_ARGUMENTS/,JSON.stringify(bad));
 await assert.rejects(as(su,()=>ev({status:'blocked'})),/INVALID_ARGUMENTS/);
 await assert.rejects(as(su,()=>ev({evidence_type:'template'})),/INVALID_ARGUMENTS/);
});
await t.test('append-only versions, idempotency, no checklist side effects',async()=>{
 const before=(await db.query('SELECT count(*)::int n FROM release_signoffs')).rows[0].n;
 const v1=await as(su,()=>ev());assert.equal(v1.version,1);
 const v2=await as(ops,()=>ev({lineage:v1.lineage,status:'blocked',blocked_reason:'Live catalog not yet compared'}));assert.equal(v2.version,2);assert.equal(v2.lineage,v1.lineage);
 await assert.rejects(as(su,()=>ev({lineage:v1.lineage,item_key:'role_scope'})),/EVIDENCE_NOT_FOUND/);
 const key=crypto.randomUUID();const a=await as(su,()=>ev({item_key:'backup_restore',reference_label:'RESTORE-DRILL-1'},key));assert.deepEqual(await as(su,()=>ev({item_key:'backup_restore',reference_label:'RESTORE-DRILL-1'},key)),a);
 await assert.rejects(as(ops,()=>ev({item_key:'backup_restore',reference_label:'RESTORE-DRILL-1'},key)),/IDEMPOTENCY_CONFLICT/);
 await assert.rejects(db.exec('UPDATE release_evidence SET status=status'),/IMMUTABLE/);await assert.rejects(db.exec('DELETE FROM release_evidence'),/IMMUTABLE/);
 const rows=await consoleRows();const l=rows.filter(r=>r.lineage===v1.lineage);assert.equal(l.length,2);assert.deepEqual(l.map(r=>r.latest),[false,true]);
 assert.ok(!JSON.stringify(rows).match(/"actor"|@/));assert.equal(rows.find(r=>r.id===v1.id).mine,true);assert.equal(l[1].owner_role,'SUPER_ADMIN');
 assert.equal((await db.query('SELECT count(*)::int n FROM release_signoffs')).rows[0].n,before);
 assert.equal((await db.query('SELECT count(*)::int n FROM release_approvals')).rows[0].n,0);
});
});
