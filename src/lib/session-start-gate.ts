import { z } from 'zod';
import { CHECKS as CAMPAIGN } from './verification-campaign';
import { ITEMS } from './owner-action-queue';
import { ARTIFACTS } from './release-bundle';

export const NOTICE = 'Production readiness is NOT claimed. This gate only authorizes a future signed-in human verification session; it never starts tests, publishes, deploys, changes permissions or calls external services.' as const;
export const EVIDENCE = 'Independent session authorization review' as const;
export const ENVIRONMENT = 'Signed-in preview' as const;
export const SESSIONS = [
  { key: 'primary-human-session', label: 'Primary human verification session' },
  { key: 'follow-up-human-session', label: 'Follow-up human verification session' },
] as const;
export const SESSION_KEYS = ['primary-human-session', 'follow-up-human-session'] as const;
export const STATUSES = ['unavailable', 'blocked', 'ready-for-start', 'in-progress', 'completed', 'concern'] as const;
export const RECORDABLE = STATUSES;
export const SUITE_GROUPS = ['Role and access suites', 'Data protection suites', 'Content and release suites', 'Full human verification campaign'] as const;
export const REASONS = ['No blocker recorded', 'Prerequisites unavailable', 'Independent review outstanding', 'Explicit human start outstanding', 'Environment unavailable', 'Concern raised'] as const;
export const NEXT_ACTIONS = ['Confirm missing prerequisites', 'Request independent start review', 'Start session manually', 'Record completion', 'Resolve concern', 'No action required'] as const;
const PROGRESS_REASONS: readonly string[] = ['No blocker recorded', 'Explicit human start outstanding', 'Independent review outstanding'];

/** Hard prerequisites in dependency order. Each maps to exact owner action, evidence artifact, checks and sign-off. */
export const PREREQS = [
  { key: 'superadmin_account', label: 'Superadmin test account', ownerAction: 'superadmin_account', artifact: 'production_readiness', checks: ['matrix-live', 'isolation-tenant', 'doctor-scope'], signoff: 'Superadmin session owner sign-off', owner: 'SUPER_ADMIN', reviewer: 'OPERATIONS_ADMIN' },
  { key: 'second_reviewer', label: 'Different Operations reviewer', ownerAction: 'second_reviewer', artifact: 'human_review_console', checks: ['matrix-live', 'privacy-retention', 'reconciliation'], signoff: 'Operations second-reviewer sign-off', owner: 'OPERATIONS_ADMIN', reviewer: 'SUPER_ADMIN' },
  { key: 'preview_access', label: 'Signed-in preview access', ownerAction: 'preview_access', artifact: 'test_session_workspace', checks: ['redirect-signed-out', 'matrix-live'], signoff: 'Preview access confirmation', owner: 'OPERATIONS_ADMIN', reviewer: 'SUPER_ADMIN' },
  { key: 'protection_evidence', label: 'Migration/RLS/storage evidence', ownerAction: 'protection_evidence', artifact: 'protection_evidence', checks: ['protection-evidence'], signoff: 'Protection evidence sign-off', owner: 'SUPER_ADMIN', reviewer: 'OPERATIONS_ADMIN' },
  { key: 'backup_evidence', label: 'Backup/restore evidence', ownerAction: 'backup_evidence', artifact: 'backup_evidence', checks: ['backup-evidence'], signoff: 'Backup evidence sign-off', owner: 'SUPER_ADMIN', reviewer: 'OPERATIONS_ADMIN' },
  { key: 'content_review', label: 'Clinic facts/contact/pricing/terms', ownerAction: 'pricing_terms', artifact: 'content_review', checks: ['content-review'], signoff: 'Content approval sign-off', owner: 'SUPER_ADMIN', reviewer: 'OPERATIONS_ADMIN' },
  { key: 'publish_owner', label: 'Publish owner', ownerAction: 'publish_owner', artifact: 'publish_gate', checks: [], signoff: 'Manual publish owner handoff', owner: 'SUPER_ADMIN', reviewer: 'OPERATIONS_ADMIN' },
] as const;
export const PREREQ_KEYS = PREREQS.map((p) => p.key) as [typeof PREREQS[number]['key'], ...typeof PREREQS[number]['key'][]];

