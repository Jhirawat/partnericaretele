// Production test session workspace: prepares the real signed-in campaign without running it.
// Pure; simulated planning is labelled SIMULATED and never counts as a real session.
import { z } from 'zod';
import { CHECKS, READINESS_NOTICE, type Check } from './verification-campaign';
import { prerequisiteRows, type Entry as PrereqEntry } from './production-test-readiness';
import { redact } from './seo-crawl';
import { unsafeText } from './release-evidence';

export const SESSION_SUITES = [
  { key: 'public_routes', label: 'Public routes', checks: ['seo-public', 'seo-private-noindex', 'a11y-mobile', 'a11y-contrast'], expected: 'Public pages load with unique accessible metadata' },
  { key: 'auth_guards', label: 'Auth guards', checks: ['redirect-signed-out'], expected: 'Signed-out visitors are sent to sign-in' },
  { key: 'role_access', label: 'Role access', checks: ['matrix-live', 'doctor-scope'], expected: 'Live behaviour matches the access matrix' },
  { key: 'isolation', label: 'Isolation', checks: ['isolation-tenant'], expected: "A partner never reads another partner's records" },
  { key: 'safety_gates', label: 'Safety gates', checks: ['screening-gates'], expected: 'No request without four PASS screening results' },
  { key: 'credit_lifecycle', label: 'Credit lifecycle', checks: ['credit-invariants'], expected: 'One reservation, one consumption, no negative balance' },
  { key: 'mcs_handoff', label: 'MCS handoff', checks: ['mcs-manual'], expected: 'Adapter stays in mock mode with no automatic calls' },
  { key: 'certificates', label: 'Certificates and private storage', checks: ['certificates-private'], expected: 'Certificate files stay private and need review' },
  { key: 'outbox', label: 'Notifications and outbox', checks: ['outbox-disabled'], expected: 'External delivery workers do nothing' },
  { key: 'sla', label: 'SLA', checks: ['sla-clock'], expected: 'Pauses and maintenance are excluded from SLA clocks' },
  { key: 'privacy', label: 'Privacy and retention', checks: ['privacy-retention'], expected: 'Privacy requests need independent approval with history kept' },
  { key: 'reconciliation', label: 'Reconciliation', checks: ['reconciliation'], expected: 'Adjustments are reporting-only and independently approved' },
  { key: 'audit', label: 'Audit', checks: ['audit-append-only'], expected: 'Audit rows cannot be edited or deleted' },
  { key: 'protection', label: 'Migration, RLS and storage', checks: ['protection-evidence'], expected: 'Recorded migration/RLS/storage evidence confirmed independently' },
  { key: 'backup', label: 'Backup and restore', checks: ['backup-evidence'], expected: 'Restore test recorded and confirmed independently' },
  { key: 'content', label: 'Content and claims', checks: ['content-review'], expected: 'Every content type acknowledged by a different reviewer' },
  { key: 'rollback', label: 'Rollback', checks: ['rollback-drill'], expected: 'Rollback drill runs on synthetic state only' },
  { key: 'no_external', label: 'No external calls', checks: ['no-external'], expected: 'No requests leave the site during checks' },
] as const;
export const SUITE_KEYS = SESSION_SUITES.map((s) => s.key) as [string, ...string[]];
export type SuiteKey = (typeof SESSION_SUITES)[number]['key'];

