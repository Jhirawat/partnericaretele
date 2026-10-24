import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTestDb,actor,uuid} from './care-db.mjs';
test('notification outbox actual-role safety',async t=>{
 const db=await createTestDb();t.after(()=>db.close());
 for(const file of ['0055_certificate_workflow','0056_certificate_storage_defence','0057_operations_console','0058_operations_evidence_private_grants','0059_notification_outbox','0060_notification_explicit_private_grants','0061_notification_anomaly_capture']) await db.exec(await readFile(`db/${file}.sql`,'utf8'));
 const a=uuid(12001),b=uuid(12002),admin=uuid(12003),other=uuid(12004),owner=uuid(12005),superadmin=uuid(12006),application=uuid(12007),event=uuid(12008);
 await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name) VALUES('${a}','N-A','Synthetic A','Synthetic A'),('${b}','N-B','Synthetic B','Synthetic B'); INSERT INTO user_roles(user_id,role,partner_id) VALUES('${admin}','OPERATIONS_ADMIN','${a}'),('${other}','OPERATIONS_ADMIN','${b}'),('${owner}','PARTNER_OWNER','${a}'),('${superadmin}','SUPER_ADMIN',null); INSERT INTO partner_applications(id,owner_user_id,scope_partner_id,status,form) VALUES('${application}','${owner}','${a}','SUBMITTED','{}');`);
 const as=async(u,fn,role='authenticated')=>{await actor(db,u);await db.exec('SET ROLE '+role);try{return await fn()}finally{await db.exec('RESET ROLE')}};
 const center=(manage=false)=>db.query('SELECT notification_center($1) r',[manage]).then(x=>x.rows[0].r);
 const cmd=(op,args,key=crypto.randomUUID())=>db.query('SELECT notification_command($1,$2::jsonb,$3) r',[op,JSON.stringify(args),key]).then(x=>x.rows[0].r);
 const emit=()=>db.query("SELECT notification_enqueue('application',$1,$2,'partner_application',$3,NULL,'SUBMITTED','DRAFT',$2)",[application,event,a]);
 let id;
 await t.test('preference suppression and owner identity derived from JWT',async()=>{
 await assert.rejects(as(owner,()=>cmd('preference',{event_type:'partner_application',enabled:false,user_id:other})),/INVALID_ARGUMENTS/);
 await as(owner,()=>cmd('preference',{event_type:'partner_application',enabled:false}));await emit();
 const r=await as(owner,()=>center());assert.equal(r.rows.length,1);assert.equal(r.rows[0].status,'suppressed');id=r.rows[0].id;
 assert.equal((await db.query('SELECT user_id FROM operational_notification_preferences')).rows[0].user_id,owner);
 });
 await t.test('scope isolation and ordinary-user controls denied',async()=>{
 assert.equal((await as(other,()=>center(true))).rows.length,0);assert.equal((await as(admin,()=>center(true))).rows.length,3);
 await assert.rejects(as(owner,()=>center(true)),/ADMIN_SCOPE_REQUIRED/);await assert.rejects(as(owner,()=>cmd('suppress',{id,reason:'operator_suppression'})),/ADMIN_SCOPE_REQUIRED/);
 await assert.rejects(as(other,()=>cmd('read',{id})),/NOTIFICATION_SCOPE_REQUIRED/);await assert.rejects(as(null,()=>center(),'anon'),/permission denied/);
 await assert.rejects(as(owner,()=>db.query('DELETE FROM operational_notifications')),/permission denied/);
 });
 await t.test('duplicate event and duplicate command are idempotent',async()=>{
 const before=(await db.query('SELECT count(*)::int n FROM operational_notifications')).rows[0].n;await emit();assert.equal((await db.query('SELECT count(*)::int n FROM operational_notifications')).rows[0].n,before);
 const key=uuid(12020);await as(owner,()=>cmd('read',{id},key));await as(owner,()=>cmd('read',{id},key));assert.equal((await db.query("SELECT count(*)::int n FROM operational_notification_history WHERE correlation_id=$1",[key])).rows[0].n,1);
 await assert.rejects(as(owner,()=>cmd('unread',{id},key)),/IDEMPOTENCY_CONFLICT/);
 });
 await t.test('safe payload excludes private content and cannot mutate',async()=>{
 const r=await as(owner,()=>center());assert.deepEqual(r.rows[0].payload,{state:'SUBMITTED',previous_state:'DRAFT'});
 await assert.rejects(db.query("UPDATE operational_notifications SET payload='{"+'"private_link":"https://private"'+"}' WHERE id=$1",[id]),/IMMUTABLE_NOTIFICATION/);
 await assert.rejects(db.query("SELECT notification_enqueue('application',$1,$2,'partner_application',$3,NULL,'https://secret',NULL,$2)",[application,uuid(12021),a]),/UNSAFE_NOTIFICATION_PAYLOAD/);
 await assert.rejects(as(owner,()=>db.query("SELECT notification_enqueue('application',$1,$2,'partner_application',$3,NULL,'SUBMITTED',NULL,$2)",[application,event,a])),/permission denied/);
 });
 await t.test('preference cannot be bypassed; three retries and backoff enforced',async()=>{
 await assert.rejects(as(admin,()=>cmd('retry',{id,reason:'retry_requested'})),/PREFERENCE_DISABLED/);await as(owner,()=>cmd('preference',{event_type:'partner_application',enabled:true}));
 await as(admin,()=>cmd('retry',{id,reason:'retry_requested'}));await as(admin,()=>cmd('suppress',{id,reason:'operator_suppression'}));await assert.rejects(as(admin,()=>cmd('retry',{id,reason:'retry_requested'})),/RETRY_NOT_DUE/);
 await db.query('UPDATE operational_notifications SET next_retry_at=now()-interval \'1 second\' WHERE id=$1',[id]);await as(admin,()=>cmd('retry',{id,reason:'retry_requested'}));await as(admin,()=>cmd('manual_review',{id,reason:'requires_review'}));await db.query('UPDATE operational_notifications SET next_retry_at=now()-interval \'1 second\' WHERE id=$1',[id]);await as(admin,()=>cmd('retry',{id,reason:'retry_requested'}));
 assert.equal((await db.query('SELECT retry_count,status FROM operational_notifications WHERE id=$1',[id])).rows[0].retry_count,3);await db.query('UPDATE operational_notifications SET next_retry_at=now()-interval \'1 second\' WHERE id=$1',[id]);await assert.rejects(as(admin,()=>cmd('retry',{id,reason:'retry_requested'})),/RETRY_LIMIT/);
 });
 await t.test('transactional events redact reasons and worker no-op preserves finances/files',async()=>{
 const before=(await db.query('SELECT id,credit_balance FROM partners ORDER BY id')).rows;
 await db.query("INSERT INTO partner_application_events(application_id,actor_user_id,action,from_state,to_state,reason) VALUES($1,$2,'REQUEST_DOCUMENTS','SUBMITTED','NEED_MORE_DOCUMENTS','PRIVATE_SECRET clinical link')",[application,admin]);
 const r=await as(admin,()=>center(true));assert.ok(!JSON.stringify(r).includes('PRIVATE_SECRET'));assert.equal(r.worker.enabled,false);assert.equal(r.worker.processed,0);assert.ok(r.rows.some(n=>n.event_type==='document_request'));
 assert.deepEqual((await db.query('SELECT id,credit_balance FROM partners ORDER BY id')).rows,before);assert.equal((await db.query('SELECT count(*)::int n FROM care_certificate_revisions')).rows[0].n,0);
 await assert.rejects(db.query('DELETE FROM operational_notification_history'),/IMMUTABLE_HISTORY/);await assert.rejects(db.query('DELETE FROM operational_notification_operations'),/IMMUTABLE_HISTORY/);await assert.rejects(db.query('DELETE FROM audit_log'),/IMMUTABLE_HISTORY/);
 await db.query("UPDATE user_roles SET status='REMOVED' WHERE user_id=$1",[admin]);await assert.rejects(as(admin,()=>center(true)),/ADMIN_SCOPE_REQUIRED/);
 });
 await t.test('Doctor routing hides other identities; manual-review anomalies are scoped',async()=>{
 const doctor=uuid(12030),doc=uuid(12031);await db.exec(`INSERT INTO user_roles(user_id,role,partner_id) VALUES('${doctor}','DOCTOR','${a}');INSERT INTO doctors(id,auth_user_id,full_name,license_number) VALUES('${doc}','${doctor}','Synthetic','N-LIC');`);
 await db.query("INSERT INTO audit_log(partner_id,action,entity_type,entity_id) VALUES($1,'DOCTOR_REGISTERED','doctor',$2)",[a,doc]);
 const r=await as(doctor,()=>center());assert.equal(r.rows.length,1);assert.equal(r.rows[0].event_type,'doctor_change');
 await db.query("INSERT INTO audit_log(partner_id,action,entity_type,entity_id,metadata) VALUES($1,'PARTNER_INTAKE_ASSESS','partner_intake',$2,'{\"status\":\"MANUAL_REVIEW\",\"notes\":\"PRIVATE\"}')",[a,uuid(12032)]);
 const global=await as(superadmin,()=>center(true));assert.ok(global.rows.some(n=>n.event_type==='credit_anomaly'));assert.ok(!JSON.stringify(global).includes('PRIVATE'));assert.equal((await as(other,()=>center(true))).rows.length,0);
 await db.query("UPDATE user_roles SET status='REMOVED' WHERE user_id=$1",[doctor]);assert.equal((await as(doctor,()=>center())).rows.length,0);
 });
});
