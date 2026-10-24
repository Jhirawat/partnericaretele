import { z } from 'zod';
import { CHECKS, READINESS_NOTICE } from './verification-campaign';
export const PREREQUISITES = [
 { key: 'superadmin_account', label: 'Global Superadmin test account', owner: 'SUPER_ADMIN', action: 'Arrange global test account', checks: ['matrix-live','isolation-tenant','doctor-scope','screening-gates','credit-invariants','certificates-private','privacy-retention','reconciliation','rollback-drill'] },
 { key: 'second_reviewer', label: 'Second Operations/admin reviewer', owner: 'OPERATIONS_ADMIN', action: 'Arrange independent global reviewer', checks: ['matrix-live','privacy-retention','reconciliation','protection-evidence','backup-evidence','content-review'] },
 { key: 'preview_access', label: 'Signed-in preview access', owner: 'OPERATIONS_ADMIN', action: 'Confirm signed-in preview access', checks: ['matrix-live','isolation-tenant','doctor-scope','screening-gates','credit-invariants','certificates-private','privacy-retention','reconciliation','rollback-drill'] },
 { key: 'protection_evidence', label: 'Live migration/RLS/storage evidence', owner: 'SUPER_ADMIN', action: 'Supply reviewed protection evidence', checks: ['protection-evidence'] },
 { key: 'backup_evidence', label: 'Backup/restore evidence', owner: 'SUPER_ADMIN', action: 'Supply reviewed restore evidence', checks: ['backup-evidence'] },
 { key: 'content_review', label: 'Clinic facts/contact/pricing/terms review', owner: 'SUPER_ADMIN', action: 'Supply reviewed clinic facts and terms', checks: ['content-review'] },
 { key: 'publish_owner', label: 'Manual publish owner', owner: 'SUPER_ADMIN', action: 'Confirm manual publish owner', checks: [] },
] as const;
export const KEYS = ['superadmin_account','second_reviewer','preview_access','protection_evidence','backup_evidence','content_review','publish_owner'] as const;
export const STATUSES = ['pending','available','blocked','unverified'] as const;
export const EVIDENCE_LABELS = ['Manual availability attestation','Owner handoff review','Independent evidence review'] as const;
// Closed vocabulary, not free text: names, credentials and private documents cannot be persisted.
export const recordSchema = z.object({ key: z.enum(KEYS), status: z.enum(STATUSES), evidence: z.enum(EVIDENCE_LABELS), due: z.iso.date() }).strict();
const reviewSchema = z.object({ outcome: z.enum(['confirmed','rejected']), independent: z.boolean(), mine: z.boolean(), created_at: z.iso.datetime({ offset: true }), correlation_id: z.uuid() }).strict();
export const entrySchema = z.object({ id: z.uuid(), key: z.enum(KEYS), version: z.number().int().positive(), status: z.enum(STATUSES), owner_role: z.enum(['SUPER_ADMIN','OPERATIONS_ADMIN']), required_action: z.enum(PREREQUISITES.map(p=>p.action) as [string,...string[]]), evidence_label: z.enum(EVIDENCE_LABELS), review_due: z.iso.date(), created_at: z.iso.datetime({ offset: true }), correlation_id: z.uuid(), mine: z.boolean(), latest: z.boolean(), reviews: z.array(reviewSchema) }).strict();
export const entriesSchema = z.array(entrySchema);
export type Entry = z.infer<typeof entrySchema>;
export type Key = typeof KEYS[number];
export type Status = typeof STATUSES[number];
export function effectiveStatus(entry: Entry | undefined, authorized: boolean, today = new Date().toISOString().slice(0,10)): Status {
 if (!authorized) return 'blocked';
 if (!entry || !entry.latest) return 'unverified';
 if (entry.review_due < today || entry.reviews.some(r=>r.outcome==='rejected')) return 'blocked';
 if (entry.status !== 'available') return entry.status;
 return entry.reviews.some(r=>r.outcome==='confirmed' && r.independent) ? 'available' : 'unverified';
}
export function prerequisiteRows(entries: readonly Entry[], authorized: boolean, today?: string) {
 return PREREQUISITES.map(p=> { const latest = [...entries].filter(e=>e.key===p.key).sort((a,b)=>b.version-a.version)[0]; return {...p, entry: latest, status: effectiveStatus(latest,authorized,today), suites: [...new Set(p.checks.map(id=>CHECKS.find(c=>c.id===id)?.suite).filter((s):s is string=>Boolean(s)))]}; });
}
export function readinessExport(entries: readonly Entry[], authorized: boolean, today?: string) {
 const safe = entriesSchema.parse(entries);
 const rows = prerequisiteRows(safe,authorized,today);
 return ['# Production test prerequisite handoff', READINESS_NOTICE, 'Availability does not run or pass a campaign check. Role-specific test accounts and independent manual evidence remain required. Publish-owner availability unlocks no test suite; publishing remains manual.', ...STATUSES.flatMap(s=>['',`## ${s}`, ...rows.filter(r=>r.status===s).map(r=>`- [ ] ${r.label} — ${r.status}; owner ${r.owner}; action ${r.action}; evidence ${r.entry?.evidence_label ?? 'not recorded'}; due ${r.entry?.review_due ?? 'not recorded'}; version ${r.entry?.version ?? 'none'}; timestamp ${r.entry?.created_at ?? 'none'}; correlation ${r.entry?.correlation_id ?? 'none'}; suites ${r.suites.join(', ') || 'None — manual owner handoff only'}; gap ${r.status==='available'?'Campaign not executed':r.entry?.status==='available'?'Independent current review required':'Availability not confirmed'}`)]), '', '## Append-only version history', ...safe.map(e=>`- ${e.key} v${e.version}: ${e.status} (recorded assertion, not readiness); ${e.evidence_label}; ${e.review_due}; ${e.created_at}; ${e.correlation_id}`)].join('\n');
}