/** Prerequisite keys a suite depends on, mirroring public.test_session_prereqs. */
export const SUITE_PREREQS: Record<SuiteKey, readonly string[]> = {
  public_routes: ['protection_evidence', 'backup_evidence'],
  auth_guards: [],
  role_access: ['superadmin_account', 'preview_access'],
  isolation: ['superadmin_account', 'preview_access'],
  safety_gates: ['superadmin_account', 'preview_access'],
  credit_lifecycle: ['superadmin_account', 'preview_access'],
  mcs_handoff: [],
  certificates: ['superadmin_account', 'preview_access'],
  outbox: [],
  sla: [],
  privacy: ['superadmin_account', 'preview_access', 'second_reviewer'],
  reconciliation: ['superadmin_account', 'preview_access', 'second_reviewer'],
  audit: [],
  protection: ['protection_evidence', 'backup_evidence', 'second_reviewer'],
  backup: ['protection_evidence', 'backup_evidence', 'second_reviewer'],
  content: ['content_review', 'second_reviewer'],
  rollback: ['superadmin_account', 'preview_access'],
  no_external: [],
};
/** Owner action queue keys each prerequisite maps to (content review splits into the four fact/claims actions). */
export const OWNER_ACTIONS: Record<string, readonly string[]> = {
  superadmin_account: ['superadmin_account'], preview_access: ['preview_access'], second_reviewer: ['second_reviewer'],
  protection_evidence: ['protection_evidence'], backup_evidence: ['backup_evidence'],
  content_review: ['clinic_facts', 'contact_details', 'pricing_terms', 'claims_review'],
};
export function suiteOwnerActions(key: SuiteKey): readonly string[] { return [...new Set(SUITE_PREREQS[key].flatMap((p) => OWNER_ACTIONS[p] ?? []))]; }
export function suiteChecks(key: SuiteKey): Check[] { const s = SESSION_SUITES.find((x) => x.key === key)!; return s.checks.map((id) => CHECKS.find((c) => c.id === id)!).filter(Boolean); }

export const SESSION_STATUSES = ['planned', 'ready', 'active', 'paused', 'completed', 'blocked'] as const;
export const ENVIRONMENTS = ['Signed-in preview'] as const;
export const EVIDENCE_LABELS = ['Manual availability attestation', 'Owner handoff review', 'Independent evidence review'] as const;
// Closed vocabulary, not free text: names, credentials and private documents cannot be persisted.
export const recordSchema = z.object({ suite: z.enum(SUITE_KEYS), status: z.enum(SESSION_STATUSES), evidence: z.enum(EVIDENCE_LABELS) }).strict();
const reviewSchema = z.object({ outcome: z.enum(['confirmed', 'rejected']), independent: z.boolean(), mine: z.boolean(), created_at: z.iso.datetime({ offset: true }), correlation_id: z.uuid() }).strict();
export const sessionSchema = z.object({ id: z.uuid(), suite_key: z.enum(SUITE_KEYS), version: z.number().int().positive(), campaign_version: z.literal('v1'), environment_label: z.enum(ENVIRONMENTS), status: z.enum(SESSION_STATUSES), owner_role: z.enum(['SUPER_ADMIN', 'OPERATIONS_ADMIN']), reviewer_role: z.enum(['SUPER_ADMIN', 'OPERATIONS_ADMIN']), prerequisite_state: z.string(), expected: z.string(), blocker_reason: z.string(), evidence_label: z.enum(EVIDENCE_LABELS), next_action: z.string(), created_at: z.iso.datetime({ offset: true }), correlation_id: z.uuid(), mine: z.boolean(), latest: z.boolean(), reviews: z.array(reviewSchema) }).strict();
export const sessionsSchema = z.array(sessionSchema);
export type Session = z.infer<typeof sessionSchema>;

/** Missing prerequisite keys for a suite, from independently confirmed prerequisite records. */
export function missingSuitePrereqs(key: SuiteKey, entries: readonly PrereqEntry[], authorized: boolean, today?: string): string[] {
  const rows = prerequisiteRows(entries, authorized, today);
  return SUITE_PREREQS[key].filter((p) => rows.find((r) => r.key === p)?.status !== 'available');
}
/** Start gate: planned may become ready only when every mapped prerequisite is available. Never automatic. */
export function startGate(key: SuiteKey, entries: readonly PrereqEntry[] | null, authorized: boolean, today?: string): { ready: boolean; missing: readonly string[]; reason: string } {
  if (!authorized || entries === null) return { ready: false, missing: [...SUITE_PREREQS[key]], reason: 'Signed-out or out-of-scope access: prerequisites cannot be read, so nothing is assumed available' };
  const missing = missingSuitePrereqs(key, entries, authorized, today);
  return missing.length ? { ready: false, missing, reason: `Prerequisites unavailable: ${missing.join(', ')}` } : { ready: true, missing, reason: 'All mapped prerequisites available; a human may plan the real signed-in run' };
}

export type DisplayStatus = (typeof SESSION_STATUSES)[number] | 'unverified';
/** Honest display status: rejected or expired review blocks; ready without an independent confirmation stays unverified. */
export function sessionStatus(s: Session | undefined, authorized: boolean): DisplayStatus {
  if (!authorized) return 'blocked';
  if (!s || !s.latest) return 'unverified';
  if (s.reviews.some((r) => r.outcome === 'rejected')) return 'blocked';
  if (s.status === 'ready' && !s.reviews.some((r) => r.outcome === 'confirmed' && r.independent)) return 'unverified';
  return s.status;
}

