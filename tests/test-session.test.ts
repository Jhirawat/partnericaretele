import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { isPrivatePath } from '../src/lib/seo-crawl';
import { SESSION_SUITES, SUITE_KEYS, SUITE_PREREQS, suiteOwnerActions, suiteChecks, recordSchema, sessionSchema, startGate, sessionStatus, planWorkspace, workspaceSummary, simulatedPlan, sessionExport, type Session } from '../src/lib/test-session';
import { CHECKS } from '../src/lib/verification-campaign';
import { ITEMS } from '../src/lib/owner-action-queue';
import { PREREQUISITES, type Entry as PrereqEntry } from '../src/lib/production-test-readiness';

const id = '00000000-0000-4000-8000-000000000001';
const prereq = (key: string, status: 'available' | 'pending', confirmed: boolean): PrereqEntry => ({ id, key: key as PrereqEntry['key'], version: 1, status, owner_role: 'SUPER_ADMIN', required_action: 'Arrange global test account', evidence_label: 'Manual availability attestation', review_due: '2099-01-01', created_at: '2026-10-20T12:00:00Z', correlation_id: id, mine: false, latest: true, reviews: confirmed ? [{ outcome: 'confirmed', independent: true, mine: false, created_at: '2026-10-20T13:00:00Z', correlation_id: id }] : [] });
const session = (status: Session['status'], confirmed: boolean): Session => ({ id, suite_key: 'role_access', version: 1, campaign_version: 'v1', environment_label: 'Signed-in preview', status, owner_role: 'SUPER_ADMIN', reviewer_role: 'OPERATIONS_ADMIN', prerequisite_state: 'none missing', expected: 'Live behaviour matches the access matrix', blocker_reason: 'None', evidence_label: 'Owner handoff review', next_action: 'Plan the real signed-in run', created_at: '2026-10-20T12:00:00Z', correlation_id: id, mine: false, latest: true, reviews: confirmed ? [{ outcome: 'confirmed', independent: true, mine: false, created_at: '2026-10-20T13:00:00Z', correlation_id: id }] : [] });

test('eighteen suites cover every campaign check and only real prerequisites and owner actions', () => {
  expect(SESSION_SUITES).toHaveLength(18);
  const covered = new Set(SESSION_SUITES.flatMap((s) => [...s.checks]));
  expect(covered.size).toBe(CHECKS.length);
  for (const s of SESSION_SUITES) {
    for (const c of s.checks) expect(CHECKS.some((x) => x.id === c), `check ${c}`).toBe(true);
    for (const p of SUITE_PREREQS[s.key]) expect(PREREQUISITES.some((x) => x.key === p), `prerequisite ${p}`).toBe(true);
    for (const a of suiteOwnerActions(s.key)) expect(ITEMS.some((i) => i.key === a), `owner action ${a}`).toBe(true);
    expect(suiteChecks(s.key).length).toBe(s.checks.length);
  }
});

test('start gate opens only when every mapped prerequisite is independently confirmed available', () => {
  const need = SUITE_PREREQS.role_access.map((k) => prereq(k, 'available', true));
  expect(startGate('role_access', need, true).ready).toBe(true);
  expect(startGate('role_access', need.map((e, i) => (i === 0 ? prereq(e.key, 'pending', true) : e)), true).ready).toBe(false);
  expect(startGate('role_access', need.map((e) => prereq(e.key, 'available', false)), true).ready).toBe(false);
  expect(startGate('role_access', null, true).ready).toBe(false);
  expect(startGate('role_access', need, false).ready).toBe(false);
  expect(startGate('auth_guards', [], true).ready).toBe(true);
});

test('status honesty: signed-out blocks, rejected blocks, ready without independent confirmation stays unverified', () => {
  expect(sessionStatus(undefined, true)).toBe('unverified');
  expect(sessionStatus(session('ready', false), false)).toBe('blocked');
  expect(sessionStatus(session('ready', false), true)).toBe('unverified');
  expect(sessionStatus(session('ready', true), true)).toBe('ready');
  expect(sessionStatus({ ...session('ready', true), reviews: [{ outcome: 'rejected', independent: true, mine: false, created_at: '2026-10-20T13:00:00Z', correlation_id: id }] }, true)).toBe('blocked');
  expect(sessionStatus({ ...session('planned', false), latest: false }, true)).toBe('unverified');
});

