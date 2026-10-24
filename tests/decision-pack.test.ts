import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { isPrivatePath } from '../src/lib/seo-crawl';
import { REGISTERS, buildDecisionPack, packSummary, decisionState, signoffSummary, decisionPackExport, signoffSchema, signSchema, type Signoff, type RegisterRow } from '../src/lib/decision-pack';
import { CHECKS, type StoredRun } from '../src/lib/verification-campaign';
import { ITEMS } from '../src/lib/owner-action-queue';
import { buildGate } from '../src/lib/publish-gate';

const id = '00000000-0000-4000-8000-000000000001';
const baseRow: RegisterRow = { key: 'sla_controls', label: 'SLA controls', checkGroup: 'SLA controls', status: 'passed', reason: 'ok', ownerRole: 'SUPER_ADMIN', reviewerRole: 'OPERATIONS_ADMIN', nextAction: 'None', evidenceLabel: 'Independent evidence review', lastReviewed: '2026-10-20T12:00:00Z', ref: id, checks: ['sla-clock'], ownerActions: [] };
const allPassed: RegisterRow[] = REGISTERS.map((r) => ({ ...baseRow, key: r.key, label: r.label, checkGroup: r.group }));
const sign = (round: number, outcome: 'endorsed' | 'concern', role: 'SUPER_ADMIN' | 'OPERATIONS_ADMIN'): Signoff => ({ id, round, outcome, signer_role: role, mine: false, created_at: '2026-10-20T12:00:00Z', correlation_id: id });

test('fourteen registers cover every campaign check and only real owner actions', () => {
  expect(REGISTERS).toHaveLength(14);
  for (const r of REGISTERS) {
    for (const c of r.checks) expect(CHECKS.some((x) => x.id === c), `check ${c}`).toBe(true);
    for (const a of r.ownerActions) expect(ITEMS.some((i) => i.key === a), `owner action ${a}`).toBe(true);
  }
  const covered = new Set(REGISTERS.flatMap((r) => [...r.checks]));
  expect(covered.size).toBe(CHECKS.length);
});

test('signed-out consolidation blocks everything; empty records stay unverified', () => {
  const gate = buildGate({ checklist: null, acks: null, signedIn: false });
  const out = buildDecisionPack({ authorized: false, gate, owner: null, prereqs: null, runs: null });
  expect(out).toHaveLength(14);
  expect(out.every((r) => r.status !== 'passed')).toBe(true);
  expect(packSummary(out).open).toHaveLength(14);
  expect(packSummary(out).productionReadyClaimed).toBe(false);
  const authed = buildDecisionPack({ authorized: true, gate: buildGate({ checklist: null, acks: null, signedIn: true }), owner: [], prereqs: [], runs: [] });
  expect(authed.every((r) => r.status !== 'passed')).toBe(true);
  expect(authed.find((r) => r.key === 'campaign_history')?.status).toBe('unverified');
});

test('blocker counts are exact and the decision stays NOT READY while anything is open', () => {
  const s = packSummary(allPassed);
  expect(s.passed).toBe(14); expect(s.open).toHaveLength(0);
  const oneOpen = allPassed.map((r, i) => (i === 3 ? { ...r, status: 'unverified' as const, reason: 'gap' } : r));
  const s2 = packSummary(oneOpen);
  expect(s2.passed).toBe(13); expect(s2.unverified).toBe(1); expect(s2.open).toHaveLength(1);
  expect(decisionState(oneOpen, [], true).state).toBe('NOT READY');
  expect(decisionState(oneOpen, [], true).reason).toContain('1 of 14');
  expect(decisionState(allPassed, null, false).state).toBe('NOT READY');
});

test('decision never auto-promotes: two distinct roles in the latest round with no concern', () => {
  expect(decisionState(allPassed, [], true).state).toBe('READY FOR HUMAN REVIEW');
  expect(decisionState(allPassed, [sign(1, 'endorsed', 'SUPER_ADMIN')], true).state).toBe('READY FOR HUMAN REVIEW');
  expect(decisionState(allPassed, [sign(1, 'endorsed', 'SUPER_ADMIN'), sign(1, 'endorsed', 'OPERATIONS_ADMIN')], true).state).toBe('READY TO PUBLISH');
  expect(decisionState(allPassed, [sign(1, 'endorsed', 'SUPER_ADMIN'), sign(1, 'endorsed', 'OPERATIONS_ADMIN'), sign(1, 'concern', 'OPERATIONS_ADMIN')], true).state).toBe('READY FOR HUMAN REVIEW');
});

test('sign-off summary uses only the latest round and earlier rounds never complete it', () => {
  const old = [sign(1, 'endorsed', 'SUPER_ADMIN'), sign(1, 'endorsed', 'OPERATIONS_ADMIN')];
  expect(signoffSummary(old).complete).toBe(true);
  const reopened = [...old, sign(2, 'endorsed', 'SUPER_ADMIN')];
  const sum = signoffSummary(reopened);
  expect(sum.round).toBe(2); expect(sum.complete).toBe(false); expect(sum.endorsedRoles).toEqual(['SUPER_ADMIN']);
});

