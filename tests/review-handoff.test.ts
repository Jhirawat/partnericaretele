import {describe,test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {archiveSchema,commandSchema,diffVersions,latestSnapshot,archiveExport,SIMULATED,type Archive} from '../src/lib/review-handoff';
import {PREREQS} from '../src/lib/session-start-gate';
import {ARTIFACTS} from '../src/lib/release-bundle';
import {BLOCKERS} from '../src/lib/owner-closure';
import {CHECKS} from '../src/lib/validation-snapshot';
import {SUITES,SESSION_KEYS} from '../src/lib/session-results';
const id='00000000-0000-4000-8000-000000000001',date='2026-10-22T03:47:00Z';
function fixture():Archive{
 const keys=[...PREREQS.map(x=>`prerequisite:${x.key}`),...ARTIFACTS.map(x=>`artifact:${x.key}`),...BLOCKERS.map(x=>`blocker:${x.key}`),...CHECKS.map(x=>`validation:${x.key}`),...SESSION_KEYS.map(x=>`gate:${x}`),...SESSION_KEYS.flatMap(s=>SUITES.map(x=>`result:${s}:${x.key}`)),'packet-review'];
 const counts={decision_state:'blocked' as const,blocker_count:14,prerequisite_count:7,artifact_count:20,discrepancy_count:92};
 const manifest=keys.map(key=>({key,version:0,status:'unverified' as const,revision:'a'.repeat(32)}));
 return {current:{packet_version:1,packet_current:true,manifest,...counts},role:'SUPER_ADMIN',snapshots:[{id,source_version:1,packet_version:1,manifest,...counts,created_at:date,current:true}],events:[],readiness_claimed:false};
}
describe('Final review handoff safety',()=>{
 test('latest valid current packet only',()=>{const d=fixture();expect(latestSnapshot(d)?.packet_version).toBe(1);d.snapshots.push({...d.snapshots[0],source_version:2,current:false});expect(latestSnapshot(d)?.source_version).toBe(1);d.current.packet_current=false;expect(latestSnapshot(d)).toBeNull();});
 test('version diff reports exact evidence and status changes',()=>{const d=fixture(),old=d.current.manifest,next=structuredClone(old);next[0].version=2;next[0].revision='b'.repeat(32);expect(diffVersions(old,next)).toEqual([{key:old[0].key,prior_version:0,next_version:2,prior_status:'unverified',next_status:'unverified',evidence_changed:true}]);expect(diffVersions(old,old)).toEqual([]);});
 test('same-version evidence revisions remain visible',()=>{const old=fixture().current.manifest,next=structuredClone(old);next[0].revision='b'.repeat(32);expect(diffVersions(old,next)).toHaveLength(1);});
 test('hard blockers prerequisites artifacts and discrepancies cannot be approved',()=>{for(const field of ['blocker_count','prerequisite_count','artifact_count','discrepancy_count'] as const){const d=fixture();d.current={...d.current,decision_state:'two-person-recorded',blocker_count:0,prerequisite_count:0,artifact_count:0,discrepancy_count:0};d.current[field]=1;expect(archiveSchema.safeParse(d).success).toBe(false);}});
 test('closed vocabulary rejects personal data secrets and simulation',()=>{for(const reason of ['https://example.invalid','alice@example.invalid','token secret','certificate contents','123456789012','SIMULATED'])expect(commandSchema.safeParse({packet_version:1,source_version:0,root_id:null,handoff_type:'created',recipient_role:'OPERATIONS_ADMIN',reason}).success).toBe(false);});
 test('count limits and source coverage enforced',()=>{const d=fixture();d.current.blocker_count=15;expect(archiveSchema.safeParse(d).success).toBe(false);const n=fixture();n.current.manifest.pop();expect(archiveSchema.safeParse(n).success).toBe(false);});
 test('simulation cannot acknowledge approve or close',()=>{expect(SIMULATED.canAcknowledge).toBe(false);expect(SIMULATED.canApprove).toBe(false);expect(SIMULATED.canClose).toBe(false);expect(SIMULATED.outboundCalls).toBe(0);});
 test('safe export remains redacted and signed-out blocked',()=>{const d=fixture();expect(()=>archiveExport(d,false)).toThrow('EXPORT_BLOCKED');const out=archiveExport(d,true);expect(out).toContain('Production readiness is NOT claimed');expect(out).toContain('Open blockers 14 of 14');expect(out).toContain('## Reviewer checklist');expect(()=>archiveExport({...d,current:{...d.current,manifest:[...d.current.manifest,{key:'secret-token',version:0,status:'unverified',revision:'a'.repeat(32)}]}} as Archive,true)).toThrow();});
});
