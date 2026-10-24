// Internal, same-origin crawl simulation. Pure functions over fetched HTML; never calls search engines,
// analytics or external crawlers, and never invents rankings, backlinks or reviews.
import { INDEXABLE_PATHS, PRIVATE_PREFIXES, SITE_URL, canonical } from "./seo";

export type Severity = "critical" | "high" | "medium" | "info";
export type Owner = "Engineering" | "Content" | "Clinic owner";
export interface Finding { route: string; check: string; ok: boolean; severity: Severity; evidence: string; owner: Owner; nextAction: string; blockedReason?: string }
export interface PageScan { route: string; status: number; html: string }

/** Routes that must be crawled: every indexable page plus a sample of each excluded family. */
export const EXCLUDED_SAMPLE = ["/auth", "/preview", "/release-handoff", "/release-readiness", "/dashboard", "/seo-readiness", "/launch-qa", "/publish-gate", "/release-runbook", "/backup-evidence", "/protection-evidence", "/content-review", "/access-matrix"] as const;
export const CRAWL_ROUTES = [...INDEXABLE_PATHS, ...EXCLUDED_SAMPLE] as const;
export const isIndexablePath = (p: string) => (INDEXABLE_PATHS as readonly string[]).includes(p);

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"))?.[1];
const tags = (html: string, re: RegExp) => html.match(re) ?? [];
const meta = (html: string, key: string) => {
  for (const t of tags(html, /<meta\b[^>]*>/gi)) if (attr(t, "name") === key || attr(t, "property") === key) return attr(t, "content");
  return undefined;
};
const text = (s: string) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

