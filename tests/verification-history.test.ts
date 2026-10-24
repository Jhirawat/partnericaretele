import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { dryRun, storedExport, storedStatus, toStoredPayload, type StoredResult, type StoredRun } from "../src/lib/verification-campaign";
import { isPrivatePath } from "../src/lib/seo-crawl";
const all = { signedIn: true, secondReviewer: true, manualEvidence: true, ownerFacts: true };
const base: StoredResult = { id: "r1", check_id: "no-external", suite: "No external calls", scope: "Whole app", prerequisite_state: "none missing", expected: "x", status: "unverified", simulated: false, owner_role: "SUPER_ADMIN", evidence_ref: "note", next_action: "next", correlation_id: "c", created_at: "t", confirmations: [] };
const ok = { outcome: "confirmed" as const, independent: true, mine: false, created_at: "t", correlation_id: "c2" };

test("status honesty: simulated never passes, even when confirmed", () => {
  expect(storedStatus({ ...base, simulated: true, confirmations: [ok] }, all)).toBe("unverified");
});
test("real result passes only with an independent confirmation and prerequisites", () => {
  expect(storedStatus(base, all)).toBe("unverified");
  expect(storedStatus({ ...base, confirmations: [{ ...ok, independent: false }] }, all)).toBe("unverified");
  expect(storedStatus({ ...base, confirmations: [ok] }, all)).toBe("passed");
  expect(storedStatus({ ...base, check_id: "doctor-scope", confirmations: [ok] })).toBe("blocked");
  expect(storedStatus({ ...base, confirmations: [ok, { ...ok, outcome: "rejected" }] }, all)).toBe("blocked");
});
test("payload never sends passed and blocks missing prerequisites", () => {
  const p = toStoredPayload(dryRun().map((r) => ({ ...r, status: "passed" as const })));
  expect(p.some((r) => r.status === "passed")).toBe(false);
  expect(p.find((r) => r.check_id === "credit-invariants")!.status).toBe("blocked");
});
test("export safety: redacts and states readiness not claimed", () => {
  const run: StoredRun = { id: "g", run_no: 1, campaign_version: "v1", label: "mail ops@example.com", simulated: true, mine: true, correlation_id: "c", created_at: "t", results: [{ ...base, evidence_ref: "https://evil.example 0812345678" }] };
  const out = storedExport([run]);
  expect(out).toMatch(/NOT claimed/); expect(out).toMatch(/SIMULATED/); expect(out).not.toMatch(/https?:|@|0812345678/);
});
test("private, signed-in only, no publish, no external calls, linked", () => {
  const src = readFileSync("src/routes/_authenticated/verification-history.tsx", "utf8");
  expect(src).toMatch(/noindex, nofollow/); expect(isPrivatePath("/verification-history")).toBe(true);
  expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|publish\(|deploy\(|gtag|analytics\./i);
  expect(readFileSync("src/lib/verification-campaign.functions.ts", "utf8")).toMatch(/requireSupabaseAuth/);
  for (const f of ["src/routes/publish-gate.tsx", "src/routes/verification-campaign.tsx"]) expect(readFileSync(f, "utf8")).toMatch(/to="\/verification-history"/);
  const sql = readFileSync("db/0078_verification_campaign_runs.sql", "utf8");
  expect(sql).not.toMatch(/'passed'/); expect(sql).toMatch(/SIMULATED_NOT_CONFIRMABLE/); expect(sql).toMatch(/REVOKE ALL ON FUNCTION[^;]*FROM PUBLIC,anon/);
});