test('sign-off input is closed vocabulary and rejects sensitive or extra fields', () => {
  for (const bad of ['approved', 'passed', 'ready', '']) expect(signSchema.safeParse({ outcome: bad }).success).toBe(false);
  expect(signSchema.safeParse({ outcome: 'endorsed', note: 'ops@example.com' }).success).toBe(false);
  expect(signoffSchema.safeParse({ ...sign(1, 'endorsed', 'SUPER_ADMIN'), signer: id }).success).toBe(false);
  expect(signoffSchema.safeParse({ ...sign(1, 'endorsed', 'SUPER_ADMIN'), signer_role: 'PARTNER_OWNER' }).success).toBe(false);
});

test('export states no readiness claim, includes counts and sign-off section, and refuses unsafe text', () => {
  const out = decisionPackExport(allPassed, decisionState(allPassed, [], true), [sign(1, 'endorsed', 'SUPER_ADMIN')], ['- [ ] Arrange global test account']);
  expect(out).toContain('NOT claimed'); expect(out).toContain('READY FOR HUMAN REVIEW');
  expect(out).toContain('Passed 14'); expect(out).toContain('Final two-person sign-off');
  expect(out).not.toMatch(/@|https?:\/\//);
  const dirty = allPassed.map((r, i) => (i === 0 ? { ...r, reason: 'contact ops@example.com' } : r));
  const cleaned = decisionPackExport(dirty, decisionState(dirty, [], true), [], []);
  expect(cleaned).not.toContain('ops@example.com');
  expect(cleaned).toContain('[email]');
  const toxic = allPassed.map((r, i) => (i === 0 ? { ...r, reason: 'token value 1234567890' } : r));
  expect(() => decisionPackExport(toxic, decisionState(toxic, [], true), [], [])).toThrow('REDACTION_FAILED');
});

test('campaign run statuses feed registers honestly: simulated never passes', () => {
  const run: StoredRun = { id, run_no: 1, campaign_version: 'v1', label: 'Dry run', simulated: true, mine: false, correlation_id: id, created_at: '2026-10-20T12:00:00Z', results: CHECKS.map((c) => ({ id, check_id: c.id, suite: c.suite, scope: c.scope, prerequisite_state: 'none missing', expected: c.expected, status: 'unverified' as const, simulated: true, owner_role: 'SUPER_ADMIN', evidence_ref: 'Simulated', next_action: 'Run the real check', correlation_id: id, created_at: '2026-10-20T12:00:00Z', confirmations: [{ outcome: 'confirmed' as const, independent: true, mine: false, created_at: '2026-10-20T13:00:00Z', correlation_id: id }] })) };
  const gate = buildGate({ checklist: null, acks: null, signedIn: true });
  const out = buildDecisionPack({ authorized: true, gate, owner: [], prereqs: [], runs: [run] });
  const campaign = out.find((r) => r.key === 'verification_campaign')!;
  expect(campaign.status).not.toBe('passed');
  expect(out.find((r) => r.key === 'campaign_history')?.status).toBe('unverified');
});

test('private route, authenticated functions, no external calls, and links from all six pages', () => {
  expect(isPrivatePath('/golive-decision-pack')).toBe(true);
  const route = readFileSync('src/routes/golive-decision-pack.tsx', 'utf8');
  expect(route).toContain('noindex, nofollow');
  expect(route).toContain('sitemap: false');
  const fns = readFileSync('src/lib/decision-pack.functions.ts', 'utf8');
  expect(fns.match(/middleware\(\[requireSupabaseAuth\]\)/g)).toHaveLength(2);
  for (const file of ['src/routes/golive-decision-pack.tsx', 'src/lib/decision-pack.functions.ts', 'src/lib/decision-pack.ts']) expect(readFileSync(file, 'utf8')).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|gtag|analytics\./i);
  expect(readFileSync('src/lib/decision-pack.functions.ts', 'utf8')).not.toMatch(/\bpublish\(|deploy\(/i);
  for (const file of ['src/routes/publish-gate.tsx', 'src/routes/_authenticated/owner-action-queue.tsx', 'src/routes/verification-campaign.tsx', 'src/routes/_authenticated/production-test-readiness.tsx', 'src/routes/release-handoff.tsx', 'src/routes/release-runbook.tsx']) expect(readFileSync(file, 'utf8')).toContain('to="/golive-decision-pack"');
  const sql = readFileSync('db/0081_golive_decision_pack.sql', 'utf8');
  expect(sql).not.toMatch(/care_command\(|http_post|pg_net|ALTER TABLE public\.(?!decision_signoffs)/i);
});
