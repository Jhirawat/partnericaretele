import { test, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { buildGate, gateSummary, gateReport, reviewStatus, REVIEW_ITEMS, HARD_BLOCKERS, type Ack } from "../src/lib/publish-gate";
import { isPrivatePath } from "../src/lib/seo-crawl";
const ack = (item: string, n: number, outcome: Ack["outcome"] = "acknowledged", round = 1): Ack => ({ item_key: item, outcome, note: "ok note", round, correlation_id: "c" + n + round, created_at: "2026-10-20", mine: false, reviewer_no: n });
const allAcks = REVIEW_ITEMS.flatMap((i) => [ack(i.key, 1), ack(i.key, 2)]);

test("signed out: gate closed, every hard blocker open, readiness never claimed", () => {
  const s = gateSummary(buildGate({ checklist: null, acks: null, signedIn: false }));
  expect(s.productionReadyClaimed).toBe(false);
  expect(s.hardOpen).toEqual([...HARD_BLOCKERS]);
  expect(s.passed).toBe(0);
});
test("counts are exact and sum to total", () => {
  const rows = buildGate({ checklist: null, acks: null, signedIn: false });
  const s = gateSummary(rows);
  expect(s.passed + s.pending + s.blocked + s.unverified).toBe(s.total);
  expect(s.total).toBe(15 + REVIEW_ITEMS.length + rows.filter((r) => r.source === "Launch QA").length + 5);
  expect(s.blockers.length).toBe(s.total - s.passed);
  for (const b of s.blockers) { expect(b.owner.length).toBeGreaterThan(0); expect(b.requiredEvidence.length).toBeGreaterThan(0); expect(b.nextAction.length).toBeGreaterThan(0); expect(b.reason.length).toBeGreaterThan(0); }
});
test("reviewer separation: one reviewer never passes; two distinct do; any concern blocks", () => {
  expect(reviewStatus("contact", [ack("contact", 1), ack("contact", 1, "acknowledged", 2)]).status).toBe("pending");
  expect(reviewStatus("contact", [ack("contact", 1), ack("contact", 2)]).status).toBe("passed");
  expect(reviewStatus("contact", [ack("contact", 1), ack("contact", 2, "concern")]).status).toBe("blocked");
  expect(reviewStatus("contact", [ack("contact", 1), ack("contact", 2, "concern"), ack("contact", 2, "acknowledged", 2)]).status).toBe("passed");
  expect(reviewStatus("contact", null).status).toBe("blocked");
});
test("full reviews still leave the gate closed while backup/restore and signed-in checks are incomplete", () => {
  const s = gateSummary(buildGate({ checklist: null, acks: allAcks, signedIn: true }));
  expect(s.hardOpen).toEqual(["checklist:backup_restore", "backup:register", "protection:register", "content:register", "access:register", "signed-in"]);
  expect(s.productionReadyClaimed).toBe(false);
});
test("report is redacted and never claims readiness", () => {
  const rows = buildGate({ checklist: null, acks: null, signedIn: false });
  rows[0] = { ...rows[0]!, reason: "ask ops@example.com 0812345678 https://evil.example eyJabcdefghijklmnop" };
  const r = gateReport(rows, new Date("2026-10-20T12:00:00Z"));
  expect(r).toMatch(/NOT claimed/); expect(r).not.toMatch(/ops@example|0812345678|evil\.example|eyJabc/);
  expect(buildGate({ checklist: null, acks: [{ ...ack("wording", 1), note: "x@y.co" }], signedIn: true }).every((x) => !x.reason.includes("@"))).toBe(true);
});
test("no accidental publish or indexing: page is noindex, private, and calls no publish/deploy API", () => {
  const files = ["src/routes/publish-gate.tsx", "src/lib/publish-gate.ts", "src/lib/publish-gate.functions.ts"].map((f) => readFileSync(f, "utf8")).join("\n");
  expect(files).toMatch(/noindex, nofollow/); expect(files).toMatch(/sitemap: false/); expect(isPrivatePath("/publish-gate")).toBe(true);
  expect(files).not.toMatch(/\bpublish\(|deploy\(|\/api\/publish|gtag|analytics\./i);
  for (const m of files.matchAll(/fetch\(([^)]*)\)/g)) expect(m[1]).not.toMatch(/https?:/);
});
test("acknowledgements are append-only in the database migration", () => {
  const sql = readFileSync("db/0071_release_review_acks.sql", "utf8");
  expect(sql).toMatch(/REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public\.release_review_acks FROM authenticated/);
  expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.release_review_acks/);
  expect(sql).toMatch(/UNIQUE\(item_key,reviewer,round\)/);
  expect(readdirSync("drizzle/migrations").some((f) => f.includes("release_review_acks"))).toBe(true);
});
