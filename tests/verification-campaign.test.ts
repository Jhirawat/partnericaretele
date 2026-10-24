import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { CHECKS, SUITES, appendRun, campaignExport, dryRun, honestStatus, missingPrereqs, summarize, NOTHING_AVAILABLE } from "../src/lib/verification-campaign";
import { isPrivatePath } from "../src/lib/seo-crawl";
const all = { signedIn: true, secondReviewer: true, manualEvidence: true, ownerFacts: true };

test("suite coverage: every one of the 20 suites has at least one check", () => {
  expect(SUITES.length).toBe(20);
  for (const s of SUITES) expect(CHECKS.some((c) => c.suite === s)).toBe(true);
  expect(new Set(CHECKS.map((c) => c.id)).size).toBe(CHECKS.length);
});
test("prerequisite blocking: signed-in checks are blocked without a test account", () => {
  const r = dryRun(NOTHING_AVAILABLE);
  for (const c of CHECKS) { const x = r.find((y) => y.checkId === c.id)!; expect(x.status).toBe(missingPrereqs(c, NOTHING_AVAILABLE).length ? "blocked" : "unverified"); }
  expect(r.find((x) => x.checkId === "credit-invariants")!.status).toBe("blocked");
});
test("status honesty: dry runs never pass, simulated passes are downgraded", () => {
  const s = summarize(dryRun(all));
  expect(s.passed).toBe(0); expect(s.productionReadyClaimed).toBe(false);
  const c = CHECKS.find((x) => x.id === "no-external")!;
  expect(honestStatus(c, { status: "passed", simulated: true }, all)).toBe("unverified");
  expect(honestStatus(CHECKS.find((x) => x.id === "doctor-scope")!, { status: "passed", simulated: false }, NOTHING_AVAILABLE)).toBe("blocked");
});
test("append-only history: earlier runs are frozen and unchanged", () => {
  const h1 = appendRun([], "first", dryRun(), true);
  const h2 = appendRun(h1, "second", dryRun(), true);
  expect(h1.length).toBe(1); expect(h2.length).toBe(2); expect(h2[0]).toBe(h1[0]!);
  expect(Object.isFrozen(h2)).toBe(true); expect(Object.isFrozen(h2[0]!.results[0])).toBe(true);
  expect(() => (h2 as unknown as unknown[]).push(1)).toThrow();
});
test("redaction: unsafe labels/evidence refused and export redacts", () => {
  expect(() => appendRun([], "mail ops@example.com", dryRun(), true)).toThrow("UNSAFE_TEXT");
  const bad = dryRun().map((r, i) => (i ? r : { ...r, evidence: "see https://evil.example 0812345678" }));
  expect(() => appendRun([], "ok run", bad, true)).toThrow("UNSAFE_TEXT");
  const out = campaignExport([], dryRun());
  expect(out).toMatch(/NOT claimed/); expect(out).not.toMatch(/https?:|@/);
});
test("scope, no publish, no external calls, not indexed", () => {
  const src = ["src/routes/verification-campaign.tsx", "src/lib/verification-campaign.ts"].map((f) => readFileSync(f, "utf8")).join("\n");
  expect(src).toMatch(/noindex, nofollow/); expect(src).toMatch(/sitemap: false/); expect(isPrivatePath("/verification-campaign")).toBe(true);
  expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|supabase|publish\(|deploy\(|gtag|analytics\./i);
  expect(readFileSync("src/routes/publish-gate.tsx", "utf8")).toMatch(/to="\/verification-campaign"/);
  expect(readFileSync("src/routes/release-runbook.tsx", "utf8")).toMatch(/to="\/verification-campaign"/);
});
