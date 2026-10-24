// Cross-Register Evidence Integrity Inspector: pure helpers. A read-only consistency and
// safety inspector for the redacted readiness registers. It never reads production business
// data, never changes permissions, never publishes or deploys, and never calls external
// services. A real integrity result counts only after a different signed-in reviewer confirms
// the latest version; simulated findings never count as passed.
import { z } from "zod";
import { unsafeText } from "./release-evidence";
import { redact } from "./seo-crawl";
import { READINESS_NOTICE } from "./verification-campaign";
import { unsafeIncidentText } from "./incident-console";

// The fourteen redacted readiness registers the inspector covers. Closed vocabulary only.
export const REGISTERS = [
  "release_runbook", "backup_evidence", "protection_evidence", "content_review", "access_matrix",
  "verification_campaign", "campaign_history", "production_readiness", "owner_action_queue",
  "golive_decision_pack", "test_session_workspace", "human_review_console", "content_approval", "launch_control",
] as const;
export type RegisterKey = (typeof REGISTERS)[number];

// Fourteen inspector rules; each maps to the registers it inspects, the responsible Owner
// Action Queue item and the exact verification check. Closed vocabulary only.
export const RULES = [
  { key: "register_coverage", label: "Register coverage", registers: [...REGISTERS], ownerAction: "publish_owner", check: "seo-private-noindex" },
  { key: "append_only_versioning", label: "Append-only and versioning invariants", registers: ["backup_evidence", "protection_evidence", "content_review", "campaign_history"], ownerAction: "protection_evidence", check: "audit-append-only" },
  { key: "latest_version_selection", label: "Latest-version selection", registers: ["owner_action_queue", "golive_decision_pack", "human_review_console", "content_approval"], ownerAction: "protection_evidence", check: "protection-evidence" },
  { key: "stale_version_rejection", label: "Stale-version rejection", registers: ["owner_action_queue", "human_review_console", "content_approval", "launch_control"], ownerAction: "protection_evidence", check: "protection-evidence" },
  { key: "reviewer_separation", label: "Reviewer separation", registers: ["production_readiness", "human_review_console", "backup_evidence", "protection_evidence"], ownerAction: "second_reviewer", check: "privacy-retention" },
  { key: "role_mfa_scope", label: "Role and MFA scope", registers: ["access_matrix", "owner_action_queue", "golive_decision_pack", "test_session_workspace"], ownerAction: "superadmin_account", check: "matrix-live" },
  { key: "closed_vocabulary", label: "Closed-vocabulary enforcement", registers: ["content_review", "content_approval", "release_runbook", "launch_control"], ownerAction: "claims_review", check: "content-review" },
  { key: "redaction_secret_rejection", label: "Redaction and credential rejection", registers: [...REGISTERS], ownerAction: "clinic_facts", check: "content-review" },
  { key: "blocker_count_consistency", label: "Blocker-count consistency", registers: ["owner_action_queue", "golive_decision_pack", "production_readiness", "human_review_console"], ownerAction: "publish_owner", check: "matrix-live" },
  { key: "status_honesty", label: "Status honesty", registers: [...REGISTERS], ownerAction: "publish_owner", check: "rollback-drill" },
  { key: "noindex_auth_guard", label: "Noindex and auth-guard coverage", registers: ["verification_campaign", "test_session_workspace", "golive_decision_pack", "campaign_history"], ownerAction: "preview_access", check: "seo-private-noindex" },
  { key: "simulated_real_separation", label: "Simulated-versus-real separation", registers: ["release_runbook", "verification_campaign", "test_session_workspace", "backup_evidence"], ownerAction: "preview_access", check: "rollback-drill" },
  { key: "no_outbound_calls", label: "No-outbound-call evidence", registers: [...REGISTERS], ownerAction: "preview_access", check: "no-external" },
  { key: "cross_register_links", label: "Cross-register dependency links", registers: ["owner_action_queue", "golive_decision_pack", "human_review_console", "launch_control"], ownerAction: "second_reviewer", check: "matrix-live" },
] as const;
export type RuleKey = (typeof RULES)[number]["key"];
export const OBSERVED = ["passed", "pending", "blocked", "unverified"] as const;
export const ROLES = ["SUPER_ADMIN", "OPERATIONS_ADMIN"] as const;
export const NEXT_ACTIONS = ["Record inspector evidence for independent review", "Record independent confirmation of integrity result", "Resolve reviewer concern", "Re-run read-only inspection after owner action"] as const;
export const READ_ONLY_NOTICE = "This inspector never reads production business data, never changes permissions, never publishes or deploys, and never calls external services. Simulated findings never count as passed, and no blocker is ever auto-closed." as const;

