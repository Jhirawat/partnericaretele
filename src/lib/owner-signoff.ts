import { z } from 'zod';
import { inputSchema as integritySchema, inspect } from './archive-integrity';
import { entrySchema, diffVersions } from './review-handoff';
import { ARTIFACTS } from './release-bundle';
import { BLOCKERS } from './owner-closure';
import { PREREQS } from './session-start-gate';
import { CHECKS } from './validation-snapshot';
import { SESSION_KEYS, SESSION_LABELS, SUITES } from './session-results';
import { CHECKLIST } from './human-review-packet';

export const NOTICE = 'Production readiness is NOT claimed. This read-only owner board never signs off, approves, closes blockers, publishes, deploys, starts tests, changes permissions, resets data or calls external services.';
const version = z.number().int().min(0).max(99999);
export const inputSchema = z.object({ integrity: integritySchema, sessions: z.array(z.object({ session_key: z.enum(SESSION_KEYS), authorized: z.boolean(), session_version: version }).strict()).length(2).refine(s => new Set(s.map(x => x.session_key)).size === 2), readiness_claimed: z.literal(false) }).strict();
export type Input = z.infer<typeof inputSchema>;
export const STATUSES = ['passed', 'pending', 'blocked', 'concern', 'unverified'] as const;
const REASONS = ['Evidence outstanding', 'Source requirement open', 'Concern preserved', 'Unauthorized session result', 'Latest packet or archive stale', 'Source count mismatch', 'SIMULATED evidence excluded', 'Independent confirmation outstanding', 'Current source confirmed'] as const;
const catalog = [
  ...ARTIFACTS.map(a => ({ key: `artifact:${a.key}`, label: a.label, expected: 'Current artifact independently confirmed', evidence: a.evidence, dependency: a.ownerAction, owner: 'SUPER_ADMIN' as const })),
  ...BLOCKERS.map(b => ({ key: `blocker:${b.key}`, label: b.label, expected: 'Current evidence-backed independent closure', evidence: b.evidence, dependency: b.dependencies.join(', ') || 'No dependencies', owner: 'SUPER_ADMIN' as const })),
  ...PREREQS.map(p => ({ key: `prerequisite:${p.key}`, label: p.label, expected: 'Current prerequisite independently available', evidence: p.signoff, dependency: p.ownerAction, owner: p.owner })),
  ...CHECKS.map(c => ({ key: `validation:${c.key}`, label: c.label, expected: c.expected, evidence: 'Independent validation metadata review', dependency: c.blocker, owner: 'SUPER_ADMIN' as const })),
  ...SESSION_KEYS.map(s => ({ key: `gate:${s}`, label: SESSION_LABELS[s], expected: 'Current independently authorized session', evidence: 'Independent session authorization review', dependency: 'Seven current prerequisites', owner: 'SUPER_ADMIN' as const })),
  ...SESSION_KEYS.flatMap(s => SUITES.map(c => ({ key: `result:${s}:${c.key}`, label: `${SESSION_LABELS[s]} — ${c.label}`, expected: c.expected, evidence: 'Independent human session result review', dependency: c.blocker, owner: 'SUPER_ADMIN' as const }))),
  { key: 'packet-review', label: 'Final independent reviewer confirmations', expected: 'Different Superadmin and Operations reviewers on the latest packet', evidence: 'Redacted human review decisions', dependency: 'All artifacts, blockers and prerequisites', owner: 'SUPER_ADMIN' as const },
];
export const itemSchema = z.object({
  item_label: z.enum(catalog.map(c => c.label)), expected_outcome: z.enum(catalog.map(c => c.expected)), observed_status: z.enum(STATUSES),
  owner_role: z.enum(['SUPER_ADMIN', 'OPERATIONS_ADMIN']), reviewer_role: z.enum(['SUPER_ADMIN', 'OPERATIONS_ADMIN']),
  evidence_label: z.enum(catalog.map(c => c.evidence)), source_version: version, blocker_reason: z.enum(REASONS),
  next_action: z.enum(['Review current source evidence', 'Retain independently confirmed source']), dependency_label: z.enum(catalog.map(c => c.dependency)),
  timestamp: z.iso.datetime({ offset: true }).nullable(), correlation_id: z.uuid().nullable(),
}).strict().refine(x => x.owner_role !== x.reviewer_role, 'REVIEWER_SEPARATION');

