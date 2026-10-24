// Launch-Day Control Center: pure helpers. Never publishes, never deploys, never calls
// external services and never claims the domain is live. A checklist group counts as
// confirmed only after a different signed-in reviewer confirms its latest version.
import { z } from "zod";
import { unsafeText } from "./release-evidence";
import { unsafeContent } from "./content-review";
import { redact } from "./seo-crawl";
import { READINESS_NOTICE } from "./verification-campaign";

// Fourteen checklist groups; each maps to the exact verification checks, Owner Action Queue
// items, decision-pack register and sign-off requirement it depends on. Closed vocabulary only.
export const CHECKLISTS = [
  { key: "dns_domain_seo", label: "DNS, domain and SEO", checks: ["seo-public", "seo-private-noindex"], ownerActions: [], register: "seo_accessibility" },
  { key: "public_routes", label: "Public routes", checks: ["seo-public", "a11y-mobile"], ownerActions: [], register: "seo_accessibility" },
  { key: "auth_guards", label: "Auth and private route guards", checks: ["redirect-signed-out"], ownerActions: ["preview_access"], register: "access_matrix" },
  { key: "content_claims", label: "Content and claims", checks: ["content-review"], ownerActions: ["clinic_facts", "contact_details", "pricing_terms", "claims_review"], register: "content_claims" },
  { key: "access_controls", label: "Access controls", checks: ["matrix-live"], ownerActions: ["superadmin_account", "second_reviewer", "preview_access"], register: "access_matrix" },
  { key: "protection_evidence", label: "Migration, RLS and storage", checks: ["protection-evidence"], ownerActions: ["protection_evidence"], register: "protection_evidence" },
  { key: "backups", label: "Backups and restore", checks: ["backup-evidence"], ownerActions: ["backup_evidence"], register: "backup_evidence" },
  { key: "privacy_retention", label: "Privacy and retention", checks: ["privacy-retention"], ownerActions: ["second_reviewer"], register: "privacy_retention" },
  { key: "credits", label: "Credits and ledger invariants", checks: ["credit-invariants"], ownerActions: ["superadmin_account", "preview_access"], register: "verification_campaign" },
  { key: "notifications_outbox", label: "Notifications and outbox disabled", checks: ["outbox-disabled"], ownerActions: [], register: "notifications_outbox" },
  { key: "sla_controls", label: "SLA controls", checks: ["sla-clock"], ownerActions: [], register: "sla_controls" },
  { key: "monitoring", label: "Monitoring readiness", checks: ["audit-append-only"], ownerActions: [], register: "verification_campaign" },
  { key: "rollback_readiness", label: "Rollback readiness", checks: ["rollback-drill"], ownerActions: ["superadmin_account", "preview_access"], register: "rollback_drill" },
  { key: "no_external_calls", label: "No external calls", checks: ["no-external"], ownerActions: [], register: "verification_campaign" },
] as const;
export type ChecklistKey = (typeof CHECKLISTS)[number]["key"];
export const PHASES = ["preflight", "post_publish"] as const;
export const ENVIRONMENTS = ["preview", "production_candidate"] as const;
export const WINDOWS = ["unscheduled", "tentative", "owner_confirmed"] as const;
export const ROLLBACK_TRIGGERS = ["none", "data_integrity", "auth_regression", "payment_error", "privacy_breach", "availability_loss"] as const;
export const ITEM_STATUSES = ["planned", "blocked", "ready", "complete"] as const;
export const REQUIRED_ACTIONS = ["Record preflight evidence for independent review", "Record independent confirmation of preflight item", "Resolve reviewer concern", "Confirm rollback stop conditions reviewed"] as const;
export const ROLES = ["SUPER_ADMIN", "OPERATIONS_ADMIN"] as const;
export const SIGNOFF_REASON = "evidence_confirmed" as const;

