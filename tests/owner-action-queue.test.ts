import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {isPrivatePath} from '../src/lib/seo-crawl';
import {ITEMS,KEYS,recordSchema,effectiveStatus,queueRows,nextActions,handoffExport,type Entry} from '../src/lib/owner-action-queue';
import {CHECKS} from '../src/lib/verification-campaign';
const id='00000000-0000-4000-8000-000000000001';
const base:Entry={id,key:'superadmin_account',version:1,status:'available',owner_role:'SUPER_ADMIN',reviewer_role:'OPERATIONS_ADMIN',required_action:'Arrange global test account',evidence_label:'Manual availability attestation',review_due:'2026-12-31',created_at:'2026-10-20T12:00:00Z',correlation_id:id,mine:true,latest:true,reviews:[]};
const review={outcome:'confirmed' as const,independent:true,mine:false,created_at:'2026-10-20T13:00:00Z',correlation_id:id};
test('closed vocabulary rejects all sensitive fields and labels',()=>{
 for(const evidence of ['ops@example.com','https://x.test','password xyz','123456','otp 123456','token abc','certificate contents','Jane Doe','private document','username john'])expect(recordSchema.safeParse({key:'superadmin_account',status:'available',evidence,due:'2026-12-31'}).success).toBe(false);
 expect(recordSchema.safeParse({key:'superadmin_account',status:'available',evidence:'Manual availability attestation',due:'2026-12-31',username:'john'}).success).toBe(false);
 expect(recordSchema.safeParse({key:'grant_all',status:'available',evidence:'Manual availability attestation',due:'2026-12-31'}).success).toBe(false);
});
test('available requires distinct reviewer; missing, signed-out, stale, expired, concerned stay unavailable',()=>{
 expect(effectiveStatus(base,true,'2026-10-20')).toBe('unverified');
 expect(effectiveStatus({...base,reviews:[review]},true,'2026-10-20')).toBe('available');
 expect(effectiveStatus({...base,reviews:[{...review,independent:false}]},true,'2026-10-20')).toBe('unverified');
 expect(effectiveStatus({...base,reviews:[review,{...review,outcome:'rejected'}]},true,'2026-10-20')).toBe('blocked');
 expect(effectiveStatus({...base,reviews:[review]},false,'2026-10-20')).toBe('blocked');
 expect(effectiveStatus({...base,latest:false,reviews:[review]},true,'2026-10-20')).toBe('unverified');
 expect(effectiveStatus({...base,review_due:'2026-10-19',reviews:[review]},true,'2026-10-20')).toBe('blocked');
 expect(effectiveStatus(undefined,true)).toBe('unverified');
});
test('latest version invalidates earlier availability without mutating history',()=>{
 const old={...base,reviews:[review],latest:false},newer={...base,version:2,status:'pending' as const};
 const history=[old,newer];const before=JSON.stringify(history);
 expect(queueRows(history,true,'2026-10-20')[0].status).toBe('pending');expect(JSON.stringify(history)).toBe(before);
});
test('ten exact items map only to applicable campaign checks; publish owner unlocks no test',()=>{
 expect(ITEMS).toHaveLength(10);expect(KEYS).toHaveLength(10);
 const map=Object.fromEntries(ITEMS.map(i=>[i.key,[...i.checks]]));
 expect(map.protection_evidence).toEqual(['protection-evidence']);expect(map.backup_evidence).toEqual(['backup-evidence']);expect(map.publish_owner).toEqual([]);
 for(const k of ['clinic_facts','contact_details','pricing_terms','claims_review'])expect(map[k as keyof typeof map]).toEqual(['content-review']);
 expect(map.superadmin_account).toEqual(['matrix-live','isolation-tenant','doctor-scope','screening-gates','credit-invariants','certificates-private','privacy-retention','reconciliation','rollback-drill']);
 expect(map.preview_access).toEqual(map.superadmin_account);
 expect(map.second_reviewer).toEqual(['matrix-live','privacy-retention','reconciliation','protection-evidence','backup-evidence','content-review']);
 for(const i of ITEMS)for(const check of i.checks)expect(CHECKS.some(c=>c.id===check)).toBe(true);
});
test('blocker counts and next actions are honest without claiming readiness',()=>{
 const rows=queueRows([],true,'2026-10-20');
 expect(rows.every(r=>r.status==='unverified')).toBe(true);
 expect(rows.filter(r=>r.status!=='available')).toHaveLength(10);
 expect(queueRows([],false).every(r=>r.status==='blocked')).toBe(true);
 const actions=nextActions(rows);
 expect(actions).toHaveLength(10);
 expect(actions.every(a=>a.startsWith('- [ ]'))).toBe(true);
 expect(actions.some(a=>a.includes('Arrange global test account'))).toBe(true);
 const confirmed=queueRows([{...base,reviews:[review]}],true,'2026-10-20');
 expect(confirmed.filter(r=>r.status!=='available')).toHaveLength(9);
 expect(nextActions(confirmed)).toHaveLength(9);
});
test('safe export refuses corrupted metadata and never claims readiness',()=>{
 const out=handoffExport([base],true,'2026-10-20');expect(out).toContain('NOT claimed');expect(out).toContain('unverified');expect(out).toContain('Independent current review required');expect(out).toContain('## Next actions');
 expect(()=>handoffExport([{...base,evidence_label:'ops@example.com'} as unknown as Entry],true)).toThrow();
});
test('private route, authenticated commands, no external services or accidental publication',()=>{
 expect(isPrivatePath('/owner-action-queue')).toBe(true);
 const route=readFileSync('src/routes/_authenticated/owner-action-queue.tsx','utf8');
 expect(route).toContain('noindex, nofollow');
 expect(route).toContain('sitemap:false');
 const functions=readFileSync('src/lib/owner-action-queue.functions.ts','utf8');
 expect(functions.match(/middleware\(\[requireSupabaseAuth\]\)/g)).toHaveLength(3);
 for(const file of ['src/routes/_authenticated/owner-action-queue.tsx','src/lib/owner-action-queue.functions.ts','src/lib/owner-action-queue.ts'])expect(readFileSync(file,'utf8')).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|publish\(|deploy\(|gtag|analytics\./i);
 for(const file of ['src/routes/publish-gate.tsx','src/routes/_authenticated/production-test-readiness.tsx'])expect(readFileSync(file,'utf8')).toContain('to="/owner-action-queue"');
 const sql=readFileSync('db/0080_owner_action_queue.sql','utf8');
 expect(sql).not.toMatch(/care_command\(|http_post|pg_net|ALTER TABLE public\.(?!owner_action)/i);
});
