import { test, expect } from 'bun:test';
import { reconcile, packet, inputSchema, SIMULATED, type Input } from '../src/lib/golive-evidence-matrix';
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
test('fixed catalogue deterministically reconciles 20 artifacts, 14 blockers, 12 validation checks, seven prerequisites and 36 session results', () => {
 const a = fixture(); expect(inputSchema.safeParse(a).success).toBe(true);
 const first = reconcile(a,true); a.bundle.sources.reverse(); a.ledger.current.reverse(); a.validation.reverse(); a.results.sessions.reverse();
 expect(reconcile(a,true)).toEqual(first); expect(first.total).toBe(98); expect(first.rows.filter(r=>r.key.startsWith('blocker:'))).toHaveLength(14); expect(first.rows.filter(r=>r.key.startsWith('session:'))).toHaveLength(36);
});
test('failed or missing results cannot be treated as passed and unauthorized sessions block results', () => {
 const a=fixture(); const session=a.results.sessions[0]; if(!session)throw Error('fixture');const r=session.suites[0];if(!r)throw Error('fixture');r.status='passed';
 const out=reconcile(a,true).rows.find(r=>r.key==='session:primary-human-session:public_routes');
 expect(out?.reasons).toContain('Conflicting status');expect(out?.reasons).toContain('Unauthorized session result');expect(out?.status).toBe('blocked');
});
test('reported session counts cannot hide count drift',()=>{const a=fixture();const s=a.results.sessions[0];if(!s)throw Error('fixture');s.counts.passed=1;expect(reconcile(a,true).rows.find(r=>r.key==='counts:primary-human-session')?.reasons).toContain('Count drift');});
test('dependencies and seven hard prerequisites remain unresolved without independent evidence',()=>{const s=reconcile(fixture(),true);expect(s.rows.filter(r=>r.key.startsWith('prerequisite:')).every(r=>r.reasons.includes('Prerequisite outstanding'))).toBe(true);expect(s.rows.find(r=>r.key==='blocker:rollback_drill')?.reasons).toContain('Dependency remains open');expect(s.remainingBlockers).toBe(14);expect(s.closureGranted).toBe(false);expect(s.readinessClaimed).toBe(false);});
test('duplicate sources are visible and never silently selected as passed',()=>{const a=fixture();const r=a.bundle.sources[0];if(!r)throw Error('fixture');a.bundle.sources.push(r);expect(reconcile(a,true).rows[0]?.reasons).toContain('Source coverage missing');});
test('closed vocabulary rejects secrets, URLs, personal and medical data or long numbers',()=>{for(const bad of ['token123','https://x.test','a@b.test','123456789012','patient diagnosis','raw logs','password','phone +66123456789']){const a=fixture();const s=a.results.sessions[0]?.suites[0];if(!s)throw Error('fixture');expect(inputSchema.safeParse({...a,results:{...a.results,sessions:[{...a.results.sessions[0],suites:[{...s,reason:bad},...a.results.sessions[0].suites.slice(1)]},...a.results.sessions.slice(1)]}}).success).toBe(false);}});
test('signed-out data and exports are blocked with no readiness claim',()=>{const s=reconcile(fixture(),false);expect(s.rows.every(r=>r.status==='blocked'&&r.observed==='not read')).toBe(true);expect(()=>packet(fixture(),false)).toThrow('AUTH_REQUIRED');});
test('simulations cannot count as reconciliation evidence',()=>{const s=reconcile(fixture(),true,true);expect(s.passed).toBe(0);expect(s.rows.every(r=>r.reasons.includes('SIMULATED evidence excluded'))).toBe(true);expect(SIMULATED.every(f=>!f.countsAsPassed&&!f.productionEvidence&&f.outboundCalls===0)).toBe(true);});
test('safe packet has exact counts, discrepancy mappings and no raw data',()=>{const p=packet(fixture(),true);expect(p).toContain('Production readiness is NOT claimed');expect(p).toContain('remaining blockers 14 of 14');expect(p).toContain('ownerActions');expect(p).toContain('signoff');expect(p).not.toMatch(/@|https?:\/\//);});
test('stale artifact source, self-review and duplicate latest versions never satisfy reconciliation',()=>{
 const a=fixture();const source=a.bundle.sources[0];if(!source)throw Error('fixture');
 const id='00000000-0000-4000-8000-000000000001',created_at='2026-10-21T15:00:00Z';
 a.bundle.snapshots.push({id,register:source.register,version:1,source_fingerprint:'b'.repeat(32),source_version:0,source_count:1,observed_status:'passed',blocker_reason:'Source readiness unverified',mine:true,created_at,correlation_id:id,reviews:[{outcome:'confirmed',independent:false,reviewer_role:'SUPER_ADMIN',mine:true,created_at,correlation_id:id}]});
 a.bundle.snapshots.push({...a.bundle.snapshots[0]});
 const r=reconcile(a,true).rows[0];expect(r?.reasons).toContain('Stale source version');expect(r?.reasons).toContain('Review concern');expect(r?.reasons).toContain('Duplicate latest version');expect(r?.status).toBe('blocked');
});
test('unsafe source labels and long numeric summaries are rejected at the matrix boundary',()=>{
 const a=fixture();const r=a.results.reconciliation[0];if(!r)throw Error('fixture');
 r.next_action='secret token';expect(inputSchema.safeParse(a).success).toBe(false);
 r.next_action='Reconcile counts before session completion';r.observed=123456789;expect(inputSchema.safeParse(a).success).toBe(false);
});
test('duplicate sessions and malicious suite mappings are rejected rather than hidden',()=>{
 const a=fixture();const s=a.results.sessions[0];if(!s)throw Error('fixture');a.results.sessions=[s,s];expect(inputSchema.safeParse(a).success).toBe(false);
 const b=fixture();const row=b.results.sessions[0]?.suites[0];if(!row)throw Error('fixture');row.artifact='medical private document';expect(inputSchema.safeParse(b).success).toBe(false);
});