// Rollback decision checklist: explicit stop conditions. Any one being met stops the launch
// window and requires the rollback decision tree in the release runbook.
export const STOP_CONDITIONS = [
  "Suspected data integrity loss in any ledger or audit trail",
  "Sign-in or private route guard regression",
  "Credit or payment discrepancy of any size",
  "Privacy or retention breach, or any personal data exposure",
  "Sustained availability loss of a public route",
  "Any reviewer concern recorded on launch evidence",
] as const;

const role = z.enum(ROLES);
const reviewSchema = z.object({ outcome: z.enum(["confirmed", "concern"]), independent: z.boolean(), mine: z.boolean(), created_at: z.iso.datetime({ offset: true }), correlation_id: z.uuid() }).strict();
const groupEnum = z.enum(CHECKLISTS.map((c) => c.key) as [ChecklistKey, ...ChecklistKey[]]);
export const itemSchema = z.object({ id: z.uuid(), lineage: z.uuid(), version: z.number().int().positive(), checklist_group: groupEnum, phase: z.enum(PHASES), release_candidate: z.string().min(3).max(80), environment: z.enum(ENVIRONMENTS), planned_window: z.enum(WINDOWS), rollback_trigger: z.enum(ROLLBACK_TRIGGERS), status: z.enum(ITEM_STATUSES), owner_role: role, reviewer_role: role, evidence_ref: z.string().min(3).max(120), required_action: z.enum(REQUIRED_ACTIONS), blocker_reason: z.string().min(3).max(200).nullable(), review_date: z.iso.date().nullable(), correlation_id: z.uuid(), created_at: z.iso.datetime({ offset: true }), mine: z.boolean(), latest: z.boolean(), reviews: z.array(reviewSchema) }).strict();
export const itemsSchema = z.array(itemSchema);
export type Item = z.infer<typeof itemSchema>;
export type IGroup = "passed" | "pending" | "blocked" | "unverified";
// Closed vocabulary plus redacted labels, not free text: names, credentials, links, raw logs
// and private documents cannot be persisted.
const safeLabel = (max: number) => z.string().trim().min(3).max(max).refine((t) => !unsafeContent(t), "REDACTED_CONTENT_REQUIRED");
export const recordSchema = z.object({ lineage: z.uuid().nullable(), group: groupEnum, phase: z.enum(PHASES), candidate: safeLabel(80), environment: z.enum(ENVIRONMENTS), window: z.enum(WINDOWS), trigger: z.enum(ROLLBACK_TRIGGERS), status: z.enum(ITEM_STATUSES), owner: role, reviewer: role, ref: safeLabel(120), action: z.enum(REQUIRED_ACTIONS), blocker: safeLabel(200).nullable(), date: z.iso.date().nullable() }).strict();
export const confirmInputSchema = z.object({ id: z.uuid(), outcome: z.enum(["confirmed", "concern"]) }).strict();

/** Derived state of one item; never auto-promotes and never counts a superseded version.
 *  Post-publish items stay unrun: they can never derive to passed from this surface. */
export function itemGroup(e: Item): { group: IGroup; reason: string } {
  if (!e.latest) return { group: "unverified", reason: "Superseded by a newer version" };
  if (e.reviews.some((r) => r.outcome === "concern")) return { group: "blocked", reason: "A reviewer recorded a concern" };
  if (e.status === "blocked") return { group: "blocked", reason: e.blocker_reason ?? "Owner marked blocked" };
  if (e.phase === "post_publish") return { group: "pending", reason: "Post-publish plan stays unrun until a human explicitly starts it after approval" };
  if (e.status === "planned" || !e.review_date) return { group: "unverified", reason: "Manual gap: still planned or review date missing" };
  if (!e.reviews.some((r) => r.outcome === "confirmed" && r.independent)) return { group: "pending", reason: "Awaiting confirmation by a different reviewer" };
  return { group: "passed", reason: "Owner recorded and a different reviewer confirmed" };
}

