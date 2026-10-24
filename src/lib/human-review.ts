// Human review sign-off console: controlled final review surface. Pure; never publishes,
// never runs production tests and never auto-promotes a round.
import { z } from 'zod';
import { redact } from './seo-crawl';
import { unsafeText } from './release-evidence';
import { READINESS_NOTICE } from './verification-campaign';
import { packSummary, type RegisterRow } from './decision-pack';

// ---- Append-only round model (db/0084); status is derived server-side, never updated. ----
export const ROUND_STATUSES = ['open', 'approved', 'concern', 'closed'] as const;
export const DECISION_REASONS = {
  blockers_resolved: 'All hard blockers resolved',
  evidence_confirmed: 'Required evidence independently confirmed',
  prerequisites_available: 'All prerequisites available',
  concern_blocker_open: 'Concern: a hard blocker is still open',
  concern_evidence_unconfirmed: 'Concern: required evidence not independently confirmed',
  concern_prerequisite_missing: 'Concern: a prerequisite is not available',
  concern_scope: 'Concern: scope or role separation',
} as const;
export type DecisionReason = keyof typeof DECISION_REASONS;
const REASON_KEYS = Object.keys(DECISION_REASONS) as [DecisionReason, ...DecisionReason[]];

// Closed vocabulary only: no names, credentials, links or free text can be persisted.
export const roundSchema = z.object({ round: z.number().int().positive(), status: z.enum(ROUND_STATUSES), opened_at: z.iso.datetime({ offset: true }), mine: z.boolean(), correlation_id: z.uuid() }).strict();
export const reviewDecisionSchema = z.object({ id: z.uuid(), round: z.number().int().positive(), decision: z.enum(['approve', 'concern']), reason: z.enum(REASON_KEYS), reviewer_role: z.enum(['SUPER_ADMIN', 'OPERATIONS_ADMIN']), mine: z.boolean(), created_at: z.iso.datetime({ offset: true }), correlation_id: z.uuid() }).strict();
export const reviewConsoleSchema = z.object({ rounds: z.array(roundSchema), decisions: z.array(reviewDecisionSchema) }).strict();
export const decideSchema = z.object({ decision: z.enum(['approve', 'concern']), reason: z.enum(REASON_KEYS) }).strict();
export type ReviewRound = z.infer<typeof roundSchema>;
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;
export type ReviewConsole = z.infer<typeof reviewConsoleSchema>;

/** Latest round and its two-person state. Only the latest round can ever be decided. */
export function roundSummary(consoleData: ReviewConsole | null) {
  if (!consoleData || consoleData.rounds.length === 0) return { round: 0, status: 'none' as const, approvedRoles: [] as string[], concern: false, approved: false, mine: false, readable: consoleData !== null };
  const round = Math.max(...consoleData.rounds.map((r) => r.round));
  const cur = consoleData.rounds.find((r) => r.round === round)!;
  const decisions = consoleData.decisions.filter((d) => d.round === round);
  const approvedRoles = [...new Set(decisions.filter((d) => d.decision === 'approve').map((d) => d.reviewer_role))];
  const concern = decisions.some((d) => d.decision === 'concern');
  return { round, status: cur.status, approvedRoles, concern, approved: cur.status === 'approved', mine: cur.mine, readable: true };
}

/** Every open blocker, linked to the exact owner action and verification check that resolves it. */
export function approvalGaps(rows: readonly RegisterRow[]) {
  return rows.filter((r) => r.status !== 'passed').map((r) => ({ key: r.key, label: r.label, status: r.status, reason: r.reason, nextAction: r.nextAction, checks: r.checks, ownerActions: r.ownerActions }));
}

export type ReviewState = 'BLOCKED' | 'OPEN' | 'TWO-PERSON APPROVAL RECORDED';
/** Never auto-promotes: approval requires zero gaps AND both required roles approving the same latest round. */
export function reviewState(rows: readonly RegisterRow[], consoleData: ReviewConsole | null, authorized: boolean): { state: ReviewState; reason: string; gaps: ReturnType<typeof approvalGaps> } {
  const gaps = approvalGaps(rows);
  if (!authorized) return { state: 'BLOCKED', reason: 'Signed out or out of scope: no register or round is read; nothing is assumed verified', gaps };
  if (gaps.length) return { state: 'BLOCKED', reason: `${gaps.length} of ${rows.length} registers not passed; approval is impossible while any hard blocker is open`, gaps };
  const s = roundSummary(consoleData);
  if (!s.approved) return { state: 'OPEN', reason: s.concern ? 'A concern was recorded on the latest round; a new round is required' : 'All blockers resolved; two-person approval of the latest round is outstanding', gaps };
  return { state: 'TWO-PERSON APPROVAL RECORDED', reason: 'A Superadmin and a different Operations admin approved the latest round; publishing remains a separate manual owner action outside this console', gaps };
}

/** Redacted review packet. Throws REDACTION_FAILED if any unsafe text survives. */
export function humanReviewExport(rows: readonly RegisterRow[], state: { state: ReviewState; reason: string }, consoleData: ReviewConsole | null, checklist: readonly string[], now = new Date()): string {
  const s = packSummary(rows);
  const so = roundSummary(consoleData);
  const line = (r: RegisterRow) => '| ' + [r.label, r.checkGroup, r.status, r.reason, r.ownerRole, r.reviewerRole, r.nextAction].map((x) => redact(x).replace(/\|/g, '/')).concat([r.lastReviewed ?? 'not recorded', r.ref ?? 'none', r.checks.join(', ') || 'none', r.ownerActions.join(', ') || 'none']).join(' | ') + ' |';
  const out = ['# Human review sign-off packet — iCareTele', `Generated ${now.toISOString()}. ${READINESS_NOTICE}`, 'This console never publishes and never runs production tests; it never auto-promotes a round.', `Review state: ${state.state} — ${state.reason}`, `Passed ${s.passed} · Pending ${s.pending} · Blocked ${s.blocked} · Unverified ${s.unverified} (total ${s.total})`, '', '| Register | Check group | Status | Blocker reason | Owner role | Reviewer role | Next action | Last reviewed | Reference | Checks | Owner actions |', '|---|---|---|---|---|---|---|---|---|---|---|', ...rows.map(line), '', '## Publish owner handoff checklist', ...checklist, '', '## Sign-off rounds', `Latest round ${so.round || 'none'} · status: ${so.status} · approved roles: ${so.approvedRoles.join(', ') || 'none'}`, ...(consoleData?.rounds ?? []).map((r) => `- Round ${r.round}: ${r.status} · opened ${r.opened_at} · ${r.correlation_id}`), ...(consoleData?.decisions ?? []).map((d) => `- Round ${d.round}: ${d.decision} (${d.reason}) by ${d.reviewer_role} · ${d.created_at} · ${d.correlation_id}`)].join('\n');
  if (unsafeText(out.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, ''))) throw new Error('REDACTION_FAILED');
  return out;
}

/** Fictional walkthrough only; labelled SIMULATED and never able to approve anything. */
export const SIMULATED_EXAMPLE = { simulated: true as const, label: 'SIMULATED example — fictional reviewers on made-up data; cannot approve any real round', decisions: ['SIMULATED: a fictional Superadmin approves round 1 (blockers_resolved)', 'SIMULATED: a different fictional Operations admin approves round 1 (evidence_confirmed)', 'SIMULATED: both roles present, so a real console would show the round approved — this example changes nothing'] };
