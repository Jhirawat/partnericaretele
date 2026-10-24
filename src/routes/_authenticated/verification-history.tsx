import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmCampaignResult, readCampaignHistory, recordCampaignRun } from "@/lib/verification-campaign.functions";
import { READINESS_NOTICE, storedExport, storedStatus, type StoredRun } from "@/lib/verification-campaign";

/** Permanent, append-only campaign history. Records planning snapshots only; never runs real checks or publishes. */
function VerificationHistory() {
  const rd = useServerFn(readCampaignHistory), rec = useServerFn(recordCampaignRun), conf = useServerFn(confirmCampaignResult);
  const [runs, setRuns] = useState<StoredRun[] | null>(null);
  const [msg, setMsg] = useState("");
  const [note, setNote] = useState("");
  const load = useCallback(() => rd().then(setRuns).catch(() => { setRuns([]); setMsg("Access limited to global Superadmins and Operations admins with two-step sign-in."); }), [rd]);
  useEffect(() => { void load(); }, [load]);
  const record = async (simulated: boolean) => { try { await rec({ data: { label: simulated ? "Synthetic dry run" : "Planning snapshot", simulated } }); setMsg(simulated ? "Simulated run saved permanently. It can never count as passed." : "Planning snapshot saved. Every check stays pending or blocked."); await load(); } catch (e) { setMsg(`Not recorded: ${e instanceof Error ? e.message : "denied"}`); } };
  const confirm = async (id: string, outcome: "confirmed" | "rejected") => { try { await conf({ data: { id, outcome, note } }); setMsg("Review saved."); await load(); } catch (e) { setMsg(`Not saved: ${e instanceof Error ? e.message : "denied"}`); } };
  const download = () => { const b = new Blob([storedExport(runs ?? [])], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "verification-campaign-history.md"; a.click(); URL.revokeObjectURL(a.href); };
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader title="Verification campaign history" subtitle="Permanent, append-only record of campaign runs. Runs cannot be edited or deleted." />
      <p role="status" className="rounded-lg border border-border p-4 font-medium">{READINESS_NOTICE} <Link to="/verification-campaign" className="underline">Campaign plan</Link> · <Link to="/publish-gate" className="underline">Publish gate</Link></p>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" className="min-h-11" onClick={() => void record(true)}>Save synthetic dry run (simulated)</Button>
        <Button variant="outline" className="min-h-11" onClick={() => void record(false)}>Save planning snapshot</Button>
        <Button variant="outline" className="min-h-11" onClick={download} disabled={!runs}>Download redacted history</Button>
      </div>
      <label className="block text-sm">Reviewer note (no links, emails, names or long numbers)<Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="mt-1" /></label>
      {msg && <p role="alert" className="text-sm">{msg}</p>}
      {runs === null ? <p>Loading…</p> : runs.length === 0 ? <p className="text-muted-foreground">No runs recorded yet.</p> : [...runs].reverse().map((g) => (
        <section key={g.id} aria-label={`Run ${g.run_no}`} className="rounded-lg border border-border p-4">
          <h2 className="font-semibold">Run {g.run_no} · {g.label} · {g.campaign_version} · {g.simulated ? "SIMULATED" : "real"} · {g.created_at} · {g.correlation_id}</h2>
          <div className="overflow-x-auto"><table className="mt-2 w-full text-sm"><caption className="sr-only">Run results</caption>
            <thead><tr className="text-left">{["Suite", "Scope", "Prerequisites", "Status", "Owner", "Evidence", "Next action", "Review"].map((h) => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
            <tbody>{g.results.map((r) => <tr key={r.id} className="border-t border-border"><td className="p-2">{r.suite}</td><td className="p-2">{r.scope}</td><td className="p-2">{r.prerequisite_state}</td><td className="p-2">{storedStatus(r)}{r.simulated ? " (simulated)" : ""}</td><td className="p-2">{r.owner_role}</td><td className="p-2">{r.evidence_ref}</td><td className="p-2">{r.next_action}</td>
              <td className="p-2">{r.simulated ? "Not reviewable" : g.mine ? "Needs a different reviewer" : <span className="flex gap-2"><Button size="sm" variant="outline" onClick={() => void confirm(r.id, "confirmed")}>Confirm</Button><Button size="sm" variant="outline" onClick={() => void confirm(r.id, "rejected")}>Reject</Button></span>} {r.confirmations.length ? `(${r.confirmations.length} review)` : ""}</td></tr>)}</tbody>
          </table></div>
        </section>
      ))}
    </main>
  );
}
export const Route = createFileRoute("/_authenticated/verification-history")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Verification history — iCareTele" }, { name: "description", content: "Internal append-only verification campaign history." }, { property: "og:title", content: "Verification history — iCareTele" }, { property: "og:description", content: "Internal verification history." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: VerificationHistory,
});
