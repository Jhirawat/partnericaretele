// Backup evidence register: pure helpers. Never proves or implies a backup exists; never passes automatically.
import { unsafeText } from "./release-evidence";
import { redactDrill } from "./release-runbook";

export type Confirmation = { outcome: "confirmed" | "rejected"; independent: boolean; mine: boolean; created_at: string; correlation_id: string };
export type BackupEntry = { id: string; lineage: string; version: number; scope_label: string; environment_label: string; backup_date: string | null; retention_days: number | null; restore_test_date: string | null; restore_result: "not_tested" | "success" | "partial" | "failed"; owner_role: string; reviewer_role: string; evidence_ref: string; status: "pending" | "blocked" | "unverified"; next_action: string; correlation_id: string; created_at: string; mine: boolean; latest: boolean; confirmations: Confirmation[] };
export type BackupGroup = "passed" | "pending" | "blocked" | "unverified";

const EXTRA = /(storage|bucket|s3|gs):\/\/|pg_dump|insert\s+into|create\s+table|copy\s+\w+|\.sql\b|\.dump\b|password|secret|apikey|api_key/i;
export function unsafeBackup(t: string) { return unsafeText(t) || EXTRA.test(t); }

/** Passed only with a successful restore test, a backup date, and an independent confirmation of this latest version. */
export function backupGroup(e: BackupEntry): { group: BackupGroup; reason: string } {
  if (!e.latest) return { group: "unverified", reason: "Superseded by a newer version" };
  if (e.confirmations.some((c) => c.outcome === "rejected")) return { group: "blocked", reason: "A reviewer rejected this evidence" };
  if (e.status === "blocked" || e.restore_result === "failed") return { group: "blocked", reason: e.restore_result === "failed" ? "Restore test failed" : "Owner marked blocked" };
  if (!e.backup_date || e.restore_result !== "success" || !e.restore_test_date) return { group: "unverified", reason: "Manual gap: backup date or successful restore test missing" };
  if (!e.confirmations.some((c) => c.outcome === "confirmed" && c.independent)) return { group: "pending", reason: "Awaiting confirmation by a different reviewer" };
  return { group: "passed", reason: "Owner recorded and a different reviewer confirmed" };
}

export function groupRegister(entries: BackupEntry[] | null) {
  const out: Record<BackupGroup, (BackupEntry & { reason: string })[]> = { passed: [], pending: [], blocked: [], unverified: [] };
  for (const e of (entries ?? []).filter((x) => x.latest)) { const g = backupGroup(e); out[g.group].push({ ...e, reason: g.reason }); }
  return out;
}

/** Gate row status: blocked without sign-in or records; passed only when every latest entry passed and at least one exists. */
export function backupGateStatus(entries: BackupEntry[] | null, signedIn: boolean): { status: BackupGroup; reason: string } {
  if (!signedIn || entries === null) return { status: "blocked", reason: "Signed-out: backup register not read; no backup is assumed to exist" };
  const g = groupRegister(entries); const n = entries.filter((e) => e.latest).length;
  if (n === 0) return { status: "unverified", reason: "Manual gap: no backup evidence recorded" };
  if (g.blocked.length) return { status: "blocked", reason: `${g.blocked.length} entries blocked` };
  if (g.passed.length === n) return { status: "passed", reason: `${n} entries independently confirmed` };
  return { status: g.pending.length ? "pending" : "unverified", reason: `${g.passed.length} of ${n} entries confirmed` };
}

export function backupExport(entries: BackupEntry[] | null, signedIn: boolean, now = new Date()) {
  const g = groupRegister(entries); const s = backupGateStatus(entries, signedIn);
  const lines = ["# Backup evidence register", `Generated ${now.toISOString()}. This report does not prove that any backup exists. Production readiness is NOT claimed. Publishing is a separate manual owner action.`, `Gate status: ${s.status} — ${s.reason}`, ""];
  for (const k of ["passed", "pending", "blocked", "unverified"] as BackupGroup[]) {
    lines.push(`## ${k} (${g[k].length})`);
    for (const e of g[k]) lines.push(`- ${e.scope_label} / ${e.environment_label} v${e.version}: backup ${e.backup_date ?? "missing"}, retention ${e.retention_days ?? "missing"} days, restore ${e.restore_result} ${e.restore_test_date ?? ""}; owner ${e.owner_role}, reviewer ${e.reviewer_role}; ref ${e.evidence_ref}; ${e.reason}; next: ${e.next_action}; ${e.created_at} ${e.correlation_id}`);
    lines.push("");
  }
  lines.push("## Manual evidence gaps", s.status === "passed" ? "- None recorded" : "- Owner (SUPER_ADMIN): record backup date, retention and a successful restore test; a different admin confirms it while signed in.");
  return redactDrill(lines.join("\n"));
}

/** Synthetic restore-check simulator: made-up fixtures only, never production data. */
export type RestoreFixture = { synthetic: true; label: string; source: Record<string, number>; restored: Record<string, number> };
export const FIXTURES: readonly RestoreFixture[] = Object.freeze([
  Object.freeze({ synthetic: true as const, label: "Matching copy", source: { partners: 3, ledger_rows: 20, certificates: 2 }, restored: { partners: 3, ledger_rows: 20, certificates: 2 } }),
  Object.freeze({ synthetic: true as const, label: "Missing ledger rows", source: { partners: 3, ledger_rows: 20, certificates: 2 }, restored: { partners: 3, ledger_rows: 18, certificates: 2 } }),
]);
export function simulateRestore(f: RestoreFixture) {
  if (!f || f.synthetic !== true) throw new Error("SYNTHETIC_ONLY");
  const diffs = Object.keys(f.source).filter((k) => f.source[k] !== f.restored[k]);
  return { label: f.label, result: diffs.length ? "failed" as const : "success" as const, diffs, note: "Simulation on made-up counts; records no evidence and proves no real backup" };
}
