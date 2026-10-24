import { z } from 'zod';
import { CHECKS as CAMPAIGN } from './verification-campaign';
import { BLOCKERS } from './owner-closure';
import { ARTIFACTS } from './release-bundle';

export const NOTICE = 'Production readiness is NOT claimed. This recorder only documents a future manually started signed-in human verification session; it never starts a session, runs tests, publishes, deploys, changes permissions or calls external services.' as const;
export const EVIDENCE = 'Independent human session result review' as const;
export const ENVIRONMENT = 'Signed-in preview' as const;
export const SESSION_KEYS = ['primary-human-session', 'follow-up-human-session'] as const;
export const SESSION_LABELS: Record<typeof SESSION_KEYS[number], string> = { 'primary-human-session': 'Primary human verification session', 'follow-up-human-session': 'Follow-up human verification session' };
export const STATUSES = ['passed', 'failed', 'blocked', 'concern', 'unverified'] as const;
export const RESULT_LABELS = ['Observed as expected', 'Deviation observed', 'Execution blocked', 'Reviewer concern recorded', 'Not yet observed'] as const;
export const REASONS = ['No blocker recorded', 'Result not recorded', 'Session not authorized', 'Prerequisite suite outstanding', 'Independent review outstanding', 'Deviation under investigation', 'Concern raised'] as const;
export const NEXT_ACTIONS = ['No action required', 'Re-run the suite manually', 'Record the blocker in the owner action queue', 'Request independent review', 'Await the prerequisite suite result'] as const;

/** Planned suites in strict dependency order. Each maps to an exact evidence artifact, owner action blocker and verification check. */
export const SUITES = [
  { ord: 1, key: 'public_routes', label: 'Public routes and SEO', expected: 'Public pages load with unique accessible metadata', artifact: 'verification_campaign', blocker: 'seo_accessibility', check: 'seo-public' },
  { ord: 2, key: 'auth_guards', label: 'Signed-out redirects', expected: 'Signed-out visitors are sent to sign-in', artifact: 'access_matrix', blocker: 'access_matrix', check: 'redirect-signed-out' },
  { ord: 3, key: 'role_access', label: 'Role/route access matrix', expected: 'Live behaviour matches the access matrix', artifact: 'access_matrix', blocker: 'access_matrix', check: 'matrix-live' },
  { ord: 4, key: 'isolation', label: 'Customer and partner isolation', expected: "A partner never reads another partner's records", artifact: 'access_matrix', blocker: 'access_matrix', check: 'isolation-tenant' },
  { ord: 5, key: 'safety_gates', label: 'Screening safety gates', expected: 'No request without four PASS screening results', artifact: 'verification_campaign', blocker: 'verification_campaign', check: 'screening-gates' },
  { ord: 6, key: 'credit_lifecycle', label: 'Consultation and credit invariants', expected: 'One reservation, one consumption, no negative balance', artifact: 'verification_campaign', blocker: 'verification_campaign', check: 'credit-invariants' },
  { ord: 7, key: 'mcs_handoff', label: 'MCS handoff', expected: 'Adapter stays in mock mode with no automatic calls', artifact: 'verification_campaign', blocker: 'verification_campaign', check: 'mcs-manual' },
  { ord: 8, key: 'certificates', label: 'Certificates and private storage', expected: 'Certificate files stay private and need review', artifact: 'verification_campaign', blocker: 'verification_campaign', check: 'certificates-private' },
  { ord: 9, key: 'outbox', label: 'Notifications/outbox disabled', expected: 'External delivery workers do nothing', artifact: 'integration_safety', blocker: 'notifications_outbox', check: 'outbox-disabled' },
  { ord: 10, key: 'sla', label: 'SLA controls', expected: 'Pauses and maintenance are excluded from SLA clocks', artifact: 'verification_campaign', blocker: 'sla_controls', check: 'sla-clock' },
  { ord: 11, key: 'privacy', label: 'Privacy and retention', expected: 'Privacy requests need independent approval with history kept', artifact: 'verification_campaign', blocker: 'privacy_retention', check: 'privacy-retention' },
  { ord: 12, key: 'reconciliation', label: 'Reconciliation', expected: 'Adjustments are reporting-only and independently approved', artifact: 'verification_campaign', blocker: 'reconciliation', check: 'reconciliation' },
  { ord: 13, key: 'audit', label: 'Audit append-only', expected: 'Audit rows cannot be edited or deleted', artifact: 'release_evidence', blocker: 'campaign_history', check: 'audit-append-only' },
  { ord: 14, key: 'protection', label: 'Migration/RLS/storage evidence', expected: 'Recorded migration/RLS/storage evidence confirmed independently', artifact: 'protection_evidence', blocker: 'protection_evidence', check: 'protection-evidence' },
  { ord: 15, key: 'backup', label: 'Backup/restore evidence', expected: 'Restore test recorded and confirmed independently', artifact: 'backup_evidence', blocker: 'backup_evidence', check: 'backup-evidence' },
  { ord: 16, key: 'content', label: 'Content/claims review', expected: 'Every content type acknowledged by a different reviewer', artifact: 'content_review', blocker: 'content_claims', check: 'content-review' },
  { ord: 17, key: 'rollback', label: 'Rollback drill', expected: 'Rollback drill runs on synthetic state only', artifact: 'release_runbook', blocker: 'rollback_drill', check: 'rollback-drill' },
  { ord: 18, key: 'no_external', label: 'No external calls', expected: 'No requests leave the site during checks', artifact: 'integration_safety', blocker: 'notifications_outbox', check: 'no-external' },
] as const;
export const SUITE_KEYS = SUITES.map((s) => s.key) as [typeof SUITES[number]['key'], ...typeof SUITES[number]['key'][]];
export const EXPECTED = SUITES.map((s) => s.expected) as [string, ...string[]];

