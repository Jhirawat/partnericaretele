import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { CRAWL_ROUTES, EXCLUDED_SAMPLE, CONTENT_GOVERNANCE, scanPage, parseJsonLd, internalLinks, sitemapPaths, redact, summarize, isPrivatePath } from "../src/lib/seo-crawl";
import { INDEXABLE_PATHS, SITE_URL, canonical, pageHead } from "../src/lib/seo";

const page = (route: string, extra = "", index = true) => {
  const h = pageHead({ path: route, index, title: "Partner telemedicine page", thTitle: "หน้าทดสอบ", description: "A sufficiently long English description for the test page.", thDescription: "คำอธิบายภาษาไทย" });
  const m = h.meta.map((x) => ("title" in x ? `<title>${x.title}</title>` : `<meta ${"name" in x ? `name="${x.name}"` : `property="${x.property}"`} content="${x.content}">`)).join("");
  const l = h.links.map((x) => `<link rel="canonical" href="${x.href}">`).join("");
  return `<html lang="th"><head><meta name="viewport" content="width=device-width, initial-scale=1">${m}${l}<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite"}</script></head><body><h1>x</h1><h2>y</h2><a href="/">home</a>${extra}</body></html>`;
};
const known = new Set<string>(CRAWL_ROUTES);

test("crawl covers every indexable route and a sample of each excluded family", () => {
  for (const p of INDEXABLE_PATHS) expect(CRAWL_ROUTES as readonly string[]).toContain(p);
  for (const p of EXCLUDED_SAMPLE) { expect(isPrivatePath(p)).toBe(true); expect(INDEXABLE_PATHS as readonly string[]).not.toContain(p); }
});
test("valid public page passes every check", () => {
  const f = scanPage({ route: "/partner-apply", status: 200, html: page("/partner-apply") }, known, ["/partner-apply"]);
  expect(f.filter((x) => !x.ok)).toEqual([]);
});
test("private route without noindex, with canonical, or in sitemap is critical", () => {
  const f = scanPage({ route: "/auth", status: 200, html: page("/auth") }, known, ["/auth"]);
  expect(f.find((x) => x.check === "noindex")!.severity).toBe("critical");
  expect(f.find((x) => x.check === "not in sitemap")!.ok).toBe(false);
  const ok = scanPage({ route: "/auth", status: 200, html: page("/auth", "", false) }, known, []);
  expect(ok.every((x) => x.ok)).toBe(true);
});
test("canonical must be unique and self-referencing", () => {
  const dup = page("/care-demo").replace("</head>", `<link rel="canonical" href="${SITE_URL}/">` + "</head>");
  expect(scanPage({ route: "/care-demo", status: 200, html: dup }, known, ["/care-demo"]).find((x) => x.check === "canonical")!.ok).toBe(false);
  expect(new Set(INDEXABLE_PATHS.map(canonical)).size).toBe(INDEXABLE_PATHS.length);
});
test("sitemap safety: real sitemap source lists only indexable pages", () => {
  expect(sitemapPaths(`<urlset><url><loc>${SITE_URL}/</loc></url><url><loc>${SITE_URL}/care-demo</loc></url></urlset>`)).toEqual(["/", "/care-demo"]);
  const robots = readFileSync("public/robots.txt", "utf8");
  expect(robots).toMatch(/Sitemap:/); expect(robots).not.toMatch(/^Disallow:\s*\/\s*$/m);
  for (const f of ["src/routes/seo-readiness.tsx", "src/routes/release-handoff.tsx", "src/routes/auth.tsx"]) expect(readFileSync(f, "utf8")).toMatch(/sitemap:\s*false|noindex/);
});
test("structured-data parsing flags invalid JSON and missing context", () => {
  expect(parseJsonLd('<script type="application/ld+json">{bad</script>').errors).toBe(1);
  expect(parseJsonLd('<script type="application/ld+json">{"@type":"X"}</script>').errors).toBe(1);
  expect(parseJsonLd('<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage"}</script>')).toEqual({ ok: true, types: ["FAQPage"], errors: 0 });
});
test("broken internal links are detected; query strings and external links ignored", () => {
  expect(internalLinks('<a href="/auth?next=/x">a</a><a href="https://x.org">b</a><a href="//cdn">c</a>')).toEqual(["/auth"]);
  const f = scanPage({ route: "/", status: 200, html: page("/", '<a href="/nope">x</a>') }, known, ["/"]);
  expect(f.find((x) => x.check === "internal links")).toMatchObject({ ok: false, evidence: "broken: /nope" });
});
test("report evidence is redacted and readiness is never claimed", () => {
  expect(redact("a@b.co https://evil.example/x 0812345678 sb_secretkey12345")).toBe("[email] [external-url] [number] [secret]");
  expect(redact(`${SITE_URL}/`)).toBe(`${SITE_URL}/`);
  expect(summarize([]).ready).toBe(false);
  expect(CONTENT_GOVERNANCE.every((g) => g.status === "pending" && g.blockedReason.length > 0)).toBe(true);
  expect(CONTENT_GOVERNANCE.map((g) => g.key)).toEqual(["terminology", "clinic_facts", "contact", "privacy_wording", "claims"]);
});
test("crawler never calls external services", () => {
  const src = readFileSync("src/lib/seo-crawl.ts", "utf8") + readFileSync("src/routes/seo-readiness.tsx", "utf8");
  for (const m of src.matchAll(/fetch\(([^)]*)\)/g)) expect(m[1]).not.toMatch(/https?:/);
  expect(src).not.toMatch(/google|bing|semrush|analytics\.|ahrefs/i);
});
test("root head is noindex by default so client-only private pages stay hidden", () => {
  expect(readFileSync("src/routes/__root.tsx", "utf8")).toMatch(/name: "robots", content: "noindex, nofollow"/);
});
