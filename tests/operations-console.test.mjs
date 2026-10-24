import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTestDb,actor,uuid} from './care-db.mjs';
test('operations console actual-role scope and immutable redacted audit',async t=>{
 const db=await createTestDb();t.after(()=>db.close());
 await db.exec(await readFile('db/0055_certificate_workflow.sql','utf8'));
 await db.exec(await readFile('db/0056_certificate_storage_defence.sql','utf8'));
 const a=uuid(11001),b=uuid(11002),branch=uuid(11003),admin=uuid(11004),superadmin=uuid(11005),owner=uuid(11006),doctor=uuid(11007),audit=uuid(11008);
 await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name) VALUES('${a}','OPS-A','Synthetic A','Synthetic A'),('${b}','OPS-B','Synthetic B','Synthetic B');
 INSERT INTO locations(id,partner_id,code,name) VALUES('${branch}','${a}','OPS','Synthetic branch');
 INSERT INTO user_roles(user_id,role,partner_id) VALUES('${admin}','OPERATIONS_ADMIN','${a}'),('${superadmin}','SUPER_ADMIN',null),('${owner}','PARTNER_OWNER','${a}'),('${doctor}','DOCTOR','${a}'),('${audit}','COMPLIANCE_AUDITOR','${a}');
 INSERT INTO audit_log(actor_user_id,actor_role,partner_id,location_id,action,entity_type,entity_id,metadata) VALUES('${admin}','OPERATIONS_ADMIN','${a}','${branch}','COVERAGE_RESERVE','care_coverage','${uuid(11100)}','{"reason":"PRIVATE clinical detail","notes":"PRIVATE","storage_path":"PRIVATE.pdf","balance_before":2,"balance_after":1,"correlation_id":"${uuid(11101)}"}'),('${superadmin}','SUPER_ADMIN','${b}',null,'OTHER_EVENT','partner','${b}','{}');
 INSERT INTO partner_applications(owner_user_id,scope_partner_id,status,form) VALUES('${owner}','${a}','SUBMITTED','{"ownerName":"PRIVATE","organizationName":"Synthetic"}');`);
 await db.exec(await readFile('db/0057_operations_console.sql','utf8'));
 const as=async(u,fn,role='authenticated')=>{await actor(db,u);await db.exec('SET ROLE '+role);try{return await fn();}finally{await db.exec('RESET ROLE');}};
 const read=(mode,filters={})=>db.query('SELECT operations_console($1,$2::jsonb) r',[mode,JSON.stringify(filters)]).then(x=>x.rows[0].r);
 await t.test('Admin sees only explicit organization and cannot request Superadmin aggregates',async()=>{
  const r=await as(admin,()=>read('admin'));assert.deepEqual(r.organizations.map(x=>x.id),[a]);assert.ok(r.rows.every(x=>x.organization===a));
  assert.equal((await as(admin,()=>read('admin',{organization:b}))).total,0);
  await assert.rejects(as(admin,()=>read('super')),/CONSOLE_SCOPE_REQUIRED/);
  for(const u of [owner,doctor])await assert.rejects(as(u,()=>read('admin')),/CONSOLE_SCOPE_REQUIRED/);
  await assert.rejects(as(null,()=>read('admin'),'anon'),/permission denied/);
 });
 await t.test('Superadmin aggregate response excludes per-case, patient, document and handoff content',async()=>{
  const r=await as(superadmin,()=>read('super'));assert.equal(r.organizations.length,2);assert.deepEqual(r.rows,[]);
  assert.ok(!JSON.stringify(r).includes('PRIVATE'));assert.ok(!JSON.stringify(r).includes('patient_id'));assert.ok(!JSON.stringify(r).includes('storage_path'));
 });
 await t.test('audit filters, numeric allowlist and scoped export data',async()=>{
  const r=await as(admin,()=>read('audit',{branch,action:'COVERAGE_RESERVE',from:'2026-01-01',to:'2099-01-01'}));assert.equal(r.total,1);
  assert.equal(r.rows[0].verified,true);assert.equal(r.rows[0].fingerprint.length,64);assert.deepEqual(r.rows[0].summary,{balance_before:2,balance_after:1});assert.equal(r.rows[0].reason,'[redacted free text]');assert.ok(!JSON.stringify(r).includes('PRIVATE'));
  assert.equal((await as(admin,()=>read('audit',{organization:b}))).total,0);
  assert.equal((await as(audit,()=>read('audit'))).total,1);
  assert.equal((await as(admin,()=>read('admin',{branch:uuid(11999)}))).rows.length,0);
  assert.equal((await as(admin,()=>read('admin',{kind:'application',status:'SUBMITTED'}))).total,1);
 });
 await t.test('audit and evidence updates/deletes denied even with privileged SQL; new entries fingerprinted',async()=>{
  await assert.rejects(as(admin,()=>db.query("UPDATE audit_log SET action='FORGED'")),/permission denied/);
  await assert.rejects(db.query('DELETE FROM audit_log'),/IMMUTABLE_HISTORY/);
  await assert.rejects(db.query("UPDATE operations_audit_evidence SET fingerprint='forged'"),/IMMUTABLE_HISTORY/);
  await assert.rejects(as(owner,()=>db.query('SELECT * FROM operations_audit_evidence')),/permission denied/);
  await db.query("INSERT INTO audit_log(actor_user_id,partner_id,action,entity_type,entity_id) VALUES($1,$2::uuid,'NEW_EVENT','partner',$2::text)",[admin,a]);
  assert.equal((await as(admin,()=>read('audit',{action:'NEW_EVENT'}))).rows[0].verified,true);
 });
 await t.test('read-only dashboards leave credits, certificates and storage protections unchanged',async()=>{
  const before=(await db.query('SELECT id,credit_balance FROM partners ORDER BY id')).rows;
  await as(superadmin,()=>read('super'));await as(admin,()=>read('admin'));
  assert.deepEqual((await db.query('SELECT id,credit_balance FROM partners ORDER BY id')).rows,before);
  assert.equal((await db.query('SELECT count(*)::int n FROM care_certificate_revisions')).rows[0].n,0);
  await assert.rejects(as(admin,()=>db.query("UPDATE care_certificates SET state='forwarded'")),/permission denied/);
  await db.query("UPDATE user_roles SET status='REMOVED' WHERE user_id=$1",[admin]);await assert.rejects(as(admin,()=>read('admin')),/CONSOLE_SCOPE_REQUIRED/);
 });
});
