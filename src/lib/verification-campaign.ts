// Unified verification campaign: plans and records the post-build test campaign.
// Pure; never runs destructive tests, never calls outside services, never claims readiness.
import { redact } from "./seo-crawl";
import { unsafeText } from "./release-evidence";

export type CheckStatus = "pending" | "passed" | "failed" | "blocked" | "unverified";
export type Prereq = "signed_in_test_account" | "second_reviewer" | "manual_production_evidence" | "owner_facts" | "none";
export interface Check { id: string; suite: string; scope: string; prerequisites: Prereq[]; expected: string; owner: string }
export interface Result { checkId: string; status: CheckStatus; evidence: string; nextAction: string; timestamp: string; correlationId: string; simulated: boolean }
export interface Run { runNo: number; label: string; simulated: boolean; createdAt: string; correlationId: string; results: readonly Result[] }

export const SUITES = [
  "Public routes and SEO", "Accessibility and mobile", "Signed-out redirects", "Role/route access matrix",
  "Customer and partner isolation", "Doctor assignment scope", "Screening safety gates", "Consultation and credit invariants",
  "MCS handoff", "Certificates and private storage", "Notifications/outbox disabled", "SLA controls",
  "Privacy and retention", "Reconciliation", "Audit append-only", "Migration/RLS/storage evidence",
  "Backup/restore evidence", "Content/claims review", "Rollback drill", "No external calls",
] as const;

const S = (n: number) => SUITES[n]!;
const c = (id: string, suite: number, scope: string, prerequisites: Prereq[], expected: string, owner = "SUPER_ADMIN"): Check => ({ id, suite: S(suite), scope, prerequisites, expected, owner });

export const CHECKS: readonly Check[] = Object.freeze([
  c("seo-public", 0, "Home, partner application, demo", ["none"], "Each page loads with unique title, description and canonical"),
  c("seo-private-noindex", 0, "Private and preview pages", ["none"], "Every private page sends noindex and is absent from the sitemap"),
  c("a11y-mobile", 1, "Public pages on a phone-sized screen", ["none"], "One main heading, labelled controls, no sideways scroll"),
  c("a11y-contrast", 1, "Public pages", ["manual_production_evidence"], "Measured contrast meets WCAG AA", "Engineering reviewer"),
  c("redirect-signed-out", 2, "Signed-in pages", ["none"], "Signed-out visitors are sent to sign-in"),
  c("matrix-live", 3, "Every matrix row", ["signed_in_test_account"], "Live behaviour matches expected allow or deny"),
  c("isolation-tenant", 4, "Customer and partner records", ["signed_in_test_account"], "A partner never reads another partner's records"),
  c("doctor-scope", 5, "Assigned cases", ["signed_in_test_account"], "A Doctor sees only assigned cases"),
  c("screening-gates", 6, "Four screening gates", ["signed_in_test_account"], "No request without four PASS results"),
  c("credit-invariants", 7, "Reserve, consume, release", ["signed_in_test_account"], "One reservation, one consumption, no negative balance"),
  c("mcs-manual", 8, "Manual handoff", ["none"], "Adapter stays in mock mode; no automatic calls"),
  c("certificates-private", 9, "Certificate storage", ["signed_in_test_account"], "Files stay private and need review"),
  c("outbox-disabled", 10, "Outside delivery", ["none"], "External delivery workers do nothing"),
  c("sla-clock", 11, "SLA clocks", ["none"], "Pauses and maintenance are excluded from clocks"),
  c("privacy-retention", 12, "Privacy requests", ["signed_in_test_account", "second_reviewer"], "Requests need independent approval; history is kept"),
  c("reconciliation", 13, "Reconciliation adjustments", ["signed_in_test_account", "second_reviewer"], "Adjustments are reporting-only and independently approved"),
  c("audit-append-only", 14, "Audit history", ["none"], "Audit rows cannot be edited or deleted"),
  c("protection-evidence", 15, "Live database", ["manual_production_evidence", "second_reviewer"], "Recorded evidence confirmed by a different reviewer"),
  c("backup-evidence", 16, "Backup and restore", ["manual_production_evidence", "second_reviewer"], "Restore test recorded and confirmed by a different reviewer"),
  c("content-review", 17, "Public wording and claims", ["owner_facts", "second_reviewer"], "Every content type acknowledged by a different reviewer", "Clinic owner"),
  c("rollback-drill", 18, "Synthetic drill", ["signed_in_test_account"], "Drill runs on synthetic state only"),
  c("no-external", 19, "Whole app", ["none"], "No requests leave the site during checks"),
]);