export const recordSchema = z.object({ session: z.enum(SESSION_KEYS), suite: z.enum(SUITE_KEYS), version: z.number().int().nonnegative(), status: z.enum(STATUSES), result_label: z.enum(RESULT_LABELS), blocker_reason: z.enum(REASONS), next_action: z.enum(NEXT_ACTIONS) }).strict()
  .refine((d) => (d.status === 'passed') === (d.result_label === 'Observed as expected' && d.blocker_reason === 'No blocker recorded'), { message: 'A passed result requires the expected observation with no blocker' });
export const confirmSchema = z.object({ id: z.uuid(), slot: z.union([z.literal(1), z.literal(2)]), outcome: z.enum(['confirmed', 'concern']) }).strict();

const role = z.enum(['SUPER_ADMIN', 'OPERATIONS_ADMIN']);
const reviewSchema = z.object({ outcome: z.enum(['confirmed', 'concern']), reviewer_role: role, mine: z.boolean(), created_at: z.iso.datetime({ offset: true }), correlation_id: z.uuid() }).strict();
const recSchema = z.object({ id: z.uuid(), version: z.number().int().positive(), status: z.enum(STATUSES), result_label: z.enum(RESULT_LABELS), blocker_reason: z.enum(REASONS), next_action: z.enum(NEXT_ACTIONS), evidence_label: z.literal(EVIDENCE), environment_label: z.literal(ENVIRONMENT), source_session_version: z.number().int().nonnegative(), owner_role: role, mine: z.boolean(), created_at: z.iso.datetime({ offset: true }), correlation_id: z.uuid(), review1: reviewSchema.nullable(), review2: reviewSchema.nullable() }).strict();
const suiteSchema = z.object({ ord: z.number().int().positive(), suite_key: z.enum(SUITE_KEYS), expected: z.enum(EXPECTED), artifact: z.string(), blocker: z.string(), check_id: z.string(), status: z.enum(STATUSES), reason: z.enum(REASONS), record: recSchema.nullable() }).strict();
const countsSchema = z.object({ passed: z.number().int().nonnegative(), failed: z.number().int().nonnegative(), blocked: z.number().int().nonnegative(), concern: z.number().int().nonnegative(), unverified: z.number().int().nonnegative() }).strict();
const sessionSchema = z.object({ session_key: z.enum(SESSION_KEYS), session_status: z.string(), session_version: z.number().int().nonnegative(), authorized: z.boolean(), suites: z.array(suiteSchema), counts: countsSchema }).strict();
const dependentSchema = z.object({ blocker: z.string(), suites: z.array(z.enum(SUITE_KEYS)), state: z.enum(['open', 'reopened', 'satisfied']), closure_granted: z.literal(false) }).strict();
const reconSchema = z.object({ register: z.string(), expected: z.number().int().nonnegative(), observed: z.number().int().nonnegative(), next_action: z.string(), match: z.boolean() }).strict();
export const consoleSchema = z.object({ missing_prerequisites: z.array(z.string()), sessions: z.array(sessionSchema), dependent_blockers: z.array(dependentSchema), reconciliation: z.array(reconSchema), readiness_claimed: z.literal(false) }).strict()
  .refine((c) => c.sessions.length === 2 && c.sessions.every((s) => s.suites.length === 18), 'Two sessions of eighteen suites required');
export type Console = z.infer<typeof consoleSchema>;
export type SuiteRow = z.infer<typeof suiteSchema>;

