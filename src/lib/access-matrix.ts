// Access matrix audit: redacted role-by-route-by-action expectations, pure synthetic simulator and review grouping.
// Never reads live records and never changes permissions. Unknown combinations are denied.
import { unsafeBackup } from "./backup-evidence";
import { redactDrill } from "./release-runbook";

export type SimRole = "anon" | "customer" | "partner" | "other_partner" | "doctor" | "scoped_ops" | "ops" | "superadmin";
export type Sensitivity = "public" | "confidential" | "clinical" | "restricted" | "aggregate";
export type MatrixRow = { key: string; surface: string; route: string; action: string; role: SimRole; expect: "allow" | "deny"; scope: string; sensitivity: Sensitivity };
const r = (key: string, surface: string, route: string, action: string, role: SimRole, expect: "allow" | "deny", scope: string, sensitivity: Sensitivity): MatrixRow => ({ key, surface, route, action, role, expect, scope, sensitivity });

export const MATRIX: readonly MatrixRow[] = Object.freeze([
  r("public_view_anon", "Public", "/", "view", "anon", "allow", "none", "public"),
  r("auth_view_anon", "Auth", "/auth", "view", "anon", "allow", "none", "public"),
  r("customer_login", "Customer", "/dashboard", "sign_in", "customer", "deny", "non-login customer", "restricted"),
  r("partner_own_org", "Partner", "/dashboard", "read_own_org", "partner", "allow", "own organization", "confidential"),
  r("partner_other_org", "Partner", "/dashboard", "read_other_org", "other_partner", "deny", "own organization", "confidential"),
  r("doctor_assigned", "Doctor", "/doctor-workspace", "read_assigned_case", "doctor", "allow", "assigned case", "clinical"),
  r("doctor_recruit_partner", "Doctor", "/doctor-recruitment", "recruit", "partner", "deny", "global or matching staff", "restricted"),
  r("doctor_recruit_ops", "Doctor", "/doctor-recruitment", "recruit", "ops", "allow", "global staff", "restricted"),
  r("mcs_handoff_ops", "MCS", "/mcs-handoff", "record_manual_handoff", "ops", "allow", "global staff", "clinical"),
  r("mcs_handoff_partner", "MCS", "/mcs-handoff", "record_manual_handoff", "partner", "deny", "global staff", "clinical"),
  r("ops_console_scoped", "Operations admin", "/admin-console", "read_queue", "scoped_ops", "allow", "matching organization", "confidential"),
  r("ops_console_partner", "Operations admin", "/admin-console", "read_queue", "partner", "deny", "matching organization", "confidential"),
  r("superadmin_console", "Superadmin", "/superadmin-console", "read_aggregate", "superadmin", "allow", "global, aggregate only", "aggregate"),
  r("superadmin_console_ops", "Superadmin", "/superadmin-console", "read_aggregate", "scoped_ops", "deny", "global, aggregate only", "aggregate"),
  r("evidence_record_superadmin", "Evidence", "/release-readiness", "record_evidence", "superadmin", "allow", "global staff with two-step sign-in", "restricted"),
  r("evidence_record_scoped", "Evidence", "/release-readiness", "record_evidence", "scoped_ops", "deny", "global staff with two-step sign-in", "restricted"),
  r("runbook_drill_superadmin", "Runbook", "/release-runbook", "record_drill", "superadmin", "allow", "global staff with two-step sign-in", "restricted"),
  r("runbook_drill_anon", "Runbook", "/release-runbook", "record_drill", "anon", "deny", "global staff with two-step sign-in", "restricted"),
  r("gate_read_superadmin", "Publish gate", "/publish-gate", "read_records", "superadmin", "allow", "global staff", "restricted"),
  r("gate_read_anon", "Publish gate", "/publish-gate", "read_records", "anon", "deny", "global staff", "restricted"),
  r("gate_publish_any", "Publish gate", "/publish-gate", "publish", "superadmin", "deny", "manual owner action outside the app", "restricted"),
  r("private_index_any", "Private routes", "/dashboard", "search_index", "anon", "deny", "noindex", "restricted"),
]);
export const MATRIX_KEYS = MATRIX.map((m) => m.key);

/** Fictional users only. Client metadata is ignored for authority. */
export type SimUser = { synthetic: true; name: string; role: SimRole; org: string | null; assignedCase: boolean; mfa: boolean; metadata?: Record<string, unknown> };
export const SIM_USERS: Readonly<Record<SimRole, SimUser>> = Object.freeze({
  anon: { synthetic: true, name: "Visitor (fictional)", role: "anon", org: null, assignedCase: false, mfa: false },
  customer: { synthetic: true, name: "Customer (fictional)", role: "customer", org: "org-a", assignedCase: false, mfa: false },
  partner: { synthetic: true, name: "Partner A (fictional)", role: "partner", org: "org-a", assignedCase: false, mfa: true },
  other_partner: { synthetic: true, name: "Partner B (fictional)", role: "other_partner", org: "org-b", assignedCase: false, mfa: true },
  doctor: { synthetic: true, name: "Doctor (fictional)", role: "doctor", org: null, assignedCase: true, mfa: true },
  scoped_ops: { synthetic: true, name: "Scoped ops (fictional)", role: "scoped_ops", org: "org-a", assignedCase: false, mfa: true },
  ops: { synthetic: true, name: "Global ops (fictional)", role: "ops", org: null, assignedCase: false, mfa: true },
  superadmin: { synthetic: true, name: "Superadmin (fictional)", role: "superadmin", org: null, assignedCase: false, mfa: true },
});

