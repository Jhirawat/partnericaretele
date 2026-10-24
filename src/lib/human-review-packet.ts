// Final Human Review Decision Packet: pure, read-only redacted summary for two future human reviewers.
// Never publishes, deploys, starts tests, closes blockers or promotes readiness.
import { z } from 'zod';
import { reconcile, type Input, type MatrixRow } from './golive-evidence-matrix';
import { unsafeText } from './release-evidence';

export const NOTICE = 'Production readiness is NOT claimed. This packet never publishes, deploys, starts tests, closes blockers or approves publication.';
export const PACKET_REASONS = {
  blockers_resolved: 'All hard blockers resolved',
  evidence_confirmed: 'Required evidence independently confirmed',
  prerequisites_available: 'All session prerequisites available',
  concern_blocker_open: 'Concern: a hard blocker is still open',
  concern_evidence_unconfirmed: 'Concern: evidence not independently confirmed',
  concern_prerequisite_missing: 'Concern: a session prerequisite is missing',
  concern_discrepancy: 'Concern: an unresolved reconciliation discrepancy',
  concern_scope: 'Concern: scope or reviewer separation',
} as const;
export type PacketReason = keyof typeof PACKET_REASONS;
const REASON_KEYS = Object.keys(PACKET_REASONS) as [PacketReason, ...PacketReason[]];
const ROLE = z.enum(['SUPER_ADMIN', 'OPERATIONS_ADMIN']);
const n = (max: number) => z.number().int().min(0).max(max);
export const versionSchema = z.object({ packet_version: z.number().int().positive(), current: z.boolean(), open_blockers: n(14), open_prerequisites: n(7), unpassed_artifacts: n(20), opener_role: ROLE, mine: z.boolean(), created_at: z.iso.datetime({ offset: true }), correlation_id: z.uuid() }).strict();
export const decisionSchema = z.object({ id: z.uuid(), packet_version: z.number().int().positive(), decision: z.enum(['approve', 'concern']), reason: z.enum(REASON_KEYS), reviewer_role: ROLE, mine: z.boolean(), created_at: z.iso.datetime({ offset: true }), correlation_id: z.uuid() }).strict();
export const packetConsoleSchema = z.object({ current: z.object({ open_blockers: n(14), open_prerequisites: n(7), unpassed_artifacts: n(20) }).strict(), versions: z.array(versionSchema), decisions: z.array(decisionSchema), readiness_claimed: z.literal(false) }).strict();
export const decideSchema = z.object({ packet_version: z.number().int().positive(), decision: z.enum(['approve', 'concern']), reason: z.enum(REASON_KEYS) }).strict().refine((d) => (d.decision === 'approve') === !d.reason.startsWith('concern_'), 'INVALID_ARGUMENTS');
export type PacketConsole = z.infer<typeof packetConsoleSchema>;

export const SECTION_GROUPS = [
  { prefix: 'artifact:', label: 'Evidence artifacts' },
  { prefix: 'blocker:', label: 'Blocker groups' },
  { prefix: 'prerequisite:', label: 'Session prerequisites' },
  { prefix: 'validation:', label: 'Validation suites' },
  { prefix: 'session:', label: 'Human session results' },
  { prefix: 'counts:', label: 'Reconciliation discrepancies' },
  { prefix: 'register-counts:', label: 'Reconciliation discrepancies' },
  { prefix: 'control:', label: 'Reviewer confirmations' },
] as const;
export type SectionStatus = 'passed' | 'pending' | 'blocked' | 'concern' | 'unverified';
export type Section = { key: string; group: string; label: string; expected: string; status: SectionStatus; blockerReason: string; ownerRole: string; firstReviewerRole: 'SUPER_ADMIN or OPERATIONS_ADMIN'; secondReviewerRole: 'Different global role'; evidence: string[]; sourceVersion: number; packetVersion: number; timestamp: string | null; correlation: string | null; nextAction: string };

export function sectionStatus(r: MatrixRow): SectionStatus {
  if (r.status === 'passed') return 'passed';
  if (r.reasons.includes('Review concern')) return 'concern';
  if (r.status === 'blocked') return 'blocked';
  return r.reasons.every((x) => x === 'Evidence outstanding' || x === 'Decision event missing') ? 'pending' : 'unverified';
}

