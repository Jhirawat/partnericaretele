import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { Input } from '../src/lib/golive-evidence-matrix';
import { assemblePacket, packetExport, packetConsoleSchema, decideSchema, sectionStatus, SIMULATED_EXAMPLE, NOTICE, type PacketConsole } from '../src/lib/human-review-packet';
import { PRIVATE_PREFIXES } from '../src/lib/seo';
import { ARTIFACTS } from '../src/lib/release-bundle';
import { BLOCKERS } from '../src/lib/owner-closure';
import { CHECKS } from '../src/lib/validation-snapshot';
import { SESSION_KEYS, SUITES } from '../src/lib/session-results';
import { PREREQ_KEYS } from '../src/lib/session-start-gate';
const fixture = (): Input => ({
 bundle: { sources: ARTIFACTS.map(a => ({ register: a.key, fingerprint: 'a'.repeat(32), source_count: 0, source_version: 0, status: 'unverified', reason: 'Missing artifact' })), snapshots: [] },
 ledger: { events: [], current: BLOCKERS.map(b => ({ key: b.key, status: 'open', eligible: false, reasons: ['Action version not recorded'], record: null, last_reviewed: null })) },
 validation: CHECKS.map(c => ({ key: c.key, status: 'unverified', reason: 'Evidence not recorded', record: null, last_reviewed: null })),
 gate: SESSION_KEYS.map(key => ({ key, status: 'unavailable', reason: 'Prerequisites unavailable', missing: [...PREREQ_KEYS], start_authorized: false, history: [], record: null })),
 results: { missing_prerequisites: [...PREREQ_KEYS], sessions: SESSION_KEYS.map(session_key => ({ session_key, session_status: 'unavailable', session_version: 0, authorized: false, suites: SUITES.map(s => ({ ord: s.ord, suite_key: s.key, expected: s.expected, artifact: s.artifact, blocker: s.blocker, check_id: s.check, status: 'unverified', reason: 'Result not recorded', record: null })), counts: { passed: 0, failed: 0, blocked: 0, concern: 0, unverified: 18 } })), dependent_blockers: [], reconciliation: [{ register: 'Owner action closure board', expected: 14, observed: 0, next_action: 'Reconcile counts before session completion', match: false }], readiness_claimed: false },
 review: { rounds: [], decisions: [] }, readiness_claimed: false,
});
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const T = '2026-10-21T10:00:00.000Z';
const pc = (over: Partial<PacketConsole> = {}): PacketConsole => ({ current: { open_blockers: 14, open_prerequisites: 7, unpassed_artifacts: 20 }, versions: [{ packet_version: 1, current: true, open_blockers: 14, open_prerequisites: 7, unpassed_artifacts: 20, opener_role: 'SUPER_ADMIN', mine: false, created_at: T, correlation_id: U(1) }], decisions: [], readiness_claimed: false, ...over });
test('latest-version aggregation is deterministic and covers every section group', () => {
  const a = fixture(), first = assemblePacket(a, pc(), true);
  a.bundle.sources.reverse(); a.ledger.current.reverse(); a.validation.reverse();
  expect(assemblePacket(a, pc(), true).sections).toEqual(first.sections);
  expect(first.sections.filter(s => s.group === 'Blocker groups')).toHaveLength(14);
  expect(first.sections.filter(s => s.group === 'Session prerequisites')).toHaveLength(7);
  expect(first.sections.filter(s => s.group === 'Validation suites')).toHaveLength(12);
  expect(first.sections.filter(s => s.group === 'Evidence artifacts')).toHaveLength(20);
  expect(first.packetVersion).toBe(1);
});
test('blocker and prerequisite honesty: signed-out counts all open and nothing passes', () => {
  const p = assemblePacket(null, null, false);
  expect([p.openBlockers, p.openPrerequisites, p.unpassedArtifacts]).toEqual([14, 7, 20]);
  expect(p.state).toBe('BLOCKED'); expect(p.canApprove).toBe(false); expect(p.sections.every(s => s.status !== 'passed')).toBe(true);
  expect(p.readinessClaimed).toBe(false);
});
test('approval impossible while any hard blocker remains, even with two approvals recorded', () => {
  const c = pc({ decisions: [{ id: U(2), packet_version: 1, decision: 'approve', reason: 'blockers_resolved', reviewer_role: 'SUPER_ADMIN', mine: false, created_at: T, correlation_id: U(3) }, { id: U(4), packet_version: 1, decision: 'approve', reason: 'evidence_confirmed', reviewer_role: 'OPERATIONS_ADMIN', mine: false, created_at: T, correlation_id: U(5) }] });
  const p = assemblePacket(fixture(), c, true); expect(p.state).toBe('BLOCKED'); expect(p.canApprove).toBe(false);
});
test('conflicts are displayed: stale version, concern and count mismatch', () => {
  const c = pc({ current: { open_blockers: 3, open_prerequisites: 7, unpassed_artifacts: 20 }, versions: [{ ...pc().versions[0], current: false }], decisions: [{ id: U(2), packet_version: 1, decision: 'concern', reason: 'concern_scope', reviewer_role: 'OPERATIONS_ADMIN', mine: false, created_at: T, correlation_id: U(3) }] });
  const p = assemblePacket(fixture(), c, true);
  expect(p.conflicts).toContain('Blocker count mismatch between packet and closure board');
  expect(p.conflicts).toContain('Latest packet version is stale: source evidence changed after it was opened');
  expect(p.conflicts).toContain('A concern was recorded on the latest packet version');
});
test('self-review is never offered client-side; server owns separation', () => {
  const zero = { open_blockers: 0, open_prerequisites: 0, unpassed_artifacts: 0 };
  const c = pc({ current: zero, versions: [{ ...pc().versions[0], ...zero, mine: true }] });
  expect(assemblePacket(fixture(), c, true).canApprove).toBe(false);
});
test('decision schema rejects mismatched, free-text and unknown reasons', () => {
  expect(decideSchema.safeParse({ packet_version: 1, decision: 'approve', reason: 'concern_scope' }).success).toBe(false);
  expect(decideSchema.safeParse({ packet_version: 1, decision: 'concern', reason: 'https://x.example' }).success).toBe(false);
  expect(decideSchema.safeParse({ packet_version: 1, decision: 'concern', reason: 'concern_scope', note: 'a@b.co' }).success).toBe(false);
  expect(decideSchema.safeParse({ packet_version: 1, decision: 'concern', reason: 'concern_scope' }).success).toBe(true);
});
test('console schema rejects identities, out-of-range counts and readiness claims', () => {
  expect(packetConsoleSchema.safeParse({ ...pc(), readiness_claimed: true }).success).toBe(false);
  expect(packetConsoleSchema.safeParse({ ...pc(), current: { open_blockers: 99, open_prerequisites: 7, unpassed_artifacts: 20 } }).success).toBe(false);
  expect(packetConsoleSchema.safeParse({ ...pc(), versions: [{ ...pc().versions[0], opened_by: U(9) }] }).success).toBe(false);
});
test('SIMULATED cannot approve or pass anything', () => {
  const zero = { open_blockers: 0, open_prerequisites: 0, unpassed_artifacts: 0 };
  const p = assemblePacket(fixture(), pc({ current: zero, versions: [{ ...pc().versions[0], ...zero }] }), true, true);
  expect(p.canApprove).toBe(false); expect(p.sections.every(s => s.status === 'unverified')).toBe(true); expect(SIMULATED_EXAMPLE.canApprove).toBe(false);
});
test('section status mapping keeps concern and pending distinct', () => {
  const base = { status: 'unverified', reasons: ['Evidence outstanding'] } as never;
  expect(sectionStatus(base)).toBe('pending');
  expect(sectionStatus({ status: 'blocked', reasons: ['Review concern'] } as never)).toBe('concern');
});
test('export: exact counts, notice, checklist, blocked signed-out, safe content', () => {
  expect(() => packetExport(assemblePacket(null, null, false), false)).toThrow('EXPORT_BLOCKED');
  const out = packetExport(assemblePacket(fixture(), pc(), true), true);
  expect(out).toContain(NOTICE); expect(out).toContain('Open blockers: 14 of 14'); expect(out).toContain('Open session prerequisites: 7 of 7');
  expect(out).toContain('Reviewer handoff checklist'); expect(out).not.toMatch(/@|https?:\/\/|\d{9,}/);
});
test('route is private, noindex, linked from ten pages, and has no publish/deploy or outbound calls', () => {
  const src = readFileSync('src/routes/human-review-packet.tsx', 'utf8');
  expect(src).toContain("content: 'noindex, nofollow'"); expect(PRIVATE_PREFIXES).toContain('/human-review-packet');
  expect(src).not.toMatch(/fetch\(|https?:\/\/|>\s*(Publish|Deploy|Activate)\b(?! gate)/);
  for (const f of ['golive-decision-pack', 'golive-evidence-matrix', 'validation-snapshot', 'session-start-gate', 'session-results', 'release-evidence-bundle', 'owner-action-closure', 'readiness-decision-ledger', 'human-review-console', 'publish-gate']) expect(readFileSync(`src/routes/${f}.tsx`, 'utf8')).toContain('to="/human-review-packet"');
  const lib = readFileSync('src/lib/human-review-packet.ts', 'utf8') + readFileSync('src/lib/human-review-packet.functions.ts', 'utf8');
  expect(lib).not.toMatch(/fetch\(|https?:\/\//);
});
