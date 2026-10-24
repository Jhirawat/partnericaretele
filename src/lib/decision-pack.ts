// Final go-live decision pack: read-only executive consolidation of every register.
// Pure; never runs checks, never calls outside services, never auto-promotes to ready.
import { z } from 'zod';
import { CHECKS, READINESS_NOTICE, missingPrereqs, storedStatus, type Available, type StoredRun, type StoredResult } from './verification-campaign';
import { type GateRow, type GateStatus } from './publish-gate';
import { queueRows, type Entry as OwnerEntry } from './owner-action-queue';
import { prerequisiteRows, type Entry as PrereqEntry } from './production-test-readiness';
import { redact } from './seo-crawl';
import { unsafeText } from './release-evidence';

// ---- Final two-person sign-off records (db/0081); append-only, one row per signer per round. ----
export const signoffSchema = z.object({ id: z.uuid(), round: z.number().int().positive(), outcome: z.enum(['endorsed', 'concern']), signer_role: z.enum(['SUPER_ADMIN', 'OPERATIONS_ADMIN']), mine: z.boolean(), created_at: z.iso.datetime({ offset: true }), correlation_id: z.uuid() }).strict();
export const signoffsSchema = z.array(signoffSchema);
export type Signoff = z.infer<typeof signoffSchema>;
// Closed vocabulary, not free text: names, credentials and private documents cannot be persisted.
export const signSchema = z.object({ outcome: z.enum(['endorsed', 'concern']) }).strict();

/** Latest round only: a round completes with both roles endorsed and no concern; a concern closes it unresolved. */
export function signoffSummary(signoffs: readonly Signoff[] | null) {
  if (!signoffs || signoffs.length === 0) return { round: 0, concern: false, endorsedRoles: [] as string[], complete: false, readable: signoffs !== null };
  const round = Math.max(...signoffs.map((s) => s.round));
  const cur = signoffs.filter((s) => s.round === round);
  const concern = cur.some((s) => s.outcome === 'concern');
  const endorsedRoles = [...new Set(cur.filter((s) => s.outcome === 'endorsed').map((s) => s.signer_role))];
  return { round, concern, endorsedRoles, complete: !concern && endorsedRoles.includes('SUPER_ADMIN') && endorsedRoles.includes('OPERATIONS_ADMIN'), readable: true };
}

// ---- Cross-register consolidation ----
interface RegisterDef { key: string; label: string; group: string; checks: readonly string[]; gate: readonly string[]; gateSource: string; ownerActions: readonly string[] }
export const REGISTERS: readonly RegisterDef[] = [
  { key: 'seo_accessibility', label: 'Public SEO and accessibility readiness', group: 'Public routes, SEO and accessibility', checks: ['seo-public', 'seo-private-noindex', 'a11y-mobile', 'a11y-contrast'], gate: ['review:keyboard_focus', 'review:contrast', 'review:device_performance'], gateSource: 'Launch QA', ownerActions: [] },
  { key: 'content_claims', label: 'Content and claims review', group: 'Content and claims review', checks: ['content-review'], gate: ['content:register'], gateSource: '', ownerActions: ['clinic_facts', 'contact_details', 'pricing_terms', 'claims_review'] },
  { key: 'access_matrix', label: 'Access matrix audit', group: 'Role and route access', checks: ['matrix-live'], gate: ['access:register'], gateSource: '', ownerActions: ['superadmin_account', 'second_reviewer', 'preview_access'] },
  { key: 'verification_campaign', label: 'Unified verification campaign', group: 'All verification suites', checks: CHECKS.map((c) => c.id), gate: [], gateSource: '', ownerActions: [] },
  { key: 'campaign_history', label: 'Persistent campaign history', group: 'Permanent run history', checks: [], gate: ['signed-in'], gateSource: '', ownerActions: ['superadmin_account', 'preview_access'] },
  { key: 'test_prerequisites', label: 'Production test prerequisites', group: 'Production test prerequisites', checks: [], gate: [], gateSource: '', ownerActions: [] },
  { key: 'protection_evidence', label: 'Migration, RLS and storage evidence', group: 'Migration, RLS and storage', checks: ['protection-evidence'], gate: ['protection:register'], gateSource: '', ownerActions: ['protection_evidence'] },
  { key: 'backup_evidence', label: 'Backup and restore evidence', group: 'Backup and restore', checks: ['backup-evidence'], gate: ['backup:register'], gateSource: '', ownerActions: ['backup_evidence'] },
  { key: 'rollback_drill', label: 'Rollback drill', group: 'Rollback drill', checks: ['rollback-drill'], gate: [], gateSource: '', ownerActions: ['superadmin_account', 'preview_access'] },
  { key: 'privacy_retention', label: 'Privacy and retention', group: 'Privacy and retention', checks: ['privacy-retention'], gate: [], gateSource: '', ownerActions: ['superadmin_account', 'second_reviewer', 'preview_access'] },
  { key: 'reconciliation', label: 'Reconciliation', group: 'Reconciliation', checks: ['reconciliation'], gate: [], gateSource: '', ownerActions: ['superadmin_account', 'second_reviewer', 'preview_access'] },
  { key: 'notifications_outbox', label: 'Notifications and outbox disabled', group: 'Notifications and outbox', checks: ['outbox-disabled'], gate: [], gateSource: '', ownerActions: [] },
  { key: 'sla_controls', label: 'SLA controls', group: 'SLA controls', checks: ['sla-clock'], gate: [], gateSource: '', ownerActions: [] },
  { key: 'owner_action_queue', label: 'Owner action queue', group: 'Owner action queue', checks: [], gate: [], gateSource: '', ownerActions: [] },
] as const;
export type RegisterKey = (typeof REGISTERS)[number]['key'];
export interface RegisterRow { key: RegisterKey; label: string; checkGroup: string; status: GateStatus; reason: string; ownerRole: string; reviewerRole: string; nextAction: string; evidenceLabel: string; lastReviewed: string | null; ref: string | null; checks: readonly string[]; ownerActions: readonly string[] }