const PUBLIC_ROUTES = new Set(["/", "/partner-apply", "/care-demo", "/auth"]);
/** Deny by default; allow only explicit rules. Reads only the fictional user's role, org and flags. */
export function decide(u: SimUser, route: string, action: string, targetOrg = "org-a"): "allow" | "deny" {
  if (!u || u.synthetic !== true) throw new Error("SYNTHETIC_ONLY");
  const global = (u.role === "ops" || u.role === "superadmin") && u.org === null;
  if (action === "publish" || action === "search_index") return "deny";
  if (action === "view") return PUBLIC_ROUTES.has(route) ? "allow" : "deny";
  if (u.role === "customer" || u.role === "anon") return "deny";
  if (action === "read_own_org" || action === "read_other_org") return (u.role === "partner" || u.role === "other_partner") && u.org === targetOrg ? "allow" : "deny";
  if (action === "read_assigned_case") return u.role === "doctor" && u.assignedCase ? "allow" : "deny";
  if (action === "recruit" || action === "record_manual_handoff") return global ? "allow" : "deny";
  if (action === "read_queue") return global || (u.role === "scoped_ops" && u.org === targetOrg) ? "allow" : "deny";
  if (action === "read_aggregate") return u.role === "superadmin" && u.org === null ? "allow" : "deny";
  if (action === "record_evidence" || action === "record_drill" || action === "read_records") return global && u.mfa ? "allow" : "deny";
  return "deny";
}
export function simulateMatrix() { return MATRIX.map((m) => { const got = decide(SIM_USERS[m.role], m.route, m.action); return { key: m.key, expect: m.expect, got, ok: got === m.expect }; }); }

export type AConfirm = { outcome: "confirmed" | "rejected"; independent: boolean; mine: boolean; created_at: string; correlation_id: string };
export type AccessEntry = { id: string; lineage: string; version: number; item_key: string; expected: "allow" | "deny"; required_scope: string; sensitivity: Sensitivity; owner_role: string; reviewer_role: string; status: "pending" | "blocked" | "unverified"; evidence_ref: string; next_action: string; correlation_id: string; created_at: string; mine: boolean; latest: boolean; confirmations: AConfirm[] };
export type AGroup = "passed" | "pending" | "blocked" | "unverified";

const EXTRA = /passport|national\s+id|date\s+of\s+birth|\+?\d[\d\s-]{7,}\d/i;
export function unsafeAccess(t: string) { return unsafeBackup(t) || EXTRA.test(t); }

export function accessGroup(e: AccessEntry): { group: AGroup; reason: string } {
  const m = MATRIX.find((x) => x.key === e.item_key);
  if (!e.latest) return { group: "unverified", reason: "Superseded by a newer version" };
  if (!m) return { group: "blocked", reason: "Unknown matrix item" };
  if (m.expect !== e.expected || m.sensitivity !== e.sensitivity) return { group: "blocked", reason: "Recorded evidence conflicts with the matrix" };
  if (e.confirmations.some((c) => c.outcome === "rejected")) return { group: "blocked", reason: "A reviewer rejected this evidence" };
  if (e.status === "blocked") return { group: "blocked", reason: "Owner marked blocked" };
  if (!e.confirmations.some((c) => c.outcome === "confirmed" && c.independent)) return { group: "pending", reason: "Awaiting confirmation by a different reviewer" };
  return { group: "passed", reason: "Owner recorded and a different reviewer confirmed" };
}
export function itemStatus(key: string, entries: AccessEntry[] | null, signedIn: boolean): { status: AGroup; reason: string } {
  if (!signedIn || entries === null) return { status: "blocked", reason: "Signed-out: audit records not read" };
  const own = entries.filter((e) => e.latest && e.item_key === key).map(accessGroup);
  if (!own.length) return { status: "unverified", reason: "Manual gap: no evidence recorded" };
  if (own.some((g) => g.group === "blocked")) return { status: "blocked", reason: own.find((g) => g.group === "blocked")!.reason };
  if (own.every((g) => g.group === "passed")) return { status: "passed", reason: "Independently confirmed" };
  return { status: "pending", reason: "Awaiting confirmation by a different reviewer" };
}
export function accessGateStatus(entries: AccessEntry[] | null, signedIn: boolean): { status: AGroup; reason: string } {
  const s = MATRIX_KEYS.map((k) => itemStatus(k, entries, signedIn).status);
  if (s.every((x) => x === "passed")) return { status: "passed", reason: "Every matrix item independently confirmed" };
  const worst = (["blocked", "unverified", "pending"] as AGroup[]).find((g) => s.includes(g))!;
  return { status: worst, reason: `${s.filter((x) => x !== "passed").length} of ${s.length} matrix items not yet passed` };
}
export function accessExport(entries: AccessEntry[] | null, signedIn: boolean, hardOpen: readonly string[], now = new Date()) {
  const lines = ["# Access matrix audit", `Generated ${now.toISOString()}. Expected permissions and human evidence only; no live permission was read or changed. Production readiness is NOT claimed. Publishing is a separate manual owner action.`, `Publish gate hard blockers open: ${hardOpen.join(", ") || "none"}`, ""];
  for (const k of ["passed", "pending", "blocked", "unverified"] as AGroup[]) {
    const rows = MATRIX.filter((m) => itemStatus(m.key, entries, signedIn).status === k);
    lines.push(`## ${k} (${rows.length})`);
    for (const m of rows) lines.push(`- ${m.surface} ${m.route} ${m.action} as ${m.role}: expect ${m.expect}; scope ${m.scope}; ${m.sensitivity}; ${itemStatus(m.key, entries, signedIn).reason}`);
    lines.push("");
  }
  return redactDrill(lines.join("\n"));
}
