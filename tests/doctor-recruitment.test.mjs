import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb, uuid } from './care-db.mjs';
const db=await createTestDb(); after(()=>db.close());
const admin=uuid(9501), scoped=uuid(9502), owner=uuid(9503), docUser=uuid(9504), stranger=uuid(9505), orgA=uuid(9506), orgB=uuid(9507), locA=uuid(9508), locB=uuid(9509);
await db.exec(`INSERT INTO auth.users(id,email) VALUES ('${docUser}','doctor@example.invalid'),('${stranger}','stranger2@example.invalid');
INSERT INTO partners(id,partner_code,legal_name,display_name) VALUES ('${orgA}','DOC-A','A','A'),('${orgB}','DOC-B','B','B');
INSERT INTO locations(id,partner_id,code,name) VALUES ('${locA}','${orgA}','A1','Branch A'),('${locB}','${orgB}','B1','Branch B');
INSERT INTO user_roles(user_id,role,partner_id) VALUES ('${admin}','SUPER_ADMIN',NULL),('${scoped}','OPERATIONS_ADMIN','${orgA}'),('${owner}','PARTNER_OWNER','${orgA}');`);
async function as(u,fn,aal='aal2',role='authenticated'){await db.exec('BEGIN');try{await db.exec(`SET LOCAL ROLE ${role}`);await db.query(`SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true),set_config('request.jwt.claim.aal',$3,true)`,[u??'',role,aal]);const r=await fn();await db.exec('COMMIT');return r;}catch(e){await db.exec('ROLLBACK');throw e;}}
const cmd=(op,id,args={})=>db.query(`SELECT doctor_command($1,$2,$3::jsonb) r`,[op,id,JSON.stringify(args)]).then(r=>r.rows[0].r);
const reg={fullName:'Synthetic Doctor',licenseNumber:'MD-SYN-1',licenseExpiresOn:'2099-01-01',specialty:'General practice',email:'doctor@example.invalid',locationId:locA};
let d, asg;
test('anon, partner owner and stranger cannot register doctors; staff need MFA',async()=>{
 await assert.rejects(as(null,()=>cmd('REGISTER',null,reg),'aal1','anon'),/permission denied/);
 await assert.rejects(as(owner,()=>cmd('REGISTER',null,reg)),/REVIEWER_REQUIRED/);
 await assert.rejects(as(stranger,()=>cmd('REGISTER',null,reg)),/REVIEWER_REQUIRED/);
 await assert.rejects(as(scoped,()=>cmd('REGISTER',null,reg),'aal1'),/MFA_REQUIRED/);
 await assert.rejects(as(scoped,()=>cmd('REGISTER',null,{...reg,locationId:locB})),/REVIEWER_REQUIRED/);
});
test('scoped admin registers PENDING doctor in own branch; duplicate license rejected; no direct writes',async()=>{
 d=await as(scoped,()=>cmd('REGISTER',null,{...reg,status:'ACTIVE'}));assert.equal(d.status,'PENDING');assert.equal(d.auth_user_id,null);
 await assert.rejects(as(admin,()=>cmd('REGISTER',null,reg)),/LICENSE_ALREADY_REGISTERED/);
 await assert.rejects(as(scoped,()=>db.query('INSERT INTO doctor_assignments(doctor_id,partner_id) VALUES ($1,$2)',[d.id,orgA])),/permission denied/);
});
test('verification requires linked account and complete unexpired details, then grants scoped DOCTOR role',async()=>{
 await assert.rejects(as(scoped,()=>cmd('VERIFY',d.id)),/ACCOUNT_NOT_LINKED/);
 await as(scoped,()=>cmd('LINK_ACCOUNT',d.id));
 await assert.rejects(as(owner,()=>cmd('VERIFY',d.id)),/REVIEWER_REQUIRED/);
 const v=await as(scoped,()=>cmd('VERIFY',d.id));assert.equal(v.status,'ACTIVE');
 assert.equal((await db.query(`SELECT count(*)::int n FROM user_roles WHERE user_id=$1 AND role='DOCTOR' AND partner_id=$2 AND status='ACTIVE'`,[docUser,orgA])).rows[0].n,1);
 const e=await as(admin,()=>cmd('REGISTER',null,{...reg,licenseNumber:'MD-SYN-EXP',licenseExpiresOn:'2000-01-01',email:''}));
 await assert.rejects(as(admin,()=>cmd('VERIFY',e.id)),/PROFESSIONAL_DETAILS_INCOMPLETE/);
});
test('assignment is scoped to the admin organization and branch must belong to it',async()=>{
 await assert.rejects(as(scoped,()=>cmd('ASSIGN',d.id,{partnerId:orgB})),/REVIEWER_REQUIRED/);
 await assert.rejects(as(admin,()=>cmd('ASSIGN',d.id,{partnerId:orgA,locationId:locB})),/BRANCH_OUTSIDE_ORGANIZATION/);
 await assert.rejects(as(owner,()=>cmd('ASSIGN',d.id,{partnerId:orgA})),/REVIEWER_REQUIRED/);
 asg=await as(scoped,()=>cmd('ASSIGN',d.id,{partnerId:orgA,locationId:locA}));assert.equal(asg.status,'ACTIVE');
 assert.equal((await as(scoped,()=>cmd('ASSIGN',d.id,{partnerId:orgA,locationId:locA}))).id,asg.id);
});
test('partner owner sees assigned doctors read-only; other org and stranger see nothing',async()=>{
 assert.equal((await as(owner,()=>db.query('SELECT id FROM doctor_assignments'))).rows.length,1);
 assert.equal((await as(owner,()=>db.query('SELECT id FROM doctors WHERE id=$1',[d.id]))).rows.length,1);
 assert.equal((await as(stranger,()=>db.query('SELECT id FROM doctor_assignments'))).rows.length,0);
 await assert.rejects(as(owner,()=>db.query("UPDATE doctor_assignments SET status='REVOKED' RETURNING id")),/permission denied/);
});
test('doctor sets own availability only on an active assignment; others cannot',async()=>{
 await assert.rejects(as(stranger,()=>cmd('SET_AVAILABILITY',asg.id,{slots:[]})),/DOCTOR_SELF_REQUIRED/);
 await assert.rejects(as(docUser,()=>cmd('SET_AVAILABILITY',asg.id,{slots:[{weekday:1,start:'10:00',end:'09:00'}]})),/INVALID_AVAILABILITY/);
 await as(docUser,()=>cmd('SET_AVAILABILITY',asg.id,{slots:[{weekday:1,start:'09:00',end:'12:00'}]}));
 assert.equal((await as(docUser,()=>db.query('SELECT id FROM doctor_availability'))).rows.length,1);
});
test('consultations can only be assigned within an active doctor assignment',async()=>{
 const n=(await db.query(`SELECT count(*)::int n FROM pg_trigger WHERE tgname='consultation_doctor_scope'`)).rows[0].n;assert.equal(n,1);
 await assert.rejects(db.query(`SELECT 1 FROM (SELECT consultation_doctor_scope_guard()) x`),/trigger/);
});
test('suspend needs reason, blocks availability; revoke is terminal and removes role',async()=>{
 await assert.rejects(as(scoped,()=>cmd('SET_ASSIGNMENT',asg.id,{status:'SUSPENDED'})),/REASON_REQUIRED/);
 await as(scoped,()=>cmd('SET_ASSIGNMENT',asg.id,{status:'SUSPENDED',reason:'Synthetic hold'}));
 await assert.rejects(as(docUser,()=>cmd('SET_AVAILABILITY',asg.id,{slots:[]})),/ASSIGNMENT_NOT_ACTIVE/);
 await as(scoped,()=>cmd('SET_ASSIGNMENT',asg.id,{status:'ACTIVE'}));
 await assert.rejects(as(scoped,()=>cmd('SUSPEND',d.id)),/REASON_REQUIRED/);
 await as(scoped,()=>cmd('SUSPEND',d.id,{reason:'Synthetic review'}));
 assert.equal((await db.query(`SELECT status::text s FROM user_roles WHERE user_id=$1 AND role='DOCTOR'`,[docUser])).rows[0].s,'SUSPENDED');
 assert.equal((await as(scoped,()=>cmd('REINSTATE',d.id))).status,'ACTIVE');
 await as(scoped,()=>cmd('REVOKE_ACCESS',d.id,{reason:'Synthetic revoke'}));
 assert.equal((await db.query('SELECT status FROM doctor_assignments WHERE id=$1',[asg.id])).rows[0].status,'REVOKED');
 await assert.rejects(as(scoped,()=>cmd('SET_ASSIGNMENT',asg.id,{status:'ACTIVE'})),/ASSIGNMENT_REVOKED/);
 assert.equal((await db.query(`SELECT status::text s FROM user_roles WHERE user_id=$1 AND role='DOCTOR'`,[docUser])).rows[0].s,'REMOVED');
 assert.ok((await db.query(`SELECT count(*)::int n FROM audit_log WHERE entity_type IN ('doctor','doctor_assignment')`)).rows[0].n>=8);
});