/** Safe console: signed-out or unauthorized means no record metadata and everything unresolved. */
export function summary(data: Console | null, authorized: boolean) {
  const safe = authorized && data ? consoleSchema.parse(data) : null;
  const sessions = SESSION_KEYS.map((key) => {
    const s = safe?.sessions.find((x) => x.session_key === key);
    return { key, label: SESSION_LABELS[key], session: s ?? null, counts: s?.counts ?? { passed: 0, failed: 0, blocked: 0, concern: 0, unverified: 18 } };
  });
  return { sessions, missing: safe?.missing_prerequisites ?? [], blockers: safe?.dependent_blockers ?? [], reconciliation: safe?.reconciliation ?? [], mismatches: (safe?.reconciliation ?? []).filter((r) => !r.match), readinessClaimed: false as const };
}

/** A result is reviewable only on the latest recorded version by someone other than the recorder; slot 2 requires a different reviewer than slot 1. */
export function reviewSlot(row: SuiteRow) {
  const r = row.record;
  if (!r || r.mine) return null;
  if (!r.review1) return 1 as const;
  if (!r.review2 && !r.review1.mine) return 2 as const;
  return null;
}

const UNSAFE = /@|https?:\/\/|www\.|\b\d{6,}\b|token|secret|password|api[_-]?key|bearer|BEGIN [A-Z ]*KEY/i;
export function resultsPacket(data: Console | null, authorized: boolean) {
  if (!authorized || !data) throw new Error('AUTH_REQUIRED');
  const s = summary(data, authorized);
  const lines = ['# Human Test Session Results Packet — iCareTele', NOTICE, 'Redacted labels only. SIMULATED fixtures excluded. Zero external calls. Nothing here starts a session or runs tests.', '',
    '## Missing hard prerequisites', ...(s.missing.length ? s.missing.map((p) => `- ${p}`) : ['- None missing']), '',
    '## Sessions',
    ...s.sessions.flatMap((x) => [`- ${x.label}: session ${x.session?.session_status ?? 'unavailable'} v${x.session?.session_version ?? 0}; authorized ${x.session?.authorized ? 'yes' : 'no'}; results passed ${x.counts.passed}/18, failed ${x.counts.failed}, blocked ${x.counts.blocked}, concern ${x.counts.concern}, unverified ${x.counts.unverified}`,
      ...(x.session?.suites ?? []).map((r) => `  - ${r.ord}. ${r.suite_key}: ${r.status} — ${r.reason}; expected "${r.expected}"; artifact ${r.artifact}; owner action ${r.blocker}; check ${r.check_id}; result v${r.record?.version ?? 'none'}; reviews ${[r.record?.review1, r.record?.review2].filter(Boolean).map((v) => `${v!.outcome} by ${v!.reviewer_role}`).join(', ') || 'none'}; correlation ${r.record?.correlation_id ?? 'none'}`)]),
    '', '## Dependent blockers (derived; never auto-closed)',
    ...s.blockers.map((b) => `- ${b.blocker}: ${b.state}; suites ${b.suites.join(', ')}; closure granted no`),
    '', '## Reconciliation',
    ...s.reconciliation.map((r) => `- ${r.register}: expected ${r.expected}, observed ${r.observed}, ${r.match ? 'consistent' : 'MISMATCH — ' + r.next_action}`)];
  const out = lines.join('\n');
  if (UNSAFE.test(out.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '').replace(/\d{4}-\d{2}-\d{2}T[0-9:.]+(Z|[+-][0-9:]+)?/g, ''))) throw new Error('REDACTION_FAILED');
  return out;
}

export const SIMULATED = [
  { label: 'SIMULATED authorized session with all suites passed', result: 'passed', canStartSession: false, canApprove: false, productionEvidence: false, outboundCalls: 0 },
  { label: 'SIMULATED result without an authorized session', result: 'blocked', canStartSession: false, canApprove: false, productionEvidence: false, outboundCalls: 0 },
  { label: 'SIMULATED self-reviewed passed result', result: 'unverified', canStartSession: false, canApprove: false, productionEvidence: false, outboundCalls: 0 },
  { label: 'SIMULATED withdrawn prerequisite result', result: 'reopened', canStartSession: false, canApprove: false, productionEvidence: false, outboundCalls: 0 },
] as const;

// Static integrity: every suite maps to a real artifact, owner-action blocker and verification check.
for (const s of SUITES) {
  if (!ARTIFACTS.some((a) => a.key === s.artifact)) throw new Error(`Unmapped artifact ${s.artifact}`);
  if (!BLOCKERS.some((b) => b.key === s.blocker)) throw new Error(`Unmapped blocker ${s.blocker}`);
  if (!CAMPAIGN.some((c) => c.id === s.check)) throw new Error(`Unmapped check ${s.check}`);
}