const statusEnum = z.enum(STATUSES);
export const recordSchema = z.object({ session: z.enum(SESSION_KEYS), version: z.number().int().nonnegative(), status: statusEnum, suite_group: z.enum(SUITE_GROUPS), blocker_reason: z.enum(REASONS), next_action: z.enum(NEXT_ACTIONS), source_validation_version: z.number().int().nonnegative() }).strict()
  .refine((d) => ['ready-for-start', 'in-progress', 'completed'].includes(d.status) === PROGRESS_REASONS.includes(d.blocker_reason), { message: 'Status and blocker reason disagree' });
export const confirmSchema = z.object({ id: z.uuid(), outcome: z.enum(['confirmed', 'concern']) }).strict();
const role = z.enum(['SUPER_ADMIN', 'OPERATIONS_ADMIN']);
const recSchema = z.object({ id: z.uuid(), version: z.number().int().positive(), status: statusEnum, suite_group: z.enum(SUITE_GROUPS), environment_label: z.literal(ENVIRONMENT), evidence_label: z.literal(EVIDENCE), blocker_reason: z.enum(REASONS), next_action: z.enum(NEXT_ACTIONS), source_validation_version: z.number().int().nonnegative(), owner_role: role, mine: z.boolean(), created_at: z.iso.datetime({ offset: true }), correlation_id: z.uuid(), reviewed: z.boolean(), review_outcome: z.enum(['confirmed', 'concern']).nullable(), reviewer_role: role.nullable() }).strict();
const histSchema = z.object({ version: z.number().int().positive(), status: statusEnum, owner_role: role, created_at: z.iso.datetime({ offset: true }), correlation_id: z.uuid(), review_outcome: z.enum(['confirmed', 'concern']).nullable(), reviewer_role: role.nullable() }).strict();
export const rowSchema = z.object({ key: z.enum(SESSION_KEYS), status: statusEnum, reason: z.enum(REASONS), missing: z.array(z.enum(PREREQ_KEYS)), start_authorized: z.boolean(), history: z.array(histSchema), record: recSchema.nullable() }).strict();
export const rowsSchema = z.array(rowSchema).refine((r) => r.length === 2 && new Set(r.map((x) => x.key)).size === 2, 'Two unique sessions required');
export type Row = z.infer<typeof rowSchema>;

/** Missing prerequisites in dependency order; signed-out or unauthorized means every prerequisite is treated as missing. */
export function missingInOrder(row: Row | undefined, authorized: boolean) {
  if (!authorized || !row) return PREREQS.map((p) => p);
  return PREREQS.filter((p) => row.missing.includes(p.key));
}

/** Explicit human start is only offered when the server reports an independently confirmed ready-for-start latest version and no missing prerequisite. */
export function canStart(row: Row | undefined, authorized: boolean) {
  return Boolean(authorized && row && row.start_authorized && row.missing.length === 0 && row.record?.status === 'ready-for-start' && !row.record.mine);
}

export function summary(rows: Row[] | null, authorized: boolean) {
  const safe = authorized && rows ? rowsSchema.parse(rows) : null;
  const sessions = SESSIONS.map((s) => {
    const row = safe?.find((r) => r.key === s.key);
    return { ...s, row, status: authorized && row ? row.status : 'blocked' as const, reason: authorized && row ? row.reason : 'Prerequisites unavailable' as const, missing: missingInOrder(row, authorized), canStart: canStart(row, authorized) };
  });
  const missing = missingInOrder(safe?.[0], authorized);
  return { sessions, missing, completed: sessions.filter((s) => s.status === 'completed').length, readinessClaimed: false as const };
}

