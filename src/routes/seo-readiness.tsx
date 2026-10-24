import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { JOURNEY } from "@/lib/public-journey";
import { CONTENT_GOVERNANCE, CRAWL_ROUTES, scanPage, sitemapPaths, summarize, type Finding } from "@/lib/seo-crawl";

/** Same-origin crawl of this site only. Nothing is sent to search engines, analytics or outside crawlers. */
function SeoReadiness() {
  const [f, setF] = useState<Finding[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const sm = sitemapPaths(await (await fetch("/sitemap.xml")).text());
      const robots = await (await fetch("/robots.txt")).text();
      const known = new Set<string>(CRAWL_ROUTES);
      const all: Finding[] = [{ route: "/robots.txt", check: "robots", ok: /Sitemap:/.test(robots) && !/^Disallow:\s*\/\s*$/m.test(robots), severity: "critical", evidence: "Sitemap directive, no blanket Disallow", owner: "Engineering", nextAction: "Fix robots.txt" }];
      for (const route of CRAWL_ROUTES) {
        const r = await fetch(route, { redirect: "follow" });
        all.push(...scanPage({ route, status: r.status, html: await r.text() }, known, sm));
      }
      setF(all);
    } finally { setBusy(false); }
  };
  const s = f && summarize(f);
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <PageHeader title="SEO readiness" subtitle="Internal crawl of this site's own pages. Release readiness is not claimed." />
      <Button onClick={run} disabled={busy} className="min-h-11">{busy ? "Crawling…" : "Run internal crawl"}</Button>
      {s && <p role="status">{s.passed}/{s.checks} checks passed · {s.failed} failed · {s.critical} critical · readiness not claimed</p>}
      {f && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Crawl findings</caption>
            <thead><tr className="text-left">{["Route", "Check", "Result", "Severity", "Evidence", "Owner", "Next action"].map((h) => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
            <tbody>{f.map((x, i) => <tr key={i} className="border-t border-border"><td className="p-2">{x.route}</td><td className="p-2">{x.check}</td><td className="p-2">{x.ok ? "pass" : "fail"}</td><td className="p-2">{x.severity}</td><td className="p-2">{x.evidence}</td><td className="p-2">{x.owner}</td><td className="p-2">{x.nextAction}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      <section aria-labelledby="journey">
        <h2 id="journey" className="text-xl font-semibold">Visitor journey checklist</h2>
        <p className="text-sm text-muted-foreground">Design records only — no visitor identity or behaviour is collected.</p>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Journey steps</caption><thead><tr className="text-left">{["Route", "CTA", "Target", "Expected outcome", "Owner", "Severity", "Blocked reason"].map((h) => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
        <tbody>{JOURNEY.map((j, i) => <tr key={i} className="border-t border-border"><td className="p-2">{j.route}</td><td className="p-2"><span lang="th">{j.cta.th}</span> · {j.cta.en}</td><td className="p-2">{j.target}</td><td className="p-2">{j.expected}</td><td className="p-2">{j.owner}</td><td className="p-2">{j.severity}</td><td className="p-2">{j.blockedReason ?? "—"}</td></tr>)}</tbody></table></div>
      </section>
      <section aria-labelledby="gov">
        <h2 id="gov" className="text-xl font-semibold">Content governance before public release</h2>
        <ul className="mt-4 space-y-3">{CONTENT_GOVERNANCE.map((g) => <li key={g.key} className="rounded-lg border border-border p-4"><p className="font-medium">{g.en}</p><p className="text-sm text-muted-foreground" lang="th">{g.th}</p><p className="mt-1 text-sm">Owner: {g.owner} · Status: {g.status} · Blocked: {g.blockedReason}</p></li>)}</ul>
      </section>
    </main>
  );
}
export const Route = createFileRoute("/seo-readiness")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "SEO readiness — iCareTele" }, { name: "description", content: "Internal crawl simulation and content governance checklist." }, { property: "og:title", content: "SEO readiness — iCareTele" }, { property: "og:description", content: "Internal crawl simulation report." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: SeoReadiness,
});
