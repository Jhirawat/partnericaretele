import { z } from 'zod';
import { CHECKS } from './verification-campaign';
import { ARTIFACTS } from './release-bundle';
export const NOTICE='Production readiness is NOT claimed. Closure is evidence metadata only, not release approval or a claim that the domain is live.';
export const BLOCKERS=[
  {
    "key": "seo_accessibility",
    "label": "Public SEO and accessibility readiness",
    "category": "readiness_blocker",
    "prerequisite": "Independent current prerequisite review",
    "checks": [
      "seo-public",
      "seo-private-noindex",
      "a11y-mobile",
      "a11y-contrast"
    ],
    "artifacts": [
      "verification_campaign",
      "publish_gate"
    ],
    "checklists": [
      "dns_domain_seo",
      "public_routes"
    ],
    "ownerActions": [
      "publish_owner"
    ],
    "dependencies": [
      "test_prerequisites"
    ],
    "signoff": "evidence_confirmed",
    "evidence": "Independent current source and artifact review"
  },
  {
    "key": "content_claims",
    "label": "Content and claims review",
    "category": "readiness_blocker",
    "prerequisite": "Independent current prerequisite review",
    "checks": [
      "content-review"
    ],
    "artifacts": [
      "content_review",
      "content_approval"
    ],
    "checklists": [
      "content_claims"
    ],
    "ownerActions": [
      "clinic_facts",
      "contact_details",
      "pricing_terms",
      "claims_review"
    ],
    "dependencies": [
      "test_prerequisites",
      "owner_action_queue"
    ],
    "signoff": "evidence_confirmed",
    "evidence": "Independent current source and artifact review"
  },
  {
    "key": "access_matrix",
    "label": "Access matrix audit",
    "category": "readiness_blocker",
    "prerequisite": "Independent current prerequisite review",
    "checks": [
      "matrix-live"
    ],
    "artifacts": [
      "access_matrix"
    ],
    "checklists": [
      "auth_guards",
      "access_controls"
    ],
    "ownerActions": [
      "superadmin_account",
      "second_reviewer",
      "preview_access"
    ],
    "dependencies": [
      "test_prerequisites",
      "owner_action_queue"
    ],
    "signoff": "evidence_confirmed",
    "evidence": "Independent current source and artifact review"
  },
  {
    "key": "verification_campaign",
    "label": "Unified verification campaign",
    "category": "readiness_blocker",
    "prerequisite": "Independent current prerequisite review",
    "checks": [
      "seo-public",
      "seo-private-noindex",
      "a11y-mobile",
      "a11y-contrast",
      "redirect-signed-out",
      "matrix-live",
      "isolation-tenant",
      "doctor-scope",
      "screening-gates",
      "credit-invariants",
      "mcs-manual",
      "certificates-private",
      "outbox-disabled",
      "sla-clock",
      "privacy-retention",
      "reconciliation",
      "audit-append-only",
      "protection-evidence",
      "backup-evidence",
      "content-review",
      "rollback-drill",
      "no-external"
    ],
    "artifacts": [
      "verification_campaign"
    ],
    "checklists": [
      "credits",
      "monitoring",
      "no_external_calls"
    ],
    "ownerActions": [
      "publish_owner"
    ],
    "dependencies": [
      "seo_accessibility",
      "content_claims",
      "access_matrix",
      "campaign_history",
      "protection_evidence",
      "backup_evidence",
      "rollback_drill",
      "privacy_retention",
      "reconciliation",
      "notifications_outbox",
      "sla_controls"
    ],
    "signoff": "evidence_confirmed",
    "evidence": "Independent current source and artifact review"
  },
  {
    "key": "campaign_history",
    "label": "Persistent campaign history",
    "category": "readiness_blocker",
    "prerequisite": "Independent current prerequisite review",
    "checks": [
      "audit-append-only"
    ],
    "artifacts": [
      "campaign_history"
    ],
    "checklists": [
      "monitoring"
    ],
    "ownerActions": [
      "superadmin_account",
      "preview_access"
    ],
    "dependencies": [
      "test_prerequisites"
    ],
    "signoff": "evidence_confirmed",
    "evidence": "Independent current source and artifact review"
  },
  {
    "key": "test_prerequisites",
    "label": "Production test prerequisites",
    "category": "readiness_blocker",
    "prerequisite": "Independent current prerequisite review",
    "checks": [],
    "artifacts": [
      "production_readiness"
    ],
    "checklists": [
      "access_controls"
    ],
    "ownerActions": [
      "publish_owner"
    ],
    "dependencies": [],
    "signoff": "evidence_confirmed",
    "evidence": "Independent current source and artifact review"
  },
  {
    "key": "protection_evidence",
    "label": "Migration, RLS and storage evidence",
    "category": "readiness_blocker",
    "prerequisite": "Independent current prerequisite review",
    "checks": [
      "protection-evidence"
    ],
    "artifacts": [
      "protection_evidence"
    ],
    "checklists": [
      "protection_evidence"
    ],
    "ownerActions": [
      "protection_evidence"
    ],
    "dependencies": [
      "test_prerequisites"
    ],
    "signoff": "evidence_confirmed",
    "evidence": "Independent current source and artifact review"
  },
  {
    "key": "backup_evidence",
    "label": "Backup and restore evidence",
    "category": "readiness_blocker",
    "prerequisite": "Independent current prerequisite review",
    "checks": [
      "backup-evidence"
    ],
    "artifacts": [
      "backup_evidence"
    ],
    "checklists": [
      "backups"
    ],
    "ownerActions": [
      "backup_evidence"
    ],
    "dependencies": [
      "test_prerequisites"
    ],
    "signoff": "evidence_confirmed",
    "evidence": "Independent current source and artifact review"
  },
  {
    "key": "rollback_drill",
    "label": "Rollback drill",
    "category": "readiness_blocker",
    "prerequisite": "Independent current prerequisite review",
    "checks": [
      "rollback-drill"
    ],
    "artifacts": [
      "release_runbook"
    ],
    "checklists": [
      "rollback_readiness"
    ],
    "ownerActions": [
      "superadmin_account",
      "preview_access"
    ],
    "dependencies": [
      "test_prerequisites",
      "backup_evidence"
    ],
    "signoff": "evidence_confirmed",
    "evidence": "Independent current source and artifact review"
  },
  {
    "key": "privacy_retention",
    "label": "Privacy and retention",
    "category": "readiness_blocker",
    "prerequisite": "Independent current prerequisite review",
    "checks": [
      "privacy-retention"
    ],
    "artifacts": [
      "verification_campaign"
    ],
    "checklists": [
      "privacy_retention"
    ],
    "ownerActions": [
      "superadmin_account",
      "second_reviewer",
      "preview_access"
    ],
    "dependencies": [
      "test_prerequisites",
      "protection_evidence"
    ],
    "signoff": "evidence_confirmed",
    "evidence": "Independent current source and artifact review"
  },
  {
    "key": "reconciliation",
    "label": "Reconciliation",
    "category": "readiness_blocker",
    "prerequisite": "Independent current prerequisite review",
    "checks": [
      "reconciliation"
    ],
    "artifacts": [
      "verification_campaign"
    ],
    "checklists": [
      "credits"
    ],
    "ownerActions": [
      "superadmin_account",
      "second_reviewer",
      "preview_access"
    ],
    "dependencies": [
      "test_prerequisites",
      "protection_evidence"
    ],
    "signoff": "evidence_confirmed",
    "evidence": "Independent current source and artifact review"
  },
  {
    "key": "notifications_outbox",
    "label": "Notifications and outbox disabled",
    "category": "readiness_blocker",
    "prerequisite": "Independent current prerequisite review",
    "checks": [
      "outbox-disabled"
    ],
    "artifacts": [
      "integration_safety",
      "verification_campaign"
    ],
    "checklists": [
      "notifications_outbox",
      "no_external_calls"
    ],
    "ownerActions": [
      "publish_owner"
    ],
    "dependencies": [
      "test_prerequisites"
    ],
    "signoff": "evidence_confirmed",
    "evidence": "Independent current source and artifact review"
  },
  {
    "key": "sla_controls",
    "label": "SLA controls",
    "category": "readiness_blocker",
    "prerequisite": "Independent current prerequisite review",
    "checks": [
      "sla-clock"
    ],
    "artifacts": [
      "verification_campaign"
    ],
    "checklists": [
      "sla_controls"
    ],
    "ownerActions": [
      "publish_owner"
    ],
    "dependencies": [
      "test_prerequisites"
    ],
    "signoff": "evidence_confirmed",
    "evidence": "Independent current source and artifact review"
  },
  {
    "key": "owner_action_queue",
    "label": "Owner action queue",
    "category": "readiness_blocker",
    "prerequisite": "Independent current prerequisite review",
    "checks": [],
    "artifacts": [
      "owner_action_queue"
    ],
    "checklists": [
      "access_controls"
    ],
    "ownerActions": ["superadmin_account","second_reviewer","preview_access","protection_evidence","backup_evidence","clinic_facts","contact_details","pricing_terms","claims_review","publish_owner"],
    "dependencies": [],
    "signoff": "evidence_confirmed",
    "evidence": "Independent current source and artifact review"
  }
] as const;
export const KEYS=BLOCKERS.map(b=>b.key) as [typeof BLOCKERS[number]['key'],...typeof BLOCKERS[number]['key'][]];
export const STATUSES=['open','in-progress','awaiting-evidence','ready-for-review','closed','blocked'] as const;
export const REASONS=['Source evidence outstanding','Independent review outstanding','Dependency remains open','Owner marked blocked','Evidence assembled for review'] as const;
export const NEXT=['Resolve source evidence','Resolve dependency first','Request independent closure review','Resolve reviewer concern'] as const;
export const EVIDENCE='Independent current source and artifact review' as const;
export const recordSchema=z.object({key:z.enum(KEYS),version:z.number().int().nonnegative(),status:z.enum(['open','in-progress','awaiting-evidence','ready-for-review','blocked']),reason:z.enum(REASONS),next:z.enum(NEXT),evidence:z.literal(EVIDENCE)}).strict();
export const confirmSchema=z.object({id:z.uuid(),outcome:z.enum(['closed','concern'])}).strict();
const reasonSchema=z.enum(['Authoritative source coverage or independent review outstanding','Current independently reviewed artifact required','Current independently reviewed prerequisite required','Current independently reviewed owner action required','Real independently reviewed verification check required','Current independently reviewed preflight checklist required','Action version not recorded','Source evidence changed; new action version required','Independent reviewer concern','Explicit independent closure outstanding',...KEYS.map(k=>`Dependency remains open: ${k}`)]);
const record=z.object({id:z.uuid(),version:z.number().int().positive(),status:z.enum(['open','in-progress','awaiting-evidence','ready-for-review','blocked']),reason:z.enum(REASONS),next_action:z.enum(NEXT),evidence_label:z.literal(EVIDENCE),mine:z.boolean(),reviewed:z.boolean(),created_at:z.iso.datetime({offset:true}),correlation_id:z.uuid()}).strict();
export const rowsSchema=z.array(z.object({key:z.enum(KEYS),status:z.enum(STATUSES),eligible:z.boolean(),reasons:z.array(reasonSchema),record:record.nullable(),last_reviewed:z.iso.datetime({offset:true}).nullable()}).strict()).superRefine((rows,ctx)=>{if(rows.length!==14||new Set(rows.map(r=>r.key)).size!==14)ctx.addIssue({code:'custom',message:'Fourteen unique blocker groups required'});for(const r of rows)if(r.status==='closed'&&(!r.eligible||!r.record?.reviewed||!r.last_reviewed||r.reasons.length))ctx.addIssue({code:'custom',message:'Unverified closure refused'});});
export type Row=z.infer<typeof rowsSchema>[number];
export function latestVersions<T extends {key:string;version:number}>(items:readonly T[]){return BLOCKERS.flatMap(b=>{const r=items.filter(i=>i.key===b.key).sort((a,b)=>b.version-a.version)[0];return r?[r]:[];});}
export function boardRows(input:Row[]|null,authorized:boolean){const safe=authorized&&input?rowsSchema.parse(input):[];return BLOCKERS.map(b=>{const r=safe.find(x=>x.key===b.key);return {...b,status:r?.status??'blocked',eligible:r?.eligible??false,reasons:r?.reasons??['Signed-out or scope blocked'],record:r?.record??null,lastReviewed:r?.last_reviewed??null,suites:[...new Set(b.checks.map(k=>CHECKS.find(c=>c.id===k)?.suite).filter((s):s is string=>Boolean(s)))],artifactLabels:b.artifacts.map(k=>ARTIFACTS.find(a=>a.key===k)?.evidence??'Missing artifact mapping'),ownerRole:'SUPER_ADMIN',reviewerRole:'OPERATIONS_ADMIN'};});}
export function boardSummary(input:Row[]|null,authorized:boolean){const rows=boardRows(input,authorized);return {rows,total:14,closed:rows.filter(r=>r.status==='closed').length,remaining:rows.filter(r=>r.status!=='closed').length,counts:Object.fromEntries(STATUSES.map(s=>[s,rows.filter(r=>r.status===s).length])),productionReadyClaimed:false as const};}
export function closurePacket(input:Row[]|null,authorized:boolean){const s=boardSummary(input,authorized);return ['# Owner action closure packet — iCareTele',NOTICE,`Closed ${s.closed}; remaining ${s.remaining}; total ${s.total}.`,...s.rows.map(r=>JSON.stringify({action:r.label,category:r.category,affectedRegister:r.key,prerequisite:r.prerequisite,dependencies:r.dependencies,checks:r.checks,suites:r.suites,artifacts:r.artifactLabels,signoff:r.signoff,checklists:r.checklists,ownerActions:r.ownerActions,evidence:EVIDENCE,status:r.status,reasons:r.reasons,nextAction:r.record?.next_action??NEXT[0],owner:r.ownerRole,reviewer:r.reviewerRole,version:r.record?.version??null,lastReviewed:r.lastReviewed,timestamp:r.record?.created_at??null,correlation:r.record?.correlation_id??null})),'SIMULATED fixtures are excluded. Zero external calls; no release authority.'].join('\n');}
export const SIMULATED=[{label:'SIMULATED missing evidence',reason:'Evidence outstanding'},{label:'SIMULATED out-of-order dependency',reason:'Dependency remains open'},{label:'SIMULATED fictional independent review',reason:'Fictional evidence cannot close a real action'}].map(f=>({...f,status:'open' as const,canClose:false as const,outboundCalls:0 as const}));
