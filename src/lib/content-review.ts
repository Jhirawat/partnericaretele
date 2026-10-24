// Content and claims review register: pure helpers. Never verifies facts automatically; never passes on its own.
import { unsafeBackup } from "./backup-evidence";
import { redactDrill } from "./release-runbook";

export const CONTENT_TYPES = [
  { key: "clinic_facts", label: "Clinic facts", claim: false },
  { key: "contact", label: "Contact details", claim: false },
  { key: "wording", label: "Thai/English wording", claim: false },
  { key: "price_terms", label: "Pricing and terms", claim: false },
  { key: "privacy_wording", label: "Privacy wording", claim: false },
  { key: "medical_claims", label: "Medical claims", claim: true },
  { key: "review_claims", label: "Review and testimonial claims", claim: true },
  { key: "certification_claims", label: "Certification claims", claim: true },
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number]["key"];
export const ROUTE_SCOPES = ["/", "/partner-apply", "/care-demo", "site-wide"] as const;
export type RouteScope = (typeof ROUTE_SCOPES)[number];
export type CGroup = "passed" | "pending" | "blocked" | "unverified";
export type CAck = { outcome: "acknowledged" | "concern"; independent: boolean; mine: boolean; created_at: string; correlation_id: string };
export type ContentEntry = { id: string; lineage: string; version: number; item_type: ContentType; route_scope: RouteScope; scope_label: string; owner_role: string; reviewer_role: string; status: "pending" | "blocked" | "unverified"; evidence_ref: string; decision_reason: string; next_action: string; review_date: string | null; correlation_id: string; created_at: string; mine: boolean; latest: boolean; acks: CAck[] };

const EXTRA = /\.(pdf|docx?|png|jpe?g)\b|passport|national\s+id|date\s+of\s+birth|\+?\d[\d\s-]{7,}\d/i;
export function unsafeContent(t: string) { return unsafeBackup(t) || EXTRA.test(t); }

export function contentGroup(e: ContentEntry): { group: CGroup; reason: string } {
  if (!e.latest) return { group: "unverified", reason: "Superseded by a newer version" };
  if (e.acks.some((a) => a.outcome === "concern")) return { group: "blocked", reason: "A reviewer recorded a concern" };
  if (e.status === "blocked") return { group: "blocked", reason: "Owner marked blocked" };
  if (!e.review_date) return { group: "unverified", reason: "Manual gap: review date missing" };
  if (!e.acks.some((a) => a.outcome === "acknowledged" && a.independent)) return { group: "pending", reason: "Awaiting acknowledgement by a different reviewer" };
  return { group: "passed", reason: "Owner recorded and a different reviewer acknowledged" };
}

/** Per item type: passed only when it has at least one entry and every latest entry passed. Claim types never borrow from fact types. */
export function typeStatus(type: ContentType, entries: ContentEntry[] | null, signedIn: boolean): { status: CGroup; reason: string } {
  if (!signedIn || entries === null) return { status: "blocked", reason: "Signed-out: review register not read; no fact is assumed verified" };
  const own = entries.filter((e) => e.latest && e.item_type === type).map(contentGroup);
  if (!own.length) return { status: "unverified", reason: "Manual gap: no review recorded" };
  if (own.some((g) => g.group === "blocked")) return { status: "blocked", reason: "Concern or blocked entry" };
  if (own.every((g) => g.group === "passed")) return { status: "passed", reason: `${own.length} entries independently acknowledged` };
  return { status: own.some((g) => g.group === "pending") ? "pending" : "unverified", reason: `${own.filter((g) => g.group === "passed").length} of ${own.length} acknowledged` };
}

export function contentGateStatus(entries: ContentEntry[] | null, signedIn: boolean): { status: CGroup; reason: string } {
  const s = CONTENT_TYPES.map((t) => typeStatus(t.key, entries, signedIn).status);
  if (s.every((x) => x === "passed")) return { status: "passed", reason: "Every content and claim type independently acknowledged" };
  const open = CONTENT_TYPES.filter((_, i) => s[i] !== "passed").length;
  const worst = (["blocked", "unverified", "pending"] as CGroup[]).find((g) => s.includes(g))!;
  return { status: worst, reason: `${open} of ${CONTENT_TYPES.length} content and claim types not yet passed` };
}

export function contentExport(entries: ContentEntry[] | null, signedIn: boolean, hardOpen: readonly string[], now = new Date()) {
  const lines = ["# Content and claims review register", `Generated ${now.toISOString()}. Human review metadata only; no fact is verified automatically. Production readiness is NOT claimed. Publishing is a separate manual owner action.`, `Publish gate hard blockers open: ${hardOpen.join(", ") || "none"}`, ""];
  for (const k of ["passed", "pending", "blocked", "unverified"] as CGroup[]) {
    const types = CONTENT_TYPES.filter((t) => typeStatus(t.key, entries, signedIn).status === k);
    lines.push(`## ${k} (${types.length})`);
    for (const t of types) {
      lines.push(`- ${t.label}${t.claim ? " (claim)" : ""}: ${typeStatus(t.key, entries, signedIn).reason}`);
      for (const e of (entries ?? []).filter((x) => x.latest && x.item_type === t.key)) lines.push(`  - ${e.route_scope} ${e.scope_label} v${e.version}: ${contentGroup(e).reason}; owner ${e.owner_role}, reviewer ${e.reviewer_role}; ref ${e.evidence_ref}; reason ${e.decision_reason}; next: ${e.next_action}; reviewed ${e.review_date ?? "missing"}; ${e.created_at} ${e.correlation_id}`);
    }
    lines.push("");
  }
  return redactDrill(lines.join("\n"));
}

/** Read-only synthetic preview with fictional clinic facts only. */
export const FICTIONAL_PREVIEW = Object.freeze({ synthetic: true as const, clinic: "Example Wellness Clinic (fictional)", area: "Sample district (fictional)", hours: "Sample hours (fictional)", note: "Fictional preview only. Not real clinic facts, contact details, prices or claims." });
export function previewFacts(p: typeof FICTIONAL_PREVIEW) { if (!p || p.synthetic !== true) throw new Error("SYNTHETIC_ONLY"); return [p.clinic, p.area, p.hours]; }
