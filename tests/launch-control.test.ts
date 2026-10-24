import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { isPrivatePath } from '../src/lib/seo-crawl';
import { CHECKLISTS, ENVIRONMENTS, ITEM_STATUSES, PHASES, REQUIRED_ACTIONS, ROLES, ROLLBACK_TRIGGERS, SIMULATED_EXAMPLE, STOP_CONDITIONS, WINDOWS, checklistStatus, controlStatus, itemGroup, itemsSchema, launchExport, recordSchema, confirmInputSchema, type Item } from '../src/lib/launch-control';
import { CHECKS, SUITES } from '../src/lib/verification-campaign';
import { ITEMS } from '../src/lib/owner-action-queue';
import { REGISTERS } from '../src/lib/decision-pack';

const id = '00000000-0000-4000-8000-000000000001';
const item = (over: Partial<Item> = {}): Item => ({ id, lineage: id, version: 1, checklist_group: 'dns_domain_seo', phase: 'preflight', release_candidate: 'Candidate label one', environment: 'preview', planned_window: 'unscheduled', rollback_trigger: 'none', status: 'ready', owner_role: 'SUPER_ADMIN', reviewer_role: 'OPERATIONS_ADMIN', evidence_ref: 'Preflight evidence label', required_action: 'Record preflight evidence for independent review', blocker_reason: null, review_date: '2026-10-20', correlation_id: id, created_at: '2026-10-20T12:00:00Z', mine: false, latest: true, reviews: [{ outcome: 'confirmed', independent: true, mine: false, created_at: '2026-10-20T12:00:00Z', correlation_id: id }], ...over });
const confirmed = CHECKLISTS.map((c) => item({ checklist_group: c.key }));

test('checklist coverage: fourteen distinct groups, each mapped to existing checks, owner actions and a register', () => {
  expect(CHECKLISTS).toHaveLength(14);
  expect(new Set(CHECKLISTS.map((c) => c.key)).size).toBe(14);
  for (const c of CHECKLISTS) {
    for (const k of c.checks) expect(CHECKS.some((x) => x.id === k)).toBe(true);
    for (const a of c.ownerActions) expect(ITEMS.some((i) => i.key === a)).toBe(true);
    expect(REGISTERS.some((r) => r.key === c.register)).toBe(true);
  }
  expect(SUITES).toContain('No external calls');
});

test('closed vocabulary only: groups, phases, environments, windows, triggers, statuses, roles and actions are fixed enums', () => {
  expect(PHASES).toEqual(['preflight', 'post_publish']);
  expect(ENVIRONMENTS).toEqual(['preview', 'production_candidate']);
  expect(WINDOWS).toEqual(['unscheduled', 'tentative', 'owner_confirmed']);
  expect(ROLLBACK_TRIGGERS).toEqual(['none', 'data_integrity', 'auth_regression', 'payment_error', 'privacy_breach', 'availability_loss']);
  expect(ITEM_STATUSES).toEqual(['planned', 'blocked', 'ready', 'complete']);
  expect(ROLES).toEqual(['SUPER_ADMIN', 'OPERATIONS_ADMIN']);
  expect(REQUIRED_ACTIONS).toHaveLength(4);
  const base = { lineage: null, group: 'dns_domain_seo', phase: 'preflight', candidate: 'Candidate label one', environment: 'preview', window: 'unscheduled', trigger: 'none', status: 'planned', owner: 'SUPER_ADMIN', reviewer: 'OPERATIONS_ADMIN', ref: 'Safe evidence label', action: REQUIRED_ACTIONS[0], blocker: null, date: null };
  for (const bad of [{ group: 'seo' }, { phase: 'live' }, { status: 'passed' }, { owner: 'PARTNER_OWNER' }, { action: 'Deploy now' }, { window: 'tomorrow' }, { trigger: 'vibes' }]) expect(recordSchema.safeParse({ ...base, ...bad }).success).toBe(false);
  expect(recordSchema.safeParse({ ...base, extra: 'x' }).success).toBe(false);
  expect(confirmInputSchema.safeParse({ id, outcome: 'approved' }).success).toBe(false);
  expect(confirmInputSchema.safeParse({ id, outcome: 'confirmed', note: 'free text' }).success).toBe(false);
});

test('secret rejection: candidate, evidence and blocker labels refuse emails, links, phone numbers, files and personal data', () => {
  const base = { lineage: null, group: 'backups', phase: 'preflight', environment: 'preview', window: 'unscheduled', trigger: 'none', status: 'planned', owner: 'SUPER_ADMIN', reviewer: 'OPERATIONS_ADMIN', action: REQUIRED_ACTIONS[0], blocker: null, date: null };
  for (const bad of ['ops@example.com', 'https://x.test/doc', '+66 81 234 5678', 'scan.pdf', 'passport copy', 'token 123456789012']) {
    expect(recordSchema.safeParse({ ...base, candidate: 'Candidate label one', ref: bad }).success).toBe(false);
    expect(recordSchema.safeParse({ ...base, candidate: bad, ref: 'Safe evidence label' }).success).toBe(false);
    expect(recordSchema.safeParse({ ...base, candidate: 'Candidate label one', ref: 'Safe evidence label', blocker: bad }).success).toBe(false);
  }
});

