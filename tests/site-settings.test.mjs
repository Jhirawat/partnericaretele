import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTestDb, actor, uuid } from './care-db.mjs';
test('Platform Site Settings synthetic database contract', async t => {
  const db = await createTestDb(); t.after(() => db.close());
  await db.exec(await readFile('drizzle/migrations/0094_platform_site_branding_themes.sql', 'utf8'));
  await db.exec(await readFile('drizzle/migrations/0095_site_settings_scoped_read_policy.sql', 'utf8'));
  await db.exec(await readFile('drizzle/migrations/0096_site_settings_customer_theme.sql', 'utf8'));
  const su=uuid(50001), ops=uuid(50002), doc=uuid(50003), patient=uuid(50004), scoped=uuid(50005), org=uuid(50006);
  await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name,status) VALUES('${org}','THEME-S','Synthetic','Synthetic','ACTIVE'); INSERT INTO user_roles(user_id,role,partner_id) VALUES('${su}','SUPER_ADMIN',null),('${ops}','OPERATIONS_ADMIN',null),('${doc}','DOCTOR',null),('${patient}','PATIENT',null),('${scoped}','SUPER_ADMIN','${org}');`);
  async function as(u, query, args=[], role='authenticated') { await actor(db,u); await db.exec('SET ROLE '+role); try { return (await db.query(query,args)).rows[0]?.r; } finally { await db.exec('RESET ROLE'); } }
  const save=(u,key,value,version)=>as(u,'SELECT site_settings_save($1,$2::jsonb,$3) r',[key,JSON.stringify(value),version]);
  const read=(u,scope)=>as(u,'SELECT site_settings_read($1) r',[scope]);
  const customer=uuid(50007); await db.exec(`INSERT INTO user_roles(user_id,role) VALUES('${customer}','CUSTOMER');`);
  const theme={mode:'light',primary:'#2563eb',font:'system',scale:1,weight:400,radius:'rounded',card:'standard',navigation:'sidebar',collapsed:false};
  await t.test('empty settings return no invented saved configuration',async()=>{assert.deepEqual((await read(su,'manage')).settings,{});});
  await t.test('name trims persists and adds version history atomically',async()=>{const r=await save(su,'site_name','  Synthetic Clinic  ',0);assert.equal(r.value,'Synthetic Clinic');assert.equal(r.revision,1);const d=await read(su,'manage');assert.equal(d.settings.site_name.value,'Synthetic Clinic');assert.equal(d.history.length,1);});
  await t.test('Superadmin-only writes include direct table paths',async()=>{for(const u of [ops,doc,patient,scoped]){await assert.rejects(save(u,'site_name','Forbidden',1),/SUPER_REQUIRED/);const rows=await as(u,"WITH changed AS (UPDATE platform_settings SET value='\"Forbidden\"' WHERE key='site_name' RETURNING key) SELECT count(*)::int r FROM changed");assert.equal(rows,0);}assert.equal((await read(su,'manage')).settings.site_name.value,'Synthetic Clinic');});
  await save(su,'theme_admin',theme,0); await save(su,'theme_doctor',{...theme,mode:'dark'},0);
  await t.test('doctor admin and customer reads are separated by RLS and RPC',async()=>{assert.equal((await read(doc,'doctor')).settings.theme_admin,undefined);assert.equal((await read(ops,'admin')).settings.theme_doctor,undefined);await assert.rejects(read(doc,'admin'),/SETTING_SCOPE_REQUIRED/);await assert.rejects(read(ops,'doctor'),/SETTING_SCOPE_REQUIRED/);await assert.rejects(read(patient,'doctor'),/SETTING_SCOPE_REQUIRED/);assert.deepEqual(await as(patient,"SELECT jsonb_agg(key) r FROM platform_settings WHERE key IN ('site_name','theme_admin','theme_doctor')"),['site_name']);assert.deepEqual(await as(ops,"SELECT jsonb_agg(key) r FROM platform_settings WHERE key='theme_doctor'"),null);assert.deepEqual(await as(doc,"SELECT jsonb_agg(key) r FROM platform_settings WHERE key='theme_doctor'"),['theme_doctor']);assert.deepEqual(await as(ops,"SELECT jsonb_agg(key) r FROM platform_settings WHERE key='theme_admin'"),['theme_admin']);assert.equal((await read(doc,'doctor')).history.length,0);await assert.rejects(read(doc,'manage'),/SETTING_SCOPE_REQUIRED/);});
  await t.test('reject invalid values and arbitrary fields at the database boundary',async()=>{for(const patch of [{primary:'red'},{scale:5},{weight:900},{font:'https://invalid.test'},{navigation:'script'},{collapsed:'true'},{css:'body{}'},{mode:'system;script'},{primary:null}])await assert.rejects(save(su,'theme_admin',{...theme,...patch},1),/INVALID_THEME/);for(const value of ['<script>','person@invalid.test','secret','123456789','x'.repeat(81),{name:'Synthetic'}])await assert.rejects(save(su,'site_name',value,1),/INVALID_SITE_NAME/);});
  await t.test('stale saves reject; rollback is a new append-only version',async()=>{await assert.rejects(save(su,'site_name','Stale',0),/STALE_SETTING_VERSION/);await save(su,'site_name','Next Synthetic',1);await save(su,'site_name','Synthetic Clinic',2);const d=await read(su,'manage');assert.equal(d.settings.site_name.revision,3);assert.equal(d.history.filter(h=>h.setting_key==='site_name').length,3);});
  await t.test('defaults reset does not delete history or other settings',async()=>{await save(su,'site_name','',3);assert.equal((await read(su,'manage')).settings.site_name.value,'');assert.equal((await read(su,'manage')).settings.theme_admin.revision,1);});
  await t.test('history is immutable and setting delete key rename are forbidden',async()=>{await assert.rejects(db.exec("UPDATE platform_settings_history SET revision=99"),/SETTING_HISTORY_IMMUTABLE/);await assert.rejects(db.exec('DELETE FROM platform_settings_history'),/SETTING_HISTORY_IMMUTABLE/);await assert.rejects(db.exec("DELETE FROM platform_settings WHERE key='site_name'"),/SETTING_DELETE_FORBIDDEN/);await assert.rejects(db.exec("UPDATE platform_settings SET key='renamed' WHERE key='site_name'"),/SETTING_KEY_IMMUTABLE/);});
  await t.test('customer theme persistence version history and isolated active reads',async()=>{
    assert.deepEqual((await read(patient,'customer')).settings,{site_name:{value:'',revision:4}});
    await save(su,'theme_customer',{...theme,primary:'#7C3AED'},0);
    for(const u of [patient,customer]) {
      const r=await read(u,'customer'); assert.equal(r.settings.theme_customer.value.primary,'#7c3aed'); assert.deepEqual(Object.keys(r.settings).sort(),['site_name','theme_customer']); assert.deepEqual(r.history,[]);
      assert.deepEqual(await as(u,"SELECT jsonb_agg(key ORDER BY key) r FROM platform_settings WHERE key IN ('site_name','theme_admin','theme_doctor','theme_customer')"),['site_name','theme_customer']);
      await assert.rejects(read(u,'manage'),/SETTING_SCOPE_REQUIRED/); await assert.rejects(read(u,'admin'),/SETTING_SCOPE_REQUIRED/);
    }
    for(const u of [ops,doc]) {await assert.rejects(read(u,'customer'),/SETTING_SCOPE_REQUIRED/); assert.equal(await as(u,"SELECT jsonb_agg(key) r FROM platform_settings WHERE key='theme_customer'"),null);}
    await assert.rejects(save(su,'theme_customer',theme,0),/STALE_SETTING_VERSION/);
    await save(su,'theme_customer',theme,1); const r=await read(su,'manage'); assert.equal(r.settings.theme_customer.revision,2); assert.equal(r.history.filter(h=>h.setting_key==='theme_customer').length,2); assert.equal(r.settings.theme_admin.revision,1); assert.equal(r.settings.theme_doctor.revision,1);
  });
  await t.test('customer values reject code and all non-Superadmin writes including direct paths',async()=>{
    for(const patch of [{primary:'red'},{font:'https://invalid.test'},{scale:5},{weight:900},{css:'body{}'},{mode:'script'},{collapsed:'false'}]) await assert.rejects(save(su,'theme_customer',{...theme,...patch},2),/INVALID_THEME/);
    for(const u of [ops,doc,patient,customer,scoped]) {
      for(const key of ['site_name','theme_admin','theme_doctor','theme_customer']) await assert.rejects(save(u,key,key==='site_name'?'Forbidden':theme,2),/SUPER_REQUIRED/);
      const count=await as(u,"WITH changed AS (UPDATE platform_settings SET value=$1::jsonb WHERE key='theme_customer' RETURNING key) SELECT count(*)::int r FROM changed",[JSON.stringify(theme)]); assert.equal(count,0);
      for(const key of ['site_logo','site_favicon','logo','favicon']) await assert.rejects(as(u,'INSERT INTO platform_settings(key,value) VALUES($1,$2::jsonb) RETURNING key r',[key,'{}']),/row-level security|SUPER_REQUIRED/);
    }
    await assert.rejects(db.exec("DELETE FROM platform_settings WHERE key='theme_customer'"),/SETTING_DELETE_FORBIDDEN/);
    await assert.rejects(as(null,"SELECT site_settings_read('customer') r",[],'anon'),/permission denied/);
  });
  await t.test('anonymous calls denied and audit records contain only safe key and version',async()=>{await assert.rejects(as(null,"SELECT site_settings_read('manage') r",[],'anon'),/permission denied/);const rows=(await db.query("SELECT metadata FROM audit_log WHERE action='SITE_SETTING_CHANGED'")).rows;assert.equal(rows.length,8);assert.ok(rows.every(r=>Object.keys(r.metadata).sort().join(',')==='key,revision'));});
});