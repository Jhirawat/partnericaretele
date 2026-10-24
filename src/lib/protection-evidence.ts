// Migration, RLS and storage protection evidence: pure helpers. Reads no schema or data; never passes automatically.
import { unsafeBackup } from "./backup-evidence";
import { redactDrill } from "./release-runbook";

export type PConfirmation = { outcome: "confirmed" | "rejected"; independent: boolean; mine: boolean; created_at: string; correlation_id: string };
export type ProtectionEntry = { id: string; lineage: string; version: number; environment_label: string; migration_label: string; applied_date: string | null; migration_history: "not_checked" | "matched" | "drift"; rls_result: "not_checked" | "all_enabled" | "gaps"; protected_tables: "not_checked" | "all_protected" | "gaps"; storage_policy: "not_checked" | "private" | "public_found"; owner_role: string; reviewer_role: string; evidence_ref: string; status: "pending" | "blocked" | "unverified"; next_action: string; correlation_id: string; created_at: string; mine: boolean; latest: boolean; confirmations: PConfirmation[] };
export type PGroup = "passed" | "pending" | "blocked" | "unverified";

const EXTRA = /create\s+(policy|function|index|schema)|alter\s+(table|policy)|grant\s+\w+\s+on|enable\s+row\s+level|\.json\b/i;
export function unsafeProtection(t: string) { return unsafeBackup(t) || EXTRA.test(t); }

export function protectionGroup(e: ProtectionEntry): { group: PGroup; reason: string } {
  if (!e.latest) return { group: "unverified", reason: "Superseded by a newer version" };
  if (e.confirmations.some((c) => c.outcome === "rejected")) return { group: "blocked", reason: "A reviewer rejected this evidence" };
  if (e.status === "blocked" || e.migration_history === "drift" || e.rls_result === "gaps" || e.protected_tables === "gaps" || e.storage_policy === "public_found") return { group: "blocked", reason: "Owner recorded a protection gap or blocked status" };
  const gaps = [!e.applied_date && "applied date", e.migration_history !== "matched" && "migration history", e.rls_result !== "all_enabled" && "RLS", e.protected_tables !== "all_protected" && "protected tables", e.storage_policy !== "private" && "private storage"].filter(Boolean);
  if (gaps.length) return { group: "unverified", reason: `Manual gap: ${gaps.join(", ")} not checked` };
  if (!e.confirmations.some((c) => c.outcome === "confirmed" && c.independent)) return { group: "pending", reason: "Awaiting confirmation by a different reviewer" };
  return { group: "passed", reason: "Owner recorded and a different reviewer confirmed" };
}

export function groupProtection(entries: ProtectionEntry[] | null) {
  const out: Record<PGroup, (ProtectionEntry & { reason: string })[]> = { passed: [], pending: [], blocked: [], unverified: [] };
  for (const e of (entries ?? []).filter((x) => x.latest)) { const g = protectionGroup(e); out[g.group].push({ ...e, reason: g.reason }); }
  return out;
}

export function protectionGateStatus(entries: ProtectionEntry[] | null, signedIn: boolean): { status: PGroup; reason: string } {
  if (!signedIn || entries === null) return { status: "blocked", reason: "Signed-out: protection register not read; nothing is assumed verified" };
  const g = groupProtection(entries); const n = entries.filter((e) => e.latest).length;
  if (n === 0) return { status: "unverified", reason: "Manual gap: no migration, RLS or storage evidence recorded" };
  if (g.blocked.length) return { status: "blocked", reason: `${g.blocked.length} entries blocked` };
  if (g.passed.length === n) return { status: "passed", reason: `${n} entries independently confirmed` };
  return { status: g.pending.length ? "pending" : "unverified", reason: `${g.passed.length} of ${n} entries confirmed` };
}

