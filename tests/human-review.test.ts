import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { isPrivatePath } from '../src/lib/seo-crawl';
import { ROUND_STATUSES, DECISION_REASONS, roundSchema, reviewDecisionSchema, reviewConsoleSchema, decideSchema, roundSummary, approvalGaps, reviewState, humanReviewExport, SIMULATED_EXAMPLE, type ReviewConsole, type ReviewRound, type ReviewDecision } from '../src/lib/human-review';
import { REGISTERS, type RegisterRow } from '../src/lib/decision-pack';
import { CHECKS } from '../src/lib/verification-campaign';
import { ITEMS } from '../src/lib/owner-action-queue';

const id = '00000000-0000-4000-8000-000000000001';
const baseRow: RegisterRow = { key: 'sla_controls', label: 'SLA controls', checkGroup: 'SLA controls', status: 'passed', reason: 'ok', ownerRole: 'SUPER_ADMIN', reviewerRole: 'OPERATIONS_ADMIN', nextAction: 'None', evidenceLabel: 'Independent evidence review', lastReviewed: '2026-10-20T12:00:00Z', ref: id, checks: ['sla-clock'], ownerActions: [] };
const allPassed: RegisterRow[] = REGISTERS.map((r) => ({ ...baseRow, key: r.key, label: r.label, checkGroup: r.group }));
const oneOpen = allPassed.map((r, i) => (i === 3 ? { ...r, status: 'blocked' as const, reason: 'gap' } : r));
const round = (n: number, status: ReviewRound['status'], mine = false): ReviewRound => ({ round: n, status, opened_at: '2026-10-20T12:00:00Z', mine, correlation_id: id });
const decision = (n: number, d: 'approve' | 'concern', role: 'SUPER_ADMIN' | 'OPERATIONS_ADMIN'): ReviewDecision => ({ id, round: n, decision: d, reason: d === 'approve' ? 'blockers_resolved' : 'concern_blocker_open', reviewer_role: role, mine: false, created_at: '2026-10-20T12:00:00Z', correlation_id: id });
const cons = (rounds: ReviewRound[], decisions: ReviewDecision[]): ReviewConsole => ({ rounds, decisions });

test('round and decision inputs are closed vocabulary and reject sensitive or extra fields', () => {
  expect(ROUND_STATUSES).toEqual(['open', 'approved', 'concern', 'closed']);
  expect(Object.keys(DECISION_REASONS)).toHaveLength(7);
  for (const bad of ['approved', 'passed', 'ready', '']) expect(decideSchema.safeParse({ decision: bad, reason: 'blockers_resolved' }).success).toBe(false);
  for (const bad of ['free text', 'ops@example.com', 'https://x.test', '']) expect(decideSchema.safeParse({ decision: 'approve', reason: bad }).success).toBe(false);
  expect(decideSchema.safeParse({ decision: 'approve', reason: 'blockers_resolved', note: 'x' }).success).toBe(false);
  expect(roundSchema.safeParse({ ...round(1, 'open'), opened_by: id }).success).toBe(false);
  expect(reviewDecisionSchema.safeParse({ ...decision(1, 'approve', 'SUPER_ADMIN'), reviewer: id }).success).toBe(false);
  expect(reviewDecisionSchema.safeParse({ ...decision(1, 'approve', 'SUPER_ADMIN'), reviewer_role: 'PARTNER_OWNER' }).success).toBe(false);
  expect(reviewConsoleSchema.safeParse(cons([round(1, 'open')], [decision(1, 'approve', 'SUPER_ADMIN')])).success).toBe(true);
});

test('round summary uses only the latest round; approval needs both roles and no concern', () => {
  expect(roundSummary(null).readable).toBe(false);
  expect(roundSummary(cons([], [])).round).toBe(0);
  expect(roundSummary(cons([round(1, 'open')], [decision(1, 'approve', 'SUPER_ADMIN')])).approved).toBe(false);
  expect(roundSummary(cons([round(1, 'approved')], [decision(1, 'approve', 'SUPER_ADMIN'), decision(1, 'approve', 'OPERATIONS_ADMIN')])).approved).toBe(true);
  expect(roundSummary(cons([round(1, 'concern')], [decision(1, 'approve', 'SUPER_ADMIN'), decision(1, 'concern', 'OPERATIONS_ADMIN')])).concern).toBe(true);
});

test('stale versions never approve: an earlier approved round does not count once a newer round exists', () => {
  const stale = cons([round(1, 'approved'), round(2, 'open')], [decision(1, 'approve', 'SUPER_ADMIN'), decision(1, 'approve', 'OPERATIONS_ADMIN')]);
  const s = roundSummary(stale);
  expect(s.round).toBe(2); expect(s.approved).toBe(false); expect(s.approvedRoles).toEqual([]);
  expect(reviewState(allPassed, stale, true).state).toBe('OPEN');
});

