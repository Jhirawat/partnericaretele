import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { isPrivatePath } from '../src/lib/seo-crawl';
import { CATEGORIES, CHANGE_CONTROL_NOTICE, ENVIRONMENTS, ITEM_STATUSES, REQUIRED_ACTIONS, ROLES, SIMULATED_SIM, categoryStatus, confirmInputSchema, integrationExport, itemGroup, itemsSchema, recordSchema, registerStatus, type Item } from '../src/lib/integration-safety';
import { CHECKS } from '../src/lib/verification-campaign';
import { ITEMS } from '../src/lib/owner-action-queue';
import { CHECKLISTS } from '../src/lib/launch-control';

const id = '00000000-0000-4000-8000-000000000001';
const item = (over: Partial<Item> = {}): Item => ({ id, lineage: id, version: 1, category: 'payment', capability: 'Payment capability label', environment: 'preview', status: 'disabled', owner_role: 'SUPER_ADMIN', reviewer_role: 'OPERATIONS_ADMIN', evidence_ref: 'Disabled-state evidence label', required_action: 'Record disabled-state evidence for independent review', blocker_reason: null, review_date: '2026-10-20', correlation_id: id, created_at: '2026-10-20T12:00:00Z', mine: false, latest: true, reviews: [{ outcome: 'confirmed', independent: true, mine: false, created_at: '2026-10-20T12:00:00Z', correlation_id: id }], ...over });
const confirmed = CATEGORIES.map((c) => item({ category: c.key }));

test('category coverage: nine distinct categories, each mapped to existing checks, launch checklists and owner actions', () => {
  expect(CATEGORIES).toHaveLength(9);
  expect(new Set(CATEGORIES.map((c) => c.key)).size).toBe(9);
  for (const k of ['payment', 'email', 'sms', 'push_notifications', 'webhooks', 'analytics_tracking', 'mcs_clinical', 'storage', 'other_provider']) expect(CATEGORIES.some((c) => c.key === k)).toBe(true);
  for (const c of CATEGORIES) {
    for (const k of c.checks) expect(CHECKS.some((x) => x.id === k)).toBe(true);
    for (const l of c.launch) expect(CHECKLISTS.some((x) => x.key === l)).toBe(true);
    for (const a of c.ownerActions) expect(ITEMS.some((i) => i.key === a)).toBe(true);
  }
});

test('closed vocabulary only: categories, environments, statuses, roles and actions are fixed enums', () => {
  expect(ENVIRONMENTS).toEqual(['preview', 'production_candidate']);
  expect(ITEM_STATUSES).toEqual(['disabled', 'unconnected', 'blocked', 'approved']);
  expect(ROLES).toEqual(['SUPER_ADMIN', 'OPERATIONS_ADMIN']);
  expect(REQUIRED_ACTIONS).toHaveLength(4);
  const base = { lineage: null, category: 'payment', capability: 'Payment capability label', environment: 'preview', status: 'disabled', owner: 'SUPER_ADMIN', reviewer: 'OPERATIONS_ADMIN', ref: 'Safe evidence label', action: REQUIRED_ACTIONS[0], blocker: null, date: null };
  for (const bad of [{ category: 'stripe' }, { environment: 'live' }, { status: 'active' }, { owner: 'PARTNER_OWNER' }, { action: 'Connect now' }]) expect(recordSchema.safeParse({ ...base, ...bad }).success).toBe(false);
  expect(recordSchema.safeParse({ ...base, extra: 'x' }).success).toBe(false);
  expect(confirmInputSchema.safeParse({ id, outcome: 'approved' }).success).toBe(false);
  expect(confirmInputSchema.safeParse({ id, outcome: 'confirmed', note: 'free text' }).success).toBe(false);
});

test('secret rejection: capability, evidence and blocker labels refuse keys, tokens, links, emails, numbers and personal data', () => {
  const base = { lineage: null, category: 'email', environment: 'preview', status: 'unconnected', owner: 'SUPER_ADMIN', reviewer: 'OPERATIONS_ADMIN', action: REQUIRED_ACTIONS[0], blocker: null, date: null };
  for (const bad of ['ops@example.com', 'https://hooks.x.test/abc', '+66 81 234 5678', 'scan.pdf', 'passport copy', 'token 123456789012', 'apikey sk_live_123456789012']) {
    expect(recordSchema.safeParse({ ...base, capability: 'Capability label one', ref: bad }).success).toBe(false);
    expect(recordSchema.safeParse({ ...base, capability: bad, ref: 'Safe evidence label' }).success).toBe(false);
    expect(recordSchema.safeParse({ ...base, capability: 'Capability label one', ref: 'Safe evidence label', blocker: bad }).success).toBe(false);
  }
});

test('disabled-state enforcement: approved is never a disabled state and blocks launch safety even when confirmed', () => {
  expect(itemGroup(item({ status: 'approved' })).group).toBe('blocked');
  expect(itemGroup(item({ status: 'approved' })).reason).toContain('not a disabled state');
  expect(categoryStatus('payment', [item({ status: 'approved' })], true).status).toBe('blocked');
  const w = registerStatus([item({ status: 'approved' }), ...confirmed.slice(1)], true);
  expect(w.passed).toBe(8); expect(w.blocked).toBe(1); expect(w.approved).toBe(1); expect(w.ready).toBe(false);
});

