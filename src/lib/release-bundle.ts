import { z } from 'zod';
import { unsafeIncidentText } from './incident-console';
export const NOTICE = 'Production readiness is NOT claimed. This packet is evidence metadata for final human review, not approval to publish or a claim that the domain is live.';
export const ARTIFACTS = [
  {
    "key": "release_readiness",
    "label": "Release readiness",
    "category": "register_metadata",
    "evidence": "Release readiness metadata snapshot",
    "check": "matrix-live",
    "ownerAction": "publish_owner",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "release_evidence",
    "label": "Release evidence",
    "category": "register_metadata",
    "evidence": "Release evidence metadata snapshot",
    "check": "audit-append-only",
    "ownerAction": "protection_evidence",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "publish_gate",
    "label": "Publish gate human acknowledgements",
    "category": "register_metadata",
    "evidence": "Publish gate human acknowledgements metadata snapshot",
    "check": "content-review",
    "ownerAction": "claims_review",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "release_runbook",
    "label": "Release runbook and rollback drills",
    "category": "register_metadata",
    "evidence": "Release runbook and rollback drills metadata snapshot",
    "check": "rollback-drill",
    "ownerAction": "publish_owner",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "backup_evidence",
    "label": "Backup evidence",
    "category": "register_metadata",
    "evidence": "Backup evidence metadata snapshot",
    "check": "backup-evidence",
    "ownerAction": "backup_evidence",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "protection_evidence",
    "label": "Protection evidence",
    "category": "register_metadata",
    "evidence": "Protection evidence metadata snapshot",
    "check": "protection-evidence",
    "ownerAction": "protection_evidence",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "content_review",
    "label": "Content and claims review",
    "category": "register_metadata",
    "evidence": "Content and claims review metadata snapshot",
    "check": "content-review",
    "ownerAction": "claims_review",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "access_matrix",
    "label": "Access matrix",
    "category": "register_metadata",
    "evidence": "Access matrix metadata snapshot",
    "check": "matrix-live",
    "ownerAction": "superadmin_account",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "verification_campaign",
    "label": "Verification campaign results",
    "category": "register_metadata",
    "evidence": "Verification campaign results metadata snapshot",
    "check": "matrix-live",
    "ownerAction": "preview_access",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "campaign_history",
    "label": "Campaign history",
    "category": "register_metadata",
    "evidence": "Campaign history metadata snapshot",
    "check": "audit-append-only",
    "ownerAction": "preview_access",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "production_readiness",
    "label": "Production test prerequisites",
    "category": "register_metadata",
    "evidence": "Production test prerequisites metadata snapshot",
    "check": "matrix-live",
    "ownerAction": "superadmin_account",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "owner_action_queue",
    "label": "Owner action queue",
    "category": "register_metadata",
    "evidence": "Owner action queue metadata snapshot",
    "check": "matrix-live",
    "ownerAction": "publish_owner",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "golive_decision_pack",
    "label": "Final go-live decision sign-offs",
    "category": "register_metadata",
    "evidence": "Final go-live decision sign-offs metadata snapshot",
    "check": "matrix-live",
    "ownerAction": "publish_owner",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "test_session_workspace",
    "label": "Test session workspace",
    "category": "register_metadata",
    "evidence": "Test session workspace metadata snapshot",
    "check": "matrix-live",
    "ownerAction": "preview_access",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "human_review_console",
    "label": "Human review sign-off rounds",
    "category": "register_metadata",
    "evidence": "Human review sign-off rounds metadata snapshot",
    "check": "matrix-live",
    "ownerAction": "second_reviewer",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "content_approval",
    "label": "Canonical content approval",
    "category": "register_metadata",
    "evidence": "Canonical content approval metadata snapshot",
    "check": "content-review",
    "ownerAction": "claims_review",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "launch_control",
    "label": "Launch-day control center",
    "category": "register_metadata",
    "evidence": "Launch-day control center metadata snapshot",
    "check": "rollback-drill",
    "ownerAction": "publish_owner",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "integration_safety",
    "label": "Integration and provider safety",
    "category": "register_metadata",
    "evidence": "Integration and provider safety metadata snapshot",
    "check": "no-external",
    "ownerAction": "protection_evidence",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "incident_console",
    "label": "Incident and escalation console",
    "category": "register_metadata",
    "evidence": "Incident and escalation console metadata snapshot",
    "check": "rollback-drill",
    "ownerAction": "publish_owner",
    "signoff": "evidence_confirmed"
  },
  {
    "key": "evidence_inspector",
    "label": "Cross-register evidence inspector",
    "category": "register_metadata",
    "evidence": "Cross-register evidence inspector metadata snapshot",
    "check": "protection-evidence",
    "ownerAction": "protection_evidence",
    "signoff": "evidence_confirmed"
  }
] as const;
export const KEYS = ARTIFACTS.map(a=>a.key) as [typeof ARTIFACTS[number]['key'], ...typeof ARTIFACTS[number]['key'][]];
export const STATUSES = ['passed','pending','blocked','unverified'] as const;
export const REASONS = ['Missing artifact','Source evidence blocked','Source readiness unverified'] as const;
const sourceSchema = z.object({register:z.enum(KEYS),fingerprint:z.string().regex(/^[a-f0-9]{32}$/),source_count:z.number().int().nonnegative(),source_version:z.number().int().nonnegative(),status:z.enum(STATUSES),reason:z.enum(REASONS)}).strict();
const reviewSchema = z.object({outcome:z.enum(['confirmed','concern']),independent:z.boolean(),reviewer_role:z.enum(['SUPER_ADMIN','OPERATIONS_ADMIN']),mine:z.boolean(),created_at:z.iso.datetime({offset:true}),correlation_id:z.uuid()}).strict();
export const snapshotSchema = z.object({id:z.uuid(),register:z.enum(KEYS),version:z.number().int().positive(),source_fingerprint:z.string().regex(/^[a-f0-9]{32}$/),source_count:z.number().int().nonnegative(),source_version:z.number().int().nonnegative(),observed_status:z.enum(STATUSES),blocker_reason:z.enum(REASONS),mine:z.boolean(),created_at:z.iso.datetime({offset:true}),correlation_id:z.uuid(),reviews:z.array(reviewSchema)}).strict();
export const consoleSchema = z.object({sources:z.array(sourceSchema),snapshots:z.array(snapshotSchema)}).strict();
export const captureSchema=z.object({register:z.enum(KEYS),version:z.number().int().nonnegative()}).strict();
export const confirmSchema=z.object({id:z.uuid(),outcome:z.enum(['confirmed','concern'])}).strict();
export type Bundle = z.infer<typeof consoleSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export function latestSnapshots(items:readonly Snapshot[]) { return ARTIFACTS.flatMap(a=>{const e=items.filter(x=>x.register===a.key).sort((x,y)=>y.version-x.version)[0];return e?[e]:[];}); }
export function assembleBundle(input:Bundle|null,authorized:boolean) {
 const safe=authorized&&input?consoleSchema.parse(input):null;
 return ARTIFACTS.map(a=>{
 const sources=safe?.sources.filter(s=>s.register===a.key)??[];const source=sources[0];
 const all=safe?.snapshots.filter(s=>s.register===a.key)??[];const e=latestSnapshots(all)[0];
 const reasons:string[]=[];
 if(!authorized) reasons.push('Signed-out or scope blocked');
 if(sources.length!==1) reasons.push(sources.length?'Duplicate source label':'Missing source label');
 if(!source?.source_count) reasons.push('Missing source artifact');
 if(!e) reasons.push('Missing artifact snapshot');
 if(e && all.filter(x=>x.version===e.version).length!==1) reasons.push('Duplicate artifact label and version');
 if(e && source && (e.source_fingerprint!==source.fingerprint || e.source_version!==source.source_version || e.source_count!==source.source_count)) reasons.push('Stale evidence or source version mismatch');
 if(e?.reviews.some(r=>r.outcome==='concern')) reasons.push('Independent reviewer concern');
 if(e?.reviews.some(r=>!r.independent)) reasons.push('Reviewer separation mismatch');
 const confirmed=Boolean(e?.reviews.some(r=>r.independent && r.outcome==='confirmed'));
 if(e&&!confirmed) reasons.push('Independent confirmation outstanding');
 if(source?.status!=='passed') reasons.push(source?.reason??'Source readiness unverified');
 if(e?.observed_status!==source?.status) reasons.push('Observed source status mismatch');
 // Capture/confirmation can validate assembly only; never manufacture source readiness.
 const status:typeof STATUSES[number]=!authorized?'blocked':reasons.some(r=>/Duplicate|mismatch|Stale|concern/.test(r))?'blocked':source?.status==='blocked'?'blocked':reasons.length?'unverified':confirmed?'passed':'pending';
 const current=Boolean(e&&source&&e.source_fingerprint===source.fingerprint&&e.source_version===source.source_version&&e.source_count===source.source_count);
 return {...a,snapshot:e,source,status,reasons,ownerRole:'SUPER_ADMIN' as const,reviewerRole:'OPERATIONS_ADMIN' as const,lastReviewed:current&&!e?.reviews.some(r=>r.outcome==='concern')?e?.reviews.filter(r=>r.independent&&r.outcome==='confirmed').map(r=>r.created_at).sort().at(-1)??null:null};
 });
}
export const INTEGRITY_RULES=['Register coverage','Duplicate or missing artifact labels','Version matching','Stale evidence','Reviewer separation','Blocker-count consistency','Noindex and sign-in coverage','SIMULATED separation','No-outbound-call evidence'] as const;
export function integritySummary(input:Bundle|null,authorized:boolean,reportedOpen?:number){
 const rows=assembleBundle(input,authorized);const open=rows.filter(r=>r.status!=='passed');
 const discrepancies=rows.flatMap(r=>r.reasons.map(reason=>({register:r.key,reason,ownerAction:r.ownerAction,check:r.check,signoff:r.signoff})));
 if(reportedOpen!==undefined && reportedOpen!==open.length) discrepancies.push({register:'owner_action_queue',reason:'Blocker-count mismatch',ownerAction:'publish_owner',check:'matrix-live',signoff:'evidence_confirmed'});
 const patterns=[/Missing source/,/Duplicate|Missing artifact/,/version|status mismatch/,/Stale/,/reviewer|confirmation/i,/Blocker-count mismatch/];
 return {rows,open,discrepancies,total:rows.length,passed:rows.filter(r=>r.status==='passed').length,pending:rows.filter(r=>r.status==='pending').length,blocked:rows.filter(r=>r.status==='blocked').length,unverified:rows.filter(r=>r.status==='unverified').length,productionReadyClaimed:false as const,rules:INTEGRITY_RULES.map((rule,i)=>{
 const pattern=patterns[i];const found=pattern?discrepancies.filter(d=>pattern.test(d.reason)):[];
 return {rule,status:!authorized||found.length?'blocked' as const:'unverified' as const,reason:!authorized?'Signed-out or scope blocked':found.length?`${found.length} discrepancies; see exact ledger resolution mappings`:'Independent real integrity evidence required; static declarations and fixtures are not proof'};
 })};
}
export function bundleExport(input:Bundle|null,authorized:boolean){
 const s=integritySummary(input,authorized);
 // Fixed labels plus validated dates/IDs only; never spread raw source metadata into the packet.
 return ['# Final release evidence bundle — iCareTele',NOTICE,`Passed ${s.passed}; pending ${s.pending}; blocked ${s.blocked}; unverified ${s.unverified}; total ${s.total}; open ${s.open.length}.`,...s.rows.map(r=>JSON.stringify({register:r.label,artifactCategory:r.category,expectedEvidence:r.evidence,status:r.status,blockers:r.reasons,owner:r.ownerRole,independentReviewer:r.reviewerRole,sourceRegister:r.key,verificationCheck:r.check,ownerAction:r.ownerAction,signoff:r.signoff,version:r.snapshot?.version??null,sourceVersion:r.source?.source_version??null,lastReviewed:r.lastReviewed,timestamp:r.snapshot?.created_at??null,correlation:r.snapshot?.correlation_id??null})),...s.rules.map(r=>`${r.rule}: ${r.status}`),'SIMULATED fixtures are excluded. No external calls are performed by this assembly.'].join('\n');
}
export const safeEvidenceLabel=(label:string)=>ARTIFACTS.some(a=>a.evidence===label)&&!unsafeIncidentText(label);
export const SIMULATED = [{label:'SIMULATED complete fictional catalogue',missing:0,duplicates:0,stale:false,independent:true},{label:'SIMULATED missing and duplicate labels',missing:1,duplicates:1,stale:false,independent:true},{label:'SIMULATED stale version and self-review',missing:0,duplicates:0,stale:true,independent:false}].map(f=>({...f,status:'unverified' as const,passed:false as const,outboundCalls:0 as const}));
