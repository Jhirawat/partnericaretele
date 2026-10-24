import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTestDb, actor, uuid } from './care-db.mjs';
import { CLOSURE_MIGRATIONS } from './owner-closure-db.mjs';
test('Human review decision packet enforces separation, freshness and hard blockers', async t => {
 const db=await createTestDb();t.after(()=>db.close());
 for(const m of [...CLOSURE_MIGRATIONS,'0097_readiness_decision_ledger','0098_validation_evidence_snapshot','0099_session_start_gate','0100_session_results','0101_golive_evidence_matrix','0102_human_review_packet'])await db.exec(await readFile(`db/${m}.sql`,'utf8'));
 const su=uuid(39201),ops=uuid(39202),su2=uuid(39203),scoped=uuid(39204),org=uuid(39205);
 await db.exec(`INSERT INTO partners(id,partner_code,legal_name,display_name,status,care_credit_model) VALUES('${org}','GEM-P','Synthetic','Synthetic','ACTIVE','LOTS_V1');INSERT INTO user_roles(user_id,role,partner_id) VALUES('${su}','SUPER_ADMIN',null),('${su2}','SUPER_ADMIN',null),('${ops}','OPERATIONS_ADMIN',null),('${scoped}','OPERATIONS_ADMIN','${org}');`);
 async function as(u,fn,role='authenticated',aal='aal2'){await actor(db,u,aal,role);await db.exec('SET ROLE '+role);try{return await fn();}finally{await db.exec('RESET ROLE');}}
 const q=(s,p)=>db.query(s,p).then(x=>x.rows[0]?.r);
 await t.test('signed-out, scoped and aal1 are blocked',async()=>{
  await assert.rejects(as(null,()=>q('SELECT human_packet_console() r'),'anon'),/permission denied/);
  await assert.rejects(as(scoped,()=>q('SELECT human_packet_console() r')),/RELEASE_SCOPE_REQUIRED/);
  await assert.rejects(as(su,()=>q('SELECT human_packet_open() r'),'authenticated','aal1'),/MFA/);
  await assert.rejects(as(su,()=>q('SELECT human_packet_state() r')),/permission denied/);
 });
 await t.test('honest current counts and redacted console',async()=>{
  const c=await as(ops,()=>q('SELECT human_packet_console() r'));
  assert.deepEqual(c.current,{open_blockers:14,open_prerequisites:7,unpassed_artifacts:20});assert.equal(c.readiness_claimed,false);assert.equal(JSON.stringify(c).includes(ops),false);
 });
 await t.test('self-review, approve-with-blockers, duplicate, role and stale rejected',async()=>{
  const v=await as(su,()=>q('SELECT human_packet_open() r'));assert.equal(v.packet_version,1);
  await assert.rejects(as(su,()=>q('SELECT human_packet_open() r')),/PACKET_CURRENT/);
  await assert.rejects(as(su,()=>q("SELECT human_packet_decide(1,'concern','concern_blocker_open') r")),/REVIEWER_SEPARATION/);
  await assert.rejects(as(ops,()=>q("SELECT human_packet_decide(1,'approve','blockers_resolved') r")),/HARD_BLOCKER_OPEN/);
  await assert.rejects(as(ops,()=>q("SELECT human_packet_decide(1,'approve','concern_scope') r")),/INVALID_ARGUMENTS/);
  await assert.rejects(as(ops,()=>q("SELECT human_packet_decide(1,'concern','https://x.example') r")),/INVALID_ARGUMENTS/);
  await as(ops,()=>q("SELECT human_packet_decide(1,'concern','concern_blocker_open') r"));
  await assert.rejects(as(ops,()=>q("SELECT human_packet_decide(1,'concern','concern_scope') r")),/DUPLICATE_DECISION/);
  await assert.rejects(as(su2,()=>q("SELECT human_packet_decide(1,'concern','concern_scope') r")),/STALE_VERSION|ROLE_SEPARATION/);
  await assert.rejects(as(ops,()=>q("SELECT human_packet_decide(0,'concern','concern_scope') r")),/STALE_VERSION/);
  await as(su,()=>db.query("SELECT validation_snapshot_record_save('typecheck',0,'unverified',null,'none','Evidence not recorded','Independent validation metadata review')"));
  const v2=await as(ops,()=>q('SELECT human_packet_open() r'));assert.equal(v2.packet_version,2);
  await assert.rejects(as(su,()=>q("SELECT human_packet_decide(1,'concern','concern_scope') r")),/STALE_VERSION/);
 });
 await t.test('append-only immutable records',async()=>{
  await assert.rejects(as(su,()=>db.query('UPDATE human_packet_decision SET reason=$1',['concern_scope'])),/permission denied/);
  await assert.rejects(db.query('DELETE FROM human_packet_version'),/immutable|IMMUTABLE/i);
 });
});
