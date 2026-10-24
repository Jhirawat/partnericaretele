import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { isPrivatePath } from '../src/lib/seo-crawl';
import { CLASSES, ENVIRONMENTS, NO_CONTROL_NOTICE, REQUIRED_ACTIONS, ROLES, SCOPES, SEVERITIES, SIMULATED_SIM, STATUSES, STOP_CONDITION_KEYS, TRIGGERS, classStatus, confirmInputSchema, consoleStatus, escalationGate, incidentExport, itemGroup, itemsSchema, recordSchema, type Item } from '../src/lib/incident-console';
import { CHECKS } from '../src/lib/verification-campaign';
import { ITEMS } from '../src/lib/owner-action-queue';
import { CHECKLISTS } from '../src/lib/launch-control';
import { CATEGORIES } from '../src/lib/integration-safety';

const id = '00000000-0000-4000-8000-000000000001';
const item = (over: Partial<Item> = {}): Item => ({ id, lineage: id, version: 1, incident_class: 'data_integrity', severity: 'medium', trigger_category: 'monitoring_signal', affected_scope: 'protection_evidence', environment: 'preview', status: 'resolved', owner_role: 'SUPER_ADMIN', reviewer_role: 'OPERATIONS_ADMIN', evidence_ref: 'Containment evidence label', required_action: 'Record containment evidence for independent review', stop_condition: 'none', blocker_reason: null, review_date: '2026-10-21', correlation_id: id, created_at: '2026-10-21T12:00:00Z', mine: false, latest: true, reviews: [{ outcome: 'confirmed', independent: true, mine: false, created_at: '2026-10-21T12:00:00Z', correlation_id: id }], ...over });
const confirmed = CLASSES.map((c) => item({ incident_class: c.key }));

test('severity/trigger coverage: ten classes mapped to existing launch checklists, owner actions, integration categories and checks', () => {
  expect(CLASSES).toHaveLength(10);
  expect(new Set(CLASSES.map((c) => c.key)).size).toBe(10);
  expect(SEVERITIES).toEqual(['low', 'medium', 'high', 'critical']);
  expect(TRIGGERS).toHaveLength(6);
  expect(SCOPES).toEqual(CHECKLISTS.map((c) => c.key));
  for (const c of CLASSES) {
    for (const l of c.launch) expect(CHECKLISTS.some((x) => x.key === l)).toBe(true);
    for (const a of c.ownerActions) expect(ITEMS.some((i) => i.key === a)).toBe(true);
    for (const k of c.checks) expect(CHECKS.some((x) => x.id === k)).toBe(true);
    expect(CATEGORIES.some((x) => x.key === c.integration)).toBe(true);
  }
});

test('stop and rollback gates: high/critical with an active stop condition maps to the rollback gate; containment otherwise', () => {
  expect(escalationGate('high', 'data_integrity')).toBe('rollback_gate');
  expect(escalationGate('critical', 'privacy_breach')).toBe('rollback_gate');
  expect(escalationGate('high', 'none')).toBe('containment');
  expect(escalationGate('medium', 'data_integrity')).toBe('containment');
  expect(escalationGate('low', 'reviewer_concern')).toBe('containment');
  expect(STOP_CONDITION_KEYS).toContain('none');
});

test('closed vocabulary only: classes, severities, triggers, scopes, statuses, stop conditions, roles and actions are fixed enums', () => {
  expect(ENVIRONMENTS).toEqual(['preview', 'production_candidate']);
  expect(STATUSES).toEqual(['open', 'contained', 'rollback_recommended', 'resolved', 'closed']);
  expect(ROLES).toEqual(['SUPER_ADMIN', 'OPERATIONS_ADMIN']);
  expect(REQUIRED_ACTIONS).toHaveLength(4);
  const base = { lineage: null, incident_class: 'auth_access', severity: 'low', trigger: 'user_report', scope: 'auth_guards', environment: 'preview', status: 'open', owner: 'SUPER_ADMIN', reviewer: 'OPERATIONS_ADMIN', ref: 'Safe evidence label', action: REQUIRED_ACTIONS[0], stop: 'none', blocker: null, date: null };
  for (const bad of [{ incident_class: 'hack' }, { severity: 'severe' }, { trigger: 'guess' }, { scope: 'everything' }, { status: 'fixed' }, { owner: 'PARTNER_OWNER' }, { action: 'Kill switch now' }, { stop: 'maybe' }]) expect(recordSchema.safeParse({ ...base, ...bad }).success).toBe(false);
  expect(recordSchema.safeParse({ ...base, extra: 'x' }).success).toBe(false);
  expect(confirmInputSchema.safeParse({ id, outcome: 'approved' }).success).toBe(false);
  expect(confirmInputSchema.safeParse({ id, outcome: 'confirmed', note: 'free text' }).success).toBe(false);
});

test('secret rejection: evidence and blocker labels refuse logs, URLs, emails, phones, credentials, patient data and long numbers', () => {
  const base = { lineage: null, incident_class: 'privacy_retention', severity: 'high', trigger: 'reviewer_concern', scope: 'privacy_retention', environment: 'preview', status: 'open', owner: 'SUPER_ADMIN', reviewer: 'OPERATIONS_ADMIN', action: REQUIRED_ACTIONS[0], stop: 'privacy_breach', date: null };
  for (const bad of ['ops@example.com', 'https://logs.x.test/abc', '+66 81 234 5678', 'scan.pdf', 'patient record copy', 'token 123456789012', 'apikey sk_live_123456789012']) {
    expect(recordSchema.safeParse({ ...base, ref: bad, blocker: null }).success).toBe(false);
    expect(recordSchema.safeParse({ ...base, ref: 'Safe evidence label', blocker: bad }).success).toBe(false);
  }
});

