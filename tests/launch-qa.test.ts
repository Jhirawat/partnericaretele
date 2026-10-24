import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { QA_ROUTES, PRIVATE_QA_ROUTES, manualChecks, fromCrawl, errorStateChecks, stamp, group, REVIEWER_TEMPLATE } from "../src/lib/launch-qa";
import { INDEXABLE_PATHS } from "../src/lib/seo";
import { CRAWL_ROUTES, isPrivatePath } from "../src/lib/seo-crawl";
import { JOURNEY, PUBLIC_ROUTES_ALLOWED } from "../src/lib/public-journey";

test("grouping covers all four statuses and never claims readiness", () => {
  const g = group(stamp([...fromCrawl([{ route: "/", check: "title", ok: true, severity: "info", evidence: "ok", owner: "Content", nextAction: "None" }]), ...manualChecks()]));
  expect(g.passed.length).toBe(1); expect(g.pending.length).toBeGreaterThan(0); expect(g.blocked.length).toBeGreaterThan(0); expect(g.unverified.length).toBeGreaterThan(0);
  expect(g.releaseReady).toBe(false);
});
test("human, signed-in and unmeasured checks never auto-pass", () => {
  const m = manualChecks();
  expect(m.some((c) => c.status === "passed")).toBe(false);
  for (const c of m.filter((c) => c.area === "Signed-in")) expect(c).toMatchObject({ status: "blocked", evidence: "Blocked: no authorized test account exists" });
  for (const id of ["a11y:keyboard", "a11y:contrast"]) expect(m.find((c) => c.id === id)!.status).toBe("unverified");
  expect(m.filter((c) => c.id.startsWith("gov:")).every((c) => c.status === "pending")).toBe(true);
  expect(fromCrawl([{ route: "/", check: "title", ok: false, severity: "high", evidence: "x", owner: "Content", nextAction: "fix" }])[0]!.status).toBe("pending");
  expect(errorStateChecks("<p>Page not found</p>", 404).find((c) => c.id === "error:boundary")!.status).toBe("unverified");
});
test("route coverage: home, apply, demo, 404 probe and every private family", () => {
  for (const r of ["/", "/partner-apply", "/care-demo"]) expect(QA_ROUTES as readonly string[]).toContain(r);
  expect(QA_ROUTES.some((r) => r.includes("404"))).toBe(true);
  for (const r of PRIVATE_QA_ROUTES) { expect(isPrivatePath(r)).toBe(true); expect(INDEXABLE_PATHS as readonly string[]).not.toContain(r); }
  expect(CRAWL_ROUTES as readonly string[]).toContain("/launch-qa");
});
test("redaction: evidence strips emails, keys, numbers and outside links; ids are unique", () => {
  const s = stamp([{ id: "x", area: "SEO", route: "/", status: "pending", evidence: "a@b.co eyJabcdefghijklmn 0812345678 https://evil.example", owner: "E", nextAction: "n" }, { id: "y", area: "SEO", route: "/", status: "pending", evidence: "", owner: "E", nextAction: "n" }], new Date("2026-10-20T12:00:00Z"));
  expect(s[0]!.evidence).toBe("[email] [secret] [number] [external-url]");
  expect(s[0]!.correlationId).toBe("qa-20261020120000-001"); expect(new Set(s.map((x) => x.correlationId)).size).toBe(2);
  expect(REVIEWER_TEMPLATE).not.toMatch(/@\w|https?:|\d{6,}/); expect(REVIEWER_TEMPLATE).toMatch(/NOT claimed/);
});
test("error-state checks flag leaks and the probe token", () => {
  expect(errorStateChecks("<p>Page not found</p>", 404).find((c) => c.id === "error:no-leak")!.status).toBe("passed");
  expect(errorStateChecks("<p>Page not found relation \"users\" __qa-token</p>", 404).find((c) => c.id === "error:no-leak")!.status).toBe("pending");
});
test("CTA safety: every journey target is an allowed public route", () => {
  for (const j of JOURNEY) expect(PUBLIC_ROUTES_ALLOWED as readonly string[]).toContain(j.target.split("?")[0]!);
});
test("no accidental indexing: QA page is noindex, out of sitemap, no external calls", () => {
  const s = readFileSync("src/routes/launch-qa.tsx", "utf8") + readFileSync("src/lib/launch-qa.ts", "utf8");
  expect(s).toMatch(/noindex, nofollow/); expect(s).toMatch(/sitemap: false/);
  for (const m of s.matchAll(/fetch\(([^)]*)\)/g)) expect(m[1]).not.toMatch(/https?:/);
  expect(s).not.toMatch(/gtag|analytics\.|pixel|segment\.io/i);
});