export function protectionExport(entries: ProtectionEntry[] | null, signedIn: boolean, now = new Date()) {
  const g = groupProtection(entries); const s = protectionGateStatus(entries, signedIn);
  const lines = ["# Migration, RLS and storage evidence register", `Generated ${now.toISOString()}. Manual metadata only; this report reads no production schema or data. Production readiness is NOT claimed. Publishing is a separate manual owner action.`, `Gate status: ${s.status} — ${s.reason}`, ""];
  for (const k of ["passed", "pending", "blocked", "unverified"] as PGroup[]) {
    lines.push(`## ${k} (${g[k].length})`);
    for (const e of g[k]) lines.push(`- ${e.environment_label} / ${e.migration_label} v${e.version}: applied ${e.applied_date ?? "missing"}; history ${e.migration_history}; RLS ${e.rls_result}; tables ${e.protected_tables}; storage ${e.storage_policy}; owner ${e.owner_role}, reviewer ${e.reviewer_role}; ref ${e.evidence_ref}; ${e.reason}; next: ${e.next_action}; ${e.created_at} ${e.correlation_id}`);
    lines.push("");
  }
  lines.push("## Evidence gaps and next actions", s.status === "passed" ? "- None recorded" : "- Owner (SUPER_ADMIN): check live migration history, RLS on every table, protected tables and private storage; record results; a different admin confirms while signed in.");
  return redactDrill(lines.join("\n"));
}

/** Read-only synthetic verifier: made-up fixtures only, never production schema or data. */
export type Fixture = { synthetic: true; migrations: { id: number; name: string }[]; tables: { name: string; rls: boolean; policies: number }[]; buckets: { name: string; public: boolean; privateFiles: boolean }[]; roles: { role: string; scope: string | null; global: boolean }[] };
export function checkOrder(m: Fixture["migrations"]) { const ids = m.map((x) => x.id); return ids.every((v, i) => i === 0 || v > ids[i - 1]!) && new Set(ids).size === ids.length && new Set(m.map((x) => x.name)).size === m.length; }
export function rlsGaps(t: Fixture["tables"]) { return t.filter((x) => !x.rls).map((x) => x.name); }
export function lockedTables(t: Fixture["tables"]) { return t.filter((x) => x.rls && x.policies === 0).map((x) => x.name); }
export function storageGaps(b: Fixture["buckets"]) { return b.filter((x) => x.privateFiles && x.public).map((x) => x.name); }
export function scopeGaps(r: Fixture["roles"]) { return r.filter((x) => (x.global && x.scope !== null) || (!x.global && x.scope === null)).map((x) => x.role); }
export function simulateProtection(f: Fixture) {
  if (!f || f.synthetic !== true) throw new Error("SYNTHETIC_ONLY");
  const r = { order: checkOrder(f.migrations), rls: rlsGaps(f.tables), locked: lockedTables(f.tables), storage: storageGaps(f.buckets), scope: scopeGaps(f.roles) };
  return { ...r, result: r.order && !r.rls.length && !r.storage.length && !r.scope.length ? "success" as const : "failed" as const, note: "Simulation on made-up fixtures; records no evidence and proves nothing about production" };
}
export const PROTECTION_FIXTURES: readonly (Fixture & { label: string })[] = Object.freeze([
  Object.freeze({ label: "Healthy fixture", synthetic: true as const, migrations: [{ id: 1, name: "a" }, { id: 2, name: "b" }], tables: [{ name: "t1", rls: true, policies: 1 }], buckets: [{ name: "docs", public: false, privateFiles: true }], roles: [{ role: "SUPER_ADMIN", scope: null, global: true }] }),
  Object.freeze({ label: "Broken fixture", synthetic: true as const, migrations: [{ id: 2, name: "b" }, { id: 1, name: "a" }], tables: [{ name: "t1", rls: false, policies: 0 }], buckets: [{ name: "docs", public: true, privateFiles: true }], roles: [{ role: "OPERATIONS_ADMIN", scope: null, global: false }] }),
]);
