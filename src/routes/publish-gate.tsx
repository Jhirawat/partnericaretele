import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { readRelease } from "@/lib/release-readiness.functions";
import { readEvidence } from "@/lib/release-evidence.functions";
import { acknowledgeReview, readReviews } from "@/lib/publish-gate.functions";
import { readBackups } from "@/lib/backup-evidence.functions";
import { readProtection } from "@/lib/protection-evidence.functions";
import type { ProtectionEntry } from "@/lib/protection-evidence";
import { readContentReviews } from "@/lib/content-review.functions";
import type { ContentEntry } from "@/lib/content-review";
import { readAccessAudit } from "@/lib/access-matrix.functions";
import type { AccessEntry } from "@/lib/access-matrix";
import type { BackupEntry } from "@/lib/backup-evidence";
import { groupHandoff, unsafeText, type EvidenceEntry } from "@/lib/release-evidence";
import { REVIEW_ITEMS, buildGate, gateReport, gateSummary, type Ack, type GateStatus, type ReviewKey } from "@/lib/publish-gate";

type Loaded = { signedIn: boolean; authorized: boolean; checklist: ReturnType<typeof groupHandoff> | null; acks: Ack[] | null; backup?: BackupEntry[] | null; protection?: ProtectionEntry[] | null; content?: ContentEntry[] | null; access?: AccessEntry[] | null };

