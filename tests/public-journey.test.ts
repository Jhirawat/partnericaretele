import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { JOURNEY, PUBLIC_ROUTES_ALLOWED } from "../src/lib/public-journey";
import { safeAuthDestination } from "../src/lib/auth-destination";
import { PUBLIC_PAGES } from "../src/lib/public-content";
const read = (f: string) => readFileSync(f, "utf8");
const PUBLIC_FILES = ["src/components/PartnerLanding.tsx", "src/routes/partner-apply.tsx", "src/routes/care-demo.tsx", "src/components/PublicContent.tsx", "src/components/PublicStates.tsx"];

test("every journey CTA targets an existing public route and is bilingual", () => {
  for (const j of JOURNEY) {
    const path = j.target.split("?")[0]!;
    expect(PUBLIC_ROUTES_ALLOWED as readonly string[]).toContain(path);
    expect(j.cta.th.length).toBeGreaterThan(1); expect(j.cta.en.length).toBeGreaterThan(1);
    const next = new URLSearchParams(j.target.split("?")[1] ?? "").get("next");
    if (next) expect(safeAuthDestination(next)).toBe(next as never);
  }
});
test("journey checklist holds no visitor identity or behaviour fields", () => {
  const keys = new Set(JOURNEY.flatMap((j) => Object.keys(j)));
  for (const k of ["email", "ip", "userId", "sessionId", "visitor", "clicks", "timestamp"]) expect(keys.has(k)).toBe(false);
  expect(read("src/lib/public-journey.ts")).not.toMatch(/fetch\(|localStorage|document\.cookie/);
});
test("public CTAs in source point only at allowed routes", () => {
  for (const f of PUBLIC_FILES) for (const m of read(f).matchAll(/to="([^"]+)"/g)) expect(PUBLIC_ROUTES_ALLOWED as readonly string[]).toContain(m[1]!);
});
test("auth redirect parameter refuses external, protocol-relative and unknown targets", () => {
  for (const bad of ["https://evil.example", "//evil.example", "/superadmin-console", "javascript:alert(1)", "/dashboard?x=1", ["/dashboard"]]) expect(safeAuthDestination(bad)).toBeUndefined();
  expect(safeAuthDestination("/partner-onboarding")).toBe("/partner-onboarding");
});
test("operational pages sit behind the sign-in gate", () => {
  const gate = read("src/routes/_authenticated/route.tsx");
  expect(gate).toMatch(/redirect\(\{ to: "\/auth" \}\)/);
  for (const f of ["dashboard", "release-readiness", "credit-reconciliation"]) expect(() => read(`src/routes/_authenticated/${f}.tsx`)).not.toThrow();
});
test("public error and 404 states never render error details", () => {
  const s = read("src/components/PublicStates.tsx");
  expect(s).not.toMatch(/error\.(message|stack)|String\(error\)|JSON\.stringify\(error|console\.(log|error)/);
  const shown = [...s.matchAll(/(?:th|en|body)="([^"]*)"|>([^<>{}]+)</g)].map((m) => m[1] ?? m[2]).join(" ");
  expect(shown).toContain("Page not found");
  expect(shown).not.toMatch(/@[\w-]+\.\w|supabase|postgres|token|https?:\/\//i);
  for (const f of ["src/routes/__root.tsx", "src/router.tsx"]) expect(read(f)).toMatch(/PublicNotFound/);
});
test("keyboard and focus: public CTAs are real links/buttons with visible focus and 44px targets", () => {
  for (const f of PUBLIC_FILES) { const s = read(f); expect(s).not.toMatch(/<div[^>]*onClick|<span[^>]*onClick|tabIndex=\{-1\}|outline-none(?![^"]*focus-visible:ring)/); }
  expect(read("src/components/ui/button.tsx")).toMatch(/focus-visible:ring-2/);
  expect(read("src/components/PublicStates.tsx")).toMatch(/min-h-11/);
});
test("language consistency: same CTA meaning uses the same Thai label", () => {
  const byEn = new Map<string, string>();
  for (const l of [...JOURNEY.map((j) => j.cta), ...Object.values(PUBLIC_PAGES).flatMap((p) => p.related.map((r) => r.label))]) {
    if (byEn.has(l.en)) expect(byEn.get(l.en)).toBe(l.th); else byEn.set(l.en, l.th);
  }
});
test("no tracking, analytics, ads or personal-data inputs on public pages", () => {
  const all = PUBLIC_FILES.map(read).join("\n") + read("src/routes/__root.tsx");
  expect(all).not.toMatch(/gtag|googletagmanager|fbq\(|facebook\.net|hotjar|segment\.io|clarity\.ms|doubleclick|<input|<form/i);
});
