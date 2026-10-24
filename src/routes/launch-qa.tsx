import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { CRAWL_ROUTES, scanPage, sitemapPaths } from "@/lib/seo-crawl";
import { REVIEWER_TEMPLATE, errorStateChecks, fromCrawl, group, manualChecks, stamp, type QaCheck, type QaStatus } from "@/lib/launch-qa";

/** Same-origin only. No analytics or outside calls; readiness is never claimed. */
function LaunchQa() {
  const [checks, setChecks] = useState<QaCheck[]>(Route.useLoaderData());
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const sm = sitemapPaths(await (await fetch("/sitemap.xml")).text());
      const known = new Set<string>(CRAWL_ROUTES);
      const crawl = [];
      for (const route of CRAWL_ROUTES) { const r = await fetch(route); crawl.push(...scanPage({ route, status: r.status, html: await r.text() }, known, sm)); }
      const p = await fetch("/__qa-404-probe?__qa-token=probe");
      setChecks(stamp([...fromCrawl(crawl), ...errorStateChecks(await p.text(), p.status), ...manualChecks()]));
    } finally { setBusy(false); }
  };
  const g = group(checks);
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <PageHeader title="Launch QA report" subtitle="Combined SEO, accessibility, journey, error-safety, privacy and content checks. Release readiness is not claimed." />
      <Button onClick={run} disabled={busy} className="min-h-11">{busy ? "Checking…" : "Run automated checks"}</Button>
      <p role="status">{(["passed", "pending", "blocked", "unverified"] as QaStatus[]).map((s) => `${g[s].length} ${s}`).join(" · ")} · readiness not claimed</p>
      {(["blocked", "pending", "unverified", "passed"] as QaStatus[]).map((s) => g[s].length > 0 && (
        <section key={s} aria-labelledby={`qa-${s}`}>
          <h2 id={`qa-${s}`} className="text-xl font-semibold capitalize">{s} ({g[s].length})</h2>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">{s} checks</caption>
            <thead><tr className="text-left">{["Area", "Route", "Evidence", "Owner", "Next action", "Time", "Correlation ID"].map((h) => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
            <tbody>{g[s].map((c) => <tr key={c.id} className="border-t border-border"><td className="p-2">{c.area}</td><td className="p-2">{c.route}</td><td className="p-2">{c.evidence}</td><td className="p-2">{c.owner}</td><td className="p-2">{c.nextAction}</td><td className="p-2">{c.timestamp}</td><td className="p-2 font-mono">{c.correlationId}</td></tr>)}</tbody>
          </table></div>
        </section>
      ))}
      <section aria-labelledby="tpl"><h2 id="tpl" className="text-xl font-semibold">Reviewer handoff template</h2><pre className="mt-3 overflow-x-auto rounded-lg border border-border p-4 text-xs">{REVIEWER_TEMPLATE}</pre></section>
    </main>
  );
}
export const Route = createFileRoute("/launch-qa")({
  staticData: { sitemap: false },
  loader: () => stamp(manualChecks()),
  head: () => ({ meta: [{ title: "Launch QA report — iCareTele" }, { name: "description", content: "Internal redacted launch QA report and reviewer handoff." }, { property: "og:title", content: "Launch QA report — iCareTele" }, { property: "og:description", content: "Internal launch QA report." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: LaunchQa,
});