const role = z.enum(ROLES);
const ruleEnum = z.enum(RULES.map((r) => r.key) as [RuleKey, ...RuleKey[]]);
const registerEnum = z.enum(REGISTERS);
const reviewSchema = z.object({ outcome: z.enum(["confirmed", "concern"]), independent: z.boolean(), mine: z.boolean(), created_at: z.iso.datetime({ offset: true }), correlation_id: z.uuid() }).strict();
export const itemSchema = z.object({ id: z.uuid(), lineage: z.uuid(), version: z.number().int().positive(), rule: ruleEnum, register: registerEnum, expected_result: z.string().min(3).max(200), observed_status: z.enum(OBSERVED), blocker_reason: z.string().min(3).max(200).nullable(), owner_role: role, reviewer_role: role, evidence_ref: z.string().min(3).max(120), next_action: z.enum(NEXT_ACTIONS), review_date: z.iso.date().nullable(), correlation_id: z.uuid(), created_at: z.iso.datetime({ offset: true }), mine: z.boolean(), latest: z.boolean(), reviews: z.array(reviewSchema) }).strict();
export const itemsSchema = z.array(itemSchema);
export type Item = z.infer<typeof itemSchema>;
export type IGroup = "passed" | "pending" | "blocked" | "unverified";
// Closed vocabulary plus redacted labels, not free text: raw logs, URLs, emails, phone numbers,
// usernames, secrets, tokens, credentials, personal data, medical data, certificate contents,
// private documents and long number runs cannot be persisted.
export const unsafeInspectorText = (t: string) => unsafeIncidentText(t);
const safeLabel = (max: number) => z.string().trim().min(3).max(max).refine((t) => !unsafeInspectorText(t), "REDACTED_CONTENT_REQUIRED");
export const recordSchema = z.object({ lineage: z.uuid().nullable(), rule: ruleEnum, register: registerEnum, expected: safeLabel(200), observed: z.enum(OBSERVED), blocker: safeLabel(200).nullable(), owner: role, reviewer: role, ref: safeLabel(120), action: z.enum(NEXT_ACTIONS), date: z.iso.date().nullable() }).strict();
export const confirmInputSchema = z.object({ id: z.uuid(), outcome: z.enum(["confirmed", "concern"]) }).strict();

/** Derived state of one inspector finding; never auto-promotes, never auto-closes a blocker
 *  and never counts a superseded version. Only an independently confirmed latest 'passed'
 *  observation counts as passed. */
export function itemGroup(e: Item): { group: IGroup; reason: string } {
  if (!e.latest) return { group: "unverified", reason: "Superseded by a newer version" };
  if (e.reviews.some((r) => r.outcome === "concern")) return { group: "blocked", reason: "A reviewer recorded a concern" };
  if (!e.review_date) return { group: "unverified", reason: "Manual gap: review date missing" };
  if (!e.reviews.some((r) => r.outcome === "confirmed" && r.independent)) return { group: "pending", reason: "Awaiting confirmation by a different reviewer" };
  if (e.observed_status === "passed") return { group: "passed", reason: "Independently confirmed passed" };
  if (e.observed_status === "blocked") return { group: "blocked", reason: "Confirmed blocked; never auto-closed" };
  return { group: "pending", reason: `Observed ${e.observed_status}: confirmed but not passed` };
}

/** Per inspector rule across its mapped registers: passed only when every latest finding for
 *  that rule is independently confirmed passed; a rule with no findings is unverified. */
export function ruleStatus(key: RuleKey, items: Item[] | null, signedIn: boolean): { status: IGroup; reason: string } {
  if (!signedIn || items === null) return { status: "blocked", reason: "Signed-out: inspector findings are not read; nothing is assumed" };
  const own = items.filter((e) => e.latest && e.rule === key).map(itemGroup);
  if (!own.length) return { status: "unverified", reason: "Manual gap: no integrity finding recorded" };
  if (own.some((g) => g.group === "blocked")) return { status: "blocked", reason: "Concern, or a confirmed blocked finding" };
  if (own.every((g) => g.group === "passed")) return { status: "passed", reason: `${own.length} findings independently confirmed passed` };
  return { status: own.some((g) => g.group === "pending") ? "pending" : "unverified", reason: `${own.filter((g) => g.group === "passed").length} of ${own.length} findings independently confirmed passed` };
}

