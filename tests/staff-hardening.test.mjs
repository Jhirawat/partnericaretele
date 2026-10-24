import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTestDb, actor, uuid } from './care-db.mjs';

test('Staff security additive synthetic database contract', async t => {
  const db = await createTestDb(); t.after(() => db.close());
  // Schema-only Auth fixture: never store a password or credential.
  await db.exec('ALTER TABLE auth.users ADD COLUMN encrypted_password text');
  for (const file of ['0094_platform_site_branding_themes','0095_site_settings_scoped_read_policy','0096_site_settings_customer_theme','0097_staff_auth_authorization_hardening','0098_preserve_workflow_role_provisioning','0099_staff_security_read_and_audit_boundaries']) await db.exec(await readFile(`drizzle/migrations/${file}.sql`,'utf8'));
  const su=uuid(71001),ops=uuid(71002),customer=uuid(71003),doc=uuid(71004),visitor=uuid(71005),org=uuid(71006);
  async function as(u,q,args=[],aal='aal2',role='authenticated') {await actor(db,u,aal,role);await db.exec('SET ROLE '+role);try{return (await db.query(q,args)).rows;}finally{await db.exec('RESET ROLE');}}
  await t.test('public signup and forged metadata never grant privileged roles',async()=>{
    await actor(db,null,'aal1','service_role');
    await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3::jsonb)',[visitor,'synthetic@example.invalid',JSON.stringify({role:'SUPER_ADMIN',roles:['OPERATIONS_ADMIN'],is_admin:true})]);
    assert.equal((await db.query('SELECT count(*)::int n FROM user_roles WHERE user_id=$1',[visitor])).rows[0].n,0);
    assert.equal((await db.query("SELECT count(*)::int n FROM pg_trigger WHERE tgname='profiles_bootstrap_super_admin'")).rows[0].n,0);
  });
  await actor(db,null,'aal2','service_role');
  await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name) VALUES('${org}','SEC-SYN','Synthetic','Synthetic'); INSERT INTO user_roles(user_id,role) VALUES('${su}','SUPER_ADMIN'),('${ops}','OPERATIONS_ADMIN'),('${customer}','CUSTOMER'),('${doc}','DOCTOR');`);
  await t.test('new owner-provisioned staff require password change then MFA',async()=>{
    assert.equal((await as(su,"SELECT staff_access_check('super') state"))[0].state,'RESET_REQUIRED');
    await assert.rejects(as(su,"SELECT site_settings_read('manage')"),/SETTING_SCOPE_REQUIRED/);
    await assert.rejects(as(su,"SELECT site_settings_save('site_name','\"Synthetic\"',0)"),/SUPER_MFA_REQUIRED/);
    // Provider-owned completion represented only by safe state; no credentials.
    await actor(db,null,'aal2','service_role'); await db.exec(`UPDATE staff_security_state SET reset_required=false WHERE user_id IN ('${su}','${ops}')`);
    assert.equal((await as(su,"SELECT staff_access_check('super') state",[],'aal1'))[0].state,'MFA_REQUIRED');
    assert.equal((await as(su,"SELECT staff_access_check('super') state"))[0].state,'ALLOWED');
  });
  await t.test('customers doctors and Operations cannot receive Superadmin records',async()=>{
    for(const u of [ops,customer,doc,visitor]) {
      assert.equal((await as(u,"SELECT staff_access_check('super') state"))[0].state,'DENIED');
      await assert.rejects(as(u,"SELECT site_settings_read('manage')"),/SETTING_SCOPE_REQUIRED/);
      assert.equal((await as(u,'SELECT count(*)::int n FROM platform_settings_history'))[0].n,0);
    }
    assert.equal((await as(customer,"SELECT staff_access_check('staff') state"))[0].state,'DENIED');
    assert.equal((await as(doc,"SELECT staff_access_check('staff') state"))[0].state,'DENIED');
    assert.equal((await as(ops,"SELECT staff_access_check('staff') state"))[0].state,'ALLOWED');
  });
  await t.test('role tampering and Operations provisioning are denied by direct RLS',async()=>{
    for(const u of [ops,customer,doc,visitor]) await assert.rejects(as(u,'INSERT INTO user_roles(user_id,role) VALUES($1,\'SUPER_ADMIN\')',[visitor]),/row-level security|SUPER_MFA_REQUIRED|SUPER_ADMIN_REQUIRED/);
    await assert.rejects(as(su,'INSERT INTO user_roles(user_id,role) VALUES($1,\'FINANCE_ADMIN\')',[visitor],'aal1'),/row-level security|MFA_REQUIRED/);
    await assert.rejects(as(su,'INSERT INTO user_roles(user_id,role,partner_id) VALUES($1,\'SUPER_ADMIN\',$2)',[visitor,org]),/GLOBAL_SUPER_REQUIRED/);
    assert.equal((await db.query('SELECT count(*)::int n FROM user_roles WHERE user_id=$1',[visitor])).rows[0].n,0);
  });
  await t.test('all settings keys are Superadmin and MFA write restricted',async()=>{
    await as(su,"SELECT site_settings_save('site_name','\"Synthetic\"',0)");
    await as(su,"INSERT INTO platform_settings(key,value) VALUES('security_rules','{}')");
    for(const u of [ops,customer,doc,visitor]) {
      assert.equal((await as(u,"WITH changed AS (UPDATE platform_settings SET value='{}' WHERE key='security_rules' RETURNING key) SELECT count(*)::int n FROM changed"))[0].n,0);
      await assert.rejects(as(u,"INSERT INTO platform_settings(key,value) VALUES('integration_rules','{}')"),/row-level security|SUPER_MFA_REQUIRED/);
    }
    await assert.rejects(as(su,"SELECT site_settings_save('site_name','\"Denied\"',1)",[],'aal1'),/SUPER_MFA_REQUIRED/);
    assert.equal((await as(su,"SELECT site_settings_read('manage') r"))[0].r.settings.site_name.value,'Synthetic');
  });
  await t.test('signup cannot bypass owner authority after last Superadmin disappears',async()=>{
    await as(su,"UPDATE user_roles SET status='REMOVED' WHERE user_id=$1",[su]);
    await actor(db,null,'aal1','service_role'); await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[uuid(71007),'next@example.invalid']);
    assert.equal((await db.query("SELECT count(*)::int n FROM user_roles WHERE role='SUPER_ADMIN' AND status='ACTIVE'")).rows[0].n,0);
  });
  await t.test('signed-out endpoints and tables return no privileged records',async()=>{
    for(const q of ["SELECT staff_access_check('super')", "SELECT site_settings_read('manage')", 'SELECT * FROM staff_security_state','SELECT * FROM platform_settings_history']) await assert.rejects(as(null,q,[],'aal1','anon'),/permission denied/);
  });
  await t.test('redacted audit is server-derived and reset trigger is present',async()=>{
    const rows=(await db.query("SELECT action,metadata FROM audit_log WHERE entity_type IN ('staff_security','user_role') OR action='PLATFORM_SECURITY_SETTING_CHANGED'")).rows;
    assert.ok(rows.some(r=>r.action==='ROLE_PROVISIONED')); assert.ok(rows.some(r=>r.action==='ROLE_CHANGED')); assert.ok(rows.some(r=>r.action==='STAFF_ACCESS_DENIED'));assert.ok(rows.some(r=>r.action==='STAFF_MFA_REQUIRED'));assert.ok(rows.some(r=>r.action==='STAFF_RESET_REQUIRED'));
    for(const r of rows) {assert.ok(Object.keys(r.metadata).every(k=>['role','status','operation','scope','state'].includes(k)));assert.doesNotMatch(JSON.stringify(r.metadata),/@|https?:|password|secret|token/i);}
    assert.equal((await db.query("SELECT count(*)::int n FROM pg_trigger WHERE tgname='staff_password_changed'")).rows[0].n,1);
  });
});