test('planner counts are exact and never claim readiness', () => {
  const need = SESSION_SUITES.flatMap((s) => SUITE_PREREQS[s.key]);
  const entries = [...new Set(need)].map((k) => prereq(k, 'available', true));
  const rows = planWorkspace(entries, [session('ready', true)], true);
  expect(rows).toHaveLength(18);
  const s = workspaceSummary(rows);
  expect(s.ready).toBe(1); expect(s.unverified).toBe(17); expect(s.readinessClaimed).toBe(false);
  const signedOut = planWorkspace(null, null, false);
  expect(workspaceSummary(signedOut).blocked).toBe(18);
  expect(signedOut.every((r) => !r.gate.ready)).toBe(true);
});

test('simulated planning is labelled SIMULATED, separate and never recorded or passed', () => {
  const sim = simulatedPlan(new Date('2026-10-21T00:00:00Z'));
  expect(sim).toHaveLength(18);
  expect(sim.every((x) => x.simulated && x.status === 'unverified' && x.note.startsWith('SIMULATED'))).toBe(true);
  const rows = planWorkspace([], [], true);
  expect(rows.every((r) => r.session === undefined)).toBe(true);
});

test('session input is closed vocabulary and rejects sensitive or extra fields', () => {
  for (const bad of ['ops@example.com', 'https://x.test', 'token1234567890', 'approved']) {
    expect(recordSchema.safeParse({ suite: bad, status: 'planned', evidence: 'Owner handoff review' }).success).toBe(false);
    expect(recordSchema.safeParse({ suite: 'audit', status: bad, evidence: 'Owner handoff review' }).success).toBe(false);
  }
  expect(recordSchema.safeParse({ suite: 'audit', status: 'planned', evidence: 'Owner handoff review', note: 'secret' }).success).toBe(false);
  expect(sessionSchema.safeParse({ ...session('planned', false), recorder: id }).success).toBe(false);
});

test('export states no readiness claim, shows counts and history, and refuses unsafe text', () => {
  const rows = planWorkspace([], [session('planned', false)], true);
  const out = sessionExport(rows, [session('planned', false)]);
  expect(out).toContain('NOT claimed');
  expect(out).toContain('never runs it and never marks a check passed');
  expect(out).toContain('Append-only version history');
  expect(out).not.toMatch(/@|https?:\/\//);
  const toxic = [{ ...rows[0]!, expected: 'token value 1234567890' }];
  expect(() => sessionExport(toxic, [])).toThrow('REDACTION_FAILED');
});

test('private route, authenticated functions, no external calls, and links from all five pages', () => {
  expect(isPrivatePath('/test-session-workspace')).toBe(true);
  const route = readFileSync('src/routes/test-session-workspace.tsx', 'utf8');
  expect(route).toContain('noindex, nofollow');
  expect(route).toContain('sitemap: false');
  const fns = readFileSync('src/lib/test-session.functions.ts', 'utf8');
  expect(fns.match(/middleware\(\[requireSupabaseAuth\]\)/g)).toHaveLength(3);
  for (const file of ['src/routes/test-session-workspace.tsx', 'src/lib/test-session.functions.ts', 'src/lib/test-session.ts']) expect(readFileSync(file, 'utf8')).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|gtag|analytics\./i);
  expect(fns).not.toMatch(/\bpublish\(|deploy\(/i);
  for (const file of ['src/routes/golive-decision-pack.tsx', 'src/routes/verification-campaign.tsx', 'src/routes/_authenticated/production-test-readiness.tsx', 'src/routes/_authenticated/owner-action-queue.tsx', 'src/routes/publish-gate.tsx']) expect(readFileSync(file, 'utf8')).toContain('to="/test-session-workspace"');
  const sql = readFileSync('db/0082_test_session_workspace.sql', 'utf8');
  expect(sql).not.toMatch(/care_command\(|http_post|pg_net|ALTER TABLE public\.(?!test_sessions|test_session_reviews)/i);
  expect(sql).toContain('CAMPAIGN_NOT_RUNNABLE');
  expect(sql).toContain('PREREQUISITES_UNAVAILABLE');
});
