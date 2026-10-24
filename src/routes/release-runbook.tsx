import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { readDrills, recordDrill } from "@/lib/release-runbook.functions";
import { unsafeText } from "@/lib/release-evidence";
import { PUBLISH_NOTICE, READINESS_NOTICE, RUNBOOK, SCENARIOS, drillReport, simulateDrill, type DrillRun, type Scenario } from "@/lib/release-runbook";

/** Private runbook. Drills are simulation-only on synthetic state; nothing here publishes or changes data. */
function ReleaseRunbook() {
  const rd = useServerFn(readDrills), rec = useServerFn(recordDrill);
  const [auth, setAuth] = useState<"out" | "denied" | "ok">("out");
  const [runs, setRuns] = useState<DrillRun[]>([]);
  const [scenario, setScenario] = useState<Scenario>("frontend_regression");
  const [msg, setMsg] = useState("");
  const load = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return setAuth("out");
    try { setRuns(await rd()); setAuth("ok"); } catch { setAuth("denied"); }
  };
  useEffect(() => { void load(); }, []);
  const preview = simulateDrill(scenario);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const evidence = String(f.get("evidence") ?? ""), next = String(f.get("next") ?? "");
    if (unsafeText(evidence) || unsafeText(next)) return setMsg("Remove emails, links, numbers or secret words.");
    try { const r = await rec({ data: { scenario, evidence, next } }); setMsg(`Drill recorded (${r.correlation_id}).`); await load(); }
    catch (err) { setMsg(err instanceof Error && err.message === "MFA" ? "Two-step sign-in required." : "Not recorded: not allowed, or text was refused."); }
  };
  const download = () => { if (!(auth === "ok")) return; const b = new Blob([drillReport(runs)], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "release-drill-report.md"; a.click(); URL.revokeObjectURL(a.href); };
  const field = "mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-2";
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <PageHeader title="Release runbook and rollback drill" subtitle={PUBLISH_NOTICE} />
      <p role="status" className="rounded-lg border border-border p-4 font-medium">{READINESS_NOTICE} <Link to="/publish-gate" className="underline">Back to the publish gate</Link> · <Link to="/backup-evidence" className="underline">Backup evidence register</Link> · <Link to="/protection-evidence" className="underline">Migration, RLS and storage evidence</Link> · <Link to="/access-matrix" className="underline">Access matrix audit</Link> · <Link to="/verification-campaign" className="underline">Verification campaign</Link> · <Link to="/golive-decision-pack" className="underline">Final go-live decision pack</Link> · <Link to="/launch-control" className="underline">Launch-day control center</Link> · <Link to="/incident-console" className="underline">Incident and escalation console</Link></p>
      <div className="grid gap-4 md:grid-cols-2">
        {RUNBOOK.map((s) => (
          <section key={s.id} aria-labelledby={`rb-${s.id}`} className="rounded-lg border border-border p-4">
            <h2 id={`rb-${s.id}`} className="text-lg font-semibold">{s.title}</h2>
            <p className="text-sm text-muted-foreground">Owner: {s.owner.role} · Backup: {s.owner.backup}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{s.steps.map((x) => <li key={x}>{x}</li>)}</ol>
          </section>
        ))}
      </div>
      <section aria-labelledby="drill" className="space-y-3">
        <h2 id="drill" className="text-xl font-semibold">Rollback drill (simulation only)</h2>
        <p className="text-sm">Uses a fake snapshot. Production data, credits, certificates, audit history and migrations are never read or changed.</p>
        <label className="block text-sm">Scenario<select value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)} className={field}>{(Object.keys(SCENARIOS) as Scenario[]).map((k) => <option key={k} value={k}>{SCENARIOS[k].label}</option>)}</select></label>
        <p className="text-sm">Expected: {preview.expected}<br />Observed (simulated): {preview.observed}<br />Status: {preview.status}</p>
        {auth === "ok" ? (
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
            <label className="text-sm">Evidence reference label<input name="evidence" required minLength={3} maxLength={120} className={field} /></label>
            <label className="text-sm">Next action<input name="next" required minLength={3} maxLength={300} className={field} /></label>
            <Button type="submit" className="min-h-11 md:col-span-2">Record drill run (cannot be edited)</Button>
            {msg && <p role="alert" className="text-sm md:col-span-2">{msg}</p>}
          </form>
        ) : <p className="text-sm">Blocked: {auth === "out" ? "signed out — drill history is not read or recorded." : "your account cannot record drills."} Recording needs a global Superadmin or Operations admin with two-step sign-in.</p>}
      </section>
      <section aria-labelledby="hist" className="space-y-3">
        <h2 id="hist" className="text-xl font-semibold">Drill history ({runs.length})</h2>
        <Button disabled={!(auth === "ok")} onClick={download} variant="outline" className="min-h-11">Download redacted drill report</Button>
        <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Append-only drill runs</caption>
          <thead><tr className="text-left">{["Scenario", "Status", "Expected", "Observed", "Evidence", "Next action", "Time", "Correlation"].map((h) => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
          <tbody>{runs.map((r) => <tr key={r.correlation_id} className="border-t border-border"><td className="p-2">{r.scenario}</td><td className="p-2">{r.status}</td><td className="p-2">{r.expected}</td><td className="p-2">{r.observed}</td><td className="p-2">{r.evidence_ref}</td><td className="p-2">{r.next_action}</td><td className="p-2">{r.created_at}</td><td className="p-2">{r.correlation_id}</td></tr>)}</tbody>
        </table></div>
      </section>
    </main>
  );
}
export const Route = createFileRoute("/release-runbook")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Release runbook — iCareTele" }, { name: "description", content: "Internal release runbook and simulation-only rollback drill." }, { property: "og:title", content: "Release runbook — iCareTele" }, { property: "og:description", content: "Internal release runbook." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: ReleaseRunbook,
});