const UNSAFE = /@|https?:\/\/|www\.|\b\d{6,}\b|token|secret|password|api[_-]?key|bearer|BEGIN [A-Z ]*KEY/i;
export function authorizationPacket(rows: Row[] | null, authorized: boolean) {
  if (!authorized || !rows) throw new Error('AUTH_REQUIRED');
  const s = summary(rows, authorized);
  const lines = ['# Controlled Human Test Session Authorization Packet — iCareTele', NOTICE, 'Redacted labels only. SIMULATED fixtures excluded. Zero external calls. No automatic start.', '', '## Missing prerequisites (dependency order)', ...(s.missing.length ? s.missing.map((p, i) => `${i + 1}. ${p.label} — owner ${p.owner}; reviewer ${p.reviewer}; owner action ${p.ownerAction}; artifact ${p.artifact}; checks ${p.checks.join(', ') || 'none'}; sign-off ${p.signoff}`) : ['- None missing']), '', '## Sessions',
    ...s.sessions.flatMap((x) => [`- ${x.label}: ${x.status} — ${x.reason}; version ${x.row?.record?.version ?? 'none'}; suite ${x.row?.record?.suite_group ?? 'not recorded'}; environment ${ENVIRONMENT}; owner ${x.row?.record?.owner_role ?? 'not recorded'}; second reviewer ${x.row?.record?.reviewer_role ?? 'required'}; source validation v${x.row?.record?.source_validation_version ?? 0}; next ${x.row?.record?.next_action ?? 'Confirm missing prerequisites'}; correlation ${x.row?.record?.correlation_id ?? 'none'}`, ...(x.row?.history ?? []).map((h) => `  - v${h.version} ${h.status} by ${h.owner_role}; review ${h.review_outcome ?? 'none'} ${h.reviewer_role ?? ''}; ${h.created_at}; ${h.correlation_id}`)]),
    '', '## Handoff checklist', ...HANDOFF.map((h) => `- [ ] ${h}`)];
  const out = lines.join('\n');
  if (UNSAFE.test(out.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '').replace(/\d{4}-\d{2}-\d{2}T[0-9:.]+(Z|[+-][0-9:]+)?/g, ''))) throw new Error('REDACTION_FAILED');
  return out;
}

export const HANDOFF = [
  'Session owner: confirm every prerequisite above is independently confirmed and in date',
  'Session owner: record ready-for-start with the current validation snapshot version',
  'Second reviewer (different role, two-step sign-in): confirm the latest ready-for-start version',
  'Session owner: start the session manually; nothing runs automatically',
  'Session owner: record completion only after personally observing each suite',
  'Second reviewer: independently confirm or raise a concern on the completed version',
  'Publish owner: publishing remains a separate manual decision outside this page',
] as const;

export const SIMULATED = [
  { label: 'SIMULATED all prerequisites confirmed', result: 'ready-for-start', canStart: false, canApprove: false, canComplete: false, productionEvidence: false, outboundCalls: 0 },
  { label: 'SIMULATED self-reviewed start', result: 'blocked', canStart: false, canApprove: false, canComplete: false, productionEvidence: false, outboundCalls: 0 },
  { label: 'SIMULATED completed session', result: 'completed', canStart: false, canApprove: false, canComplete: false, productionEvidence: false, outboundCalls: 0 },
] as const;

// Static integrity: every prerequisite maps to real owner actions, artifacts and checks.
for (const p of PREREQS) {
  if (!ITEMS.some((i) => i.key === p.ownerAction)) throw new Error(`Unmapped owner action ${p.ownerAction}`);
  if (!ARTIFACTS.some((a) => a.key === p.artifact)) throw new Error(`Unmapped artifact ${p.artifact}`);
  for (const c of p.checks) if (!CAMPAIGN.some((x) => x.id === c)) throw new Error(`Unmapped check ${c}`);
}