test('derived state: confirmation needs latest version, review date and an independent confirmation; recorded state alone never passes', () => {
  expect(itemGroup(item()).group).toBe('passed');
  expect(itemGroup(item({ status: 'unconnected' })).group).toBe('passed');
  expect(itemGroup(item({ status: 'blocked' })).group).toBe('passed');
  expect(itemGroup(item({ latest: false })).group).toBe('unverified');
  expect(itemGroup(item({ reviews: [{ outcome: 'concern', independent: true, mine: false, created_at: '2026-10-20T12:00:00Z', correlation_id: id }] })).group).toBe('blocked');
  expect(itemGroup(item({ review_date: null })).group).toBe('unverified');
  expect(itemGroup(item({ reviews: [] })).group).toBe('pending');
  const self = item({ reviews: [{ outcome: 'confirmed', independent: false, mine: true, created_at: '2026-10-20T12:00:00Z', correlation_id: id }] });
  expect(itemGroup(self).group).toBe('pending');
});

test('stale versions never count: a superseded confirmed item keeps the category open', () => {
  const stale = item({ latest: false });
  expect(categoryStatus('payment', [stale], true).status).toBe('unverified');
  expect(categoryStatus('payment', [stale, item({ version: 2, reviews: [] })], true).status).toBe('pending');
  expect(categoryStatus('payment', [stale, item({ version: 2 })], true).status).toBe('passed');
});

test('status honesty: signed-out blocks everything, counts are exact, readiness and activation are never claimed', () => {
  const w = registerStatus(null, false);
  expect(w.total).toBe(9); expect(w.blocked).toBe(9); expect(w.open).toHaveLength(9); expect(w.ready).toBe(false);
  const ok = registerStatus(confirmed, true);
  expect(ok.passed).toBe(9); expect(ok.disabled).toBe(9); expect(ok.approved).toBe(0); expect(ok.ready).toBe(false);
  const partial = registerStatus(confirmed.slice(0, 8), true);
  expect(partial.passed).toBe(8); expect(partial.unverified).toBe(1); expect(partial.ready).toBe(false);
  expect(CHANGE_CONTROL_NOTICE).toContain('No provider may be activated from this page');
});

test('no outbound calls: the simulator is declarative fiction and the register modules contain no network code', () => {
  expect(SIMULATED_SIM.simulated).toBe(true);
  expect(SIMULATED_SIM.rows.every((r) => r.outboundCalls === 0)).toBe(true);
  expect(SIMULATED_SIM.conclusion).toContain('SIMULATED');
  for (const file of ['src/lib/integration-safety.ts', 'src/lib/integration-safety.functions.ts', 'src/routes/integration-safety.tsx']) {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|gtag|analytics\./i);
    expect(src).not.toMatch(/\bactivate\(|connect\(|publish\(|deploy\(/i);
  }
});

test('export states no connection and no readiness claim, gives exact disabled/blocked counts, redacts and throws on surviving secrets', () => {
  const out = integrationExport(confirmed.slice(0, 3), true);
  expect(out).toContain('No external service is connected'); expect(out).toContain('NOT claimed');
  expect(out).toContain('passed 3'); expect(out).toContain('unverified 6');
  expect(out).toContain('disabled 3'); expect(out).toContain('approved 0');
  expect(out).not.toMatch(/@|https?:\/\//);
  expect(integrationExport([item({ evidence_ref: 'ask ops@example.com' })], true)).not.toContain('ops@example.com');
  expect(() => integrationExport([item({ evidence_ref: 'token value 1234567890' })], true)).toThrow('REDACTION_FAILED');
});

test('simulator labelled SIMULATED and unable to approve anything', () => {
  expect(SIMULATED_SIM.label).toContain('SIMULATED');
  expect(SIMULATED_SIM.rows.every((r) => r.provider.startsWith('SIMULATED'))).toBe(true);
  expect(registerStatus([], true).passed).toBe(0);
});

test('private route, authenticated functions, no activation control, no external calls, links from all five pages', () => {
  expect(isPrivatePath('/integration-safety')).toBe(true);
  const route = readFileSync('src/routes/integration-safety.tsx', 'utf8');
  expect(route).toContain('noindex, nofollow');
  expect(route).toContain('sitemap: false');
  expect(route).toContain('SIMULATED');
  expect(route).not.toMatch(/>\s*(Activate|Connect|Publish|Deploy)\s*</);
  const fns = readFileSync('src/lib/integration-safety.functions.ts', 'utf8');
  expect(fns.match(/middleware\(\[requireSupabaseAuth\]\)/g)).toHaveLength(3);
  for (const file of ['src/routes/launch-control.tsx', 'src/routes/golive-decision-pack.tsx', 'src/routes/human-review-console.tsx', 'src/routes/release-handoff.tsx', 'src/routes/publish-gate.tsx']) expect(readFileSync(file, 'utf8')).toContain('to="/integration-safety"');
  const sql = readFileSync('db/0089_integration_provider_safety.sql', 'utf8');
  expect(sql).not.toMatch(/care_command\(|http_post|pg_net/i);
  expect(sql).not.toMatch(/ALTER TABLE public\.(?!integration_safety)/i);
  expect(itemsSchema.parse([item()])).toHaveLength(1);
});
