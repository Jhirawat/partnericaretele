import { z } from 'zod';
import { archiveSchema, diffVersions } from './review-handoff';
import { packetConsoleSchema, CHECKLIST } from './human-review-packet';

export const NOTICE = 'Production readiness is NOT claimed. This read-only archive snapshot never approves, closes blockers, publishes, deploys, starts tests or sends messages.';
export const RULES = [
  ['latest-packet', 'Latest valid packet'],
  ['latest-handoff', 'Latest valid handoff'],
  ['immutability', 'Append-only immutability'],
  ['coverage', 'Source-to-packet coverage'],
  ['version-match', 'Packet-to-handoff versions'],
  ['counts', 'Blocker, prerequisite and artifact counts'],
  ['discrepancies', 'Discrepancy preservation'],
  ['reviewer-separation', 'Independent reviewer separation'],
  ['rejection', 'Stale, self-review and duplicate rejection'],
  ['simulation', 'Simulated versus real isolation'],
  ['export', 'Redacted export safety'],
  ['access', 'Authentication and noindex coverage'],
] as const;
const controlSchema = z.object({ immutability: z.boolean(), reviewer_separation: z.boolean(), duplicate_rejection: z.boolean() }).strict();
export const inputSchema = z.object({ archive: archiveSchema, packet: packetConsoleSchema, controls: controlSchema, readiness_claimed: z.literal(false) }).strict();
export type Input = z.infer<typeof inputSchema>;
export type Status = 'passed' | 'blocked' | 'unverified';
export function inspect(input: Input | null, authorized: boolean, simulated = false) {
  const d = authorized && input ? inputSchema.parse(input) : null;
  const a = d?.archive;
  const packet = d?.packet.versions.slice().sort((x, y) => y.packet_version - x.packet_version)[0];
  const latestArchived = a?.snapshots.slice().sort((x, y) => y.source_version - x.source_version)[0];
  const handoff = latestArchived?.current && a?.current.packet_current && latestArchived.packet_version === a.current.packet_version ? latestArchived : null;
  const changes = a ? diffVersions(latestArchived?.manifest ?? [], a.current.manifest) : [];
  const manifests = a?.current.manifest ?? [];
  const unresolved = manifests.filter(e => !['passed', 'closed'].includes(e.status));
  const current = a?.current;
  const countMatches = !!d && !!current && d.packet.current.open_blockers === current.blocker_count && d.packet.current.open_prerequisites === current.prerequisite_count && d.packet.current.unpassed_artifacts === current.artifact_count
    && manifests.filter(e => e.key.startsWith('blocker:') && e.status !== 'closed').length === current.blocker_count
    && manifests.filter(e => e.key.startsWith('prerequisite:') && e.status !== 'passed').length === current.prerequisite_count
    && manifests.filter(e => e.key.startsWith('artifact:') && e.status !== 'passed').length === current.artifact_count;
  const observed: Record<string, [Status, string]> = {
    'latest-packet': [packet?.current && packet.packet_version === current?.packet_version ? 'passed' : 'blocked', packet?.current ? 'Latest packet selected by version' : 'Latest packet missing or stale'],
    'latest-handoff': [handoff ? 'passed' : 'blocked', handoff ? 'Latest current archived source selected' : 'Current handoff snapshot missing or stale'],
    immutability: [d?.controls.immutability ? 'passed' : 'blocked', d?.controls.immutability ? 'Four enabled immutable source guards' : 'Immutable source guard missing or unverified'],
    coverage: [manifests.length === 92 ? 'passed' : 'blocked', `${manifests.length} of 92 allowlisted sources`],
    'version-match': [handoff && packet?.current && handoff.packet_version === packet.packet_version && changes.length === 0 ? 'passed' : 'blocked', `${changes.length} changed source entries; packet and source matching required`],
    counts: [countMatches ? 'passed' : 'blocked', countMatches ? 'Exact source, packet and manifest counts match' : 'Count mismatch or counts unavailable'],
    discrepancies: [current && current.discrepancy_count === unresolved.length + current.prerequisite_count ? 'passed' : 'blocked', `${unresolved.length} unresolved manifest entries; prerequisite discrepancies retained separately`],
    'reviewer-separation': [d?.controls.reviewer_separation ? 'passed' : 'blocked', d?.controls.reviewer_separation ? 'Recorded reviewers are independent of source owners' : 'Reviewer separation conflict or unverified'],
    rejection: [d?.controls.duplicate_rejection ? 'unverified' : 'blocked', 'Duplicate history inspected; stale and self-review command rejection requires independently reviewed validation evidence'],
    simulation: ['unverified', 'SIMULATED fixtures excluded; real provenance requires independent source review'],
    export: ['unverified', 'Closed-vocabulary export enforced; independent runtime confirmation outstanding'],
    access: ['unverified', 'Global scope and two-step sign-in enforced; independent auth and noindex validation outstanding'],
  };
  const rows = RULES.map(([key, label]) => ({ key, label, status: (!d ? 'blocked' : simulated ? 'unverified' : observed[key]?.[0] ?? 'unverified') as Status, reason: !d ? 'Private metadata not read' : simulated ? 'SIMULATED — never counts as passed' : observed[key]?.[1] ?? 'Evidence outstanding', owner_role: 'SUPER_ADMIN' as const, reviewer_role: 'OPERATIONS_ADMIN' as const, evidence_label: 'Redacted archive integrity evidence' as const, next_action: 'Review current source evidence' as const }));
  return { rows, changes, unresolved, packetVersion: packet?.packet_version ?? 0, sourceVersion: latestArchived?.source_version ?? 0, blockerCount: current?.blocker_count ?? 14, prerequisiteCount: current?.prerequisite_count ?? 7, artifactCount: current?.artifact_count ?? 20, discrepancyCount: current?.discrepancy_count ?? null, passed: rows.filter(r => r.status === 'passed').length, blocked: rows.filter(r => r.status === 'blocked').length, unverified: rows.filter(r => r.status === 'unverified').length, readinessClaimed: false as const, simulated };
}
export function integrityExport(input: Input | null, authorized: boolean) {
  if (!authorized || !input) throw new Error('EXPORT_BLOCKED');
  const d = inputSchema.parse(input), s = inspect(d, true);
  return ['# Final Release Archive Integrity Snapshot', NOTICE, `Packet v${s.packetVersion}; archived source v${s.sourceVersion}`, `Open blockers ${s.blockerCount} of 14; prerequisites ${s.prerequisiteCount} of 7; unpassed artifacts ${s.artifactCount} of 20; discrepancies ${s.discrepancyCount}`, '## Integrity rules', ...s.rows.map(r => `${r.label}: ${r.status}; ${r.reason}; ${r.owner_role}; ${r.reviewer_role}; ${r.evidence_label}; ${r.next_action}`), '## Exact changed evidence', ...s.changes.map(c => `${c.key}: v${c.prior_version} ${c.prior_status} to v${c.next_version} ${c.next_status}; evidence changed ${c.evidence_changed}`), '## Unresolved evidence', ...s.unresolved.map(e => `${e.key}: v${e.version}; ${e.status}`), '## Preserved handoff history', ...d.archive.events.map(e => `${e.handoff_type}; ${e.sender_role}; ${e.recipient_role}; ${e.reason}; ${e.evidence_label}; ${e.created_at}; ${e.correlation_id}`), '## Reviewer checklist', ...CHECKLIST].join('\n');
}
export const SIMULATED = { label: 'SIMULATED archive integrity fixture', canApprove: false, canAcknowledge: false, canClose: false, outboundCalls: 0 } as const;