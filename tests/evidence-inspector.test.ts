import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { isPrivatePath } from '../src/lib/seo-crawl';
import { NEXT_ACTIONS, OBSERVED, READ_ONLY_NOTICE, REGISTERS, ROLES, RULES, SIMULATED_SUITE, confirmInputSchema, inspectorExport, inspectorStatus, itemGroup, itemsSchema, recordSchema, ruleStatus, type Item } from '../src/lib/evidence-inspector';
import { CHECKS } from '../src/lib/verification-campaign';
import { ITEMS } from '../src/lib/owner-action-queue';

const id = '00000000-0000-4000-8000-000000000001';
const item = (over: Partial<Item> = {}): Item => ({ id, lineage: id, version: 1, rule: 'append_only_versioning', register: 'backup_evidence', expected_result: 'Every version kept without edits', observed_status: 'passed', blocker_reason: null, owner_role: 'SUPER_ADMIN', reviewer_role: 'OPERATIONS_ADMIN', evidence_ref: 'Inspection evidence label', next_action: NEXT_ACTIONS[1], review_date: '2026-10-21', correlation_id: id, created_at: '2026-10-21T12:00:00Z', mine: false, latest: true, reviews: [{ outcome: 'confirmed', independent: true, mine: false, created_at: '2026-10-21T12:00:00Z', correlation_id: id }], ...over });
const confirmed = RULES.map((r) => item({ rule: r.key }));

test('rule coverage: fourteen rules over fourteen registers, each mapped to an existing owner action and verification check', () => {
  expect(RULES).toHaveLength(14);
  expect(new Set(RULES.map((r) => r.key)).size).toBe(14);
  expect(REGISTERS).toHaveLength(14);
  expect(new Set(REGISTERS).size).toBe(14);
  for (const r of RULES) {
    expect(r.registers.length).toBeGreaterThan(0);
    for (const g of r.registers) expect(REGISTERS).toContain(g);
    expect(ITEMS.some((i) => i.key === r.ownerAction)).toBe(true);
    expect(CHECKS.some((c) => c.id === r.check)).toBe(true);
  }
  for (const key of ['register_coverage', 'append_only_versioning', 'latest_version_selection', 'stale_version_rejection', 'reviewer_separation', 'role_mfa_scope', 'closed_vocabulary', 'redaction_secret_rejection', 'blocker_count_consistency', 'status_honesty', 'noindex_auth_guard', 'simulated_real_separation', 'no_outbound_calls', 'cross_register_links']) expect(RULES.some((r) => r.key === key)).toBe(true);
});

test('cross-register aggregation: every register is inspected by at least one rule', () => {
  for (const g of REGISTERS) expect(RULES.some((r) => (r.registers as readonly string[]).includes(g))).toBe(true);
});

test('closed vocabulary only: rules, registers, observed statuses, roles and next actions are fixed enums', () => {
  expect(OBSERVED).toEqual(['passed', 'pending', 'blocked', 'unverified']);
  expect(ROLES).toEqual(['SUPER_ADMIN', 'OPERATIONS_ADMIN']);
  expect(NEXT_ACTIONS).toHaveLength(4);
  const base = { lineage: null, rule: 'status_honesty', register: 'launch_control', expected: 'Statuses never auto-promote', observed: 'pending', blocker: null, owner: 'SUPER_ADMIN', reviewer: 'OPERATIONS_ADMIN', ref: 'Safe evidence label', action: NEXT_ACTIONS[0], date: null };
  for (const bad of [{ rule: 'hack' }, { register: 'everything' }, { observed: 'fixed' }, { owner: 'PARTNER_OWNER' }, { action: 'Approve now' }]) expect(recordSchema.safeParse({ ...base, ...bad }).success).toBe(false);
  expect(recordSchema.safeParse({ ...base, extra: 'x' }).success).toBe(false);
  expect(confirmInputSchema.safeParse({ id, outcome: 'approved' }).success).toBe(false);
  expect(confirmInputSchema.safeParse({ id, outcome: 'confirmed', note: 'free text' }).success).toBe(false);
});

test('secret rejection: evidence, expected and blocker labels refuse logs, URLs, emails, phones, credentials, medical wording and long numbers', () => {
  const base = { lineage: null, rule: 'redaction_secret_rejection', register: 'protection_evidence', expected: 'Only redacted labels persist', observed: 'blocked', blocker: null, owner: 'SUPER_ADMIN', reviewer: 'OPERATIONS_ADMIN', action: NEXT_ACTIONS[0], date: null };
  for (const bad of ['ops@example.com', 'https://logs.x.test/abc', '+66 81 234 5678', 'scan.pdf', 'patient record copy', 'token 123456789012', 'apikey sk_live_123456789012']) {
    expect(recordSchema.safeParse({ ...base, ref: bad }).success).toBe(false);
    expect(recordSchema.safeParse({ ...base, ref: 'Safe evidence label', blocker: bad }).success).toBe(false);
    expect(recordSchema.safeParse({ ...base, ref: 'Safe evidence label', expected: bad }).success).toBe(false);
  }
});