export interface Available { signedIn: boolean; secondReviewer: boolean; manualEvidence: boolean; ownerFacts: boolean }
export const NOTHING_AVAILABLE: Available = { signedIn: false, secondReviewer: false, manualEvidence: false, ownerFacts: false };

export function missingPrereqs(check: Check, a: Available): Prereq[] {
  const have: Record<Prereq, boolean> = { none: true, signed_in_test_account: a.signedIn, second_reviewer: a.secondReviewer, manual_production_evidence: a.manualEvidence, owner_facts: a.ownerFacts };
  return check.prerequisites.filter((p) => !have[p]);
}

export const READINESS_NOTICE = "Production readiness is NOT claimed. It stays unclaimed until real signed-in checks and manual evidence are complete. Publishing is a separate manual owner action.";

const stampId = (n: number, now: Date) => `vc-${now.getTime().toString(36)}-${n}`;

/** Read-only dry-run from fixtures. Nothing passes: simulated results are "unverified" at best. */
export function dryRun(a: Available = NOTHING_AVAILABLE, now = new Date()): Result[] {
  return CHECKS.map((ch, i) => {
    const miss = missingPrereqs(ch, a);
    return {
      checkId: ch.id,
      status: miss.length ? "blocked" : "unverified",
      evidence: "Simulated from fixtures only",
      nextAction: miss.length ? `Provide: ${miss.join(", ")}` : "Run the real check and record evidence",
      timestamp: now.toISOString(), correlationId: stampId(i, now), simulated: true,
    };
  });
}

/** Status a recorded result may hold: simulated or prerequisite-missing results never pass. */
export function honestStatus(check: Check, r: Pick<Result, "status" | "simulated">, a: Available): CheckStatus {
  if (missingPrereqs(check, a).length) return "blocked";
  if (r.simulated && (r.status === "passed")) return "unverified";
  return r.status;
}

export function sanitize(text: string): string | null { return unsafeText(text) ? null : redact(text).slice(0, 300); }

/** Append-only: returns a new frozen history; existing runs are never changed. */
export function appendRun(history: readonly Run[], label: string, results: Result[], simulated: boolean, now = new Date()): readonly Run[] {
  const clean = sanitize(label);
  if (!clean) throw new Error("UNSAFE_TEXT");
  for (const r of results) if (sanitize(r.evidence) === null || sanitize(r.nextAction) === null) throw new Error("UNSAFE_TEXT");
  const runNo = history.length + 1;
  const run: Run = Object.freeze({ runNo, label: clean, simulated, createdAt: now.toISOString(), correlationId: stampId(runNo, now), results: Object.freeze(results.map((r) => Object.freeze({ ...r, simulated: r.simulated || simulated }))) });
  return Object.freeze([...history, run]);
}

export function summarize(results: readonly Result[]) {
  const n = (s: CheckStatus) => results.filter((r) => r.status === s).length;
  return { total: results.length, pending: n("pending"), passed: n("passed"), failed: n("failed"), blocked: n("blocked"), unverified: n("unverified"), productionReadyClaimed: false as const };
}

