import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { isPrivatePath } from '../src/lib/seo-crawl';
import { NEXT_ACTIONS, REASONS, RESULT_LABELS, SESSION_KEYS, SIMULATED, STATUSES, SUITES, confirmSchema, consoleSchema, recordSchema, resultsPacket, reviewSlot, summary, type Console, type SuiteRow } from '../src/lib/session-results';
import { BLOCKERS } from '../src/lib/owner-closure';
import { ARTIFACTS } from '../src/lib/release-bundle';
import { CHECKS } from '../src/lib/verification-campaign';

const id = '00000000-0000-4000-8000-000000000001';
const ts = '2026-10-21T12:00:00Z';
const suiteRow = (i: number, over: Partial<SuiteRow> = {}, rec: Partial<NonNullable<SuiteRow['record']>> | null = null): SuiteRow => {
  const s = SUITES[i]!;
  return { ord: s.ord, suite_key: s.key, expected: s.expected, artifact: s.artifact, blocker: s.blocker, check_id: s.check, status: 'unverified', reason: 'Result not recorded', record: rec === null ? null : { id, version: 1, status: 'passed', result_label: 'Observed as expected', blocker_reason: 'No blocker recorded', next_action: 'No action required', evidence_label: 'Independent human session result review', environment_label: 'Signed-in preview', source_session_version: 2, owner_role: 'SUPER_ADMIN', mine: false, created_at: ts, correlation_id: id, review1: null, review2: null, ...rec }, ...over };
};
const fixture = (suites: SuiteRow[]): Console => ({ missing_prerequisites: [], sessions: SESSION_KEYS.map((k) => ({ session_key: k, session_status: 'in-progress', session_version: 2, authorized: true, suites, counts: { passed: suites.filter((s) => s.status === 'passed').length, failed: 0, blocked: 0, concern: 0, unverified: suites.filter((s) => s.status !== 'passed').length } })), dependent_blockers: [], reconciliation: [{ register: 'Owner action closure board', expected: 14, observed: 0, next_action: 'Reconcile counts before session completion', match: false }], readiness_claimed: false });
const allSuites = () => SUITES.map((_, i) => suiteRow(i));