test('blocker gating: approval is impossible while any hard blocker is open and gaps link to exact resolvers', () => {
  expect(reviewState(oneOpen, cons([round(1, 'approved')], [decision(1, 'approve', 'SUPER_ADMIN'), decision(1, 'approve', 'OPERATIONS_ADMIN')]), true).state).toBe('BLOCKED');
  const st = reviewState(oneOpen, null, true);
  expect(st.reason).toContain('1 of 14');
  expect(st.gaps).toHaveLength(1);
  for (const g of approvalGaps(oneOpen)) {
    for (const c of g.checks) expect(CHECKS.some((x) => x.id === c)).toBe(true);
    for (const a of g.ownerActions) expect(ITEMS.some((i) => i.key === a)).toBe(true);
  }
  expect(reviewState(allPassed, null, false).state).toBe('BLOCKED');
  expect(reviewState(allPassed, cons([], []), true).state).toBe('OPEN');
  const ok = reviewState(allPassed, cons([round(1, 'approved')], [decision(1, 'approve', 'SUPER_ADMIN'), decision(1, 'approve', 'OPERATIONS_ADMIN')]), true);
  expect(ok.state).toBe('TWO-PERSON APPROVAL RECORDED');
  expect(ok.reason).toContain('separate manual owner action');
  expect(ok.reason).not.toMatch(/publish approved|auto/i);
});

test('simulated example is labelled SIMULATED and can never approve anything', () => {
  expect(SIMULATED_EXAMPLE.simulated).toBe(true);
  expect(SIMULATED_EXAMPLE.label).toContain('SIMULATED');
  expect(SIMULATED_EXAMPLE.decisions.every((d) => d.startsWith('SIMULATED'))).toBe(true);
  expect(reviewState(allPassed, cons([], []), true).state).toBe('OPEN');
});

test('export states no readiness claim, includes counts and rounds, and refuses unsafe text', () => {
  const st = reviewState(oneOpen, cons([round(1, 'open')], []), true);
  const out = humanReviewExport(oneOpen, st, cons([round(1, 'open')], [decision(1, 'approve', 'SUPER_ADMIN')]), ['- [ ] Arrange global test account']);
  expect(out).toContain('NOT claimed'); expect(out).toContain('BLOCKED');
  expect(out).toContain('Passed 13'); expect(out).toContain('Sign-off rounds');
  expect(out).not.toMatch(/@|https?:\/\//);
  const dirty = oneOpen.map((r, i) => (i === 0 ? { ...r, reason: 'contact ops@example.com' } : r));
  expect(humanReviewExport(dirty, reviewState(dirty, null, true), null, [])).not.toContain('ops@example.com');
  const toxic = oneOpen.map((r, i) => (i === 0 ? { ...r, reason: 'token value 1234567890' } : r));
  expect(() => humanReviewExport(toxic, reviewState(toxic, null, true), null, [])).toThrow('REDACTION_FAILED');
});

test('private route, authenticated functions, no publish action, no external calls, links from all five pages', () => {
  expect(isPrivatePath('/human-review-console')).toBe(true);
  const route = readFileSync('src/routes/human-review-console.tsx', 'utf8');
  expect(route).toContain('noindex, nofollow');
  expect(route).toContain('sitemap: false');
  expect(route).toContain('SIMULATED');
  const fns = readFileSync('src/lib/human-review.functions.ts', 'utf8');
  expect(fns.match(/middleware\(\[requireSupabaseAuth\]\)/g)).toHaveLength(3);
  for (const file of ['src/routes/human-review-console.tsx', 'src/lib/human-review.functions.ts', 'src/lib/human-review.ts']) {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|gtag|analytics\./i);
    expect(src).not.toMatch(/\bpublish\(|deploy\(/i);
  }
  for (const file of ['src/routes/golive-decision-pack.tsx', 'src/routes/test-session-workspace.tsx', 'src/routes/_authenticated/owner-action-queue.tsx', 'src/routes/publish-gate.tsx', 'src/routes/release-handoff.tsx']) expect(readFileSync(file, 'utf8')).toContain('to="/human-review-console"');
  const sql = readFileSync('db/0084_human_review_signoff.sql', 'utf8');
  expect(sql).not.toMatch(/care_command\(|http_post|pg_net/i);
  expect(sql).not.toMatch(/ALTER TABLE public\.(?!review_rounds|review_decisions)/i);
});