/** Private gate page. Never publishes and never claims production readiness. */
function PublishGate() {
  const rr = useServerFn(readRelease), re = useServerFn(readEvidence), rv = useServerFn(readReviews), ack = useServerFn(acknowledgeReview), rb = useServerFn(readBackups), rp = useServerFn(readProtection), rc = useServerFn(readContentReviews), ra = useServerFn(readAccessAudit);
  const [d, setD] = useState<Loaded>({ signedIn: false, authorized: false, checklist: null, acks: null });
  const [msg, setMsg] = useState("");
  const load = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return setD({ signedIn: false, authorized: false, checklist: null, acks: null });
    try {
      const [rel, ev, acks, backup, protection, content, access] = await Promise.all([rr(), re(), rv(), rb(), rp(), rc(), ra()]);
      setD({ signedIn: true, authorized: true, checklist: groupHandoff(rel.items ?? null, ev as EvidenceEntry[]), acks, backup, protection, content, access });
    } catch { setD({ signedIn: true, authorized: false, checklist: null, acks: null }); }
  };
  useEffect(() => { void load(); }, []);
  const rows = useMemo(() => buildGate({ checklist: d.checklist, acks: d.acks, backup: d.backup ?? null, protection: d.protection ?? null, content: d.content ?? null, access: d.access ?? null, signedIn: d.authorized }), [d]);
  const s = gateSummary(rows);
  const download = () => { if (!(d.authorized)) return; const b = new Blob([gateReport(rows)], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "publish-gate-handoff.md"; a.click(); URL.revokeObjectURL(a.href); };
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const note = String(f.get("note") ?? "");
    if (unsafeText(note)) return setMsg("Remove emails, links, numbers or secret words from the note.");
    try { const r = await ack({ data: { item: String(f.get("item")) as ReviewKey, outcome: String(f.get("outcome")) as "acknowledged", note } }); setMsg(`Recorded (round ${r.round}, ${r.correlation_id}).`); await load(); }
    catch (err) { setMsg(err instanceof Error && err.message === "MFA" ? "Two-step sign-in required." : "Not recorded: you are not allowed to acknowledge, or the note was refused."); }
  };
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <PageHeader title="Publish gate and human review" subtitle="Production readiness is NOT claimed. Publishing is a separate manual owner action and cannot be started here." />
      <p role="status" className="rounded-lg border border-border p-4 font-medium">Passed {s.passed} · Pending {s.pending} · Blocked {s.blocked} · Unverified {s.unverified} (total {s.total}) · Gate CLOSED — {s.hardOpen.length} hard blockers open</p>
      {!d.authorized && <p className="text-sm text-muted-foreground">{d.signedIn ? "Your account cannot read release records." : "Signed out: checklist, evidence and reviewer records are not read, so every signed-in item is blocked."}</p>}
      <div className="flex flex-wrap gap-3"><Button disabled={!(d.authorized)} onClick={download} variant="outline" className="min-h-11">Download redacted handoff report</Button><Button asChild variant="outline" className="min-h-11"><Link to="/release-runbook">Release runbook and rollback drill</Link></Button><Button asChild variant="outline"><Link to="/session-start-gate">Human session start gate</Link></Button><Button asChild variant="outline"><Link to="/session-results">Human session results</Link></Button><Button asChild variant="outline" className="min-h-11"><Link to="/backup-evidence">Backup evidence register</Link></Button><Button asChild variant="outline" className="min-h-11"><Link to="/protection-evidence">Migration, RLS and storage evidence</Link></Button><Button asChild variant="outline" className="min-h-11"><Link to="/content-review">Content and claims review</Link></Button><Button asChild variant="outline" className="min-h-11"><Link to="/content-approval">Canonical content approval</Link></Button><Button asChild variant="outline" className="min-h-11"><Link to="/launch-control">Launch-day control center</Link></Button><Button asChild variant="outline" className="min-h-11"><Link to="/access-matrix">Access matrix audit</Link></Button><Button asChild variant="outline" className="min-h-11"><Link to="/verification-campaign">Verification campaign</Link></Button><Button asChild variant="outline" className="min-h-11"><Link to="/verification-history">Verification history</Link></Button><Button asChild variant="outline" className="min-h-11"><Link to="/production-test-readiness">Production test readiness</Link></Button><Button asChild variant="outline" className="min-h-11"><Link to="/owner-action-queue">Owner action queue</Link></Button><Button asChild variant="outline" className="min-h-11"><Link to="/golive-decision-pack">Final go-live decision pack</Link></Button><Button asChild variant="outline" className="min-h-11"><Link to="/test-session-workspace">Test session workspace</Link></Button><Button asChild variant="outline" className="min-h-11"><Link to="/human-review-console">Human review sign-off</Link></Button><Button asChild variant="outline" className="min-h-11"><Link to="/integration-safety">Integration and provider safety</Link></Button><Button asChild variant="outline" className="min-h-11"><Link to="/incident-console">Incident and escalation console</Link></Button><Button asChild variant="outline" className="min-h-11"><Link to="/evidence-inspector">Evidence integrity inspector</Link></Button><Button asChild variant="outline"><Link to="/owner-action-closure">Owner action closure board</Link></Button><Button asChild variant="outline"><Link to="/release-evidence-bundle">Final release evidence bundle</Link></Button><Button asChild variant="outline"><Link to="/readiness-decision-ledger">Readiness change and decision ledger</Link></Button><Button asChild variant="outline"><Link to="/validation-snapshot">Final validation evidence snapshot</Link></Button><Button asChild variant="outline"><Link to="/golive-evidence-matrix">Go-live evidence reconciliation matrix</Link></Button><Button asChild variant="outline"><Link to="/human-review-packet">Human review decision packet</Link></Button><Button asChild variant="outline"><Link to="/final-review-handoff">Final review handoff archive</Link></Button><Button asChild variant="outline"><Link to="/archive-integrity-snapshot">Release archive integrity snapshot</Link></Button></div>
      <Button asChild variant="outline"><Link to="/owner-signoff-readiness">Final owner sign-off readiness</Link></Button><section aria-labelledby="blockers">
        <h2 id="blockers" className="text-xl font-semibold">Blockers ({s.blockers.length})</h2>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Every item not yet passed</caption>
          <thead><tr className="text-left">{["Source", "Item", "Status", "Owner role", "Required evidence", "Next action", "Reason"].map((h) => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
          <tbody>{s.blockers.map((r) => <tr key={r.id} className="border-t border-border"><td className="p-2">{r.source}</td><td className="p-2">{r.label}</td><td className="p-2">{r.status as GateStatus}</td><td className="p-2">{r.owner}</td><td className="p-2">{r.requiredEvidence}</td><td className="p-2">{r.nextAction}</td><td className="p-2">{r.reason}</td></tr>)}</tbody>
        </table></div>
      </section>
      <section aria-labelledby="ack" className="space-y-3">
        <h2 id="ack" className="text-xl font-semibold">Reviewer acknowledgement</h2>
        {d.authorized ? (
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
            <label className="text-sm">Item<select name="item" className="mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-2">{REVIEW_ITEMS.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}</select></label>
            <label className="text-sm">Outcome<select name="outcome" className="mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-2"><option value="acknowledged">Acknowledged</option><option value="concern">Concern</option></select></label>
            <label className="text-sm md:col-span-2">Note (no names, emails, links or numbers)<input name="note" required minLength={3} maxLength={300} className="mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-2" /></label>
            <Button type="submit" className="min-h-11 md:col-span-4">Record acknowledgement (cannot be edited)</Button>
            {msg && <p role="alert" className="md:col-span-4 text-sm">{msg}</p>}
          </form>
        ) : <p className="text-sm">Blocked: acknowledgements need a signed-in global Superadmin or Operations admin with two-step sign-in. Each item needs two different reviewers.</p>}
      </section>
    </main>
  );
}
export const Route = createFileRoute("/publish-gate")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Publish gate — iCareTele" }, { name: "description", content: "Internal publish gate and human review handoff." }, { property: "og:title", content: "Publish gate — iCareTele" }, { property: "og:description", content: "Internal publish gate." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PublishGate,
});
