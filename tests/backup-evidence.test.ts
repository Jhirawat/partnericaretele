import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { backupGroup, backupGateStatus, backupExport, groupRegister, simulateRestore, unsafeBackup, FIXTURES, type BackupEntry } from "../src/lib/backup-evidence";
import { buildGate, gateSummary } from "../src/lib/publish-gate";
import { isPrivatePath } from "../src/lib/seo-crawl";

const e = (o: Partial<BackupEntry> = {}): BackupEntry => ({ id: "i", lineage: "l", version: 1, scope_label: "Main database", environment_label: "Production", backup_date: "2026-10-19", retention_days: 30, restore_test_date: "2026-10-20", restore_result: "success", owner_role: "SUPER_ADMIN", reviewer_role: "OPERATIONS_ADMIN", evidence_ref: "drill label", status: "pending", next_action: "Confirm", correlation_id: "c", created_at: "t", mine: false, latest: true, confirmations: [], ...o });
const ok = { outcome: "confirmed" as const, independent: true, mine: false, created_at: "t", correlation_id: "k" };

test("never passes without an independent confirmation", () => {
  expect(backupGroup(e()).group).toBe("pending");
  expect(backupGroup(e({ confirmations: [{ ...ok, independent: false }] })).group).toBe("pending");
  expect(backupGroup(e({ confirmations: [ok] })).group).toBe("passed");
  expect(backupGroup(e({ confirmations: [ok, { ...ok, outcome: "rejected" }] })).group).toBe("blocked");
});
test("manual gaps stay unverified; failed restore blocks; superseded versions ignored", () => {
  expect(backupGroup(e({ backup_date: null, confirmations: [ok] })).group).toBe("unverified");
  expect(backupGroup(e({ restore_result: "not_tested", confirmations: [ok] })).group).toBe("unverified");
  expect(backupGroup(e({ restore_result: "failed" })).group).toBe("blocked");
  const g = groupRegister([e({ latest: false, confirmations: [ok] }), e({ id: "2", version: 2 })]);
  expect(g.passed.length).toBe(0); expect(g.pending.length).toBe(1);
});
test("gate stays closed signed out, with no records, and until confirmed", () => {
  for (const [entries, signedIn] of [[null, false], [[e({ confirmations: [ok] })], false], [[], true], [[e()], true]] as const) {
    const s = gateSummary(buildGate({ checklist: null, acks: null, signedIn, backup: entries as BackupEntry[] | null }));
    expect(s.hardOpen).toContain("backup:register"); expect(s.productionReadyClaimed).toBe(false);
  }
  expect(backupGateStatus([e({ confirmations: [ok] })], true).status).toBe("passed");
});
test("redaction refuses secrets, storage links, dumps, personal data and long numbers", () => {
  for (const t of ["s3://bucket/x", "https://x.io/b", "pg_dump main", "INSERT INTO users", "a@b.co", "token abc", "0812345678", "backup.sql", "-----BEGIN CERT"]) expect(unsafeBackup(t)).toBe(true);
  expect(unsafeBackup("Main database nightly")).toBe(false);
  const out = backupExport([e({ evidence_ref: "a@b.co 0812345678" })], true);
  expect(out.includes("a@b.co")).toBe(false); expect(out.includes("0812345678")).toBe(false);
  expect(out).toContain("does not prove"); expect(out).toContain("NOT claimed"); expect(out).toContain("Manual evidence gaps");
  for (const k of ["passed", "pending", "blocked", "unverified"]) expect(out).toContain(`## ${k}`);
});
test("simulator is synthetic-only and never records evidence", () => {
  expect(simulateRestore(FIXTURES[0]).result).toBe("success");
  expect(simulateRestore(FIXTURES[1]).diffs).toEqual(["ledger_rows"]);
  expect(() => simulateRestore({ ...FIXTURES[0], synthetic: false } as never)).toThrow("SYNTHETIC_ONLY");
  expect(Object.isFrozen(FIXTURES) && Object.isFrozen(FIXTURES[0])).toBe(true);
});
test("page is private, linked, and makes no external calls", () => {
  expect(isPrivatePath("/backup-evidence")).toBe(true);
  const src = ["src/routes/backup-evidence.tsx", "src/lib/backup-evidence.ts", "src/lib/backup-evidence.functions.ts"].map((f) => readFileSync(f, "utf8")).join("");
  expect(src).toContain("noindex, nofollow");
  expect(/fetch\(|XMLHttpRequest|sendBeacon|\.from\(|\.storage/.test(src)).toBe(false);
  expect(readFileSync("src/routes/publish-gate.tsx", "utf8")).toContain('to="/backup-evidence"');
  expect(readFileSync("src/routes/release-runbook.tsx", "utf8")).toContain('to="/backup-evidence"');
});