test('status honesty: only an independently confirmed latest passed observation passes; blocked is never auto-closed', () => {
  expect(itemGroup(item()).group).toBe('passed');
  expect(itemGroup(item({ observed_status: 'blocked' })).group).toBe('blocked');
  for (const s of ['pending', 'unverified'] as const) expect(itemGroup(item({ observed_status: s })).group).toBe('pending');
  expect(itemGroup(item({ latest: false })).group).toBe('unverified');
  expect(itemGroup(item({ reviews: [{ outcome: 'concern', independent: true, mine: false, created_at: '2026-10-21T12:00:00Z', correlation_id: id }] })).group).toBe('blocked');
  expect(itemGroup(item({ review_date: null })).group).toBe('unverified');
  expect(itemGroup(item({ reviews: [] })).group).toBe('pending');
  const self = item({ reviews: [{ outcome: 'confirmed', independent: false, mine: true, created_at: '2026-10-21T12:00:00Z', correlation_id: id }] });
  expect(itemGroup(self).group).toBe('pending');
});

test('stale versions never count: a superseded confirmed finding keeps the rule open', () => {
  const stale = item({ latest: false });
  expect(ruleStatus('append_only_versioning', [stale], true).status).toBe('unverified');
  expect(ruleStatus('append_only_versioning', [stale, item({ version: 2, reviews: [] })], true).status).toBe('pending');
  expect(ruleStatus('append_only_versioning', [stale, item({ version: 2 })], true).status).toBe('passed');
});

test('scope isolation and blocker honesty: signed-out blocks everything, counts are exact, readiness is never claimed', () => {
  const w = inspectorStatus(null, false);
  expect(w.total).toBe(14); expect(w.blocked).toBe(14); expect(w.open).toHaveLength(14); expect(w.ready).toBe(false);
  const ok = inspectorStatus(confirmed, true);
  expect(ok.passed).toBe(14); expect(ok.ready).toBe(false);
  const partial = inspectorStatus(confirmed.slice(0, 13), true);
  expect(partial.passed).toBe(13); expect(partial.unverified).toBe(1); expect(partial.ready).toBe(false);
  const concerned = inspectorStatus([item({ reviews: [{ outcome: 'concern', independent: true, mine: false, created_at: '2026-10-21T12:00:00Z', correlation_id: id }] }), ...confirmed.slice(1)], true);
  // append_only_versioning a deux constats (un concern, un passed) → bloquée ; register_coverage n'en a plus → non vérifiée.
  expect(concerned.blocked).toBe(1); expect(concerned.unverified).toBe(1); expect(concerned.passed).toBe(12); expect(concerned.ready).toBe(false);
  expect(READ_ONLY_NOTICE).toContain('never reads production business data');
  expect(READ_ONLY_NOTICE).toContain('no blocker is ever auto-closed');
});

test('simulated-only enforcement: the fixture suite is declarative fiction with safe and failing cases and zero outbound calls', () => {
  expect(SIMULATED_SUITE.simulated).toBe(true);
  expect(SIMULATED_SUITE.cases.some((c) => c.kind === 'safe')).toBe(true);
  expect(SIMULATED_SUITE.cases.some((c) => c.kind === 'failing')).toBe(true);
  expect(SIMULATED_SUITE.cases.every((c) => c.outboundCalls === 0 && c.case.startsWith('SIMULATED'))).toBe(true);
  expect(SIMULATED_SUITE.cases.every((c) => RULES.some((r) => r.key === c.rule))).toBe(true);
  expect(SIMULATED_SUITE.conclusion).toContain('never count as passed');
  for (const file of ['src/lib/evidence-inspector.ts', 'src/lib/evidence-inspector.functions.ts', 'src/routes/evidence-inspector.tsx']) {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|gtag|analytics\./i);
    expect(src).not.toMatch(/\bactivate\(|connect\(|publish\(|deploy\(|killSwitch/i);
  }
});

test('export states read-only scope and no readiness claim, gives exact counts, redacts and throws on surviving secrets', () => {
  const out = inspectorExport(confirmed.slice(0, 3), true);
  expect(out).toContain('never reads production business data'); expect(out).toContain('NOT claimed');
  expect(out).toContain('passed 3'); expect(out).toContain('unverified 11');
  expect(out).not.toMatch(/@|https?:\/\//);
  expect(inspectorExport([item({ evidence_ref: 'ask ops@example.com' })], true)).not.toContain('ops@example.com');
  expect(() => inspectorExport([item({ evidence_ref: 'token value 1234567890' })], true)).toThrow('REDACTION_FAILED');
});

test('private route, authenticated functions, no publish/deploy/external control, links from all six pages', () => {
  expect(isPrivatePath('/evidence-inspector')).toBe(true);
  const route = readFileSync('src/routes/evidence-inspector.tsx', 'utf8');
  expect(route).toContain('noindex, nofollow');
  expect(route).toContain('sitemap: false');
  expect(route).toContain('SIMULATED');
  expect(route).not.toMatch(/>\s*(Activate|Connect|Publish|Deploy|Notify|Kill switch)\s*</);
  const fns = readFileSync('src/lib/evidence-inspector.functions.ts', 'utf8');
  expect(fns.match(/middleware\(\[requireSupabaseAuth\]\)/g)).toHaveLength(3);
  for (const file of ['src/routes/golive-decision-pack.tsx', 'src/routes/human-review-console.tsx', 'src/routes/launch-control.tsx', 'src/routes/incident-console.tsx', 'src/routes/_authenticated/owner-action-queue.tsx', 'src/routes/publish-gate.tsx']) expect(readFileSync(file, 'utf8')).toContain('to="/evidence-inspector"');
  const sql = readFileSync('db/0092_evidence_integrity_inspector.sql', 'utf8');
  expect(sql).not.toMatch(/care_command\(|http_post|pg_net/i);
  expect(sql).not.toMatch(/ALTER TABLE public\.(?!evidence_inspector)/i);
  expect(itemsSchema.parse([item()])).toHaveLength(1);
});
