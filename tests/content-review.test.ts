import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { contentGroup, typeStatus, contentGateStatus, contentExport, unsafeContent, previewFacts, FICTIONAL_PREVIEW, CONTENT_TYPES, ROUTE_SCOPES, type ContentEntry } from "../src/lib/content-review";
import { buildGate, gateSummary } from "../src/lib/publish-gate";
import { isPrivatePath } from "../src/lib/seo-crawl";
import { INDEXABLE_PATHS } from "../src/lib/seo";

const e = (o: Partial<ContentEntry> = {}): ContentEntry => ({ id: "i", lineage: "l", version: 1, item_type: "clinic_facts", route_scope: "/", scope_label: "Home clinic facts", owner_role: "SUPER_ADMIN", reviewer_role: "OPERATIONS_ADMIN", status: "pending", evidence_ref: "review one", decision_reason: "Matches documents", next_action: "Acknowledge", review_date: "2026-10-20", correlation_id: "c", created_at: "t", mine: false, latest: true, acks: [], ...o });
const ok = { outcome: "acknowledged" as const, independent: true, mine: false, created_at: "t", correlation_id: "k" };
const all = CONTENT_TYPES.map((t, i) => e({ id: `i${i}`, lineage: `l${i}`, item_type: t.key, acks: [ok] }));

test("two-person review: self or missing acknowledgement never passes; any concern blocks", () => {
  expect(contentGroup(e()).group).toBe("pending");
  expect(contentGroup(e({ acks: [{ ...ok, independent: false }] })).group).toBe("pending");
  expect(contentGroup(e({ acks: [ok] })).group).toBe("passed");
  expect(contentGroup(e({ acks: [ok, { ...ok, outcome: "concern" }] })).group).toBe("blocked");
  expect(contentGroup(e({ review_date: null, acks: [ok] })).group).toBe("unverified");
  expect(contentGroup(e({ latest: false, acks: [ok] })).group).toBe("unverified");
});
test("claim types stay separate from fact types", () => {
  const facts = [e({ acks: [ok] })];
  expect(typeStatus("clinic_facts", facts, true).status).toBe("passed");
  for (const t of ["medical_claims", "review_claims", "certification_claims"] as const) expect(typeStatus(t, facts, true).status).toBe("unverified");
  expect(CONTENT_TYPES.filter((t) => t.claim).map((t) => t.key)).toEqual(["medical_claims", "review_claims", "certification_claims"]);
});
test("blocked-state honesty and gate blocking", () => {
  for (const [entries, signedIn] of [[null, false], [all, false], [[], true], [all.slice(1), true], [[...all.slice(1), e({ acks: [{ ...ok, outcome: "concern" }] })], true]] as const) {
    const s = gateSummary(buildGate({ checklist: null, acks: null, signedIn, content: entries as ContentEntry[] | null }));
    expect(s.hardOpen).toContain("content:register"); expect(s.productionReadyClaimed).toBe(false);
  }
  expect(contentGateStatus(null, false).status).toBe("blocked");
  expect(contentGateStatus(all, true).status).toBe("passed");
});
test("redaction refuses links, emails, numbers, documents, secrets and personal data", () => {
  for (const t of ["https://x.io", "a@b.co", "+66 81 234 5678", "0812345678", "licence.pdf", "passport scan", "date of birth", "token abc", "-----BEGIN CERT"]) expect(unsafeContent(t)).toBe(true);
  expect(unsafeContent("Home page clinic facts")).toBe(false);
});
test("route scope is limited to public content areas", () => {
  expect([...ROUTE_SCOPES]).toEqual(["/", "/partner-apply", "/care-demo", "site-wide"]);
  for (const r of ROUTE_SCOPES.filter((x) => x !== "site-wide")) expect((INDEXABLE_PATHS as readonly string[]).includes(r)).toBe(true);
});
test("export is grouped, redacted and never claims readiness", () => {
  const out = contentExport([e({ evidence_ref: "a@b.co 0812345678" })], true, ["content:register"]);
  expect(out.includes("a@b.co") || out.includes("0812345678")).toBe(false);
  expect(out).toContain("NOT claimed"); expect(out).toContain("content:register");
  for (const k of ["passed", "pending", "blocked", "unverified"]) expect(out).toContain(`## ${k}`);
});
test("fictional preview is synthetic-only", () => {
  expect(previewFacts(FICTIONAL_PREVIEW).every((x) => x.includes("fictional"))).toBe(true);
  expect(() => previewFacts({ ...FICTIONAL_PREVIEW, synthetic: false } as never)).toThrow("SYNTHETIC_ONLY");
});
test("page is private, linked, noindex, with no publish or external calls", () => {
  expect(isPrivatePath("/content-review")).toBe(true);
  const src = ["src/routes/content-review.tsx", "src/lib/content-review.ts", "src/lib/content-review.functions.ts"].map((f) => readFileSync(f, "utf8")).join("");
  expect(src).toContain("noindex, nofollow");
  expect(/fetch\(|XMLHttpRequest|sendBeacon|supabase\.from|supabase\.storage|publish\(/.test(src)).toBe(false);
  expect(readFileSync("src/routes/publish-gate.tsx", "utf8")).toContain('to="/content-review"');
});