/** Per checklist group: passed only when it has at least one latest item and every latest item passed. */
export function checklistStatus(key: ChecklistKey, items: Item[] | null, signedIn: boolean): { status: IGroup; reason: string } {
  if (!signedIn || items === null) return { status: "blocked", reason: "Signed-out: launch control records are not read; nothing is assumed confirmed" };
  const own = items.filter((e) => e.latest && e.checklist_group === key).map(itemGroup);
  if (!own.length) return { status: "unverified", reason: "Manual gap: no evidence recorded" };
  if (own.some((g) => g.group === "blocked")) return { status: "blocked", reason: "Concern or blocked item" };
  if (own.every((g) => g.group === "passed")) return { status: "passed", reason: `${own.length} items independently confirmed` };
  return { status: own.some((g) => g.group === "pending") ? "pending" : "unverified", reason: `${own.filter((g) => g.group === "passed").length} of ${own.length} independently confirmed` };
}

/** Whole control center: never claims readiness, never exposes a publish or deploy control. */
export function controlStatus(items: Item[] | null, signedIn: boolean) {
  const per = CHECKLISTS.map((c) => ({ ...c, ...checklistStatus(c.key, items, signedIn) }));
  const count = (s: IGroup) => per.filter((c) => c.status === s).length;
  return { per, total: CHECKLISTS.length, passed: count("passed"), pending: count("pending"), blocked: count("blocked"), unverified: count("unverified"), open: per.filter((c) => c.status !== "passed"), ready: false as const };
}

/** Redacted launch packet. Throws REDACTION_FAILED if any unsafe text survives. */
export function launchExport(items: Item[] | null, signedIn: boolean, now = new Date()): string {
  const w = controlStatus(items, signedIn);
  const cell = (x: unknown) => redact(String(x)).replace(/\|/g, "/");
  const line = (c: (typeof w.per)[number]) => "| " + [c.label, c.status, c.reason, c.checks.join(", ") || "none", c.ownerActions.join(", ") || "none", c.register].map(cell).join(" | ") + " |";
  const rows = (items ?? []).map((e) => "| " + [e.checklist_group, e.phase, e.release_candidate, e.environment, e.planned_window, e.rollback_trigger, `v${e.version}`, e.status, e.owner_role, e.reviewer_role, itemGroup(e).reason, e.required_action, e.blocker_reason ?? "none"].map(cell).concat([cell(e.evidence_ref), e.review_date ?? "missing", e.created_at, e.correlation_id]).join(" | ") + " |");
  const out = ["# Launch-Day Control Center packet — iCareTele", `Generated ${now.toISOString()}. ${READINESS_NOTICE}`, "This surface never publishes, never deploys and never calls external services; the domain is NOT claimed live. Readiness is NOT claimed until every checklist group is independently confirmed by a different signed-in reviewer.", `Checklist groups: passed ${w.passed} · pending ${w.pending} · blocked ${w.blocked} · unverified ${w.unverified} (total ${w.total})`, "", "## Rollback decision checklist — explicit stop conditions", "Stop the launch window and follow the release runbook rollback decision tree if ANY condition is met:", ...STOP_CONDITIONS.map((s) => `- ${s}`), "", "| Checklist group | Status | Reason | Verification checks | Owner actions | Register |", "|---|---|---|---|---|---|", ...w.per.map(line), "", "| Group | Phase | Release candidate | Environment | Window | Rollback trigger | Version | Status | Owner role | Reviewer role | State | Required action | Blocker | Evidence label | Review date | Timestamp | Correlation |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|", ...rows].join("\n");
  if (unsafeText(out.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, ""))) throw new Error("REDACTION_FAILED");
  return out;
}

/** Fictional walkthrough only; labelled SIMULATED and never able to confirm anything. */
export const SIMULATED_EXAMPLE = { simulated: true as const, label: "SIMULATED example — fictional owner and reviewer on made-up metadata; cannot confirm any real checklist item and never counts as passed", steps: ["SIMULATED: a fictional Operations admin records a preflight DNS and SEO item with a redacted evidence label", "SIMULATED: a different fictional Superadmin confirms version 1", "SIMULATED: a real control center would still show every other group open and readiness NOT claimed — this example changes nothing"] };