type Component = { status: GateStatus; reason: string; nextAction: string; at: string | null; ref: string | null };
const WORST: GateStatus[] = ['blocked', 'unverified', 'pending', 'passed'];
const worst = (cs: Component[]): Component => cs.reduce((a, b) => (WORST.indexOf(b.status) < WORST.indexOf(a.status) ? b : a));

/** Prerequisite availability derived only from independently confirmed prerequisite records. */
export function availabilityFromPrereqs(entries: readonly PrereqEntry[] | null, authorized: boolean, today?: string): Available {
  const rows = prerequisiteRows(entries ?? [], authorized, today);
  const has = (k: string) => rows.find((r) => r.key === k)?.status === 'available';
  return { signedIn: has('superadmin_account') && has('preview_access'), secondReviewer: has('second_reviewer'), manualEvidence: has('protection_evidence') && has('backup_evidence'), ownerFacts: has('content_review') };
}

function latestResults(runs: readonly StoredRun[]): Map<string, StoredResult> {
  const m = new Map<string, StoredResult>();
  for (const run of runs) for (const r of run.results) m.set(r.check_id, r);
  return m;
}

export interface PackInput { authorized: boolean; gate: GateRow[] | null; owner: readonly OwnerEntry[] | null; prereqs: readonly PrereqEntry[] | null; runs: readonly StoredRun[] | null; today?: string }

export function buildDecisionPack(input: PackInput): RegisterRow[] {
  const avail = availabilityFromPrereqs(input.prereqs, input.authorized, input.today);
  const results = input.runs === null ? null : latestResults(input.runs);
  const ownerRows = queueRows(input.owner ?? [], input.authorized, input.today);
  const prereqRows = prerequisiteRows(input.prereqs ?? [], input.authorized, input.today);
  const mapStatus = (s: string): GateStatus => (s === 'available' ? 'passed' : s === 'failed' ? 'blocked' : (s as GateStatus));
  return REGISTERS.map((reg) => {
    const cs: Component[] = [];
    if (input.gate === null) cs.push({ status: 'blocked', reason: 'Signed-in access unavailable: gate registers not read', nextAction: 'Sign in as a global Superadmin or Operations admin', at: null, ref: null });
    else for (const g of input.gate.filter((r) => reg.gate.includes(r.id) || (reg.gateSource !== '' && r.source === reg.gateSource))) cs.push({ status: g.status, reason: g.reason, nextAction: g.nextAction, at: null, ref: null });
    for (const id of reg.checks) {
      const ch = CHECKS.find((c) => c.id === id);
      if (!ch) continue;
      if (results === null) { cs.push({ status: input.authorized ? 'unverified' : 'blocked', reason: input.authorized ? 'Campaign history not recorded for this check' : 'Signed-in access unavailable: campaign history not read', nextAction: ch.expected, at: null, ref: null }); continue; }
      const r = results.get(id);
      if (!r) { cs.push({ status: 'unverified', reason: 'No campaign run recorded for this check', nextAction: 'Run the real check and record evidence', at: null, ref: null }); continue; }
      const miss = missingPrereqs(ch, avail);
      cs.push({ status: mapStatus(storedStatus(r, avail)), reason: miss.length ? `Missing: ${miss.join(', ')}` : r.next_action, nextAction: r.next_action, at: r.created_at, ref: r.correlation_id });
    }
    for (const key of reg.ownerActions) {
      const row = ownerRows.find((r) => r.key === key);
      if (row) cs.push({ status: mapStatus(row.status), reason: `Owner action ${row.status}`, nextAction: row.action, at: row.entry?.created_at ?? null, ref: row.entry?.correlation_id ?? null });
    }
    if (reg.key === 'test_prerequisites') for (const p of prereqRows) cs.push({ status: mapStatus(p.status), reason: `Prerequisite ${p.key} ${p.status}`, nextAction: p.action, at: p.entry?.created_at ?? null, ref: p.entry?.correlation_id ?? null });
    if (reg.key === 'owner_action_queue') for (const o of ownerRows) cs.push({ status: mapStatus(o.status), reason: `Queue item ${o.key} ${o.status}`, nextAction: o.action, at: o.entry?.created_at ?? null, ref: o.entry?.correlation_id ?? null });
    if (reg.key === 'campaign_history') {
      if (input.runs !== null && input.runs.length === 0) cs.push({ status: 'unverified', reason: 'No permanent campaign run recorded', nextAction: 'Record a real signed-in campaign run', at: null, ref: null });
      if (input.runs?.some((r) => r.simulated)) cs.push({ status: 'unverified', reason: 'Simulated runs never count as passed', nextAction: 'Record real signed-in results', at: null, ref: null });
    }
    if (cs.length === 0) cs.push({ status: 'unverified', reason: 'No source records', nextAction: 'Record evidence on the owning register', at: null, ref: null });
    const w = worst(cs);
    const dated = cs.map((c) => c.at).filter((x): x is string => x !== null).sort();
    return { key: reg.key, label: reg.label, checkGroup: reg.group, status: w.status, reason: redact(w.reason), ownerRole: 'SUPER_ADMIN', reviewerRole: 'OPERATIONS_ADMIN', nextAction: redact(w.nextAction), evidenceLabel: w.status === 'passed' ? 'Independent evidence review' : 'not recorded', lastReviewed: dated.at(-1) ?? null, ref: cs.map((c) => c.ref).filter((x): x is string => x !== null).at(-1) ?? null, checks: reg.checks, ownerActions: reg.ownerActions };
  });
}

