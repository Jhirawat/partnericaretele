import { z } from 'zod';
import { BLOCKERS, KEYS as BLOCKER_KEYS } from './owner-closure';
import { ARTIFACTS, KEYS as ARTIFACT_KEYS } from './release-bundle';
import { CHECKS as CAMPAIGN_CHECKS } from './verification-campaign';
export const NOTICE='Production readiness is NOT claimed. Validation metadata records human verification only; it never approves publication, runs the real production campaign or claims the domain is live.';
export const EVIDENCE='Independent validation metadata review' as const;
export const REASONS=['No blocker recorded','Evidence not recorded','Independent review outstanding','Suite execution outstanding','Optional check skipped','Environment unavailable'] as const;
export const SKIPS=['none','optional-concurrency-skip'] as const;
export const STATUSES=['passed','pending','blocked','unverified'] as const;
export const CHECKS=[
 {key:'app-tests',label:'Focused app test suite',suite:'app',expected:'All focused app tests pass with zero failures',blocker:'verification_campaign',artifact:'verification_campaign',check:'matrix-live',ownerRole:'SUPER_ADMIN',reviewerRole:'OPERATIONS_ADMIN'},
 {key:'database-tests',label:'Database migration and safety test suite',suite:'database',expected:'All database tests pass with zero failures; optional concurrency check may skip',blocker:'verification_campaign',artifact:'campaign_history',check:'audit-append-only',ownerRole:'SUPER_ADMIN',reviewerRole:'OPERATIONS_ADMIN'},
 {key:'typecheck',label:'Typecheck',suite:'typecheck',expected:'Typecheck completes with zero errors',blocker:'verification_campaign',artifact:'verification_campaign',check:'matrix-live',ownerRole:'SUPER_ADMIN',reviewerRole:'OPERATIONS_ADMIN'},
 {key:'production-build',label:'Production build',suite:'production-build',expected:'Production build completes successfully',blocker:'verification_campaign',artifact:'verification_campaign',check:'matrix-live',ownerRole:'SUPER_ADMIN',reviewerRole:'OPERATIONS_ADMIN'},
 {key:'private-route-auth',label:'Private route sign-in guard',suite:'preview-smoke',expected:'Private routes block signed-out users before any record read',blocker:'access_matrix',artifact:'access_matrix',check:'redirect-signed-out',ownerRole:'SUPER_ADMIN',reviewerRole:'OPERATIONS_ADMIN'},
 {key:'noindex-coverage',label:'Noindex and nofollow coverage',suite:'preview-smoke',expected:'Every private route serves noindex and nofollow',blocker:'seo_accessibility',artifact:'publish_gate',check:'seo-private-noindex',ownerRole:'SUPER_ADMIN',reviewerRole:'OPERATIONS_ADMIN'},
 {key:'signed-out-block',label:'Signed-out block behaviour',suite:'preview-smoke',expected:'Signed-out preview shows the blocked state without reading records',blocker:'access_matrix',artifact:'access_matrix',check:'redirect-signed-out',ownerRole:'SUPER_ADMIN',reviewerRole:'OPERATIONS_ADMIN'},
 {key:'mobile-preview',label:'Mobile preview behaviour',suite:'preview-smoke',expected:'Mobile viewport renders the blocked or recorded state without errors',blocker:'seo_accessibility',artifact:'verification_campaign',check:'a11y-mobile',ownerRole:'SUPER_ADMIN',reviewerRole:'OPERATIONS_ADMIN'},
 {key:'desktop-preview',label:'Desktop preview behaviour',suite:'preview-smoke',expected:'Desktop viewport renders the blocked or recorded state without errors',blocker:'seo_accessibility',artifact:'verification_campaign',check:'a11y-contrast',ownerRole:'SUPER_ADMIN',reviewerRole:'OPERATIONS_ADMIN'},
 {key:'zero-record-reads',label:'Zero record reads while signed out',suite:'preview-smoke',expected:'Signed-out sessions perform zero register record reads',blocker:'privacy_retention',artifact:'evidence_inspector',check:'isolation-tenant',ownerRole:'SUPER_ADMIN',reviewerRole:'OPERATIONS_ADMIN'},
 {key:'simulated-separation',label:'Simulated versus real separation',suite:'preview-smoke',expected:'Simulated fixtures never count as passed or production evidence',blocker:'campaign_history',artifact:'campaign_history',check:'matrix-live',ownerRole:'SUPER_ADMIN',reviewerRole:'OPERATIONS_ADMIN'},
 {key:'zero-outbound-calls',label:'Zero outbound calls',suite:'preview-smoke',expected:'Recording and reading validation metadata performs zero external calls',blocker:'notifications_outbox',artifact:'integration_safety',check:'no-external',ownerRole:'SUPER_ADMIN',reviewerRole:'OPERATIONS_ADMIN'},
] as const;
export const KEYS=CHECKS.map(c=>c.key) as [typeof CHECKS[number]['key'],...typeof CHECKS[number]['key'][]];
const statusEnum=z.enum(STATUSES);
export const recordSchema=z.object({key:z.enum(KEYS),version:z.number().int().nonnegative(),status:statusEnum,count:z.number().int().nonnegative().nullable(),optional_skip:z.enum(SKIPS),blocker_reason:z.enum(REASONS),evidence:z.literal(EVIDENCE)}).strict().superRefine((r,c)=>{
 if((r.status==='passed')!==(r.blocker_reason==='No blocker recorded'&&r.optional_skip==='none'))c.addIssue({code:'custom',message:'Passed requires no blocker and no skip'});
 if(r.optional_skip!=='none'&&(r.key!=='database-tests'||r.status==='passed'))c.addIssue({code:'custom',message:'Optional skip applies only to the database suite'});
});
export const confirmSchema=z.object({id:z.uuid(),outcome:z.enum(['confirmed','concern'])}).strict();
const recSchema=z.object({id:z.uuid(),version:z.number().int().positive(),status:statusEnum,numeric_count:z.number().int().nonnegative().nullable(),optional_skip:z.enum(SKIPS),blocker_reason:z.enum(REASONS),evidence_label:z.literal(EVIDENCE),mine:z.boolean(),created_at:z.iso.datetime({offset:true}),correlation_id:z.uuid(),reviewed:z.boolean(),review_outcome:z.enum(['confirmed','concern']).nullable()}).strict();
export const rowSchema=z.object({key:z.enum(KEYS),status:statusEnum,reason:z.enum(REASONS),record:recSchema.nullable(),last_reviewed:z.iso.datetime({offset:true}).nullable()}).strict();
export const rowsSchema=z.array(rowSchema).superRefine((rows,c)=>{if(rows.length!==12||new Set(rows.map(r=>r.key)).size!==12)c.addIssue({code:'custom',message:'Twelve unique validation checks required'});});
export type Record_ = z.infer<typeof recSchema>;export type Row=z.infer<typeof rowSchema>;
/** Independently recomputes the effective status; a recorded pass counts only when a different reviewer confirmed the latest version. */
export function derive(record:Record_|null,independentConfirmed:boolean):{status:typeof STATUSES[number];reason:typeof REASONS[number]}{
 if(!record)return{status:'unverified',reason:'Evidence not recorded'};
 if(record.review_outcome==='concern')return{status:'blocked',reason:'Independent review outstanding'};
 if(record.status==='passed')return independentConfirmed&&record.review_outcome==='confirmed'?{status:'passed',reason:'No blocker recorded'}:{status:'unverified',reason:'Independent review outstanding'};
 return{status:record.status,reason:record.blocker_reason};
}
export function summary(rows:Row[]|null,authorized:boolean){
 const safe=authorized&&rows?rowsSchema.parse(rows):null;
 const list=CHECKS.map(c=>{const row=safe?.find(r=>r.key===c.key);const d=derive(row?.record??null,!!row?.record&&!row.record.mine&&row.record.reviewed);return{...c,status:d.status,reason:d.reason,record:row?.record??null,last_reviewed:row?.last_reviewed??null};});
 const passed=list.filter(r=>r.status==='passed').length;
 return{rows:list,passed,total:12,gaps:list.filter(r=>r.status!=='passed'),suites:{app:1,database:1,typecheck:1,productionBuild:1,previewSmoke:8},productionReadyClaimed:false as const};
}
export function validationPacket(rows:Row[]|null,authorized:boolean){
 if(!authorized)throw new Error('Authorization required');
 const s=summary(rows,true);
 return ['# Final Validation Evidence Snapshot — iCareTele',NOTICE,'Redacted metadata only. SIMULATED fixtures excluded. Zero external calls. History begins at first recorded version.','',...s.rows.map(r=>JSON.stringify({check:r.key,suite:r.suite,status:r.status,reason:r.reason,version:r.record?.version??0,numeric_count:r.record?.numeric_count??null,optional_skip:r.record?.optional_skip??'none',evidence_label:EVIDENCE,owner_role:r.ownerRole,reviewer_role:r.reviewerRole,blocker:r.blocker,artifact:r.artifact,verification_check:r.check})),'',`Confirmed passed ${s.passed} of ${s.total}. Unresolved gaps ${s.gaps.length}: ${s.gaps.map(g=>g.key).join(', ')||'none'}.`].join('\n');
}
export const SIMULATED=[{label:'SIMULATED all checks passed',suite:'app',result:'passed'},{label:'SIMULATED self-confirmed pass',suite:'preview-smoke',result:'unverified'},{label:'SIMULATED stale version confirmation',suite:'database',result:'blocked'}].map(f=>({...f,countsAsPassed:false as const,productionEvidence:false as const,canConfirm:false as const,outboundCalls:0 as const}));
// Static integrity: every mapping must reference the real blocker board, evidence bundle and campaign catalogue.
for(const c of CHECKS){if(!BLOCKER_KEYS.includes(c.blocker)||!ARTIFACT_KEYS.includes(c.artifact)||!CAMPAIGN_CHECKS.some(x=>x.id===c.check))throw new Error('Unsafe validation mapping');if(!BLOCKERS.some(b=>b.key===c.blocker)||!ARTIFACTS.some(a=>a.key===c.artifact))throw new Error('Unsafe validation mapping');}
