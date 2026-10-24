import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { isPrivatePath } from '../src/lib/seo-crawl';
import { APPROVAL_STATUSES, CANONICAL, CATEGORIES, REQUIRED_ACTIONS, ROLES, SIMULATED_EXAMPLE, SURFACES, UNLOCKS, approvalExport, approvalGroup, categoryStatus, entriesSchema, recordSchema, reviewInputSchema, workspaceStatus, type Entry } from '../src/lib/content-approval';
import { CHECKS, SUITES } from '../src/lib/verification-campaign';
import { ITEMS } from '../src/lib/owner-action-queue';
import { REGISTERS } from '../src/lib/decision-pack';

const id = '00000000-0000-4000-8000-000000000001';
const entry = (over: Partial<Entry> = {}): Entry => ({ id, lineage: id, version: 1, category: 'clinic_facts', surface: '/', canonical_source: 'available', status: 'available', owner_role: 'SUPER_ADMIN', reviewer_role: 'OPERATIONS_ADMIN', evidence_ref: 'Canonical source document reference', required_action: 'Record independent approval of canonical source', review_date: '2026-10-20', correlation_id: id, created_at: '2026-10-20T12:00:00Z', mine: false, latest: true, reviews: [{ outcome: 'approved', independent: true, mine: false, created_at: '2026-10-20T12:00:00Z', correlation_id: id }], ...over });
const approved = CATEGORIES.map((c) => entry({ category: c.key }));

test('category coverage: nine distinct categories, each mapped to an existing check, suite, owner action and sign-off register', () => {
  expect(CATEGORIES).toHaveLength(9);
  expect(new Set(CATEGORIES.map((c) => c.key)).size).toBe(9);
  for (const c of CATEGORIES) {
    expect(ITEMS.some((i) => i.key === c.ownerAction)).toBe(true);
  }
  expect(CHECKS.some((x) => x.id === UNLOCKS.check)).toBe(true);
  expect(SUITES).toContain(UNLOCKS.suite);
  expect(REGISTERS.some((r) => r.key === UNLOCKS.register)).toBe(true);
  expect(UNLOCKS.signoffReason).toBe('evidence_confirmed');
});

test('closed vocabulary only: categories, statuses, roles, actions and surfaces are fixed enums', () => {
  expect(APPROVAL_STATUSES).toEqual(['pending', 'available', 'blocked', 'unverified']);
  expect(CANONICAL).toEqual(['available', 'missing']);
  expect(ROLES).toEqual(['SUPER_ADMIN', 'OPERATIONS_ADMIN']);
  expect(SURFACES).toEqual(['/', '/partner-apply', '/care-demo', 'site-wide']);
  expect(REQUIRED_ACTIONS).toHaveLength(4);
  const base = { lineage: null, category: 'clinic_facts', surface: '/', canonical: 'available', status: 'pending', owner: 'SUPER_ADMIN', reviewer: 'OPERATIONS_ADMIN', ref: 'Safe evidence label', action: REQUIRED_ACTIONS[0], date: null };
  for (const bad of [{ category: 'facts' }, { status: 'passed' }, { status: 'approved' }, { owner: 'PARTNER_OWNER' }, { action: 'Call the clinic' }, { surface: '/admin' }]) expect(recordSchema.safeParse({ ...base, ...bad }).success).toBe(false);
  expect(recordSchema.safeParse({ ...base, extra: 'x' }).success).toBe(false);
  expect(reviewInputSchema.safeParse({ id, outcome: 'acknowledged' }).success).toBe(false);
  expect(reviewInputSchema.safeParse({ id, outcome: 'approved', note: 'free text' }).success).toBe(false);
});

test('secret rejection: evidence labels refuse emails, links, phone numbers, files and personal data', () => {
  const base = { lineage: null, category: 'pricing', surface: '/', canonical: 'available', status: 'pending', owner: 'SUPER_ADMIN', reviewer: 'OPERATIONS_ADMIN', action: REQUIRED_ACTIONS[0], date: null };
  for (const bad of ['ops@example.com', 'https://x.test/doc', '+66 81 234 5678', 'scan.pdf', 'passport copy', 'token 123456789012']) expect(recordSchema.safeParse({ ...base, ref: bad }).success).toBe(false);
});