test('status honesty: only resolved/closed with an independent confirmation passes; open, contained and rollback-recommended never do', () => {
  expect(itemGroup(item()).group).toBe('passed');
  expect(itemGroup(item({ status: 'closed' })).group).toBe('passed');
  for (const s of ['open', 'contained', 'rollback_recommended'] as const) expect(itemGroup(item({ status: s })).group).toBe('pending');
  expect(itemGroup(item({ latest: false })).group).toBe('unverified');
  expect(itemGroup(item({ reviews: [{ outcome: 'concern', independent: true, mine: false, created_at: '2026-10-21T12:00:00Z', correlation_id: id }] })).group).toBe('blocked');
  expect(itemGroup(item({ review_date: null })).group).toBe('unverified');
  expect(itemGroup(item({ reviews: [] })).group).toBe('pending');
  const self = item({ reviews: [{ outcome: 'confirmed', independent: false, mine: true, created_at: '2026-10-21T12:00:00Z', correlation_id: id }] });
  expect(itemGroup(self).group).toBe('pending');
});

test('stale versions never count: a superseded confirmed record keeps the class open', () => {
  const stale = item({ latest: false });
  expect(classStatus('data_integrity', [stale], true).status).toBe('unverified');
  expect(classStatus('data_integrity', [stale, item({ version: 2, reviews: [] })], true).status).toBe('pending');
  expect(classStatus('data_integrity', [stale, item({ version: 2 })], true).status).toBe('passed');
});

test('status honesty: signed-out blocks everything, counts are exact, readiness is never claimed', () => {
  const w = consoleStatus(null, false);
  expect(w.total).toBe(10); expect(w.blocked).toBe(10); expect(w.open).toHaveLength(10); expect(w.ready).toBe(false);
  const ok = consoleStatus(confirmed, true);
  expect(ok.passed).toBe(10); expect(ok.resolved).toBe(10); expect(ok.openIncidents).toBe(0); expect(ok.ready).toBe(false);
  const partial = consoleStatus(confirmed.slice(0, 9), true);
  expect(partial.passed).toBe(9); expect(partial.unverified).toBe(1); expect(partial.ready).toBe(false);
  const active = consoleStatus([item({ status: 'rollback_recommended', severity: 'critical' }), ...confirmed.slice(1)], true);
  expect(active.rollbackRecommended).toBe(1); expect(active.passed).toBe(9); expect(active.ready).toBe(false);
  expect(NO_CONTROL_NOTICE).toContain('never deploys');
});

test('synthetic-only enforcement: the simulator is declarative fiction and the modules contain no network or control code', () => {
  expect(SIMULATED_SIM.simulated).toBe(true);
  expect(SIMULATED_SIM.steps.every((s) => s.outboundCalls === 0 && s.step.startsWith('SIMULATED'))).toBe(true);
  expect(SIMULATED_SIM.conclusion).toContain('cannot resolve or approve anything');
  for (const file of ['src/lib/incident-console.ts', 'src/lib/incident-console.functions.ts', 'src/routes/incident-console.tsx']) {
    const src = readFileSync(file, 'utf8');
    expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|gtag|analytics\./i);
    expect(src).not.toMatch(/\bactivate\(|connect\(|publish\(|deploy\(|killSwitch/i);
  }
});

test('export states no control and no readiness claim, gives exact counts, redacts and throws on surviving secrets', () => {
  const out = incidentExport(confirmed.slice(0, 3), true);
  expect(out).toContain('never deploys'); expect(out).toContain('NOT claimed');
  expect(out).toContain('passed 3'); expect(out).toContain('unverified 7');
  expect(out).toContain('resolved 3'); expect(out).toContain('open 0');
  expect(out).toContain('rollback gate');
  expect(out).not.toMatch(/@|https?:\/\//);
  expect(incidentExport([item({ evidence_ref: 'ask ops@example.com' })], true)).not.toContain('ops@example.com');
  expect(() => incidentExport([item({ evidence_ref: 'token value 1234567890' })], true)).toThrow('REDACTION_FAILED');
});

test('private route, authenticated functions, no deploy/publish/kill-switch/notification control, links from all six pages', () => {
  expect(isPrivatePath('/incident-console')).toBe(true);
  const route = readFileSync('src/routes/incident-console.tsx', 'utf8');
  expect(route).toContain('noindex, nofollow');
  expect(route).toContain('sitemap: false');
  expect(route).toContain('SIMULATED');
  expect(route).not.toMatch(/>\s*(Activate|Connect|Publish|Deploy|Notify|Kill switch)\s*</);
  const fns = readFileSync('src/lib/incident-console.functions.ts', 'utf8');
  expect(fns.match(/middleware\(\[requireSupabaseAuth\]\)/g)).toHaveLength(3);
  for (const file of ['src/routes/launch-control.tsx', 'src/routes/release-runbook.tsx', 'src/routes/golive-decision-pack.tsx', 'src/routes/human-review-console.tsx', 'src/routes/integration-safety.tsx', 'src/routes/publish-gate.tsx']) expect(readFileSync(file, 'utf8')).toContain('to="/incident-console"');
  const sql = readFileSync('db/0090_incident_escalation_console.sql', 'utf8');
  expect(sql).not.toMatch(/care_command\(|http_post|pg_net/i);
  expect(sql).not.toMatch(/ALTER TABLE public\.(?!incident_console)/i);
  expect(itemsSchema.parse([item()])).toHaveLength(1);
});