test('eighteen suites in strict dependency order map to real artifacts, blockers and checks', () => {
  expect(SUITES.map((s) => s.ord)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
  expect(new Set(SUITES.map((s) => s.key)).size).toBe(18);
  for (const s of SUITES) {
    expect(ARTIFACTS.some((a) => a.key === s.artifact)).toBe(true);
    expect(BLOCKERS.some((b) => b.key === s.blocker)).toBe(true);
    expect(CHECKS.some((c) => c.id === s.check)).toBe(true);
    expect(s.expected.length).toBeGreaterThan(0);
  }
});

test('closed vocabulary rejects unsafe values, extra fields and failed-marked-as-passed', () => {
  const ok = { session: 'primary-human-session', suite: 'public_routes', version: 0, status: 'unverified', result_label: 'Not yet observed', blocker_reason: 'Result not recorded', next_action: 'Request independent review' };
  expect(recordSchema.safeParse(ok).success).toBe(true);
  for (const bad of ['ops@example.com', 'https://x.test', 'token1234567890', 'SIMULATED', 'Bearer abc']) for (const f of ['session', 'suite', 'status', 'result_label', 'blocker_reason', 'next_action']) expect(recordSchema.safeParse({ ...ok, [f]: bad }).success).toBe(false);
  expect(recordSchema.safeParse({ ...ok, note: 'x' }).success).toBe(false);
  expect(recordSchema.safeParse({ ...ok, status: 'failed', result_label: 'Observed as expected', blocker_reason: 'No blocker recorded' }).success).toBe(false);
  expect(recordSchema.safeParse({ ...ok, status: 'passed' }).success).toBe(false);
  expect(recordSchema.safeParse({ ...ok, status: 'passed', result_label: 'Observed as expected', blocker_reason: 'No blocker recorded' }).success).toBe(true);
});

test('console schema enforces two sessions of eighteen suites and never claims readiness', () => {
  expect(consoleSchema.safeParse(fixture(allSuites())).success).toBe(true);
  expect(consoleSchema.safeParse({ ...fixture(allSuites()), readiness_claimed: true }).success).toBe(false);
  expect(consoleSchema.safeParse({ ...fixture(allSuites()), sessions: fixture(allSuites()).sessions.slice(0, 1) }).success).toBe(false);
});

test('reviewer separation: recorder and slot-one reviewer cannot take another slot', () => {
  expect(reviewSlot(suiteRow(0, {}, {}))).toBe(1);
  expect(reviewSlot(suiteRow(0, {}, { mine: true }))).toBe(null);
  expect(reviewSlot(suiteRow(0, {}, { review1: { outcome: 'confirmed', reviewer_role: 'OPERATIONS_ADMIN', mine: false, created_at: ts, correlation_id: id } }))).toBe(2);
  expect(reviewSlot(suiteRow(0, {}, { review1: { outcome: 'confirmed', reviewer_role: 'OPERATIONS_ADMIN', mine: true, created_at: ts, correlation_id: id } }))).toBe(null);
  expect(reviewSlot(suiteRow(0, {}, null))).toBe(null);
  expect(confirmSchema.safeParse({ id, slot: 3, outcome: 'confirmed' }).success).toBe(false);
});

test('blocker honesty: signed-out blocks everything and readiness is never claimed', () => {
  const s = summary(null, false);
  expect(s.sessions).toHaveLength(2);
  expect(s.sessions.every((x) => x.counts.passed === 0 && x.counts.unverified === 18)).toBe(true);
  expect(s.readinessClaimed).toBe(false);
  const s2 = summary(fixture(allSuites()), true);
  expect(s2.readinessClaimed).toBe(false);
  expect(s2.mismatches).toHaveLength(1);
});

test('results packet is redacted, signed-in only and states readiness not claimed', () => {
  expect(() => resultsPacket(null, false)).toThrow('AUTH_REQUIRED');
  const out = resultsPacket(fixture(allSuites()), true);
  expect(out).toContain('Production readiness is NOT claimed');
  expect(out).toContain('MISMATCH');
  expect(out).not.toMatch(/@|https?:\/\//);
});

test('SIMULATED fixtures cannot start, approve or produce evidence', () => {
  expect(SIMULATED.length).toBeGreaterThanOrEqual(3);
  expect(SIMULATED.every((f) => f.label.startsWith('SIMULATED') && !f.canStartSession && !f.canApprove && !f.productionEvidence && f.outboundCalls === 0)).toBe(true);
});

test('vocabulary matches the database check constraints', () => {
  const sql = readFileSync('db/0100_session_results.sql', 'utf8');
  for (const v of [...STATUSES, ...RESULT_LABELS, ...REASONS, ...NEXT_ACTIONS, ...SUITES.map((s) => s.key), ...SUITES.map((s) => s.expected)]) expect(sql).toContain(`'${v.replace(/'/g, "''")}'`);
  for (const k of ['SESSION_NOT_AUTHORIZED', 'ORDER_REQUIRED', 'STALE_VERSION', 'SECOND_REVIEWER_REQUIRED', 'DUPLICATE_REVIEW', 'ROLE_SEPARATION_REQUIRED', 'PREREQUISITES_UNAVAILABLE']) expect(sql).toContain(k);
  expect(sql).not.toMatch(/http_post|pg_net/);
});

test('private route, authenticated functions, no publish controls or external calls, linked from nine pages', () => {
  expect(isPrivatePath('/session-results')).toBe(true);
  const route = readFileSync('src/routes/session-results.tsx', 'utf8');
  expect(route).toContain('noindex, nofollow');
  expect(route).toContain('sitemap: false');
  expect(route).not.toMatch(/<Button(?![^>]*asChild)[^>]*>(<[^>]+>)?\s*(Publish|Deploy|Activate|Run tests|Start session)/i);
  const fns = readFileSync('src/lib/session-results.functions.ts', 'utf8');
  expect(fns.match(/middleware\(\[requireSupabaseAuth\]\)/g)).toHaveLength(3);
  for (const f of ['src/routes/session-results.tsx', 'src/lib/session-results.functions.ts', 'src/lib/session-results.ts']) expect(readFileSync(f, 'utf8')).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|gtag|analytics\./i);
  for (const f of ['src/routes/session-start-gate.tsx', 'src/routes/_authenticated/production-test-readiness.tsx', 'src/routes/test-session-workspace.tsx', 'src/routes/validation-snapshot.tsx', 'src/routes/release-evidence-bundle.tsx', 'src/routes/owner-action-closure.tsx', 'src/routes/human-review-console.tsx', 'src/routes/golive-decision-pack.tsx', 'src/routes/publish-gate.tsx']) expect(readFileSync(f, 'utf8')).toContain('to="/session-results"');
});
