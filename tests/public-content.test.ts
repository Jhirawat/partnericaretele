import { test, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { PUBLIC_PAGES, faqLd } from "../src/lib/public-content";
import { INDEXABLE_PATHS, PRIVATE_PREFIXES } from "../src/lib/seo";
const pages = Object.values(PUBLIC_PAGES);
const all = (p: (typeof pages)[number]) => [p.h1, p.intent, ...p.sections, ...p.faq.flatMap((f) => [f.q, f.a]), ...p.related.map((r) => r.label)];

test("every indexable route has Thai and English intent and H1 copy", () => {
  expect(Object.keys(PUBLIC_PAGES).sort()).toEqual([...INDEXABLE_PATHS].sort());
  for (const p of pages) for (const b of all(p)) { expect(b.th.trim().length).toBeGreaterThan(1); expect(b.en.trim().length).toBeGreaterThan(1); }
});
test("H1 and search intent are unique across routes", () => {
  for (const k of ["th", "en"] as const) {
    expect(new Set(pages.map((p) => p.h1[k])).size).toBe(pages.length);
    expect(new Set(pages.map((p) => p.intent[k])).size).toBe(pages.length);
  }
});
test("internal links only target indexable public routes, never self or private", () => {
  for (const p of pages) for (const r of p.related) {
    expect(INDEXABLE_PATHS as readonly string[]).toContain(r.to);
    expect(r.to).not.toBe(p.path);
    expect(PRIVATE_PREFIXES.some((x) => r.to.startsWith(x))).toBe(false);
    expect(/click here|คลิกที่นี่/i.test(r.label.en + r.label.th)).toBe(false);
  }
});
test("FAQ structured data exactly mirrors visible FAQ copy", () => {
  for (const p of pages) {
    const ld = faqLd(p.faq);
    expect(ld.mainEntity.length).toBe(p.faq.length * 2);
    for (const q of ld.mainEntity) {
      const src = p.faq.find((f) => f.q[q.inLanguage as "th" | "en"] === q.name)!;
      expect(src).toBeDefined();
      expect(q.acceptedAnswer.text).toBe(src.a[q.inLanguage as "th" | "en"]);
    }
  }
});
test("public copy carries no clinical outcomes, reviews, prices, certifications or personal data", () => {
  const text = pages.flatMap(all).map((b) => b.th + " " + b.en).join(" ");
  expect(/cure|guarantee|rating|review(s|ed by)? from|stars|certified|award|฿|\$\d|@|\d{6,}|รักษาหาย|รับรองผล/i.test(text)).toBe(false);
});
test("private routes never get canonical/index and are absent from the content map", () => {
  for (const x of PRIVATE_PREFIXES) expect(Object.keys(PUBLIC_PAGES).some((p) => p.startsWith(x))).toBe(false);
});
test("basic performance budget: image dimensions, font weights, no backend client on public pages", () => {
  const brand = readFileSync("src/components/BrandIdentity.tsx", "utf8");
  expect(brand).toMatch(/width=\{48\}/); expect(brand).toMatch(/height=\{48\}/);
  const root = readFileSync("src/routes/__root.tsx", "utf8");
  const font = root.match(/fonts\.googleapis\.com\/css2\?[^"]+/)![0];
  expect(font).toContain("display=swap");
  expect((font.match(/\d{3}/g) ?? []).length).toBeLessThanOrEqual(9);
  for (const f of ["src/routes/index.tsx", "src/routes/partner-apply.tsx", "src/components/PartnerLanding.tsx", "src/components/PublicContent.tsx"])
    expect(readFileSync(f, "utf8")).not.toMatch(/integrations\/supabase|recharts|leaflet/);
  const imgs = readdirSync("src/components").filter((f) => f.endsWith(".tsx")).flatMap((f) => (readFileSync("src/components/" + f, "utf8").match(/<img[\s\S]*?\/>/g) ?? []));
  for (const i of imgs) expect(/width=|className="[^"]*\bh-\d/.test(i)).toBe(true);
});