/** Deterministic latest-version summary derived only from server-selected latest source projections. */
export function assemblePacket(input: Input | null, pc: PacketConsole | null, authorized: boolean, simulated = false) {
  const m = reconcile(input, authorized, simulated);
  const ok = authorized && !!input && !!pc;
  const latest = ok && pc!.versions.length ? pc!.versions[pc!.versions.length - 1] : null;
  const packetVersion = latest?.packet_version ?? 0;
  const sections: Section[] = m.rows.map((r) => ({
    key: r.key, group: SECTION_GROUPS.find((g) => r.key.startsWith(g.prefix))?.label ?? 'Reviewer confirmations', label: r.label, expected: r.expected,
    status: simulated ? 'unverified' : sectionStatus(r), blockerReason: r.reasons.join('; '), ownerRole: r.ownerActions.join(', '),
    firstReviewerRole: 'SUPER_ADMIN or OPERATIONS_ADMIN', secondReviewerRole: 'Different global role', evidence: r.artifacts,
    sourceVersion: r.sourceVersion ?? 0, packetVersion, timestamp: r.timestamp, correlation: r.correlation, nextAction: r.nextAction,
  }));
  // Hard-blocker counts are server-derived; signed-out or unread state is never counted as resolved.
  const openBlockers = ok ? pc!.current.open_blockers : 14;
  const openPrerequisites = ok ? pc!.current.open_prerequisites : 7;
  const unpassedArtifacts = ok ? pc!.current.unpassed_artifacts : 20;
  const discrepancies = sections.filter((s) => s.status !== 'passed');
  const conflicts: string[] = [];
  if (ok && sections.filter((s) => s.key.startsWith('blocker:') && s.status !== 'passed').length !== openBlockers) conflicts.push('Blocker count mismatch between packet and closure board');
  if (ok && sections.filter((s) => s.key.startsWith('prerequisite:') && s.status !== 'passed').length !== openPrerequisites) conflicts.push('Prerequisite count mismatch between packet and start gate');
  if (latest && !latest.current) conflicts.push('Latest packet version is stale: source evidence changed after it was opened');
  const decisions = ok ? pc!.decisions.filter((d) => d.packet_version === packetVersion) : [];
  if (decisions.some((d) => d.decision === 'concern')) conflicts.push('A concern was recorded on the latest packet version');
  const roles = new Set(decisions.filter((d) => d.decision === 'approve').map((d) => d.reviewer_role));
  const hardOpen = openBlockers + openPrerequisites + unpassedArtifacts > 0;
  const canApprove = ok && !simulated && !!latest?.current && !hardOpen && !latest.mine && !decisions.some((d) => d.mine) && conflicts.length === 0;
  const state = !ok ? 'BLOCKED' : hardOpen ? 'BLOCKED' : roles.size === 2 && latest?.current ? 'TWO-PERSON DECISION RECORDED' : 'AWAITING HUMAN REVIEW';
  const evidenceLabels = [...new Set(discrepancies.flatMap((s) => s.evidence))].sort();
  return { sections, packetVersion, latest, decisions, openBlockers, openPrerequisites, unpassedArtifacts, discrepancies, conflicts, canApprove, state, evidenceLabels, readinessClaimed: false as const, simulated };
}

export const CHECKLIST = [
  '- [ ] First reviewer (Superadmin or Operations admin) signed in with two-step sign-in; did not open this packet version',
  '- [ ] Second reviewer holds the other global role and is a different person',
  '- [ ] Packet version is the latest and marked current (not stale)',
  '- [ ] Open blockers, prerequisites and unpassed artifacts are all zero before any approve',
  '- [ ] Every discrepancy below is resolved at its source register, not here',
  '- [ ] Publishing remains a separate manual owner action outside this packet',
];

/** Redacted export. Throws when signed out or when any unsafe text survives. */
export function packetExport(p: ReturnType<typeof assemblePacket>, authorized: boolean, now = new Date()): string {
  if (!authorized) throw new Error('EXPORT_BLOCKED');
  const out = ['# Final human review decision packet — iCareTele', `Generated ${now.toISOString()}. ${NOTICE}`, `State: ${p.state}${p.simulated ? ' (SIMULATED)' : ''}`, `Packet version: ${p.packetVersion || 'none'}`,
    `Open blockers: ${p.openBlockers} of 14`, `Open session prerequisites: ${p.openPrerequisites} of 7`, `Unpassed evidence artifacts: ${p.unpassedArtifacts} of 20`, `Unresolved discrepancies: ${p.discrepancies.length} of ${p.sections.length}`,
    '', '## Conflicts', ...(p.conflicts.length ? p.conflicts.map((c) => `- ${c}`) : ['- None displayed']),
    '', '## Required evidence labels', ...(p.evidenceLabels.length ? p.evidenceLabels.map((e) => `- ${e}`) : ['- None']),
    '', '## Sections', '| Group | Section | Expected | Status | Blocker reason | Owner role | Source v | Packet v |', '|---|---|---|---|---|---|---|---|',
    ...p.sections.map((s) => '| ' + [s.group, s.label, s.expected, s.status, s.blockerReason, s.ownerRole, String(s.sourceVersion), String(s.packetVersion)].map((x) => x.replace(/\|/g, '/')).join(' | ') + ' |'),
    '', '## Decisions', ...(p.decisions.length ? p.decisions.map((d) => `- v${d.packet_version}: ${d.decision} (${d.reason}) by ${d.reviewer_role} · ${d.created_at} · ${d.correlation_id}`) : ['- None recorded']),
    '', '## Reviewer handoff checklist', ...CHECKLIST].join('\n');
  if (unsafeText(out.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, ''))) throw new Error('REDACTION_FAILED');
  return out;
}

export const SIMULATED_EXAMPLE = { label: 'SIMULATED example — fictional reviewers on made-up data; cannot approve any real packet', canApprove: false as const, outboundCalls: 0 };
