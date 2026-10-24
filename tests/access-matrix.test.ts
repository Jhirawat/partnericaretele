import { test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { MATRIX, SIM_USERS, decide, simulateMatrix, accessGroup, itemStatus, accessGateStatus, accessExport, unsafeAccess, type AccessEntry } from "../src/lib/access-matrix";
import { buildGate, gateSummary } from "../src/lib/publish-gate";
import { isPrivatePath } from "../src/lib/seo-crawl";
import { INDEXABLE_PATHS } from "../src/lib/seo";

const ok = { outcome: "confirmed" as const, independent: true, mine: false, created_at: "t", correlation_id: "k" };
const e = (key = "partner_own_org", o: Partial<AccessEntry> = {}): AccessEntry => { const m = MATRIX.find((x) => x.key === key)!; return { id: key, lineage: key, version: 1, item_key: key, expected: m.expect, required_scope: m.scope, sensitivity: m.sensitivity, owner_role: "SUPER_ADMIN", reviewer_role: "OPERATIONS_ADMIN", status: "pending", evidence_ref: "access check", next_action: "Confirm", correlation_id: "c", created_at: "t", mine: false, latest: true, confirmations: [], ...o }; };

test("route coverage: every surface present and every route file exists", () => {
  const surfaces = new Set(MATRIX.map((m) => m.surface));
  for (const s of ["Public", "Auth", "Customer", "Partner", "Doctor", "MCS", "Operations admin", "Superadmin", "Evidence", "Runbook", "Publish gate"]) expect(surfaces.has(s)).toBe(true);
  for (const m of MATRIX) { const f = m.route === "/" ? "src/routes/index.tsx" : `src/routes${m.route}.tsx`; expect(existsSync(f) || existsSync(`src/routes/_authenticated${m.route}.tsx`)).toBe(true); }
  expect(new Set(MATRIX.map((m) => m.key)).size).toBe(MATRIX.length);
});
test("fictional simulator matches every expected decision", () => {
  for (const s of simulateMatrix()) expect(s.got).toBe(s.expect);
});
test("deny by default and no privilege escalation from metadata", () => {
  for (const u of Object.values(SIM_USERS)) { expect(decide(u, "/unknown", "unknown")).toBe("deny"); expect(decide(u, "/publish-gate", "publish")).toBe("deny"); expect(decide(u, "/dashboard", "search_index")).toBe("deny"); }
  expect(decide({ ...SIM_USERS.partner, metadata: { role: "SUPER_ADMIN" } }, "/superadmin-console", "read_aggregate")).toBe("deny");
  expect(decide({ ...SIM_USERS.ops, org: "org-a" }, "/doctor-recruitment", "recruit")).toBe("deny");
  expect(decide({ ...SIM_USERS.superadmin, mfa: false }, "/release-readiness", "record_evidence")).toBe("deny");
  expect(() => decide({ ...SIM_USERS.ops, synthetic: false } as never, "/", "view")).toThrow("SYNTHETIC_ONLY");
});
test("role and scope isolation", () => {
  expect(decide(SIM_USERS.partner, "/dashboard", "read_own_org", "org-b")).toBe("deny");
  expect(decide(SIM_USERS.scoped_ops, "/admin-console", "read_queue", "org-b")).toBe("deny");
  expect(decide({ ...SIM_USERS.doctor, assignedCase: false }, "/doctor-workspace", "read_assigned_case")).toBe("deny");
  expect(decide(SIM_USERS.customer, "/dashboard", "sign_in")).toBe("deny");
});
test("sensitive data stays off anonymous allows; only approved public pages", () => {
  for (const m of MATRIX.filter((x) => x.expect === "allow" && x.role === "anon")) expect(m.sensitivity).toBe("public");
  expect([...INDEXABLE_PATHS]).toEqual(["/", "/partner-apply", "/care-demo"]);
  for (const m of MATRIX.filter((x) => x.sensitivity !== "public")) expect((INDEXABLE_PATHS as readonly string[]).includes(m.route)).toBe(false);
});
test("two-person confirmation, conflicts and versioning", () => {
  expect(accessGroup(e()).group).toBe("pending");
  expect(accessGroup(e(undefined, { confirmations: [{ ...ok, independent: false }] })).group).toBe("pending");
  expect(accessGroup(e(undefined, { confirmations: [ok] })).group).toBe("passed");
  expect(accessGroup(e(undefined, { expected: "deny", confirmations: [ok] })).group).toBe("blocked");
  expect(accessGroup(e(undefined, { confirmations: [ok, { ...ok, outcome: "rejected" }] })).group).toBe("blocked");
  expect(itemStatus("partner_own_org", [e(undefined, { latest: false, confirmations: [ok] })], true).status).toBe("unverified");
});
test("gate stays closed until every item is independently confirmed", () => {
  const all = MATRIX.map((m) => e(m.key, { confirmations: [ok] }));
  for (const [entries, signedIn] of [[null, false], [all, false], [[], true], [all.slice(1), true]] as const) expect(gateSummary(buildGate({ checklist: null, acks: null, signedIn, access: entries as AccessEntry[] | null })).hardOpen).toContain("access:register");
  expect(accessGateStatus(all, true).status).toBe("passed");
});
test("redaction and export safety", () => {
  for (const t of ["https://x.io", "a@b.co", "0812345678", "+66 81 234 5678", "token abc", "passport", "-----BEGIN CERT"]) expect(unsafeAccess(t)).toBe(true);
  expect(unsafeAccess("Partner own organization check")).toBe(false);
  const out = accessExport([e(undefined, { evidence_ref: "a@b.co 0812345678" })], true, ["access:register"]);
  expect(out.includes("a@b.co") || out.includes("0812345678")).toBe(false);
  expect(out).toContain("NOT claimed");
  for (const k of ["passed", "pending", "blocked", "unverified"]) expect(out).toContain(`## ${k}`);
});
test("page is private, noindex, linked, with no external or permission-changing calls", () => {
  expect(isPrivatePath("/access-matrix")).toBe(true);
  const src = ["src/routes/access-matrix.tsx", "src/lib/access-matrix.ts", "src/lib/access-matrix.functions.ts"].map((f) => readFileSync(f, "utf8")).join("");
  expect(src).toContain("noindex, nofollow");
  expect(/fetch\(|XMLHttpRequest|sendBeacon|supabase\.from|supabase\.storage|user_roles|publish\(/.test(src)).toBe(false);
  for (const f of ["src/routes/publish-gate.tsx", "src/routes/release-runbook.tsx"]) expect(readFileSync(f, "utf8")).toContain('to="/access-matrix"');
});
