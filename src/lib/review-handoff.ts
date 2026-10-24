import { z } from 'zod';
import { ARTIFACTS } from './release-bundle';
import { BLOCKERS } from './owner-closure';
import { CHECKS } from './validation-snapshot';
import { SUITES, SESSION_KEYS } from './session-results';
import { PREREQS } from './session-start-gate';
import { CHECKLIST } from './human-review-packet';
export const NOTICE = 'Production readiness is NOT claimed. Receipt is not approval. This archive never publishes, deploys, starts tests, closes blockers or sends messages.';
export const TYPES = ['created','shared','acknowledged','returned','concern','expired'] as const;
export const REASONS = ['review-requested','receipt-confirmed','evidence-changed','blockers-open','review-concern','window-expired'] as const;
export const ROLES = ['SUPER_ADMIN','OPERATIONS_ADMIN'] as const;
const role = z.enum(ROLES), version = z.number().int().min(0).max(99999), date = z.iso.datetime({ offset: true });
const keys = ['packet-review',...PREREQS.map(x=>`prerequisite:${x.key}`),...ARTIFACTS.map(x=>`artifact:${x.key}`),...BLOCKERS.map(x=>`blocker:${x.key}`),...CHECKS.map(x=>`validation:${x.key}`),...SESSION_KEYS.map(x=>`gate:${x}`),...SESSION_KEYS.flatMap(s=>SUITES.map(x=>`result:${s}:${x.key}`))] as const;
export const entrySchema = z.object({key:z.enum(keys),version,status:z.enum(['passed','pending','blocked','unverified','open','in-progress','awaiting-evidence','ready-for-review','closed','unavailable','ready-for-start','completed','concern','failed']),revision:z.string().regex(/^[0-9a-f]{32}$/)}).strict();
const manifest = z.array(entrySchema).length(keys.length).refine(x=>new Set(x.map(r=>r.key)).size===keys.length,'DUPLICATE_SOURCE');
const counts = {decision_state:z.enum(['blocked','awaiting-review','two-person-recorded']),blocker_count:z.number().int().min(0).max(14),prerequisite_count:z.number().int().min(0).max(7),artifact_count:z.number().int().min(0).max(20),discrepancy_count:version};
const honest = (v:{decision_state:string;blocker_count:number;prerequisite_count:number;artifact_count:number;discrepancy_count:number})=>v.decision_state!=='two-person-recorded'||v.blocker_count+v.prerequisite_count+v.artifact_count+v.discrepancy_count===0;
export const snapshotSchema=z.object({id:z.uuid(),source_version:version,packet_version:version,manifest,...counts,created_at:date,current:z.boolean()}).strict().refine(honest,'BLOCKER_COUNT_CONFLICT');
export const eventSchema=z.object({id:z.uuid(),snapshot_id:z.uuid(),root_id:z.uuid().nullable(),handoff_type:z.enum(TYPES),recipient_role:role,sender_role:role,reviewer_role:role.nullable(),reason:z.enum(REASONS),next_action:z.enum(['independent-review','resolve-source','retain-history']),packet_label:z.literal('Final human review packet'),evidence_label:z.literal('Redacted handoff evidence'),created_at:date,correlation_id:z.uuid(),mine:z.boolean()}).strict().refine(x=>x.sender_role!==x.recipient_role,'ROLE_SEPARATION');
export const archiveSchema=z.object({current:z.object({packet_version:version,packet_current:z.boolean(),manifest,...counts}).strict().refine(honest,'BLOCKER_COUNT_CONFLICT'),role,snapshots:z.array(snapshotSchema),events:z.array(eventSchema),readiness_claimed:z.literal(false)}).strict();
export const commandSchema=z.object({packet_version:version,source_version:version,root_id:z.uuid().nullable(),handoff_type:z.enum(TYPES),recipient_role:role,reason:z.enum(REASONS)}).strict().refine(x=>({created:['review-requested'],shared:['review-requested'],acknowledged:['receipt-confirmed'],returned:['evidence-changed','blockers-open'],concern:['review-concern'],expired:['window-expired']}[x.handoff_type] as readonly string[]).includes(x.reason),'INVALID_ARGUMENTS');
export type Archive=z.infer<typeof archiveSchema>;
export type Entry=z.infer<typeof entrySchema>;
export function diffVersions(before:Entry[],after:Entry[]){
 const a=new Map(before.map(x=>[x.key,x])),b=new Map(after.map(x=>[x.key,x]));
 return [...new Set([...a.keys(),...b.keys()])].sort().flatMap(key=>{const prior=a.get(key),next=b.get(key);return prior?.version===next?.version&&prior?.status===next?.status&&prior?.revision===next?.revision?[]:[{key,prior_version:prior?.version??0,next_version:next?.version??0,prior_status:prior?.status??'missing',next_status:next?.status??'missing',evidence_changed:prior?.revision!==next?.revision}];});
}
export function latestSnapshot(data:Archive){return data.snapshots.filter(s=>s.current&&s.packet_version===data.current.packet_version&&data.current.packet_current).sort((a,b)=>b.source_version-a.source_version)[0]??null;}
export function archiveExport(input:Archive|null,authorized:boolean){
 if(!authorized||!input)throw new Error('EXPORT_BLOCKED');
 const d=archiveSchema.parse(input);
 return ['# Final review handoff and audit archive',NOTICE,`Packet version ${d.current.packet_version}; current: ${d.current.packet_current}`,`Open blockers ${d.current.blocker_count} of 14; prerequisites ${d.current.prerequisite_count} of 7; unpassed artifacts ${d.current.artifact_count} of 20; discrepancies ${d.current.discrepancy_count}`,`Decision state: ${d.current.decision_state}`,'## Immutable snapshots',...d.snapshots.map((s,i)=>`Packet v${s.packet_version} / source v${s.source_version}: ${s.decision_state}; blockers ${s.blocker_count}; prerequisites ${s.prerequisite_count}; artifacts ${s.artifact_count}; discrepancies ${s.discrepancy_count}\nChanges: ${JSON.stringify(diffVersions(d.snapshots[i-1]?.manifest??[],s.manifest))}`),'## Unresolved evidence',...d.current.manifest.filter(x=>!['passed','closed'].includes(x.status)).map(x=>`${x.key} v${x.version}: ${x.status}`),'## Handoff history',...d.events.map(e=>`${e.packet_label}: ${e.handoff_type}; ${e.sender_role} to ${e.recipient_role}; ${e.reason}; ${e.next_action}; ${e.evidence_label}; ${e.created_at}; ${e.correlation_id}`),'## Reviewer checklist',...CHECKLIST].join('\n');
}
export const SIMULATED={label:'SIMULATED handoff — fictional only',canAcknowledge:false,canApprove:false,canClose:false,outboundCalls:0} as const;
