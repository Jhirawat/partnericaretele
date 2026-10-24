// Integration and Provider Safety Register: pure helpers. Proves which external capabilities
// remain disabled before launch. Never activates, connects or calls any provider, never reads
// production configuration, and notifications/outbox remain disabled until a future explicit
// change-control process exists. A capability counts as proven disabled only after a different
// signed-in reviewer confirms its latest version.
import { z } from "zod";
import { unsafeText } from "./release-evidence";
import { unsafeContent } from "./content-review";
import { redact } from "./seo-crawl";
import { READINESS_NOTICE } from "./verification-campaign";

// Nine provider categories; each maps to the exact verification checks, Launch-Day checklist
// groups and Owner Action Queue items it affects. Closed vocabulary only.
export const CATEGORIES = [
  { key: "payment", label: "Payment providers", checks: ["credit-invariants", "no-external"], launch: ["credits", "no_external_calls"], ownerActions: ["superadmin_account", "preview_access"] },
  { key: "email", label: "Email delivery", checks: ["outbox-disabled", "no-external"], launch: ["notifications_outbox", "no_external_calls"], ownerActions: [] },
  { key: "sms", label: "SMS delivery", checks: ["outbox-disabled", "no-external"], launch: ["notifications_outbox", "no_external_calls"], ownerActions: [] },
  { key: "push_notifications", label: "Push notifications", checks: ["outbox-disabled", "no-external"], launch: ["notifications_outbox", "no_external_calls"], ownerActions: [] },
  { key: "webhooks", label: "Webhooks", checks: ["no-external"], launch: ["no_external_calls", "monitoring"], ownerActions: [] },
  { key: "analytics_tracking", label: "Analytics and tracking", checks: ["no-external", "seo-private-noindex"], launch: ["no_external_calls", "dns_domain_seo"], ownerActions: [] },
  { key: "mcs_clinical", label: "MCS and clinical integrations", checks: ["mcs-manual", "no-external"], launch: ["no_external_calls"], ownerActions: [] },
  { key: "storage", label: "Storage providers", checks: ["certificates-private", "protection-evidence"], launch: ["protection_evidence", "backups"], ownerActions: ["protection_evidence"] },
  { key: "other_provider", label: "Any other provider", checks: ["no-external"], launch: ["no_external_calls"], ownerActions: [] },
] as const;
export type CategoryKey = (typeof CATEGORIES)[number]["key"];
export const ENVIRONMENTS = ["preview", "production_candidate"] as const;
export const ITEM_STATUSES = ["disabled", "unconnected", "blocked", "approved"] as const;
export const REQUIRED_ACTIONS = ["Record disabled-state evidence for independent review", "Record independent confirmation of disabled state", "Resolve reviewer concern", "Confirm provider remains disabled pending change control"] as const;
export const ROLES = ["SUPER_ADMIN", "OPERATIONS_ADMIN"] as const;
export const CHANGE_CONTROL_NOTICE = "No provider may be activated from this page. Notifications and outbox remain disabled until an explicit future change-control process exists." as const;

const role = z.enum(ROLES);
const reviewSchema = z.object({ outcome: z.enum(["confirmed", "concern"]), independent: z.boolean(), mine: z.boolean(), created_at: z.iso.datetime({ offset: true }), correlation_id: z.uuid() }).strict();
const categoryEnum = z.enum(CATEGORIES.map((c) => c.key) as [CategoryKey, ...CategoryKey[]]);
export const itemSchema = z.object({ id: z.uuid(), lineage: z.uuid(), version: z.number().int().positive(), category: categoryEnum, capability: z.string().min(3).max(80), environment: z.enum(ENVIRONMENTS), status: z.enum(ITEM_STATUSES), owner_role: role, reviewer_role: role, evidence_ref: z.string().min(3).max(120), required_action: z.enum(REQUIRED_ACTIONS), blocker_reason: z.string().min(3).max(200).nullable(), review_date: z.iso.date().nullable(), correlation_id: z.uuid(), created_at: z.iso.datetime({ offset: true }), mine: z.boolean(), latest: z.boolean(), reviews: z.array(reviewSchema) }).strict();
export const itemsSchema = z.array(itemSchema);
export type Item = z.infer<typeof itemSchema>;
export type IGroup = "passed" | "pending" | "blocked" | "unverified";
// Closed vocabulary plus redacted labels, not free text: keys, secrets, tokens, webhook URLs,
// provider IDs, emails, phone numbers, personal data and private documents cannot be persisted.
const safeLabel = (max: number) => z.string().trim().min(3).max(max).refine((t) => !unsafeContent(t), "REDACTED_CONTENT_REQUIRED");
export const recordSchema = z.object({ lineage: z.uuid().nullable(), category: categoryEnum, capability: safeLabel(80), environment: z.enum(ENVIRONMENTS), status: z.enum(ITEM_STATUSES), owner: role, reviewer: role, ref: safeLabel(120), action: z.enum(REQUIRED_ACTIONS), blocker: safeLabel(200).nullable(), date: z.iso.date().nullable() }).strict();
export const confirmInputSchema = z.object({ id: z.uuid(), outcome: z.enum(["confirmed", "concern"]) }).strict();

/** Derived state of one item; never auto-promotes and never counts a superseded version.
 *  An "approved" record is never a disabled state: launch safety requires every capability
 *  disabled until a future change-control process exists. */
