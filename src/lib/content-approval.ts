// Canonical content and commercial approval workspace: pure helpers. Never publishes,
// never makes a claim live and never approves automatically; a category passes only after a
// different signed-in reviewer approves its latest version.
import { z } from "zod";
import { unsafeText } from "./release-evidence";
import { unsafeContent } from "./content-review";
import { redact } from "./seo-crawl";
import { READINESS_NOTICE } from "./verification-campaign";

// Nine canonical categories; each maps to the exact verification check, suite, owner action
// and sign-off requirement it unlocks. Closed vocabulary only.
export const CATEGORIES = [
  { key: "clinic_facts", label: "Clinic facts", ownerAction: "clinic_facts" },
  { key: "contact_channels", label: "Contact channels", ownerAction: "contact_details" },
  { key: "wording_th_en", label: "Thai/English wording", ownerAction: "clinic_facts" },
  { key: "pricing", label: "Pricing", ownerAction: "pricing_terms" },
  { key: "terms", label: "Terms", ownerAction: "pricing_terms" },
  { key: "privacy_wording", label: "Privacy wording", ownerAction: "pricing_terms" },
  { key: "medical_claims", label: "Medical claims", ownerAction: "claims_review" },
  { key: "testimonials", label: "Review and testimonial claims", ownerAction: "claims_review" },
  { key: "certification_claims", label: "Certification claims", ownerAction: "claims_review" },
] as const;
export type Category = (typeof CATEGORIES)[number]["key"];
export const SURFACES = ["/", "/partner-apply", "/care-demo", "site-wide"] as const;
export const CANONICAL = ["available", "missing"] as const;
export const APPROVAL_STATUSES = ["pending", "available", "blocked", "unverified"] as const;
export const REQUIRED_ACTIONS = ["Supply canonical source for independent review", "Record independent approval of canonical source", "Resolve reviewer concern", "Confirm canonical source availability"] as const;
export const ROLES = ["SUPER_ADMIN", "OPERATIONS_ADMIN"] as const;
export const UNLOCKS = { check: "content-review", suite: "Content/claims review", register: "content_claims", signoffReason: "evidence_confirmed" } as const;

const role = z.enum(ROLES);
const reviewSchema = z.object({ outcome: z.enum(["approved", "concern"]), independent: z.boolean(), mine: z.boolean(), created_at: z.iso.datetime({ offset: true }), correlation_id: z.uuid() }).strict();
export const entrySchema = z.object({ id: z.uuid(), lineage: z.uuid(), version: z.number().int().positive(), category: z.enum(CATEGORIES.map((c) => c.key) as [Category, ...Category[]]), surface: z.enum(SURFACES), canonical_source: z.enum(CANONICAL), status: z.enum(APPROVAL_STATUSES), owner_role: role, reviewer_role: role, evidence_ref: z.string().min(3).max(120), required_action: z.enum(REQUIRED_ACTIONS), review_date: z.iso.date().nullable(), correlation_id: z.uuid(), created_at: z.iso.datetime({ offset: true }), mine: z.boolean(), latest: z.boolean(), reviews: z.array(reviewSchema) }).strict();
export const entriesSchema = z.array(entrySchema);
export type Entry = z.infer<typeof entrySchema>;
export type AGroup = "passed" | "pending" | "blocked" | "unverified";
// Closed vocabulary, not free text: names, credentials, links and raw copy cannot be persisted.
export const recordSchema = z.object({ lineage: z.uuid().nullable(), category: z.enum(CATEGORIES.map((c) => c.key) as [Category, ...Category[]]), surface: z.enum(SURFACES), canonical: z.enum(CANONICAL), status: z.enum(APPROVAL_STATUSES), owner: role, reviewer: role, ref: z.string().trim().min(3).max(120).refine((t) => !unsafeContent(t), "REDACTED_CONTENT_REQUIRED"), action: z.enum(REQUIRED_ACTIONS), date: z.iso.date().nullable() }).strict();
export const reviewInputSchema = z.object({ id: z.uuid(), outcome: z.enum(["approved", "concern"]) }).strict();