export function summarize(input: Input | null, authorized: boolean, simulated = false) {
  const d = authorized && input ? inputSchema.parse(input) : null;
  const a = d?.integrity.archive;
  const latest = d?.integrity.packet.versions.slice().sort((x, y) => y.packet_version - x.packet_version)[0];
  const snapshots = a?.snapshots.slice().sort((x, y) => x.source_version - y.source_version) ?? [];
  const currentSnapshot = snapshots.at(-1);
  const integrity = inspect(d?.integrity ?? null, !!d);
  const current = !!latest?.current && !!a?.current.packet_current && !!currentSnapshot?.current && currentSnapshot.packet_version === latest.packet_version && integrity.changes.length === 0;
  const countMatch = integrity.rows.find(r => r.key === 'counts')?.status === 'passed';
  const latestDecisions = d?.integrity.packet.decisions.filter(x => x.packet_version === latest?.packet_version) ?? [];
  const confirmations = new Set(latestDecisions.filter(x => x.decision === 'approve').map(x => x.reviewer_role));
  const separation = !!d?.integrity.controls.reviewer_separation && !!d?.integrity.controls.duplicate_rejection && latestDecisions.length === confirmations.size && !latestDecisions.some(x => x.decision === 'concern');
  const items = catalog.map(c => {
    const source = a?.current.manifest.find(e => e.key === c.key);
    let status: typeof STATUSES[number] = !d ? 'blocked' : !source || source.version === 0 ? 'unverified' : source.status === 'concern' ? 'concern' : ['passed', 'closed'].includes(source.status) ? 'passed' : ['pending', 'in-progress', 'ready-for-review', 'awaiting-evidence', 'ready-for-start'].includes(source.status) ? 'pending' : ['blocked', 'open', 'failed', 'unavailable'].includes(source.status) ? 'blocked' : 'unverified';
    let reason: typeof REASONS[number] = status === 'passed' ? 'Current source confirmed' : status === 'concern' ? 'Concern preserved' : status === 'blocked' ? 'Source requirement open' : 'Evidence outstanding';
    if (c.key.startsWith('result:')) {
      const session = d?.sessions.find(s => c.key.startsWith(`result:${s.session_key}:`));
      if (d && (!session?.authorized || session.session_version === 0)) { status = 'blocked'; reason = 'Unauthorized session result'; }
    }
    if (status === 'passed' && (!current || !countMatch)) { status = 'blocked'; reason = !current ? 'Latest packet or archive stale' : 'Source count mismatch'; }
    if (c.key === 'packet-review' && status === 'passed' && (confirmations.size !== 2 || !separation)) { status = 'blocked'; reason = 'Independent confirmation outstanding'; }
    if (simulated) { status = 'unverified'; reason = 'SIMULATED evidence excluded'; }
    return { key: c.key, ...itemSchema.parse({ item_label: c.label, expected_outcome: c.expected, observed_status: status, owner_role: c.owner, reviewer_role: c.owner === 'SUPER_ADMIN' ? 'OPERATIONS_ADMIN' : 'SUPER_ADMIN', evidence_label: c.evidence, source_version: source?.version ?? 0, blocker_reason: reason, next_action: status === 'passed' ? 'Retain independently confirmed source' : 'Review current source evidence', dependency_label: c.dependency, timestamp: c.key === 'packet-review' ? latest?.created_at ?? null : null, correlation_id: c.key === 'packet-review' ? latest?.correlation_id ?? null : null }) };
  });
  const open = (prefix: string) => items.filter(i => i.key.startsWith(prefix) && i.observed_status !== 'passed').length;
  const blockers = Math.max(open('blocker:'), a?.current.blocker_count ?? 14);
  const prerequisites = Math.max(open('prerequisite:'), a?.current.prerequisite_count ?? 7);
  const artifacts = Math.max(open('artifact:'), a?.current.artifact_count ?? 20);
  const discrepancies = items.filter(i => i.observed_status !== 'passed');
  return { items, blockers, prerequisites, artifacts, discrepancies, sourceDiscrepancies: a?.current.discrepancy_count ?? null, packetVersion: latest?.packet_version ?? 0, sourceVersion: currentSnapshot?.source_version ?? 0, current, counts: Object.fromEntries(STATUSES.map(s => [s, items.filter(i => i.observed_status === s).length])), changes: integrity.changes, versionDiffs: snapshots.map((s, i) => ({ sourceVersion: s.source_version, packetVersion: s.packet_version, changes: diffVersions(snapshots[i - 1]?.manifest ?? [], s.manifest) })), events: a?.events ?? [], decisions: d?.integrity.packet.decisions ?? [], confirmations: !simulated && current && separation && blockers + prerequisites + artifacts === 0 && discrepancies.length === 0 ? confirmations.size : 0, canSignOff: false as const, readinessClaimed: false as const, simulated };
}

export function ownerExport(input: Input | null, authorized: boolean, simulated = false) {
  if (!authorized || !input) throw new Error('EXPORT_BLOCKED');
  const d = inputSchema.parse(input), s = summarize(d, true, simulated);
  return ['# Final Owner Sign-off Readiness Board', NOTICE, simulated ? 'SIMULATED — cannot sign off, approve or close' : 'Authoritative source metadata only; this board cannot record sign-offs',
    `Packet v${s.packetVersion}; source v${s.sourceVersion}; current ${s.current}`, `Open blockers ${s.blockers} of 14; prerequisites ${s.prerequisites} of 7; artifacts ${s.artifacts} of 20; unresolved owner items ${s.discrepancies.length}; source discrepancies ${s.sourceDiscrepancies}`, '## Required evidence and owner items',
    ...s.items.map(({ key: _key, ...i }) => JSON.stringify(itemSchema.parse(i))), '## Exact source changes', ...s.changes.map(c => `${entrySchema.shape.key.parse(c.key)}: v${c.prior_version} ${c.prior_status} to v${c.next_version} ${c.next_status}; evidence changed ${c.evidence_changed}`),
    '## Version history changes', ...s.versionDiffs.map(v => JSON.stringify(v)), '## Preserved handoff events', ...s.events.map(e => `${e.handoff_type}; ${e.reason}; ${e.sender_role}; ${e.recipient_role}; ${e.evidence_label}; ${e.created_at}; ${e.correlation_id}`),
    '## Immutable reviewer history', ...s.decisions.map(e => `${e.packet_version}; ${e.decision}; ${e.reason}; ${e.reviewer_role}; ${e.created_at}; ${e.correlation_id}`), '## Reviewer checklist', ...CHECKLIST].join('\n');
}
export const SIMULATED = { label: 'SIMULATED owner handoff', canSignOff: false, canClose: false, canApprove: false, outboundCalls: 0 } as const;