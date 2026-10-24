import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { protectionGroup, protectionGateStatus, protectionExport, groupProtection, simulateProtection, unsafeProtection, checkOrder, rlsGaps, lockedTables, storageGaps, scopeGaps, PROTECTION_FIXTURES, type ProtectionEntry } from "../src/lib/protection-evidence";
import { buildGate, gateSummary } from "../src/lib/publish-gate";
import { isPrivatePath } from "../src/lib/seo-crawl";

const e = (o: Partial<ProtectionEntry> = {}): ProtectionEntry => ({ id: "i", lineage: "l", version: 1, environment_label: "Production", migration_label: "Release label", applied_date: "2026-10-19", migration_history: "matched", rls_result: "all_enabled", protected_tables: "all_protected", storage_policy: "private", owner_role: "SUPER_ADMIN", reviewer_role: "OPERATIONS_ADMIN", evidence_ref: "live check one", status: "pending", next_action: "Confirm", correlation_id: "c", created_at: "t", mine: false, latest: true, confirmations: [], ...o });
const ok = { outcome: "confirmed" as const, independent: true, mine: false, created_at: "t", correlation_id: "k" };

test("passes only with an independent confirmation", () => {
  expect(protectionGroup(e()).group).toBe("pending");
  expect(protectionGroup(e({ confirmations: [{ ...ok, independent: false }] })).group).toBe("pending");
  expect(protectionGroup(e({ confirmations: [ok] })).group).toBe("passed");
  expect(protectionGroup(e({ confirmations: [ok, { ...ok, outcome: "rejected" }] })).group).toBe("blocked");
});
test("gaps block; unchecked results stay unverified; superseded versions ignored", () => {
  for (const o of [{ migration_history: "drift" }, { rls_result: "gaps" }, { protected_tables: "gaps" }, { storage_policy: "public_found" }] as Partial<ProtectionEntry>[]) expect(protectionGroup(e({ ...o, confirmations: [ok] })).group).toBe("blocked");
  for (const o of [{ applied_date: null }, { rls_result: "not_checked" }, { storage_policy: "not_checked" }] as Partial<ProtectionEntry>[]) expect(protectionGroup(e({ ...o, confirmations: [ok] })).group).toBe("unverified");
  const g = groupProtection([e({ latest: false, confirmations: [ok] }), e({ id: "2", version: 2 })]);
  expect(g.passed.length).toBe(0); expect(g.pending.length).toBe(1);
});
test("gate stays closed signed out, empty, or unconfirmed", () => {
  for (const [entries, signedIn] of [[null, false], [[e({ confirmations: [ok] })], false], [[], true], [[e()], true]] as const) {
    const s = gateSummary(buildGate({ checklist: null, acks: null, signedIn, protection: entries as ProtectionEntry[] | null }));
    expect(s.hardOpen).toContain("protection:register"); expect(s.productionReadyClaimed).toBe(false);
  }
  expect(protectionGateStatus([e({ confirmations: [ok] })], true).status).toBe("passed");
});
test("redaction refuses secrets, links, schema dumps, personal data and long numbers", () => {
  for (const t of ["s3://bucket/x", "https://x.io", "pg_dump", "CREATE POLICY x", "ALTER TABLE t", "GRANT SELECT ON t", "a@b.co", "token abc", "0812345678", "schema.json", "-----BEGIN CERT"]) expect(unsafeProtection(t)).toBe(true);
  expect(unsafeProtection("Live migration check")).toBe(false);
  const out = protectionExport([e({ evidence_ref: "a@b.co 0812345678" })], true);
  expect(out.includes("a@b.co") || out.includes("0812345678")).toBe(false);
  expect(out).toContain("NOT claimed"); expect(out).toContain("Evidence gaps and next actions");
  for (const k of ["passed", "pending", "blocked", "unverified"]) expect(out).toContain(`## ${k}`);
});
test("migration order, RLS coverage, storage and scope logic", () => {
  expect(checkOrder([{ id: 1, name: "a" }, { id: 2, name: "b" }])).toBe(true);
  expect(checkOrder([{ id: 2, name: "b" }, { id: 1, name: "a" }])).toBe(false);
  expect(checkOrder([{ id: 1, name: "a" }, { id: 1, name: "b" }])).toBe(false);
  expect(checkOrder([{ id: 1, name: "a" }, { id: 2, name: "a" }])).toBe(false);
  expect(rlsGaps([{ name: "a", rls: true, policies: 1 }, { name: "b", rls: false, policies: 2 }])).toEqual(["b"]);
  expect(lockedTables([{ name: "a", rls: true, policies: 0 }])).toEqual(["a"]);
  expect(storageGaps([{ name: "docs", public: true, privateFiles: true }, { name: "logo", public: true, privateFiles: false }])).toEqual(["docs"]);
  expect(scopeGaps([{ role: "SUPER_ADMIN", scope: "org", global: true }, { role: "OPS", scope: null, global: false }, { role: "OK", scope: null, global: true }])).toEqual(["SUPER_ADMIN", "OPS"]);
});
test("simulator is synthetic-only", () => {
  expect(simulateProtection(PROTECTION_FIXTURES[0]!).result).toBe("success");
  expect(simulateProtection(PROTECTION_FIXTURES[1]!).result).toBe("failed");
  expect(() => simulateProtection({ ...PROTECTION_FIXTURES[0]!, synthetic: false } as never)).toThrow("SYNTHETIC_ONLY");
  expect(Object.isFrozen(PROTECTION_FIXTURES[0])).toBe(true);
});
test("page is private, linked, and makes no external or schema calls", () => {
  expect(isPrivatePath("/protection-evidence")).toBe(true);
  const src = ["src/routes/protection-evidence.tsx", "src/lib/protection-evidence.ts", "src/lib/protection-evidence.functions.ts"].map((f) => readFileSync(f, "utf8")).join("");
  expect(src).toContain("noindex, nofollow");
  expect(/fetch\(|XMLHttpRequest|sendBeacon|\.from\(|supabase\.storage|pg_catalog|information_schema/.test(src)).toBe(false);
  for (const f of ["src/routes/publish-gate.tsx", "src/routes/release-runbook.tsx"]) expect(readFileSync(f, "utf8")).toContain('to="/protection-evidence"');
});
