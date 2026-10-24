import { z } from 'zod';
import { ARTIFACTS, consoleSchema as bundleSchema, assembleBundle } from './release-bundle';
import { BLOCKERS } from './owner-closure';
import { ledgerSchema, latestEvents } from './readiness-ledger';
import { CHECKS, rowsSchema as validationSchema, derive } from './validation-snapshot';
import { PREREQS, rowsSchema as gateSchema } from './session-start-gate';
import { SUITES, SESSION_KEYS, consoleSchema as resultsSchema } from './session-results';
import { reviewConsoleSchema } from './human-review';
export const NOTICE = 'Production readiness is NOT claimed. Reconciliation never closes blockers, promotes readiness, starts tests or approves publication.';
export const REASONS = ['Signed-out or scope blocked', 'Evidence outstanding', 'Conflicting status', 'Stale source version', 'Independent confirmation missing', 'Prerequisite outstanding', 'Dependency remains open', 'Unauthorized session result', 'Count drift', 'SIMULATED evidence excluded', 'Duplicate latest version', 'Decision event missing', 'Source coverage missing', 'Review concern', 'No discrepancy observed'] as const;
const REGISTERS = ['Final validation evidence snapshot', 'Final release evidence bundle', 'Owner action closure board', 'Readiness change and decision ledger', 'Human review sign-off console'] as const;
export const inputSchema = z.object({ bundle: bundleSchema, ledger: ledgerSchema, validation: validationSchema, gate: gateSchema, results: resultsSchema, review: reviewConsoleSchema, readiness_claimed: z.literal(false) }).strict().superRefine((d, c) => {
 if (new Set(d.results.sessions.map(s => s.session_key)).size !== 2) c.addIssue({ code: 'custom', message: 'Duplicate session' });
 for (const s of d.results.sessions) {
  if (new Set(s.suites.map(r => r.suite_key)).size !== 18) c.addIssue({ code: 'custom', message: 'Duplicate suite' });
  if (!['unavailable','blocked','ready-for-start','in-progress','completed','concern'].includes(s.session_status)) c.addIssue({ code: 'custom', message: 'Unsafe session status' });
  for (const r of s.suites) {
   const cat = SUITES.find(x => x.key === r.suite_key);
   if (!cat || r.artifact !== cat.artifact || r.blocker !== cat.blocker || r.check_id !== cat.check || r.expected !== cat.expected || r.ord !== cat.ord) c.addIssue({ code: 'custom', message: 'Unsafe suite mapping' });
  }
 }
 for (const b of d.results.dependent_blockers) if (!BLOCKERS.some(x => x.key === b.blocker)) c.addIssue({ code: 'custom', message: 'Unsafe blocker' });
 for (const r of d.results.reconciliation) if (!(REGISTERS as readonly string[]).includes(r.register) || !['Reconcile counts before session completion', 'No action required'].includes(r.next_action)) c.addIssue({ code: 'custom', message: 'Unsafe reconciliation label' });
 function checkNumbers(v: unknown): void { if (typeof v === 'number' && (!Number.isSafeInteger(v) || v < 0 || v > 99999)) c.addIssue({ code: 'custom', message: 'Unsafe numeric summary' }); else if (Array.isArray(v)) v.forEach(checkNumbers); else if (v && typeof v === 'object') Object.values(v).forEach(checkNumbers); }
 checkNumbers(d);
});
export type Input = z.infer<typeof inputSchema>;
type Reason = typeof REASONS[number];
type Status = 'passed' | 'blocked' | 'unverified';
export type MatrixRow = { key: string; label: string; expected: string; observed: string; status: Status; reasons: Reason[]; artifacts: string[]; ownerActions: string[]; checks: string[]; blocker: string; signoff: string; sourceVersion: number; resultVersion: number; event: { decision: string; version: number; correlation: string } | null; timestamp: string | null; correlation: string | null; dependency: 'satisfied' | 'outstanding'; reviewer: 'confirmed' | 'outstanding'; nextAction: string };
const mapping = (blocker: string, artifacts: readonly string[], checks: readonly string[], ownerActions?: readonly string[]) => {
 const b = BLOCKERS.find(x => x.key === blocker);
 return { blocker, artifacts: [...artifacts], checks: [...checks], ownerActions: [...(ownerActions ?? b?.ownerActions ?? ['publish_owner'])], signoff: b?.signoff ?? 'evidence_confirmed' };
};
/** No caller statuses or free text are accepted; mappings are fixed catalogues. */
export function reconcile(input: Input | null, authorized: boolean, simulated = false) {
 const d = authorized && input ? inputSchema.parse(input) : null;
 const rows: MatrixRow[] = [];
 const events = latestEvents(d?.ledger.events ?? []);
 function add(key: string, label: string, expected: string, observed: string, m: ReturnType<typeof mapping>, reasons: Reason[], sourceVersion = 0, resultVersion = 0, timestamp: string | null = null, correlation: string | null = null) {
  const event = events.find(e => e.kind === 'blocker' && e.register_key === m.blocker) ?? events.find(e => e.kind === 'artifact' && m.artifacts.includes(e.register_key));
  const r: Reason[] = !d ? ['Signed-out or scope blocked'] : simulated ? ['SIMULATED evidence excluded', ...reasons] : reasons;
  const unique = [...new Set(r)];
  if (!d && !unique.includes('Prerequisite outstanding')) unique.push('Prerequisite outstanding');
  rows.push({ key, label, expected, observed: d ? observed : 'not read', ...m, reasons: unique.length ? unique : ['No discrepancy observed'], status: !d || simulated || unique.some(x => !['Evidence outstanding', 'Independent confirmation missing', 'Decision event missing'].includes(x)) ? 'blocked' : unique.length ? 'unverified' : 'passed', sourceVersion, resultVersion, timestamp, correlation, event: event ? { decision: event.decision, version: event.event_version, correlation: event.correlation_id } : null, dependency: unique.some(x => /Dependency|Prerequisite|Unauthorized/.test(x)) ? 'outstanding' : 'satisfied', reviewer: unique.some(x => /confirmation|concern|scope|SIMULATED/.test(x)) ? 'outstanding' : 'confirmed', nextAction: unique.length ? 'Resolve mapped source and request independent review' : 'Retain current evidence for human sign-off' });
 }
 const bundle = assembleBundle(d?.bundle ?? null, !!d);
 for (const a of bundle) {
  const reasons: Reason[] = [];
  if (!a.source?.source_count || !a.snapshot) reasons.push('Evidence outstanding');
  if (d?.bundle.sources.filter(x => x.register === a.key).length !== 1) reasons.push('Source coverage missing');
  if (a.reasons.some(r => /Duplicate/.test(r))) reasons.push('Duplicate latest version');
  if (a.reasons.some(r => /Stale|version mismatch/.test(r))) reasons.push('Stale source version');
  if (a.source?.status !== 'passed') reasons.push('Evidence outstanding');
  if (a.snapshot && a.snapshot.observed_status !== a.source?.status) reasons.push('Conflicting status');
  const reviews = a.snapshot?.reviews ?? [];
  if (reviews.some(r => !r.independent || r.outcome === 'concern')) reasons.push('Review concern');
  if (!['SUPER_ADMIN', 'OPERATIONS_ADMIN'].every(role => reviews.some(r => r.independent && r.outcome === 'confirmed' && r.reviewer_role === role))) reasons.push('Independent confirmation missing');
  const b = BLOCKERS.find(b => (b.artifacts as readonly string[]).includes(a.key));
  add(`artifact:${a.key}`, a.label, 'Current independently confirmed source and artifact', a.source?.status ?? 'unverified', mapping(b?.key ?? 'owner_action_queue', [a.key], [a.check], [a.ownerAction]), reasons, a.source?.source_version, a.snapshot?.version, a.snapshot?.created_at, a.snapshot?.correlation_id);
 }
 for (const b of BLOCKERS) {
  const row = d?.ledger.current.find(x => x.key === b.key);
  const reasons: Reason[] = [];
  if (row?.status !== 'closed') reasons.push('Evidence outstanding');
  if (!row?.record?.reviewed || !row.eligible) reasons.push('Independent confirmation missing');
  if (b.dependencies.some(k => d?.ledger.current.find(x => x.key === k)?.status !== 'closed')) reasons.push('Dependency remains open');
  if (row?.reasons.some(x => x.includes('changed'))) reasons.push('Stale source version');
  if (row?.reasons.some(x => x.includes('concern'))) reasons.push('Review concern');
  if (row?.status === 'closed' && row.record?.mine && row.record.reviewed && !row.last_reviewed) reasons.push('Independent confirmation missing');
  if (b.artifacts.some(k => bundle.find(x => x.key === k)?.status !== 'passed')) reasons.push('Evidence outstanding');
  const sessionBlocker = d?.results.dependent_blockers.find(x => x.blocker === b.key);
  if (sessionBlocker && sessionBlocker.state !== 'satisfied') reasons.push('Prerequisite outstanding');
  const event = events.find(e => e.kind === 'blocker' && e.register_key === b.key);
  if (!event) reasons.push('Decision event missing');
  else if (event.resulting_version !== row?.record?.version) reasons.push('Stale source version');
  else if (event.new_status === 'closed' && row?.status !== 'closed' && event.decision !== 'reopened') reasons.push('Conflicting status');
  add(`blocker:${b.key}`, b.label, 'Explicit current independent closure', row?.status ?? 'blocked', mapping(b.key, b.artifacts, b.checks), reasons, row?.record?.version, row?.record?.version, row?.record?.created_at, row?.record?.correlation_id);
 }
 for (const c of CHECKS) {
  const r = d?.validation.find(x => x.key === c.key);
  const effective = derive(r?.record ?? null, !!r?.record?.reviewed);
  const reasons: Reason[] = [];
  if (effective.status !== 'passed') reasons.push('Evidence outstanding');
  if (r && r.status !== effective.status) reasons.push('Conflicting status');
  if (!r?.record?.reviewed || r.record.review_outcome !== 'confirmed') reasons.push('Independent confirmation missing');
  if (r?.record?.optional_skip !== 'none' && r?.status === 'passed') reasons.push('Conflicting status');
  add(`validation:${c.key}`, c.label, c.expected, r?.status ?? 'unverified', mapping(c.blocker, [c.artifact], [c.check]), reasons, r?.record?.version, r?.record?.version, r?.record?.created_at, r?.record?.correlation_id);
 }
 const validationVersion = Math.max(0, ...(d?.validation.map(r => r.record?.version ?? 0) ?? []));
 for (const p of PREREQS) {
  const missing = !d || d.gate.some(g => g.missing.includes(p.key)) || d.results.missing_prerequisites.includes(p.key);
  add(`prerequisite:${p.key}`, p.label, 'Current independent prerequisite confirmation', missing ? 'missing' : 'confirmed', mapping('test_prerequisites', [p.artifact], p.checks, [p.ownerAction]), missing ? ['Prerequisite outstanding'] : []);
 }
 for (const key of SESSION_KEYS) {
  const sess = d?.results.sessions.find(s => s.session_key === key);
  const gate = d?.gate.find(g => g.key === key);
  let passed = 0;
  for (const suite of SUITES) {
   const r = sess?.suites.find(x => x.suite_key === suite.key);
   const rec = r?.record;
   const reasons: Reason[] = [];
   if (!sess?.authorized || !gate || !['in-progress', 'completed'].includes(gate.status) || gate.missing.length || d?.results.missing_prerequisites.length) reasons.push('Unauthorized session result');
   if (rec && (rec.source_session_version !== sess?.session_version || sess.session_version !== gate?.record?.version || gate?.record?.source_validation_version !== validationVersion)) reasons.push('Stale source version');
   if (r?.status !== 'passed') reasons.push('Evidence outstanding');
   if (r?.status === 'passed' && (rec?.status !== 'passed' || rec.result_label !== 'Observed as expected' || rec.blocker_reason !== 'No blocker recorded')) reasons.push('Conflicting status');
   const reviews = [rec?.review1, rec?.review2];
   if (!['SUPER_ADMIN', 'OPERATIONS_ADMIN'].every(role => reviews.some(v => v?.outcome === 'confirmed' && v.reviewer_role === role))) reasons.push('Independent confirmation missing');
   if (reviews.some(v => v?.outcome === 'concern')) reasons.push('Review concern');
   if (rec && SUITES.filter(x => x.ord < suite.ord).some(x => !sess?.suites.find(r => r.suite_key === x.key)?.record)) reasons.push('Dependency remains open');
   if (r?.status === 'passed') passed++;
   add(`session:${key}:${suite.key}`, `${key} · ${suite.label}`, suite.expected, r?.status ?? 'unverified', mapping(suite.blocker, [suite.artifact], [suite.check]), reasons, rec?.source_session_version, rec?.version, rec?.created_at, rec?.correlation_id);
  }
  if (sess && (sess.counts.passed !== passed || Object.values(sess.counts).reduce((a,b) => a+b,0) !== 18)) add(`counts:${key}`, `${key} counts`, 'Eighteen latest suite results', 'mismatch', mapping('verification_campaign', ['verification_campaign'], ['matrix-live']), ['Count drift']);
 }
 const round = Math.max(0, ...(d?.review.rounds.map(r => r.round) ?? []));
 const decisions = d?.review.decisions.filter(r => r.round === round) ?? [];
 const confirmed = ['SUPER_ADMIN', 'OPERATIONS_ADMIN'].every(role => decisions.some(r => r.reviewer_role === role && r.decision === 'approve'));
 const latestRound = d?.review.rounds.find(r => r.round === round);
 const signoffReasons: Reason[] = [];
 if (!confirmed || latestRound?.status !== 'approved') signoffReasons.push('Independent confirmation missing');
 if (decisions.some(r => r.decision === 'concern')) signoffReasons.push('Review concern');
 if (decisions.some(r => r.mine) && latestRound?.mine) signoffReasons.push('Review concern');
 if (new Set(decisions.map(r => r.reviewer_role)).size !== decisions.length) signoffReasons.push('Duplicate latest version');
 if (rows.some(r => r.status !== 'passed')) signoffReasons.push('Prerequisite outstanding');
 add('control:signoff', 'Latest two-role sign-off', 'Different Superadmin and Operations reviewers on current round', latestRound?.status ?? 'unverified', mapping('owner_action_queue', ['human_review_console'], ['matrix-live'], ['second_reviewer']), signoffReasons, round, round, latestRound?.opened_at, latestRound?.correlation_id);
 // Compare actual current closures against session-result reporting, never compare different units (20 artifacts vs 14 blockers).
 const closed = d?.ledger.current.filter(r => r.status === 'closed').length ?? 0;
 const report = d?.results.reconciliation.find(r => r.register === 'Owner action closure board');
 add('control:counts', 'Current blocker count consistency', 'Fourteen latest blockers and consistent closure count', report ? String(report.observed) : 'unverified', mapping('owner_action_queue', ['owner_action_queue'], ['matrix-live']), !report ? ['Evidence outstanding'] : report.expected !== 14 || report.observed !== closed ? ['Count drift'] : []);
 const reconciledCounts = [
  { register: REGISTERS[0], expected: 12, observed: d?.validation.filter(r => derive(r.record, !!r.record?.reviewed).status === 'passed').length ?? 0, blocker: 'verification_campaign', artifact: 'verification_campaign', check: 'matrix-live' },
  { register: REGISTERS[1], expected: 20, observed: bundle.filter(r => r.status === 'passed').length, blocker: 'owner_action_queue', artifact: 'release_evidence', check: 'audit-append-only' },
  { register: REGISTERS[3], expected: closed, observed: events.filter(e => e.kind === 'blocker' && e.decision === 'closure-confirmed' && d?.ledger.current.some(r => r.key === e.register_key && r.status === 'closed' && r.record?.version === e.resulting_version)).length, blocker: 'owner_action_queue', artifact: 'owner_action_queue', check: 'audit-append-only' },
  { register: REGISTERS[4], expected: 1, observed: confirmed && latestRound?.status === 'approved' && !signoffReasons.length ? 1 : 0, blocker: 'owner_action_queue', artifact: 'human_review_console', check: 'matrix-live' },
 ];
 for (const x of reconciledCounts) {
  const reports = d?.results.reconciliation.filter(r => r.register === x.register) ?? [];
  const r = reports[0];
  const reasons: Reason[] = [];
  if (reports.length !== 1) reasons.push(reports.length ? 'Duplicate latest version' : 'Source coverage missing');
  if (r && (r.expected !== x.expected || r.observed !== x.observed || r.match !== (r.expected === r.observed))) reasons.push('Count drift');
  if (x.observed !== x.expected) reasons.push('Evidence outstanding');
  add(`register-counts:${x.register}`, x.register, `Expected ${x.expected} current confirmed items`, `Derived ${x.observed}; reported ${r?.observed ?? 'not recorded'}`, mapping(x.blocker, [x.artifact], [x.check]), reasons);
 }
 for (const [key, label] of [['private-route-auth', 'Auth coverage'], ['noindex-coverage', 'Noindex coverage'], ['zero-outbound-calls', 'External-call evidence']] as const) {
  const r = d?.validation.find(r => r.key === key);
  const c = CHECKS.find(c => c.key === key);
  add(`control:${key}`, label, 'Current independently reviewed evidence; declarations are not proof', r?.status ?? 'unverified', mapping(c?.blocker ?? 'notifications_outbox', [c?.artifact ?? 'integration_safety'], [c?.check ?? 'no-external']), r?.status === 'passed' && r.record?.reviewed && r.record.review_outcome === 'confirmed' ? [] : ['Evidence outstanding']);
 }
 return { rows, total: rows.length, passed: rows.filter(r => r.status === 'passed').length, blocked: rows.filter(r => r.status === 'blocked').length, unverified: rows.filter(r => r.status === 'unverified').length, discrepancies: rows.filter(r => r.status !== 'passed'), closedBlockers: closed, remainingBlockers: 14 - closed, readinessClaimed: false as const, closureGranted: false as const };
}
export function packet(input: Input | null, authorized: boolean) {
 if (!authorized || !input) throw new Error('AUTH_REQUIRED');
 const s = reconcile(input, authorized);
 return ['# Final Go-Live Evidence Reconciliation Matrix — iCareTele', NOTICE, 'Redacted labels only. SIMULATED fixtures excluded. No external calls. No reconciliation writes or confirmations.', `Rows ${s.total}; passed ${s.passed}; blocked ${s.blocked}; unverified ${s.unverified}; remaining blockers ${s.remainingBlockers} of 14.`, ...s.rows.map(r => JSON.stringify(r))].join('\n');
}
export const SIMULATED = ['SIMULATED conflicting pass and failed result', 'SIMULATED stale source and self-review', 'SIMULATED missing prerequisites and count drift'].map(label => ({ label, status: 'unverified', countsAsPassed: false, productionEvidence: false, outboundCalls: 0 }));