export interface SuiteRow { key: SuiteKey; label: string; checks: readonly string[]; prerequisites: readonly string[]; ownerActions: readonly string[]; expected: string; missing: readonly string[]; gate: { ready: boolean; reason: string }; status: DisplayStatus; session: Session | undefined }
/** Read-only planner: combines the static suite plan with recorded sessions and prerequisite availability. */
export function planWorkspace(entries: readonly PrereqEntry[] | null, sessions: readonly Session[] | null, authorized: boolean, today?: string): SuiteRow[] {
  return SESSION_SUITES.map((s) => {
    const latest = sessions ? [...sessions].filter((x) => x.suite_key === s.key && x.latest).at(-1) : undefined;
    const gate = startGate(s.key, entries, authorized, today);
    return { key: s.key, label: s.label, checks: s.checks, prerequisites: SUITE_PREREQS[s.key], ownerActions: suiteOwnerActions(s.key), expected: s.expected, missing: gate.missing, gate, status: sessionStatus(latest, authorized), session: latest };
  });
}
export function workspaceSummary(rows: readonly SuiteRow[]) {
  const n = (s: DisplayStatus) => rows.filter((r) => r.status === s).length;
  return { total: rows.length, planned: n('planned'), ready: n('ready'), active: n('active'), paused: n('paused'), completed: n('completed'), blocked: n('blocked'), unverified: n('unverified'), openBlockers: rows.filter((r) => !r.gate.ready).length, readinessClaimed: false as const };
}

/** SIMULATED dry plan from fixtures only; never recorded and never counts as a real session. */
export function simulatedPlan(now = new Date()) {
  return SESSION_SUITES.map((s, i) => ({ suite: s.key, label: s.label, simulated: true as const, status: 'unverified' as const, note: 'SIMULATED from fixtures only; a real signed-in run plus independent review is required', timestamp: now.toISOString(), correlationId: `sim-${now.getTime().toString(36)}-${i}` }));
}

/** Redacted session handoff/export. Throws REDACTION_FAILED if any unsafe text survives. */
export function sessionExport(rows: readonly SuiteRow[], sessions: readonly Session[] | null, now = new Date()): string {
  const s = workspaceSummary(rows);
  const cell = (x: string) => redact(x).replace(/\|/g, '/');
  // Timestamps, versions and correlation IDs are validated formats, so they pass through untouched; everything else is redacted.
  const line = (r: SuiteRow) => '| ' + [r.label, r.checks.join(', '), r.prerequisites.join(', ') || 'none', r.ownerActions.join(', ') || 'none', r.expected, r.status, r.gate.reason, r.session?.evidence_label ?? 'not recorded', r.session?.blocker_reason ?? 'not recorded', r.session?.next_action ?? 'Plan the session'].map(cell).concat([r.session ? `v${r.session.version}` : 'none', r.session?.created_at ?? 'not recorded', r.session?.correlation_id ?? 'none']).join(' | ') + ' |';
  const out = ['# Production test session workspace — iCareTele', `Generated ${now.toISOString()}. ${READINESS_NOTICE}`, 'This workspace prepares the real signed-in campaign; it never runs it and never marks a check passed. Sessions start only by human action when every mapped prerequisite is available.', `Planned ${s.planned} · Ready ${s.ready} · Active ${s.active} · Paused ${s.paused} · Completed ${s.completed} · Blocked ${s.blocked} · Unverified ${s.unverified} (total ${s.total}) · Open blockers ${s.openBlockers}`, '', '| Suite | Checks | Prerequisites | Owner actions | Expected | Status | Gate | Evidence | Blocker | Next action | Version | Timestamp | Correlation ID |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|', ...rows.map(line), '', '## Append-only version history', ...(sessions ?? []).map((x) => `- ${x.suite_key} v${x.version}: ${x.status} · ${x.environment_label} · ${x.prerequisite_state} · ${x.blocker_reason} · ${x.created_at} · ${x.correlation_id}`)].join('\n');
  if (unsafeText(out.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, ''))) throw new Error('REDACTION_FAILED');
  return out;
}
