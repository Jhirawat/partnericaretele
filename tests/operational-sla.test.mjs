import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTestDb,actor,uuid} from './care-db.mjs';
test('operational SLA clocks and actual-role controls',async t=>{
 const db=await createTestDb();t.after(()=>db.close());
 for(const file of ['0055_certificate_workflow','0056_certificate_storage_defence','0057_operations_console','0058_operations_evidence_private_grants','0059_notification_outbox','0060_notification_explicit_private_grants','0061_notification_anomaly_capture','0062_operational_sla','0063_sla_explicit_private_grants'])await db.exec(await readFile(`db/${file}.sql`,'utf8'));
 const a=uuid(13001),b=uuid(13002),admin=uuid(13003),reviewer=uuid(13004),other=uuid(13005),superadmin=uuid(13006),partner=uuid(13007),app=uuid(13008);
 await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name) VALUES('${a}','SLA-A','Synthetic','Synthetic'),('${b}','SLA-B','Other','Other');INSERT INTO user_roles(user_id,role,partner_id) VALUES('${admin}','OPERATIONS_ADMIN','${a}'),('${reviewer}','OPERATIONS_ADMIN','${a}'),('${other}','OPERATIONS_ADMIN','${b}'),('${superadmin}','SUPER_ADMIN',null),('${partner}','PARTNER_OWNER','${a}');INSERT INTO partner_applications(id,owner_user_id,scope_partner_id,status,form,created_at) VALUES('${app}','${partner}','${a}','SUBMITTED','{"private":"SECRET"}',now()-interval '2 hours');`);
 const as=async(u,fn,role='authenticated')=>{await actor(db,u);await db.exec('SET ROLE '+role);try{return await fn()}finally{await db.exec('RESET ROLE')}};
 const cmd=(op,args={},key=crypto.randomUUID())=>db.query('SELECT sla_command($1,$2::jsonb,$3) r',[op,JSON.stringify(args),key]).then(x=>x.rows[0].r);
 const consoleRead=(mode='admin')=>db.query('SELECT sla_console($1) r',[mode]).then(x=>x.rows[0].r);
 const policy={partner_id:a,kind:'partner_review',effective_from:'2026-01-01T00:00:00Z',warning_minutes:30,breach_minutes:60,clock_mode:'calendar',timezone:'Asia/Bangkok',business_days:[1,2,3,4,5],opens:'09:00',closes:'17:00',escalation_level:2,owner_role:'OPERATIONS_ADMIN',reason:'Synthetic operational policy'};
 let id,cid;
 await t.test('calendar, weekend, business-hour clipping and overlapping pauses',async()=>{
 const clock=async(start,end,mode,excluded=[])=>Number((await db.query("SELECT sla_elapsed($1,$2,$3,'Asia/Bangkok',ARRAY[1,2,3,4,5],'09:00','17:00',$4::jsonb) n",[start,end,mode,JSON.stringify(excluded)])).rows[0].n);
 assert.equal(await clock('2026-10-16T09:00Z','2026-10-19T03:00Z','business'),120);
 assert.equal(await clock('2026-10-17T02:00Z','2026-10-18T10:00Z','business'),0);
 assert.equal(await clock('2026-10-20T00:00Z','2026-10-20T02:00Z','calendar',[{start:'2026-10-20T00:30Z',end:'2026-10-20T01:30Z'},{start:'2026-10-20T01:00Z',end:'2026-10-20T01:45Z'}]),45);
 });
 await t.test('scope, mandatory independent approval, immutable versions',async()=>{
 await assert.rejects(as(partner,()=>cmd('propose',policy)),/SLA_SCOPE_REQUIRED/);
 await assert.rejects(as(other,()=>cmd('propose',policy)),/SLA_SCOPE_REQUIRED/);
 await assert.rejects(as(admin,()=>cmd('propose',{...policy,actor_user_id:superadmin})),/INVALID_ARGUMENTS/);
 id=(await as(admin,()=>cmd('propose',policy))).id;
 await as(admin,()=>cmd('submit',{id,reason:'Ready for review'}));
 await assert.rejects(as(admin,()=>cmd('approve',{id,reason:'Cannot self approve'})),/INDEPENDENT_REVIEW_REQUIRED/);
 await as(reviewer,()=>cmd('approve',{id,reason:'Verified synthetic policy'}));
 await assert.rejects(db.query('UPDATE operational_sla_policies SET warning_minutes=1 WHERE id=$1',[id]),/IMMUTABLE_POLICY_VERSION/);
 const p2=(await as(admin,()=>cmd('propose',policy))).id;await as(admin,()=>cmd('submit',{id:p2,reason:'Second version'}));
 await assert.rejects(as(reviewer,()=>cmd('approve',{id:p2,reason:'Overlap denied'})),/OVERLAPPING_POLICY/);
 assert.equal((await as(admin,()=>consoleRead())).policies.find(p=>p.id===p2).version,2);
 });
 await t.test('breaches and duplicate scan commands enqueue exactly once',async()=>{
 const key=uuid(13020);await as(admin,()=>cmd('scan',{},key));await as(admin,()=>cmd('scan',{},key));
 const data=await as(admin,()=>consoleRead());cid=data.rows.find(c=>c.source_id===app)?.id??data.rows.find(c=>c.kind==='partner_review').id;
 assert.equal(data.rows.find(c=>c.id===cid).state,'breached');
 const n=(await db.query("SELECT count(*)::int n FROM operational_notifications WHERE source_kind='sla'")).rows[0].n;
 assert.ok(n>0);await as(admin,()=>cmd('scan'));assert.equal((await db.query("SELECT count(*)::int n FROM operational_notifications WHERE source_kind='sla'")).rows[0].n,n);
 assert.equal((await as(other,()=>consoleRead())).rows.length,0);
 await assert.rejects(as(partner,()=>consoleRead()),/ADMIN_REQUIRED/);
 await assert.rejects(as(null,()=>consoleRead(),'anon'),/permission denied/);
 });
 await t.test('pause/resume, acknowledgment and safe operational reassignment',async()=>{
 await as(admin,()=>cmd('acknowledge',{id:cid,reason:'Escalation acknowledged'}));
 await as(admin,()=>cmd('reassign',{id:cid,owner_user_id:reviewer,reason:'Scoped operator'}));
 await assert.rejects(as(admin,()=>cmd('reassign',{id:cid,owner_user_id:other,reason:'Wrong organization'})),/OWNER_SCOPE_REQUIRED/);
 await as(admin,()=>cmd('pause',{id:cid,reason:'Operational hold'}));await as(admin,()=>cmd('scan'));assert.equal((await as(admin,()=>consoleRead())).rows.find(c=>c.id===cid).state,'paused');
 await as(admin,()=>cmd('resume',{id:cid,reason:'Operational hold ended'}));await as(admin,()=>cmd('scan'));assert.equal((await as(admin,()=>consoleRead())).rows.find(c=>c.id===cid).state,'breached');
 });
 await t.test('redacted aggregates, immutable timeline, finances and files untouched',async()=>{
 const health=await as(superadmin,()=>consoleRead('super'));assert.deepEqual(health.rows,[]);assert.deepEqual(health.policies,[]);assert.deepEqual(health.timeline,[]);assert.deepEqual(health.organizations,[]);assert.ok(!JSON.stringify(health).includes('SECRET'));assert.equal(health.providers_enabled,false);
 await assert.rejects(as(other,()=>consoleRead('health')),/ADMIN_REQUIRED/);
 const observed=await as(superadmin,()=>cmd('health_check'));assert.equal(observed.outbox_enabled,false);assert.ok(observed.last_health_check);assert.equal(observed.last_test_check,null);
 await assert.rejects(db.exec('DELETE FROM operational_sla_timeline'),/IMMUTABLE_HISTORY/);
 await assert.rejects(as(admin,()=>db.exec('UPDATE operational_sla_cases SET elapsed_minutes=0')),/permission denied/);
 assert.equal((await db.query('SELECT count(*)::int n FROM care_holds')).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int n FROM care_certificate_revisions')).rows[0].n,0);
 });
 await t.test('maintenance pauses clock without altering source workflow; source resolution retained',async()=>{
 const before=(await db.query('SELECT status,form FROM partner_applications WHERE id=$1',[app])).rows;
 await as(admin,()=>cmd('maintenance',{partner_id:a,starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+60000).toISOString(),reason:'Scheduled synthetic maintenance'}));
 await as(admin,()=>cmd('scan'));assert.equal((await as(admin,()=>consoleRead())).rows.find(c=>c.id===cid).state,'paused');assert.deepEqual((await db.query('SELECT status,form FROM partner_applications WHERE id=$1',[app])).rows,before);
 await db.query("UPDATE partner_applications SET status='APPROVED' WHERE id=$1",[app]);await as(admin,()=>cmd('scan'));assert.equal((await as(admin,()=>consoleRead())).rows.find(c=>c.id===cid).state,'resolved');
 await db.query("UPDATE user_roles SET status='REMOVED' WHERE user_id=$1",[admin]);await assert.rejects(as(admin,()=>cmd('scan')),/ADMIN_REQUIRED/);
 });
 await t.test('branch isolation, suppression window and exact private grants',async()=>{
 const branch=uuid(13040);await db.exec(`INSERT INTO locations(id,partner_id,code,name) VALUES('${branch}','${b}','B1','Synthetic branch');`);
 await assert.rejects(as(reviewer,()=>cmd('propose',{...policy,location_id:branch})),/SLA_SCOPE_REQUIRED/);
 for(const table of ['operational_sla_cases','operational_sla_policies','operational_sla_timeline','operational_sla_operations','operational_maintenance','operational_health_checks']){
 const r=(await db.query('SELECT has_table_privilege(\'anon\',$1,\'SELECT\') a,has_table_privilege(\'authenticated\',$1,\'INSERT\') i',[table])).rows[0];assert.equal(r.a,false);assert.equal(r.i,false);
 }
 const pp={...policy,partner_id:b,suppression_from:new Date(Date.now()-3600000).toISOString(),suppression_to:new Date(Date.now()+3600000).toISOString()};
 const pol=(await as(other,()=>cmd('propose',pp))).id;await as(other,()=>cmd('submit',{id:pol,reason:'Suppression configured'}));await as(superadmin,()=>cmd('approve',{id:pol,reason:'Independent review'}));
 await db.exec(`INSERT INTO partner_applications(id,owner_user_id,scope_partner_id,status,form,created_at) VALUES('${uuid(13041)}','${uuid(13042)}','${b}','SUBMITTED','{}',now()-interval '2 hours');`);
 await as(other,()=>cmd('scan'));assert.equal((await as(other,()=>consoleRead())).rows[0].state,'breached');assert.equal((await db.query("SELECT count(*)::int n FROM operational_notifications WHERE source_kind='sla' AND partner_id=$1",[b])).rows[0].n,0);
 });
});