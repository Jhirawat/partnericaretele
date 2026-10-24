import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { SCENARIOS, SYNTHETIC_BASE, simulateDrill, redactDrill, drillReport, bannerMessageSafe, RUNBOOK, type Scenario } from "../src/lib/release-runbook";
import { isPrivatePath } from "../src/lib/seo-crawl";

test("every drill leaves protected synthetic counts unchanged and base untouched", () => {
  for (const k of Object.keys(SCENARIOS) as Scenario[]) {
    const r = simulateDrill(k);
    expect(r.status).toBe("passed");
    for (const f of ["credits", "certificates", "auditRows", "migrations"] as const) expect(r.after[f]).toBe(SYNTHETIC_BASE[f]);
  }
  expect(Object.isFrozen(SYNTHETIC_BASE)).toBe(true);
  expect(SYNTHETIC_BASE.version).toBe("v-current");
});
test("non-synthetic state is refused", () => {
  expect(() => simulateDrill("credit_anomaly", { ...SYNTHETIC_BASE, synthetic: false } as never)).toThrow("SYNTHETIC_ONLY");
});
test("redaction removes emails, links, tokens, PEM and long numbers", () => {
  const out = redactDrill("a@b.co https://x.io eyJa.b.c sk_live1 0812345678 -----BEGIN CERT-----x-----END CERT-----");
  for (const s of ["a@b.co", "https://", "eyJa", "sk_live1", "0812345678", "BEGIN"]) expect(out.includes(s)).toBe(false);
});
test("report never claims readiness and states publish is manual", () => {
  const r = drillReport([{ scenario: "x", expected: "e", observed: "o mail a@b.co", status: "passed", evidence_ref: "drill one", next_action: "n", correlation_id: "c", created_at: "t", mine: true }]);
  expect(r).toContain("NOT claimed"); expect(r).toContain("separate manual"); expect(r.includes("a@b.co")).toBe(false);
});
test("maintenance banner messages must be safe", () => {
  expect(bannerMessageSafe("Scheduled maintenance tonight")).toBe(true);
  for (const m of ["", "see https://x.io", "mail a@b.co", "call 0812345678"]) expect(bannerMessageSafe(m)).toBe(false);
});
test("runbook covers every section with owner and backup owner", () => {
  expect(RUNBOOK.map((s) => s.id)).toEqual(["pre", "day", "post", "incident", "banner", "rollback", "restore"]);
  for (const s of RUNBOOK) { expect(s.owner.role).not.toBe(s.owner.backup); expect(s.steps.length).toBeGreaterThan(0); }
});
test("page is private, noindex, and has no publish or external calls", () => {
  expect(isPrivatePath("/release-runbook")).toBe(true);
  const src = readFileSync("src/routes/release-runbook.tsx", "utf8") + readFileSync("src/lib/release-runbook.ts", "utf8") + readFileSync("src/lib/release-runbook.functions.ts", "utf8");
  expect(src).toContain("noindex, nofollow");
  expect(/fetch\(|XMLHttpRequest|sendBeacon|publish\(|\.from\(/.test(src)).toBe(false);
  expect(readFileSync("src/routes/publish-gate.tsx", "utf8")).toContain('to="/release-runbook"');
});
