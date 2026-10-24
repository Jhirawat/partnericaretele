import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {isPrivatePath} from '../src/lib/seo-crawl';
import {PREREQUISITES,recordSchema,effectiveStatus,prerequisiteRows,readinessExport,type Entry} from '../src/lib/production-test-readiness';
import {CHECKS} from '../src/lib/verification-campaign';
const id='00000000-0000-4000-8000-000000000001';
const base:Entry={id,key:'superadmin_account',version:1,status:'available',owner_role:'SUPER_ADMIN',required_action:'Arrange global test account',evidence_label:'Manual availability attestation',review_due:'2026-12-31',created_at:'2026-10-20T12:00:00Z',correlation_id:id,mine:true,latest:true,reviews:[]};
const review={outcome:'confirmed' as const,independent:true,mine:false,created_at:'2026-10-20T13:00:00Z',correlation_id:id};
test('closed vocabulary rejects all sensitive fields and labels',()=>{
 for(const evidence of ['ops@example.com','https://x.test','password xyz','123456','otp 123456','token abc','certificate contents','Jane Doe','private document','username john'])expect(recordSchema.safeParse({key:'superadmin_account',status:'available',evidence,due:'2026-12-31'}).success).toBe(false);
 expect(recordSchema.safeParse({key:'superadmin_account',status:'available',evidence:'Manual availability attestation',due:'2026-12-31',username:'john'}).success).toBe(false);
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
 expect(prerequisiteRows(history,true,'2026-10-20')[0].status).toBe('pending');expect(JSON.stringify(history)).toBe(before);
});
test('seven exact prerequisites map only to applicable campaign checks; owner unlocks no test',()=>{
 expect(PREREQUISITES).toHaveLength(7);
 const map=Object.fromEntries(PREREQUISITES.map(p=>[p.key,[...p.checks]]));
 expect(map.protection_evidence).toEqual(['protection-evidence']);expect(map.backup_evidence).toEqual(['backup-evidence']);expect(map.content_review).toEqual(['content-review']);expect(map.publish_owner).toEqual([]);
 expect(map.superadmin_account).toEqual(['matrix-live','isolation-tenant','doctor-scope','screening-gates','credit-invariants','certificates-private','privacy-retention','reconciliation','rollback-drill']);
 expect(map.preview_access).toEqual(map.superadmin_account);
 expect(map.second_reviewer).toEqual(['matrix-live','privacy-retention','reconciliation','protection-evidence','backup-evidence','content-review']);
 for(const p of PREREQUISITES)for(const check of p.checks)expect(CHECKS.some(c=>c.id===check)).toBe(true);
});
test('safe export refuses corrupted metadata and never claims readiness',()=>{
 const out=readinessExport([base],true,'2026-10-20');expect(out).toContain('NOT claimed');expect(out).toContain('unverified');expect(out).toContain('Independent current review required');
 expect(()=>readinessExport([{...base,evidence_label:'ops@example.com'} as unknown as Entry],true)).toThrow();
 expect(prerequisiteRows([],false).every(r=>r.status==='blocked')).toBe(true);
});
test('private route, authenticated commands, no external services or accidental publication',()=>{
 expect(isPrivatePath('/production-test-readiness')).toBe(true);
 const route=readFileSync('src/routes/_authenticated/production-test-readiness.tsx','utf8');
 expect(route).toContain('noindex, nofollow');
 expect(route).toContain('sitemap:false');
 const functions=readFileSync('src/lib/production-test-readiness.functions.ts','utf8');
 expect(functions.match(/middleware\(\[requireSupabaseAuth\]\)/g)).toHaveLength(3);
 for(const file of ['src/routes/_authenticated/production-test-readiness.tsx','src/lib/production-test-readiness.functions.ts','src/lib/production-test-readiness.ts'])expect(readFileSync(file,'utf8')).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|publish\(|deploy\(|gtag|analytics\./i);
 for(const file of ['src/routes/publish-gate.tsx','src/routes/verification-campaign.tsx'])expect(readFileSync(file,'utf8')).toContain('to="/production-test-readiness"');
 const sql=readFileSync('db/0079_production_test_readiness.sql','utf8');
 expect(sql).not.toMatch(/care_command\(|http_post|pg_net|ALTER TABLE public\.(?!test_prerequisite)/i);
});
