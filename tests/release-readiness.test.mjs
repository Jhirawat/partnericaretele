import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createTestDb,actor,uuid} from './care-db.mjs';
const MIGRATIONS=['0055_certificate_workflow','0056_certificate_storage_defence','0057_operations_console','0058_operations_evidence_private_grants','0059_notification_outbox','0060_notification_explicit_private_grants','0061_notification_anomaly_capture','0062_operational_sla','0063_sla_explicit_private_grants','0064_privacy_lifecycle','0065_privacy_sla_notification_scope','0066_financial_reconciliation','0067_financial_explicit_private_grants','0068_financial_projection_defence','0069_release_readiness'];
test('release readiness sign-offs, approvals and smoke checks',async t=>{
const db=await createTestDb();t.after(()=>db.close());for(const f of MIGRATIONS)await db.exec(await readFile(`db/${f}.sql`,'utf8'));
const su=uuid(16001),ops=uuid(16002),scoped=uuid(16003),owner=uuid(16004),org=uuid(16005),lot=uuid(16006);
await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name,status,care_credit_model) VALUES('${org}','REL-A','Synthetic','Synthetic','ACTIVE','LOTS_V1');INSERT INTO user_roles(user_id,role,partner_id) VALUES('${su}','SUPER_ADMIN',null),('${ops}','OPERATIONS_ADMIN',null),('${scoped}','OPERATIONS_ADMIN','${org}'),('${owner}','PARTNER_OWNER','${org}');INSERT INTO care_credit_lots(id,partner_id,granted,expires_at,purchased_at,snapshot) VALUES('${lot}','${org}',5,'2099-01-01','2020-01-01','{}');`);
const as=async(u,fn,role='authenticated',aal='aal2')=>{await actor(db,u,aal,role);await db.exec('SET ROLE '+role);try{return await fn()}finally{await db.exec('RESET ROLE')}};
const cmd=(op,args={},key=crypto.randomUUID())=>db.query('SELECT release_command($1,$2::jsonb,$3) r',[op,JSON.stringify({reason:'Synthetic release review',...args}),key]).then(x=>x.rows[0].r);
const signoff=(item_key,status='passed')=>cmd('signoff',{item_key,status,evidence_reference:'EVID-'+item_key});
await t.test('only global admins with MFA can read or sign off',async()=>{
 for(const u of [scoped,owner])await assert.rejects(as(u,()=>signoff('rls_storage')),/RELEASE_SCOPE_REQUIRED/);
 await assert.rejects(as(owner,()=>db.query('SELECT release_console()')),/RELEASE_SCOPE_REQUIRED/);
 await assert.rejects(as(null,()=>db.query('SELECT release_console()'),'anon'),/permission denied/);
 await assert.rejects(as(su,()=>signoff('rls_storage'),'authenticated','aal1'),/MFA/);
 await assert.rejects(as(su,()=>cmd('signoff',{item_key:'rls_storage',status:'done',evidence_reference:'EV-1'})),/INVALID_ARGUMENTS/);
 await assert.rejects(as(su,()=>cmd('signoff',{item_key:'rls_storage',status:'passed',evidence_reference:'EV-1',actor:ops})),/INVALID_ARGUMENTS/);
 for(const tb of ['release_signoffs','release_approvals','release_banner_events'])assert.equal((await db.query("SELECT has_table_privilege('authenticated',$1,'INSERT') ok",[tb])).rows[0].ok,false);
});
await t.test('sensitive sign-offs need independent second approval',async()=>{
 const r=await as(su,()=>signoff('credit_invariants'));assert.equal(r.effective,'pending');assert.equal(r.version,1);
 await assert.rejects(as(su,()=>cmd('approve',{signoff_id:r.id})),/INDEPENDENT_APPROVAL_REQUIRED/);
 const a=await as(ops,()=>cmd('approve',{signoff_id:r.id}));assert.equal(a.effective,'passed');
 await assert.rejects(as(ops,()=>cmd('reject',{signoff_id:r.id})),/ALREADY_DECIDED/);
 const n=await as(ops,()=>signoff('backup_restore'));assert.equal(n.effective,'passed');
 await assert.rejects(as(su,()=>cmd('approve',{signoff_id:n.id})),/APPROVAL_NOT_APPLICABLE/);
 const f=await as(su,()=>signoff('certificate_privacy','failed'));assert.equal(f.effective,'failed');
 const w=await as(su,()=>signoff('privacy_retention','waived'));const rj=await as(ops,()=>cmd('reject',{signoff_id:w.id}));assert.equal(rj.effective,'blocked');
});
await t.test('new versions supersede, history is append-only and idempotent',async()=>{
 const v1=await as(su,()=>signoff('audit_integrity'));const v2=await as(su,()=>signoff('audit_integrity','blocked'));assert.equal(v2.version,2);
 await assert.rejects(as(ops,()=>cmd('approve',{signoff_id:v1.id})),/SUPERSEDED_SIGNOFF/);
 const key=crypto.randomUUID();const a=await as(su,()=>cmd('signoff',{item_key:'role_scope',status:'pending',evidence_reference:'EV-ROLE'},key));const b=await as(su,()=>cmd('signoff',{item_key:'role_scope',status:'pending',evidence_reference:'EV-ROLE'},key));assert.deepEqual(a,b);
 await assert.rejects(as(ops,()=>cmd('signoff',{item_key:'role_scope',status:'pending',evidence_reference:'EV-ROLE'},key)),/IDEMPOTENCY_CONFLICT/);
 for(const tb of ['release_signoffs','release_approvals','release_checklist_items','release_operations']){await assert.rejects(db.exec(`UPDATE ${tb} SET actor=actor`).catch(e=>{if(/column/.test(e.message))return db.exec(`DELETE FROM ${tb}`);throw e}),/IMMUTABLE/);await assert.rejects(db.exec(`DELETE FROM ${tb}`),/IMMUTABLE/);}
 const c=(await as(su,()=>db.query('SELECT release_console() r'))).rows[0].r;assert.equal(c.items.length,15);const ai=c.items.find(i=>i.key==='audit_integrity');assert.equal(ai.versions,2);assert.equal(ai.latest.effective,'blocked');assert.ok(!JSON.stringify(c).match(/@|actor"/));
 await db.query("UPDATE user_roles SET status='REMOVED' WHERE user_id=$1",[ops]);await assert.rejects(as(ops,()=>cmd('approve',{signoff_id:a.id})),/RELEASE_SCOPE_REQUIRED/);await db.query("UPDATE user_roles SET status='ACTIVE' WHERE user_id=$1",[ops]);
});
await t.test('maintenance banner is append-only, redacted and readable by signed-in users',async()=>{
 await assert.rejects(as(su,()=>cmd('banner',{active:true,message:'contact ops@example.com'})),/INVALID_ARGUMENTS/);
 await as(su,()=>cmd('banner',{active:true,message:'Scheduled maintenance window'}));
 assert.equal((await as(owner,()=>db.query('SELECT release_banner() r'))).rows[0].r.message,'Scheduled maintenance window');
 await as(ops,()=>cmd('banner',{active:false,message:'Maintenance complete'}));assert.equal((await as(owner,()=>db.query('SELECT release_banner() r'))).rows[0].r,null);
 await assert.rejects(as(null,()=>db.query('SELECT release_banner()'),'anon'),/permission denied/);
});
await t.test('smoke checks are read-only and leave credit/certificate/privacy protections intact',async()=>{
 const before=(await db.query('SELECT care_available($1) n',[org])).rows[0].n;const tx=(await db.query('SELECT count(*)::int n FROM credit_transactions')).rows[0].n;
 const s=(await as(su,()=>db.query('SELECT release_smoke() r'))).rows[0].r;const by=Object.fromEntries(s.map(x=>[x.check,x]));
 for(const k of ['private_storage','grant_boundaries','credit_invariants','audit_append_only','sla_clock','no_external_delivery'])assert.equal(by[k].status,'passed',k+' '+JSON.stringify(by[k]));
 assert.equal(by.migration_metadata.status,'blocked');assert.ok(['passed','failed'].includes(by.rls_enabled.status));
 assert.ok(!JSON.stringify(s).includes(org));
 assert.equal((await db.query('SELECT care_available($1) n',[org])).rows[0].n,before);assert.equal((await db.query('SELECT count(*)::int n FROM credit_transactions')).rows[0].n,tx);
 await assert.rejects(as(owner,()=>db.query('SELECT release_smoke()')),/RELEASE_SCOPE_REQUIRED/);
 assert.equal((await db.query("SELECT has_table_privilege('anon','public.care_certificate_revisions','SELECT') ok")).rows[0].ok,false);
});
});