test('derived state: confirmation needs latest version, review date and an independent confirmation; recorded ready/complete alone never passes', () => {
  expect(itemGroup(item()).group).toBe('passed');
  expect(itemGroup(item({ latest: false })).group).toBe('unverified');
  expect(itemGroup(item({ reviews: [{ outcome: 'concern', independent: true, mine: false, created_at: '2026-10-20T12:00:00Z', correlation_id: id }] })).group).toBe('blocked');
  expect(itemGroup(item({ status: 'blocked', blocker_reason: 'Owner recorded a blocker' })).group).toBe('blocked');
  expect(itemGroup(item({ status: 'planned' })).group).toBe('unverified');
  expect(itemGroup(item({ review_date: null })).group).toBe('unverified');
  expect(itemGroup(item({ status: 'complete', reviews: [] })).group).toBe('pending');
  const self = item({ reviews: [{ outcome: 'confirmed', independent: false, mine: true, created_at: '2026-10-20T12:00:00Z', correlation_id: id }] });
  expect(itemGroup(self).group).toBe('pending');
});

test('post-publish plan stays unrun: post-publish items never derive to passed even with independent confirmation', () => {
  const post = item({ phase: 'post_publish', status: 'complete' });
  expect(itemGroup(post).group).toBe('pending');
  expect(itemGroup(post).reason).toContain('stays unrun');
  expect(checklistStatus('dns_domain_seo', [post], true).status).toBe('pending');
});

test('stale versions never count: a superseded confirmed item keeps the group open', () => {
  const stale = item({ latest: false });
  const fresh = item({ version: 2, reviews: [] });
  expect(checklistStatus('dns_domain_seo', [stale], true).status).toBe('unverified');
  expect(checklistStatus('dns_domain_seo', [stale, fresh], true).status).toBe('pending');
  expect(checklistStatus('dns_domain_seo', [stale, item({ version: 2 })], true).status).toBe('passed');
});

test('status honesty: signed-out blocks everything, counts are exact, readiness and publish are never claimed', () => {
  const w = controlStatus(null, false);
  expect(w.total).toBe(14); expect(w.blocked).toBe(14); expect(w.open).toHaveLength(14); expect(w.ready).toBe(false);
  const ok = controlStatus(confirmed, true);
  expect(ok.passed).toBe(14); expect(ok.blocked).toBe(0); expect(ok.ready).toBe(false);
  const partial = controlStatus(confirmed.slice(0, 13), true);
  expect(partial.passed).toBe(13); expect(partial.unverified).toBe(1); expect(partial.ready).toBe(false);
  expect(checklistStatus('credits', null, true).status).toBe('blocked');
});

test('rollback stop conditions: closed list covering data, auth, payment, privacy, availability and reviewer concern', () => {
  expect(STOP_CONDITIONS).toHaveLength(6);
  const joined = STOP_CONDITIONS.join(' ').toLowerCase();
  for (const word of ['data integrity', 'sign-in', 'credit or payment', 'privacy', 'availability', 'reviewer concern']) expect(joined).toContain(word);
  const out = launchExport([], true);
  expect(out).toContain('Rollback decision checklist');
  for (const s of STOP_CONDITIONS) expect(out).toContain(s);
});

test('export states no readiness claim, never claims the domain live, redacts unsafe text and throws on secrets that survive', () => {
  const out = launchExport(confirmed.slice(0, 3), true);
  expect(out).toContain('NOT claimed'); expect(out).toContain('NOT claimed live');
  expect(out).toContain('passed 3'); expect(out).toContain('unverified 11');
  expect(out).not.toMatch(/@|https?:\/\//);
  expect(launchExport([item({ evidence_ref: 'ask ops@example.com' })], true)).not.toContain('ops@example.com');
  expect(() => launchExport([item({ evidence_ref: 'token value 1234567890' })], true)).toThrow('REDACTION_FAILED');
});

test('simulated example is labelled SIMULATED and cannot confirm anything', () => {
  expect(SIMULATED_EXAMPLE.simulated).toBe(true);
  expect(SIMULATED_EXAMPLE.label).toContain('SIMULATED');
  expect(SIMULATED_EXAMPLE.steps.every((s) => s.startsWith('SIMULATED'))).toBe(true);
  expect(controlStatus([], true).passed).toBe(0);
});

test('private route, authenticated functions, no publish or deploy control, no external calls, links from all six pages', () => {
  expect(isPrivatePath('/launch-control')).toBe(true);
  const route = readFileSync('src/routes/launch-control.tsx', 'utf8');
  expect(route).toContain('noindex, nofollow');
  expect(route).toContain('sitemap: false');
  expect(route).toContain('SIMULATED');
  expect(route).not.toMatch(/>\s*(Publish|Deploy)\s*</);
  const fns = readFileSync('src/lib/launch-control.functions.ts', 'utf8');
  expect(fns.match(/middleware\(\[requireSupabaseAuth\]\)/g)).toHaveLength(3);
  for (const file of ['src/routes/launch-control.tsx', 'src/lib/launch-control.functions.ts', 'src/lib/launch-control.ts']) {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|gtag|analytics\./i);
    expect(src).not.toMatch(/\bpublish\(|deploy\(/i);
  }
  for (const file of ['src/routes/golive-decision-pack.tsx', 'src/routes/human-review-console.tsx', 'src/routes/release-runbook.tsx', 'src/routes/release-handoff.tsx', 'src/routes/_authenticated/owner-action-queue.tsx', 'src/routes/publish-gate.tsx']) expect(readFileSync(file, 'utf8')).toContain('to="/launch-control"');
  const sql = readFileSync('db/0088_launch_day_control.sql', 'utf8');
  expect(sql).not.toMatch(/care_command\(|http_post|pg_net/i);
  expect(sql).not.toMatch(/ALTER TABLE public\.(?!launch_control)/i);
  expect(itemsSchema.parse([item()])).toHaveLength(1);
});
