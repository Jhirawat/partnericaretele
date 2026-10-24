// Publish gate: consolidates checklist handoff, launch QA and human review acknowledgements.
// Pure; never publishes and never claims production readiness.
import { groupHandoff, type HandoffRow } from "./release-evidence";
import { manualChecks, type QaCheck } from "./launch-qa";
import { redact } from "./seo-crawl";
import { backupGateStatus, type BackupEntry } from "./backup-evidence";
import { protectionGateStatus, type ProtectionEntry } from "./protection-evidence";
import { contentGateStatus, type ContentEntry } from "./content-review";
import { accessGateStatus, type AccessEntry } from "./access-matrix";

export const REVIEW_ITEMS = [
  { key: "wording", label: "Thai/English wording", owner: "Content reviewer", evidence: "Reviewed page list and label table" },
  { key: "clinic_facts", label: "Clinic facts", owner: "Clinic owner", evidence: "Licence and registration documents compared" },
  { key: "contact", label: "Contact details", owner: "Clinic owner", evidence: "Approved public contact channels" },
  { key: "price_terms", label: "Price and terms wording", owner: "Clinic owner", evidence: "Owner-approved prices, tax, refund and expiry terms" },
  { key: "claims", label: "Medical, review and certification claims", owner: "Clinical/compliance reviewer", evidence: "Claims review record" },
  { key: "keyboard_focus", label: "Keyboard focus", owner: "Engineering reviewer", evidence: "Manual tab-through of every public page" },
  { key: "contrast", label: "Contrast", owner: "Engineering reviewer", evidence: "Measured WCAG AA contrast results" },
  { key: "device_performance", label: "Live-device performance", owner: "Engineering reviewer", evidence: "Measurements on a real phone" },
] as const;
export type ReviewKey = (typeof REVIEW_ITEMS)[number]["key"];
/** Distinct reviewers needed before a review item counts as passed. */
export const REQUIRED_REVIEWERS = 2;
export interface Ack { item_key: string; outcome: "acknowledged" | "concern"; note: string; round: number; correlation_id: string; created_at: string; mine: boolean; reviewer_no: number }
export type GateStatus = "passed" | "pending" | "blocked" | "unverified";
export interface GateRow { id: string; source: "Checklist" | "Launch QA" | "Human review" | "Backup" | "Protection" | "Content" | "Access" | "Signed-in"; label: string; status: GateStatus; owner: string; requiredEvidence: string; nextAction: string; reason: string }
/** Items that must be complete before any UI may even consider readiness. */
export const HARD_BLOCKERS = ["review:clinic_facts", "review:contact", "review:price_terms", "review:claims", "checklist:backup_restore", "backup:register", "protection:register", "content:register", "access:register", "signed-in"] as const;

export function reviewStatus(key: ReviewKey, acks: Ack[] | null): { status: GateStatus; reason: string } {
  if (acks === null) return { status: "blocked", reason: "No authorized test account; reviewer records cannot be read" };
  const latest = new Map<number, Ack>();
  for (const a of acks.filter((x) => x.item_key === key)) { const p = latest.get(a.reviewer_no); if (!p || p.round < a.round) latest.set(a.reviewer_no, a); }
  const l = [...latest.values()];
  if (l.some((a) => a.outcome === "concern")) return { status: "blocked", reason: "A reviewer recorded a concern" };
  if (l.length >= REQUIRED_REVIEWERS) return { status: "passed", reason: `${l.length} distinct reviewers acknowledged` };
  return { status: "pending", reason: `${l.length} of ${REQUIRED_REVIEWERS} distinct reviewers acknowledged` };
}