export function campaignExport(history: readonly Run[], plan: readonly Result[], now = new Date()): string {
  const latest = history.at(-1)?.results ?? plan;
  const s = summarize(latest);
  const row = (r: Result) => { const ch = CHECKS.find((x) => x.id === r.checkId)!; return "| " + [ch.suite, ch.scope, ch.prerequisites.join(", "), ch.expected, r.status + (r.simulated ? " (simulated)" : ""), ch.owner, r.evidence, r.nextAction, r.timestamp, r.correlationId].map((x) => redact(x).replace(/\|/g, "/")).join(" | ") + " |"; };
  return `# Verification campaign — iCareTele\nGenerated ${now.toISOString()}. ${READINESS_NOTICE}\n\nRuns recorded this session: ${history.length}\nPassed ${s.passed} · Pending ${s.pending} · Failed ${s.failed} · Blocked ${s.blocked} · Unverified ${s.unverified} (total ${s.total})\n\n| Suite | Scope | Prerequisites | Expected | Status | Owner | Evidence | Next action | Timestamp | Correlation ID |\n|---|---|---|---|---|---|---|---|---|---|\n${latest.map(row).join("\n")}\n`;
}

// ---- Permanent history (db/0078): stored results never hold "passed". ----
export const CAMPAIGN_VERSION = "v1";
export interface StoredConfirmation { outcome: "confirmed" | "rejected"; independent: boolean; mine: boolean; created_at: string; correlation_id: string }
export interface StoredResult { id: string; check_id: string; suite: string; scope: string; prerequisite_state: string; expected: string; status: "pending" | "blocked" | "unverified" | "failed"; simulated: boolean; owner_role: string; evidence_ref: string; next_action: string; correlation_id: string; created_at: string; confirmations: StoredConfirmation[] }
export interface StoredRun { id: string; run_no: number; campaign_version: string; label: string; simulated: boolean; mine: boolean; correlation_id: string; created_at: string; results: StoredResult[] }

/** Effective status: simulated never passes; real passes only with an independent confirmation and no rejection, and only when prerequisites are available. */
export function storedStatus(r: StoredResult, a: Available = NOTHING_AVAILABLE): CheckStatus {
  const ch = CHECKS.find((x) => x.id === r.check_id);
  if (!ch || missingPrereqs(ch, a).length) return "blocked";
  if (r.simulated) return r.status === "failed" ? "failed" : "unverified";
  if (r.confirmations.some((c) => c.outcome === "rejected")) return "blocked";
  if (r.status === "unverified" && r.confirmations.some((c) => c.outcome === "confirmed" && c.independent)) return "passed";
  return r.status;
}

/** Payload for permanent recording; status "passed" is never sent. */
export function toStoredPayload(results: readonly Result[], a: Available = NOTHING_AVAILABLE) {
  return results.map((r) => {
    const ch = CHECKS.find((x) => x.id === r.checkId)!;
    const miss = missingPrereqs(ch, a);
    const status = miss.length ? "blocked" : r.status === "passed" ? "unverified" : r.status;
    return { check_id: ch.id, suite: ch.suite, scope: ch.scope, prerequisite_state: miss.length ? `Missing: ${miss.join(", ")}` : "none missing", expected: ch.expected, status, owner_role: "SUPER_ADMIN", evidence_ref: sanitize(r.evidence) ?? "redacted", next_action: sanitize(r.nextAction) ?? "redacted" };
  });
}

export function storedExport(runs: readonly StoredRun[], now = new Date()): string {
  const cell = (x: string) => redact(x).replace(/\|/g, "/");
  const body = runs.map((g) => `## Run ${g.run_no} · ${cell(g.label)} · ${g.campaign_version} · ${g.simulated ? "SIMULATED" : "real"} · ${g.created_at} · ${g.correlation_id}\n\n| Suite | Scope | Prerequisites | Expected | Status | Owner | Evidence | Next action | Correlation ID |\n|---|---|---|---|---|---|---|---|---|\n` +
    g.results.map((r) => "| " + [r.suite, r.scope, r.prerequisite_state, r.expected, storedStatus(r) + (r.simulated ? " (simulated)" : ""), r.owner_role, r.evidence_ref, r.next_action, r.correlation_id].map(cell).join(" | ") + " |").join("\n")).join("\n\n");
  return `# Verification campaign history — iCareTele\nGenerated ${now.toISOString()}. ${READINESS_NOTICE}\n\nPermanent runs: ${runs.length}\n\n${body}\n`;
}
