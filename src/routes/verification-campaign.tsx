import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { CHECKS, READINESS_NOTICE, SUITES, appendRun, campaignExport, dryRun, summarize, type Run } from "@/lib/verification-campaign";

/** Private campaign planner. Reads no records, runs no real checks, never publishes. */
function VerificationCampaign() {
  const plan = Route.useLoaderData();
  const [history, setHistory] = useState<readonly Run[]>([]);
  const [msg, setMsg] = useState("");
  const latest = history.at(-1)?.results ?? plan;
  const s = summarize(latest);
  const simulate = () => { try { setHistory((h) => appendRun(h, "Synthetic dry run", dryRun(), true)); setMsg("Simulated run added. Results are simulated and do not count as passed."); } catch { setMsg("Not recorded."); } };
  const download = () => { if (!history.length || history.every(run => run.simulated)) return; const b = new Blob([campaignExport(history, plan)], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "verification-campaign.md"; a.click(); URL.revokeObjectURL(a.href); };
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <PageHeader title="Unified verification campaign" subtitle="Plan for the full post-build test campaign. It has not been run yet." />
      <p role="status" className="rounded-lg border border-border p-4 font-medium">{READINESS_NOTICE} <Link to="/publish-gate" className="underline">Publish gate</Link> · <Link to="/release-runbook" className="underline">Release runbook</Link> · <Link to="/verification-history" className="underline">Permanent history and redacted export</Link> · <Link to="/production-test-readiness" className="underline">Production test prerequisites</Link> · <Link to="/golive-decision-pack" className="underline">Final go-live decision pack</Link> · <Link to="/test-session-workspace" className="underline">Test session workspace</Link></p>
      <p className="font-medium">Passed {s.passed} · Pending {s.pending} · Failed {s.failed} · Blocked {s.blocked} · Unverified {s.unverified} (total {s.total}, {SUITES.length} suites)</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={simulate} variant="outline" className="min-h-11">Add synthetic dry run (simulated)</Button>
        <Button disabled={!history.length || history.every(run => run.simulated)} onClick={download} variant="outline" className="min-h-11">Download redacted campaign report</Button>
      </div>
      {msg && <p role="alert" className="text-sm">{msg}</p>}
      <p className="text-sm text-muted-foreground">Dry runs use fixtures only, are kept for this browser session in order and cannot be edited. Nothing is sent or saved elsewhere.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Campaign checks</caption>
        <thead><tr className="text-left">{["Suite", "Scope", "Prerequisites", "Expected", "Status", "Owner", "Evidence", "Next action", "Correlation ID"].map((h) => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
        <tbody>{latest.map((r) => { const c = CHECKS.find((x) => x.id === r.checkId)!; return <tr key={r.checkId} className="border-t border-border"><td className="p-2">{c.suite}</td><td className="p-2">{c.scope}</td><td className="p-2">{c.prerequisites.join(", ")}</td><td className="p-2">{c.expected}</td><td className="p-2">{r.status}{r.simulated ? " (simulated)" : ""}</td><td className="p-2">{c.owner}</td><td className="p-2">{r.evidence}</td><td className="p-2">{r.nextAction}</td><td className="p-2">{r.correlationId}</td></tr>; })}</tbody>
      </table></div>
      <section aria-labelledby="hist"><h2 id="hist" className="text-xl font-semibold">Run history ({history.length})</h2>
        <ol className="mt-2 list-decimal pl-6 text-sm">{history.map((h) => <li key={h.correlationId}>Run {h.runNo} · {h.label} · {h.simulated ? "simulated" : "recorded"} · {h.createdAt} · {h.correlationId}</li>)}</ol>
      </section>
    </main>
  );
}
export const Route = createFileRoute("/verification-campaign")({
  staticData: { sitemap: false },
  loader: () => dryRun(),
  head: () => ({ meta: [{ title: "Verification campaign — iCareTele" }, { name: "description", content: "Internal post-build verification campaign plan." }, { property: "og:title", content: "Verification campaign — iCareTele" }, { property: "og:description", content: "Internal verification campaign." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: VerificationCampaign,
});