export function parseJsonLd(html: string): { ok: boolean; types: string[]; errors: number } {
  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]!);
  const types: string[] = []; let errors = 0;
  for (const b of blocks) { try { const j = JSON.parse(b); if (j["@context"] !== "https://schema.org" || !j["@type"]) errors++; else types.push(j["@type"]); } catch { errors++; } }
  return { ok: errors === 0, types, errors };
}
export function internalLinks(html: string) {
  return [...new Set(tags(html, /<a\b[^>]*>/gi).map((t) => attr(t, "href")).filter((h): h is string => !!h && h.startsWith("/") && !h.startsWith("//")).map((h) => h.split(/[?#]/)[0]!))];
}
export function sitemapPaths(xml: string) { return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!.trim()).pathname); }

/** Strip anything that could identify a person or leak a secret before it enters the report. */
export function redact(s: string) {
  return s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]").replace(/https?:\/\/[^\s"']+/g, (u) => (u.startsWith(SITE_URL) ? u : "[external-url]"))
    .replace(/\b(eyJ[\w-]{10,}|sb_[\w-]{10,}|sk_[\w-]{10,})\S*/g, "[secret]").replace(/\d{6,}/g, "[number]").slice(0, 160);
}

export function scanPage(p: PageScan, knownRoutes: Set<string>, sitemap: string[]): Finding[] {
  const out: Finding[] = []; const idx = isIndexablePath(p.route);
  const add = (check: string, ok: boolean, severity: Severity, evidence: string, owner: Owner, nextAction: string, blockedReason?: string) =>
    out.push({ route: p.route, check, ok, severity: ok ? "info" : severity, evidence: redact(evidence), owner, nextAction: ok ? "None" : nextAction, ...(blockedReason && !ok ? { blockedReason } : {}) });
  const robots = meta(p.html, "robots") ?? "";
  const canon = tags(p.html, /<link\b[^>]*rel="canonical"[^>]*>/gi).map((t) => attr(t, "href"));
  add("availability", p.status === 200, "critical", `HTTP ${p.status}`, "Engineering", "Restore the route");
  if (!idx) {
    add("noindex", /noindex/.test(robots), "critical", `robots="${robots}"`, "Engineering", "Add noindex to this private route");
    add("no canonical", canon.length === 0, "high", `${canon.length} canonical`, "Engineering", "Remove canonical from private route");
    add("not in sitemap", !sitemap.includes(p.route), "critical", "sitemap membership", "Engineering", "Remove from sitemap");
    return out;
  }
  const title = text(p.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const desc = meta(p.html, "description") ?? "";
  add("title", title.length >= 10 && title.length <= 120, "high", `${title.length} chars`, "Content", "Write a 10–120 character title");
  add("description", desc.length >= 50 && desc.length <= 320, "medium", `${desc.length} chars`, "Content", "Write a 50–320 character description");
  add("indexable", /index, follow/.test(robots), "critical", `robots="${robots}"`, "Engineering", "Allow indexing");
  add("canonical", canon.length === 1 && canon[0] === canonical(p.route) && meta(p.html, "og:url") === canon[0], "high", `${canon.length} canonical, og:url ${meta(p.html, "og:url") === canon[0] ? "matches" : "differs"}`, "Engineering", "Self-reference one canonical and og:url");
  add("sitemap", sitemap.includes(p.route), "high", "sitemap membership", "Engineering", "List page in sitemap");
  add("language", /<html[^>]*\blang="[a-z-]+"/i.test(p.html) && !!meta(p.html, "og:locale"), "medium", "html lang + og:locale", "Engineering", "Set language metadata");
  const levels = tags(p.html, /<h[1-6]\b/gi).map((h) => Number(h[2]));
  const skip = levels.some((l, i) => i > 0 && l > levels[i - 1]! + 1);
  add("headings", levels.filter((l) => l === 1).length === 1 && !skip, "medium", `h1×${levels.filter((l) => l === 1).length}, skipped=${skip}`, "Content", "Use one H1 and no skipped levels");
  const broken = internalLinks(p.html).filter((h) => !knownRoutes.has(h));
  add("internal links", broken.length === 0, "high", broken.length ? `broken: ${broken.join(", ")}` : "all resolve", "Engineering", "Fix or remove broken links");
  const ld = parseJsonLd(p.html);
  add("json-ld", ld.ok, "medium", `${ld.types.join(", ") || "none"}; errors=${ld.errors}`, "Engineering", "Fix invalid structured data");
  const vp = meta(p.html, "viewport") ?? "";
  add("mobile viewport", /width=device-width/.test(vp) && !/user-scalable=no|maximum-scale=1(\D|$)/.test(vp), "high", `viewport="${vp}"`, "Engineering", "Use width=device-width without zoom lock");
  return out;
}

export function summarize(f: Finding[]) {
  const failed = f.filter((x) => !x.ok);
  return { checks: f.length, passed: f.length - failed.length, failed: failed.length, critical: failed.filter((x) => x.severity === "critical").length, ready: false as const };
}
export const isPrivatePath = (p: string) => PRIVATE_PREFIXES.some((x) => p === x || p.startsWith(x + "/"));

export interface GovernanceItem { key: string; th: string; en: string; owner: Owner; status: "pending"; blockedReason: string }
/** Human-review checklist; always pending until a person confirms it. Never auto-passes. */
export const CONTENT_GOVERNANCE: GovernanceItem[] = [
  { key: "terminology", th: "คำศัพท์ไทย/อังกฤษสอดคล้องกัน (พาร์ทเนอร์ เครดิต Annual Care ผู้รับบริการ)", en: "Thai/English terminology is consistent (partner, credit, Annual Care, customer)", owner: "Content", status: "pending", blockedReason: "Needs human language review" },
  { key: "clinic_facts", th: "ข้อมูลคลินิกถูกต้องตามเอกสารจริง", en: "Clinic facts match real documents", owner: "Clinic owner", status: "pending", blockedReason: "No verified clinic address or license on file" },
  { key: "contact", th: "ช่องทางติดต่อเป็นของจริงและได้รับอนุมัติ", en: "Contact details are real and approved", owner: "Clinic owner", status: "pending", blockedReason: "No approved contact details supplied" },
  { key: "privacy_wording", th: "ข้อความความเป็นส่วนตัวผ่านการตรวจทาน", en: "Privacy wording has been reviewed", owner: "Clinic owner", status: "pending", blockedReason: "Needs legal/privacy review" },
  { key: "claims", th: "ไม่มีคำกล่าวอ้างทางการแพทย์ รีวิว ราคา หรือการรับรองที่ไม่ได้ตรวจสอบ", en: "No unverified medical, review, price or certification claims", owner: "Content", status: "pending", blockedReason: "Needs claims review before release" },
];