export function packSummary(rows: readonly RegisterRow[]) {
  const count = (s: GateStatus) => rows.filter((r) => r.status === s).length;
  return { total: rows.length, passed: count('passed'), pending: count('pending'), blocked: count('blocked'), unverified: count('unverified'), open: rows.filter((r) => r.status !== 'passed'), productionReadyClaimed: false as const };
}

export type DecisionState = 'NOT READY' | 'READY FOR HUMAN REVIEW' | 'READY TO PUBLISH';
/** Never auto-promotes: READY TO PUBLISH requires every register passed AND both roles endorsed in the latest round with no concern. */
export function decisionState(rows: readonly RegisterRow[], signoffs: readonly Signoff[] | null, authorized: boolean): { state: DecisionState; reason: string } {
  if (!authorized) return { state: 'NOT READY', reason: 'Signed out or out of scope: registers cannot be read; nothing is assumed verified' };
  const open = rows.filter((r) => r.status !== 'passed');
  if (open.length) return { state: 'NOT READY', reason: `${open.length} of ${rows.length} registers not passed (${open[0]!.label}: ${open[0]!.status})` };
  const s = signoffSummary(signoffs);
  if (!s.complete) return { state: 'READY FOR HUMAN REVIEW', reason: s.concern ? 'A concern was recorded in the latest sign-off round' : 'All registers passed; final two-person sign-off outstanding' };
  return { state: 'READY TO PUBLISH', reason: 'Every register passed and a Superadmin and a different Operations admin endorsed the latest round; publishing remains a separate manual owner action' };
}

/** Redacted export. Throws REDACTION_FAILED if any unsafe text survives. */
export function decisionPackExport(rows: readonly RegisterRow[], decision: { state: DecisionState; reason: string }, signoffs: readonly Signoff[] | null, checklist: readonly string[], now = new Date()): string {
  const s = packSummary(rows);
  const so = signoffSummary(signoffs);
  // Timestamps and correlation IDs are validated formats, so they pass through untouched; everything else is redacted.
  const line = (r: RegisterRow) => '| ' + [r.label, r.checkGroup, r.status, r.reason, r.ownerRole, r.reviewerRole, r.nextAction, r.evidenceLabel].map((x) => redact(x).replace(/\|/g, '/')).concat([r.lastReviewed ?? 'not recorded', r.ref ?? 'none', r.checks.join(', ') || 'none', r.ownerActions.join(', ') || 'none']).join(' | ') + ' |';
  const out = ['# Final go-live decision pack — iCareTele', `Generated ${now.toISOString()}. ${READINESS_NOTICE}`, 'This pack does not approve publishing; it never auto-promotes to ready.', `Decision state: ${decision.state} — ${decision.reason}`, `Passed ${s.passed} · Pending ${s.pending} · Blocked ${s.blocked} · Unverified ${s.unverified} (total ${s.total})`, '', '| Register | Check group | Status | Blocker reason | Owner role | Reviewer role | Next action | Evidence label | Last reviewed | Reference | Checks | Owner actions |', '|---|---|---|---|---|---|---|---|---|---|---|---|', ...rows.map(line), '', '## Owner handoff checklist', ...checklist, '', '## Final two-person sign-off', `Round ${so.round || 'none'} · endorsed roles: ${so.endorsedRoles.join(', ') || 'none'} · concern: ${so.concern ? 'yes' : 'no'} · complete: ${so.complete ? 'yes' : 'no'}`, ...(signoffs ?? []).map((x) => `- Round ${x.round}: ${x.outcome} by ${x.signer_role} · ${x.created_at} · ${x.correlation_id}`)].join('\n');
  if (unsafeText(out.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, ''))) throw new Error('REDACTION_FAILED');
  return out;
}