/** Derived state of one entry; never auto-promotes and never counts a superseded version. */
export function approvalGroup(e: Entry): { group: AGroup; reason: string } {
  if (!e.latest) return { group: "unverified", reason: "Superseded by a newer version" };
  if (e.reviews.some((r) => r.outcome === "concern")) return { group: "blocked", reason: "A reviewer recorded a concern" };
  if (e.status === "blocked") return { group: "blocked", reason: "Owner marked blocked" };
  if (e.canonical_source === "missing") return { group: "blocked", reason: "Canonical source is not available" };
  if (e.status === "unverified" || !e.review_date) return { group: "unverified", reason: "Manual gap: review date missing or unverified" };
  if (!e.reviews.some((r) => r.outcome === "approved" && r.independent)) return { group: "pending", reason: "Awaiting approval by a different reviewer" };
  return { group: "passed", reason: "Owner recorded and a different reviewer approved" };
}

/** Per category: passed only when it has at least one latest entry and every latest entry passed. */
export function categoryStatus(key: Category, entries: Entry[] | null, signedIn: boolean): { status: AGroup; reason: string } {
  if (!signedIn || entries === null) return { status: "blocked", reason: "Signed-out: approval register not read; nothing is assumed approved" };
  const own = entries.filter((e) => e.latest && e.category === key).map(approvalGroup);
  if (!own.length) return { status: "unverified", reason: "Manual gap: no canonical source recorded" };
  if (own.some((g) => g.group === "blocked")) return { status: "blocked", reason: "Concern, blocked entry or missing canonical source" };
  if (own.every((g) => g.group === "passed")) return { status: "passed", reason: `${own.length} entries independently approved` };
  return { status: own.some((g) => g.group === "pending") ? "pending" : "unverified", reason: `${own.filter((g) => g.group === "passed").length} of ${own.length} independently approved` };
}

/** Whole workspace: never claims readiness; counts only. */
export function workspaceStatus(entries: Entry[] | null, signedIn: boolean) {
  const per = CATEGORIES.map((c) => ({ ...c, ...categoryStatus(c.key, entries, signedIn) }));
  const count = (s: AGroup) => per.filter((c) => c.status === s).length;
  return { per, total: CATEGORIES.length, passed: count("passed"), pending: count("pending"), blocked: count("blocked"), unverified: count("unverified"), open: per.filter((c) => c.status !== "passed"), ready: false as const };
}

/** Redacted approval packet. Throws REDACTION_FAILED if any unsafe text survives. */
export function approvalExport(entries: Entry[] | null, signedIn: boolean, now = new Date()): string {
  const w = workspaceStatus(entries, signedIn);
  const line = (c: (typeof w.per)[number]) => "| " + [c.label, c.status, c.reason, UNLOCKS.suite, c.ownerAction, UNLOCKS.register].map((x) => redact(x).replace(/\|/g, "/")).join(" | ") + " |";
  const rows = (entries ?? []).map((e) => "| " + [e.category, e.surface, `v${e.version}`, e.status, e.canonical_source, e.owner_role, e.reviewer_role, approvalGroup(e).reason, e.required_action].map((x) => redact(String(x)).replace(/\|/g, "/")).concat([redact(e.evidence_ref).replace(/\|/g, "/"), e.review_date ?? "missing", e.created_at, e.correlation_id]).join(" | ") + " |");
  const out = ["# Canonical content and commercial approval packet — iCareTele", `Generated ${now.toISOString()}. ${READINESS_NOTICE}`, "This workspace never publishes and never makes a claim live; readiness is NOT claimed until every category is independently approved by a different signed-in reviewer.", `Categories: passed ${w.passed} · pending ${w.pending} · blocked ${w.blocked} · unverified ${w.unverified} (total ${w.total})`, "", "| Category | Status | Reason | Unlocks suite | Owner action | Sign-off register |", "|---|---|---|---|---|---|", ...w.per.map(line), "", "| Category | Surface | Version | Status | Canonical source | Owner role | Reviewer role | Approval state | Required action | Evidence label | Review date | Timestamp | Correlation |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|", ...rows].join("\n");
  if (unsafeText(out.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, ""))) throw new Error("REDACTION_FAILED");
  return out;
}

/** Fictional walkthrough only; labelled SIMULATED and never able to approve anything. */
export const SIMULATED_EXAMPLE = { simulated: true as const, label: "SIMULATED example — fictional owner and reviewer on made-up metadata; cannot approve any real category", steps: ["SIMULATED: a fictional Operations admin records clinic facts v1 with a redacted evidence label", "SIMULATED: a different fictional Superadmin approves version 1", "SIMULATED: a real workspace would show the category pending until every category passes — this example changes nothing"] };