export function buildGate(input: { checklist: HandoffRow[] | null; acks: Ack[] | null; signedIn: boolean; backup?: BackupEntry[] | null; protection?: ProtectionEntry[] | null; content?: ContentEntry[] | null; access?: AccessEntry[] | null; qa?: Omit<QaCheck, "timestamp" | "correlationId">[] }): GateRow[] {
  const checklist = input.checklist ?? groupHandoff(null, []);
  const rows: GateRow[] = checklist.map((r) => ({ id: `checklist:${r.key}`, source: "Checklist", label: r.key, status: r.group, owner: "SUPER_ADMIN", requiredEvidence: r.key === "backup_restore" ? "Manual production restore drill reference" : "Effective sign-off plus evidence", nextAction: r.group === "passed" ? "None" : "Record sign-off and evidence on Release readiness", reason: r.reason }));
  rows.push(...REVIEW_ITEMS.map((i) => { const s = reviewStatus(i.key, input.acks); return { id: `review:${i.key}`, source: "Human review" as const, label: i.label, status: s.status, owner: i.owner, requiredEvidence: i.evidence, nextAction: s.status === "passed" ? "None" : `${REQUIRED_REVIEWERS} distinct reviewers acknowledge`, reason: s.reason }; }));
  rows.push(...(input.qa ?? manualChecks()).filter((q) => q.area !== "Signed-in" && q.area !== "Content governance" && q.area !== "Privacy wording" ? true : q.area === "Privacy wording").map((q) => ({ id: `qa:${q.id}`, source: "Launch QA" as const, label: q.id, status: q.status, owner: q.owner, requiredEvidence: q.evidence, nextAction: q.nextAction, reason: q.evidence })));
  { const b = backupGateStatus(input.backup ?? null, input.signedIn); rows.push({ id: "backup:register", source: "Backup", label: "Backup and restore evidence", status: b.status, owner: "SUPER_ADMIN", requiredEvidence: "Owner-recorded backup and restore test, confirmed by a different reviewer", nextAction: b.status === "passed" ? "None" : "Record and independently confirm on the Backup evidence register", reason: b.reason }); }
  { const p = protectionGateStatus(input.protection ?? null, input.signedIn); rows.push({ id: "protection:register", source: "Protection", label: "Migration, RLS and storage evidence", status: p.status, owner: "SUPER_ADMIN", requiredEvidence: "Owner-recorded live migration, RLS, table and storage results, confirmed by a different reviewer", nextAction: p.status === "passed" ? "None" : "Record and independently confirm on the protection evidence register", reason: p.reason }); }
  { const c = contentGateStatus(input.content ?? null, input.signedIn); rows.push({ id: "content:register", source: "Content", label: "Content and claims review", status: c.status, owner: "SUPER_ADMIN", requiredEvidence: "Owner-recorded review per content and claim type, acknowledged by a different reviewer", nextAction: c.status === "passed" ? "None" : "Record and independently acknowledge on the content review register", reason: c.reason }); }
  { const a = accessGateStatus(input.access ?? null, input.signedIn); rows.push({ id: "access:register", source: "Access", label: "Access matrix audit", status: a.status, owner: "SUPER_ADMIN", requiredEvidence: "Owner-recorded evidence per matrix item, confirmed by a different reviewer", nextAction: a.status === "passed" ? "None" : "Record and independently confirm on the access matrix audit", reason: a.reason }); }
  rows.push({ id: "signed-in", source: "Signed-in", label: "Signed-in checks", status: input.signedIn ? "unverified" : "blocked", owner: "SUPER_ADMIN", requiredEvidence: "Run of every signed-in check with a test account", nextAction: input.signedIn ? "Run signed-in smoke checks and record evidence" : "Provide an authorized test account", reason: input.signedIn ? "Signed-in run not yet recorded" : "No authorized test account exists" });
  return rows.map((r) => ({ ...r, reason: redact(r.reason), nextAction: redact(r.nextAction), requiredEvidence: redact(r.requiredEvidence) }));
}

export function gateSummary(rows: GateRow[]) {
  const count = (s: GateStatus) => rows.filter((r) => r.status === s).length;
  const hardOpen = HARD_BLOCKERS.filter((id) => rows.find((r) => r.id === id)?.status !== "passed");
  return { total: rows.length, passed: count("passed"), pending: count("pending"), blocked: count("blocked"), unverified: count("unverified"), blockers: rows.filter((r) => r.status !== "passed"), hardOpen, productionReadyClaimed: false as const };
}

export function gateReport(rows: GateRow[], now = new Date()) {
  const s = gateSummary(rows);
  const line = (r: GateRow) => "| " + [r.source, r.label, r.status, r.owner, r.requiredEvidence, r.nextAction, r.reason].map((x) => redact(x).replace(/\|/g, "/")).join(" | ") + " |";
  return redact(`# Publish gate handoff — iCareTele`).concat(`\nGenerated ${now.toISOString()}. Production readiness is NOT claimed. Publishing is a separate, manual owner action.\n\nPassed ${s.passed} · Pending ${s.pending} · Blocked ${s.blocked} · Unverified ${s.unverified} (total ${s.total})\nHard blockers open: ${s.hardOpen.join(", ") || "none"}\n\n| Source | Item | Status | Owner | Required evidence | Next action | Reason |\n|---|---|---|---|---|---|---|\n${s.blockers.map(line).join("\n")}\n`);
}