test('derived state: approval needs latest version, canonical source, review date and an independent approval', () => {
  expect(approvalGroup(entry()).group).toBe('passed');
  expect(approvalGroup(entry({ latest: false })).group).toBe('unverified');
  expect(approvalGroup(entry({ reviews: [{ outcome: 'concern', independent: true, mine: false, created_at: '2026-10-20T12:00:00Z', correlation_id: id }] })).group).toBe('blocked');
  expect(approvalGroup(entry({ canonical_source: 'missing' })).group).toBe('blocked');
  expect(approvalGroup(entry({ review_date: null })).group).toBe('unverified');
  expect(approvalGroup(entry({ status: 'blocked' })).group).toBe('blocked');
  const self = entry({ reviews: [{ outcome: 'approved', independent: false, mine: true, created_at: '2026-10-20T12:00:00Z', correlation_id: id }] });
  expect(approvalGroup(self).group).toBe('pending');
  expect(approvalGroup(entry({ reviews: [] })).group).toBe('pending');
});

test('stale versions never count: a superseded approved entry keeps the category open', () => {
  const lineage = entry({ category: 'pricing' });
  const stale = { ...lineage, latest: false };
  const missing = entry({ category: 'pricing', version: 2, reviews: [] });
  expect(categoryStatus('pricing', [stale], true).status).toBe('unverified');
  expect(categoryStatus('pricing', [stale, missing], true).status).toBe('pending');
  expect(categoryStatus('pricing', [stale, entry({ category: 'pricing', version: 2 })], true).status).toBe('passed');
});

test('blocker mapping and honesty: signed-out blocks everything, counts are exact, readiness is never claimed', () => {
  const w = workspaceStatus(null, false);
  expect(w.total).toBe(9); expect(w.blocked).toBe(9); expect(w.open).toHaveLength(9); expect(w.ready).toBe(false);
  const ok = workspaceStatus(approved, true);
  expect(ok.passed).toBe(9); expect(ok.blocked).toBe(0); expect(ok.ready).toBe(false);
  const partial = workspaceStatus(approved.slice(0, 8), true);
  expect(partial.passed).toBe(8); expect(partial.unverified).toBe(1); expect(partial.ready).toBe(false);
  expect(categoryStatus('terms', null, true).status).toBe('blocked');
});

test('export states no readiness claim, redacts unsafe text and throws on secrets that survive', () => {
  const out = approvalExport(approved.slice(0, 3), true);
  expect(out).toContain('NOT claimed'); expect(out).toContain('never publishes');
  expect(out).toContain('passed 3'); expect(out).toContain('unverified 6');
  expect(out).not.toMatch(/@|https?:\/\//);
  const dirty = [entry({ evidence_ref: 'ask ops@example.com' })];
  expect(approvalExport(dirty, true)).not.toContain('ops@example.com');
  const toxic = [entry({ evidence_ref: 'token value 1234567890' })];
  expect(() => approvalExport(toxic, true)).toThrow('REDACTION_FAILED');
});

test('simulated example is labelled SIMULATED and cannot approve anything', () => {
  expect(SIMULATED_EXAMPLE.simulated).toBe(true);
  expect(SIMULATED_EXAMPLE.label).toContain('SIMULATED');
  expect(SIMULATED_EXAMPLE.steps.every((s) => s.startsWith('SIMULATED'))).toBe(true);
  expect(workspaceStatus([], true).passed).toBe(0);
});

test('private route, authenticated functions, no publish action, no external calls, links from all five pages', () => {
  expect(isPrivatePath('/content-approval')).toBe(true);
  const route = readFileSync('src/routes/content-approval.tsx', 'utf8');
  expect(route).toContain('noindex, nofollow');
  expect(route).toContain('sitemap: false');
  expect(route).toContain('SIMULATED');
  expect(route).not.toMatch(/>\s*Publish\s*</);
  const fns = readFileSync('src/lib/content-approval.functions.ts', 'utf8');
  expect(fns.match(/middleware\(\[requireSupabaseAuth\]\)/g)).toHaveLength(3);
  for (const file of ['src/routes/content-approval.tsx', 'src/lib/content-approval.functions.ts', 'src/lib/content-approval.ts']) {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|gtag|analytics\./i);
    expect(src).not.toMatch(/\bpublish\(|deploy\(/i);
  }
  for (const file of ['src/routes/content-review.tsx', 'src/routes/golive-decision-pack.tsx', 'src/routes/_authenticated/owner-action-queue.tsx', 'src/routes/human-review-console.tsx', 'src/routes/publish-gate.tsx']) expect(readFileSync(file, 'utf8')).toContain('to="/content-approval"');
  const sql = readFileSync('db/0086_content_approval_workspace.sql', 'utf8');
  expect(sql).not.toMatch(/care_command\(|http_post|pg_net/i);
  expect(sql).not.toMatch(/ALTER TABLE public\.(?!content_approval)/i);
  expect(entriesSchema.parse([entry()])).toHaveLength(1);
});
