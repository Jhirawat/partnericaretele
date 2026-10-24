import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { isPrivatePath } from '../src/lib/seo-crawl';
import { PREREQS, SIMULATED, authorizationPacket, canStart, missingInOrder, recordSchema, rowsSchema, summary, type Row } from '../src/lib/session-start-gate';
import { ITEMS } from '../src/lib/owner-action-queue';
import { ARTIFACTS } from '../src/lib/release-bundle';
import { CHECKS } from '../src/lib/verification-campaign';
import { KEYS as PREREQ_REGISTER } from '../src/lib/production-test-readiness';

const id = '00000000-0000-4000-8000-000000000001';
const row = (over: Partial<Row> = {}, rec: Partial<NonNullable<Row['record']>> | null = {}): Row => ({ key: 'primary-human-session', status: 'ready-for-start', reason: 'Explicit human start outstanding', missing: [], start_authorized: true, history: [], record: rec === null ? null : { id, version: 1, status: 'ready-for-start', suite_group: 'Full human verification campaign', environment_label: 'Signed-in preview', evidence_label: 'Independent session authorization review', blocker_reason: 'Independent review outstanding', next_action: 'Start session manually', source_validation_version: 0, owner_role: 'SUPER_ADMIN', mine: false, created_at: '2026-10-21T12:00:00Z', correlation_id: id, reviewed: true, review_outcome: 'confirmed', reviewer_role: 'OPERATIONS_ADMIN', ...rec }, ...over });
const pair = (a: Row) => [a, { ...row({}, null), key: 'follow-up-human-session' as const, status: 'unavailable' as const, start_authorized: false }];

test('seven prerequisites match the register and map to real actions, artifacts and checks', () => {
  expect(PREREQS.map((p) => p.key)).toEqual([...PREREQ_REGISTER]);
  for (const p of PREREQS) {
    expect(ITEMS.some((i) => i.key === p.ownerAction)).toBe(true);
    expect(ARTIFACTS.some((a) => a.key === p.artifact)).toBe(true);
    for (const c of p.checks) expect(CHECKS.some((x) => x.id === c)).toBe(true);
    expect(p.signoff.length).toBeGreaterThan(0);
  }
});

test('dependency ordering is preserved and signed-out treats all as missing', () => {
  expect(missingInOrder(undefined, false)).toHaveLength(7);
  const r = row({ missing: ['publish_owner', 'superadmin_account'] });
  expect(missingInOrder(r, true).map((p) => p.key)).toEqual(['superadmin_account', 'publish_owner']);
});

test('explicit start gate: only independently confirmed, prerequisite-complete, non-self latest version', () => {
  expect(canStart(row(), true)).toBe(true);
  expect(canStart(row(), false)).toBe(false);
  expect(canStart(row({ start_authorized: false }), true)).toBe(false);
  expect(canStart(row({ missing: ['backup_evidence'] }), true)).toBe(false);
  expect(canStart(row({}, { mine: true }), true)).toBe(false);
  expect(canStart(row({}, { status: 'in-progress' }), true)).toBe(false);
});

test('blocker honesty: signed-out blocks everything and readiness is never claimed', () => {
  const s = summary(null, false);
  expect(s.sessions.every((x) => x.status === 'blocked' && !x.canStart)).toBe(true);
  expect(s.missing).toHaveLength(7);
  expect(summary(pair(row()), true).readinessClaimed).toBe(false);
  expect(() => rowsSchema.parse([row()])).toThrow();
});

test('closed vocabulary rejects sensitive values, extra fields and inconsistent reasons', () => {
  const ok = { session: 'primary-human-session', version: 0, status: 'blocked', suite_group: 'Role and access suites', blocker_reason: 'Prerequisites unavailable', next_action: 'Confirm missing prerequisites', source_validation_version: 0 };
  expect(recordSchema.safeParse(ok).success).toBe(true);
  for (const bad of ['ops@example.com', 'https://x.test', 'token1234567890', 'SIMULATED']) for (const f of ['session', 'status', 'suite_group', 'blocker_reason', 'next_action']) expect(recordSchema.safeParse({ ...ok, [f]: bad }).success).toBe(false);
  expect(recordSchema.safeParse({ ...ok, note: 'x' }).success).toBe(false);
  expect(recordSchema.safeParse({ ...ok, status: 'ready-for-start' }).success).toBe(false);
  expect(rowsSchema.safeParse(pair(row({}, { recorder: id } as never))).success).toBe(false);
});

test('SIMULATED fixtures cannot start, approve or complete', () => {
  expect(SIMULATED.every((f) => f.label.startsWith('SIMULATED') && !f.canStart && !f.canApprove && !f.canComplete && !f.productionEvidence && f.outboundCalls === 0)).toBe(true);
});

test('authorization packet is redacted, signed-in only and states readiness not claimed', () => {
  expect(() => authorizationPacket(null, false)).toThrow('AUTH_REQUIRED');
  const out = authorizationPacket(pair(row()), true);
  expect(out).toContain('Production readiness is NOT claimed');
  expect(out).toContain('Handoff checklist');
  expect(out).not.toMatch(/@|https?:\/\//);
});

test('private route, authenticated functions, no publish or external calls, linked from seven pages', () => {
  expect(isPrivatePath('/session-start-gate')).toBe(true);
  const route = readFileSync('src/routes/session-start-gate.tsx', 'utf8');
  expect(route).toContain('noindex, nofollow');
  expect(route).toContain('sitemap: false');
  expect(route).not.toMatch(/<Button(?![^>]*asChild)[^>]*>(<[^>]+>)?\s*(Publish|Deploy|Activate|Run tests)/i);
  const fns = readFileSync('src/lib/session-start-gate.functions.ts', 'utf8');
  expect(fns.match(/middleware\(\[requireSupabaseAuth\]\)/g)).toHaveLength(3);
  for (const f of ['src/routes/session-start-gate.tsx', 'src/lib/session-start-gate.functions.ts', 'src/lib/session-start-gate.ts']) expect(readFileSync(f, 'utf8')).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|gtag|analytics\./i);
  for (const f of ['src/routes/_authenticated/production-test-readiness.tsx', 'src/routes/test-session-workspace.tsx', 'src/routes/validation-snapshot.tsx', 'src/routes/owner-action-closure.tsx', 'src/routes/human-review-console.tsx', 'src/routes/golive-decision-pack.tsx', 'src/routes/publish-gate.tsx']) expect(readFileSync(f, 'utf8')).toContain('to="/session-start-gate"');
  const sql = readFileSync('db/0099_session_start_gate.sql', 'utf8');
  expect(sql).not.toMatch(/care_command\(|http_post|pg_net/i);
  for (const k of ['PREREQUISITES_UNAVAILABLE', 'START_AUTHORIZATION_REQUIRED', 'ROLE_SEPARATION_REQUIRED', 'STALE_VERSION']) expect(sql).toContain(k);
});