export function itemGroup(e: Item): { group: IGroup; reason: string } {
  if (!e.latest) return { group: "unverified", reason: "Superseded by a newer version" };
  if (e.reviews.some((r) => r.outcome === "concern")) return { group: "blocked", reason: "A reviewer recorded a concern" };
  if (e.status === "approved") return { group: "blocked", reason: "Approved is not a disabled state; launch safety requires every capability disabled until change control exists" };
  if (!e.review_date) return { group: "unverified", reason: "Manual gap: review date missing" };
  if (!e.reviews.some((r) => r.outcome === "confirmed" && r.independent)) return { group: "pending", reason: "Awaiting confirmation by a different reviewer" };
  return { group: "passed", reason: `Proven ${e.status}: owner recorded and a different reviewer confirmed` };
}

/** Per provider category: passed only when it has at least one latest item and every latest item passed. */
export function categoryStatus(key: CategoryKey, items: Item[] | null, signedIn: boolean): { status: IGroup; reason: string } {
  if (!signedIn || items === null) return { status: "blocked", reason: "Signed-out: integration safety records are not read; nothing is assumed disabled" };
  const own = items.filter((e) => e.latest && e.category === key).map(itemGroup);
  if (!own.length) return { status: "unverified", reason: "Manual gap: no disabled-state evidence recorded" };
  if (own.some((g) => g.group === "blocked")) return { status: "blocked", reason: "Concern, or a capability not in a disabled state" };
  if (own.every((g) => g.group === "passed")) return { status: "passed", reason: `${own.length} capabilities independently confirmed disabled` };
  return { status: own.some((g) => g.group === "pending") ? "pending" : "unverified", reason: `${own.filter((g) => g.group === "passed").length} of ${own.length} independently confirmed` };
}

/** Whole register: never claims readiness and never exposes an activation control. */
export function registerStatus(items: Item[] | null, signedIn: boolean) {
  const per = CATEGORIES.map((c) => ({ ...c, ...categoryStatus(c.key, items, signedIn) }));
  const count = (s: IGroup) => per.filter((c) => c.status === s).length;
  const latest = (items ?? []).filter((e) => e.latest);
  const state = (s: (typeof ITEM_STATUSES)[number]) => latest.filter((e) => e.status === s).length;
  return { per, total: CATEGORIES.length, passed: count("passed"), pending: count("pending"), blocked: count("blocked"), unverified: count("unverified"), open: per.filter((c) => c.status !== "passed"), disabled: state("disabled"), unconnected: state("unconnected"), blockedState: state("blocked"), approved: state("approved"), ready: false as const };
}

/** Redacted integration safety export. Throws REDACTION_FAILED if any unsafe text survives. */
export function integrationExport(items: Item[] | null, signedIn: boolean, now = new Date()): string {
  const w = registerStatus(items, signedIn);
  const cell = (x: unknown) => redact(String(x)).replace(/\|/g, "/");
  const line = (c: (typeof w.per)[number]) => "| " + [c.label, c.status, c.reason, c.checks.join(", ") || "none", c.launch.join(", ") || "none", c.ownerActions.join(", ") || "none"].map(cell).join(" | ") + " |";
  const rows = (items ?? []).map((e) => "| " + [e.category, e.capability, e.environment, `v${e.version}`, e.status, e.owner_role, e.reviewer_role, itemGroup(e).reason, e.required_action, e.blocker_reason ?? "none"].map(cell).concat([cell(e.evidence_ref), e.review_date ?? "missing", e.created_at, e.correlation_id]).join(" | ") + " |");
  const out = ["# Integration and Provider Safety Register — iCareTele", `Generated ${now.toISOString()}. ${READINESS_NOTICE}`, "No external service is connected: this register records redacted metadata only and never activates, connects or calls any provider.", CHANGE_CONTROL_NOTICE, `Categories: passed ${w.passed} · pending ${w.pending} · blocked ${w.blocked} · unverified ${w.unverified} (total ${w.total})`, `Latest recorded states: disabled ${w.disabled} · unconnected ${w.unconnected} · blocked ${w.blockedState} · approved ${w.approved}`, "", "| Provider category | Status | Reason | Verification checks | Launch-day checklist | Owner actions |", "|---|---|---|---|---|---|", ...w.per.map(line), "", "| Category | Capability | Environment | Version | State | Owner role | Reviewer role | Derived state | Required action | Blocker | Evidence label | Review date | Timestamp | Correlation |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|", ...rows].join("\n");
  if (unsafeText(out.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, ""))) throw new Error("REDACTION_FAILED");
  return out;
}

/** Read-only synthetic simulator: fictional providers only. It never activates a provider,
 *  never reads production configuration and makes no outbound calls; the counts below are
 *  declared, not measured. */
export const SIMULATED_SIM = { simulated: true as const, label: "SIMULATED — fictional providers on made-up metadata; nothing is activated, nothing is read from production and no outbound call is made", rows: [
  { provider: "SIMULATED fictional payment provider", state: "disabled", outboundCalls: 0 },
  { provider: "SIMULATED fictional email provider", state: "unconnected", outboundCalls: 0 },
  { provider: "SIMULATED fictional webhook endpoint", state: "blocked", outboundCalls: 0 },
] as const, conclusion: "SIMULATED result: disabled, unconnected and blocked states make zero outbound calls by declaration; this example cannot approve or activate anything and never counts as evidence." };