/** Whole inspector: exact counts, never claims readiness. */
export function inspectorStatus(items: Item[] | null, signedIn: boolean) {
  const per = RULES.map((r) => ({ ...r, ...ruleStatus(r.key, items, signedIn) }));
  const count = (s: IGroup) => per.filter((r) => r.status === s).length;
  return { per, total: RULES.length, passed: count("passed"), pending: count("pending"), blocked: count("blocked"), unverified: count("unverified"), open: per.filter((r) => r.status !== "passed"), ready: false as const };
}

/** Redacted integrity report/export. Throws REDACTION_FAILED if any unsafe text survives. */
export function inspectorExport(items: Item[] | null, signedIn: boolean, now = new Date()): string {
  const w = inspectorStatus(items, signedIn);
  const cell = (x: unknown) => redact(String(x)).replace(/\|/g, "/");
  const line = (r: (typeof w.per)[number]) => "| " + [r.label, r.status, r.reason, r.registers.join(", "), r.ownerAction, r.check].map(cell).join(" | ") + " |";
  const rows = (items ?? []).map((e) => "| " + [e.rule, e.register, e.expected_result, e.observed_status, `v${e.version}`, e.owner_role, e.reviewer_role, itemGroup(e).reason, e.next_action, e.blocker_reason ?? "none"].map(cell).concat([cell(e.evidence_ref), e.review_date ?? "missing", e.created_at, e.correlation_id]).join(" | ") + " |");
  const out = ["# Cross-register evidence integrity report — iCareTele", `Generated ${now.toISOString()}. ${READINESS_NOTICE}`, READ_ONLY_NOTICE, `Inspector rules: passed ${w.passed} · pending ${w.pending} · blocked ${w.blocked} · unverified ${w.unverified} (total ${w.total})`, "", "| Inspector rule | Status | Reason | Registers | Owner action | Verification check |", "|---|---|---|---|---|---|", ...w.per.map(line), "", "| Rule | Register | Expected | Observed | Version | Owner role | Reviewer role | Derived state | Next action | Blocker | Evidence label | Review date | Timestamp | Correlation |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|", ...rows].join("\n");
  if (unsafeText(out.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, ""))) throw new Error("REDACTION_FAILED");
  return out;
}

/** Synthetic fixture suite: fictional metadata only, demonstrating safe and failing cases.
 *  It reads no live records, makes no outbound request, and its findings never count as passed. */
export const SIMULATED_SUITE = { simulated: true as const, label: "SIMULATED — fictional register metadata on made-up fixtures; no live record is read, no outbound request is made and simulated findings never count as passed", cases: [
  { rule: "append_only_versioning", kind: "safe" as const, case: "SIMULATED safe: fictional register shows versions 1, 2, 3 with no edit or delete markers", outcome: "passed", outboundCalls: 0 },
  { rule: "stale_version_rejection", kind: "failing" as const, case: "SIMULATED failing: fictional confirmation targets version 1 while version 2 exists", outcome: "blocked", outboundCalls: 0 },
  { rule: "reviewer_separation", kind: "failing" as const, case: "SIMULATED failing: fictional recorder and reviewer are the same person", outcome: "blocked", outboundCalls: 0 },
  { rule: "redaction_secret_rejection", kind: "failing" as const, case: "SIMULATED failing: fictional evidence label containing a token-shaped string is refused", outcome: "blocked", outboundCalls: 0 },
  { rule: "blocker_count_consistency", kind: "failing" as const, case: "SIMULATED failing: fictional decision pack counts 13 open blockers while the queue lists 14", outcome: "blocked", outboundCalls: 0 },
  { rule: "no_outbound_calls", kind: "safe" as const, case: "SIMULATED safe: fictional inspection declares zero outbound requests", outcome: "passed", outboundCalls: 0 },
] as const, conclusion: "SIMULATED result: safe and failing cases are demonstrated by declaration on fictional fixtures; simulated findings never count as passed and never close a blocker." };
