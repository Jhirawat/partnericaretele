import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { readRelease } from "@/lib/release-readiness.functions";
import { readEvidence } from "@/lib/release-evidence.functions";
import { readReviews } from "@/lib/publish-gate.functions";
import { readBackups } from "@/lib/backup-evidence.functions";
import { readProtection } from "@/lib/protection-evidence.functions";
import { readContentReviews } from "@/lib/content-review.functions";
import { readAccessAudit } from "@/lib/access-matrix.functions";
import { readCampaignHistory } from "@/lib/verification-campaign.functions";
import { readOwnerActions } from "@/lib/owner-action-queue.functions";
import { readTestPrerequisites } from "@/lib/production-test-readiness.functions";
import { readDecisionSignoffs, recordDecisionSignoff } from "@/lib/decision-pack.functions";
import { buildGate, type Ack, type GateRow } from "@/lib/publish-gate";
import { groupHandoff, type EvidenceEntry } from "@/lib/release-evidence";
import type { BackupEntry } from "@/lib/backup-evidence";
import type { ProtectionEntry } from "@/lib/protection-evidence";
import type { ContentEntry } from "@/lib/content-review";
import type { AccessEntry } from "@/lib/access-matrix";
import type { StoredRun } from "@/lib/verification-campaign";
import type { Entry as OwnerEntry } from "@/lib/owner-action-queue";
import type { Entry as PrereqEntry } from "@/lib/production-test-readiness";
import { buildDecisionPack, decisionState, signoffSummary, packSummary, decisionPackExport, type Signoff } from "@/lib/decision-pack";
import { nextActions, queueRows } from "@/lib/owner-action-queue";
import { READINESS_NOTICE } from "@/lib/verification-campaign";

type Loaded = { signedIn: boolean; authorized: boolean; gate: GateRow[] | null; owner: OwnerEntry[] | null; prereqs: PrereqEntry[] | null; runs: StoredRun[] | null; signoffs: Signoff[] | null };
const EMPTY: Loaded = { signedIn: false, authorized: false, gate: null, owner: null, prereqs: null, runs: null, signoffs: null };

/** Private executive decision pack. Read-only consolidation; never publishes and never auto-promotes to ready. */
function GoLiveDecisionPack() {
  const rr = useServerFn(readRelease), re = useServerFn(readEvidence), rv = useServerFn(readReviews), rb = useServerFn(readBackups), rp = useServerFn(readProtection), rc = useServerFn(readContentReviews), ra = useServerFn(readAccessAudit), rh = useServerFn(readCampaignHistory), ro = useServerFn(readOwnerActions), rt = useServerFn(readTestPrerequisites), rs = useServerFn(readDecisionSignoffs), sign = useServerFn(recordDecisionSignoff);
  const [d, setD] = useState<Loaded>(EMPTY);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return setD(EMPTY);
    try {
      const [rel, ev, acks, backup, protection, content, access, runs, owner, prereqs, signoffs] = await Promise.all([rr(), re(), rv(), rb(), rp(), rc(), ra(), rh(), ro(), rt(), rs()]);
      const gate = buildGate({ checklist: groupHandoff(rel.items ?? null, ev as EvidenceEntry[]), acks: acks as Ack[], backup: backup as BackupEntry[], protection: protection as ProtectionEntry[], content: content as ContentEntry[], access: access as AccessEntry[], signedIn: true });
      setD({ signedIn: true, authorized: true, gate, owner: owner as OwnerEntry[], prereqs: prereqs as PrereqEntry[], runs: runs as StoredRun[], signoffs: signoffs as Signoff[] });
    } catch { setD({ signedIn: true, authorized: false, gate: null, owner: null, prereqs: null, runs: null, signoffs: null }); }
  };
  useEffect(() => { void load(); }, []);
  const rows = useMemo(() => buildDecisionPack({ authorized: d.authorized, gate: d.gate, owner: d.owner, prereqs: d.prereqs, runs: d.runs }), [d]);
  const decision = useMemo(() => decisionState(rows, d.signoffs, d.authorized), [rows, d.signoffs, d.authorized]);
  const s = packSummary(rows);
  const so = signoffSummary(d.signoffs);
  const checklist = nextActions(queueRows(d.owner ?? [], d.authorized));
  const download = () => { try { const b = new Blob([decisionPackExport(rows, decision, d.signoffs, checklist)], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "golive-decision-pack.md"; a.click(); URL.revokeObjectURL(a.href); } catch { setMsg("Export refused: safe metadata could not be verified."); } };
  const record = async (outcome: "endorsed" | "concern") => { setBusy(true); try { await sign({ data: { outcome } }); setMsg("Sign-off recorded (append-only). Readiness is not claimed."); await load(); } catch { setMsg("Not recorded: a global Superadmin or Operations admin with two-step sign-in is required, and you may sign only once per round."); } finally { setBusy(false); } };
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <PageHeader title="Final go-live decision pack" subtitle="Read-only executive consolidation of every register. It never auto-promotes to ready and never publishes." />
      <p className="border-l-4 border-warning pl-4">{READINESS_NOTICE}</p>
      <p role="status" className="rounded-lg border border-border p-4 font-medium">Decision state: {decision.state} — {decision.reason}</p>
      <p role="status" className="text-sm">Passed {s.passed} · Pending {s.pending} · Blocked {s.blocked} · Unverified {s.unverified} (total {s.total}) · Open blockers {s.open.length}</p>
      {!d.authorized && <p role="alert" className="text-sm">{d.signedIn ? "Your account cannot read release records; every register is shown as blocked." : "Signed out: no register is read, so every item is blocked. A global Superadmin or Operations admin with two-step sign-in is required."}</p>}
      <nav aria-label="Register navigation" className="flex flex-wrap gap-3">
        <Button asChild variant="outline"><Link to="/publish-gate">Publish gate</Link></Button><Button asChild variant="outline"><Link to="/session-start-gate">Human session start gate</Link></Button><Button asChild variant="outline"><Link to="/session-results">Human session results</Link></Button><Button asChild variant="outline"><Link to="/readiness-decision-ledger">Readiness change and decision ledger</Link></Button><Button asChild variant="outline"><Link to="/validation-snapshot">Final validation evidence snapshot</Link></Button>
        <Button asChild variant="outline"><Link to="/owner-action-queue">Owner action queue</Link></Button>
        <Button asChild variant="outline"><Link to="/verification-campaign">Verification campaign</Link></Button>
        <Button asChild variant="outline"><Link to="/verification-history">Campaign history</Link></Button>
        <Button asChild variant="outline"><Link to="/production-test-readiness">Production test readiness</Link></Button>
        <Button asChild variant="outline"><Link to="/release-handoff">Release handoff</Link></Button>
        <Button asChild variant="outline"><Link to="/release-runbook">Release runbook</Link></Button>
        <Button asChild variant="outline"><Link to="/protection-evidence">Migration, RLS and storage evidence</Link></Button>
        <Button asChild variant="outline"><Link to="/backup-evidence">Backup evidence</Link></Button>
        <Button asChild variant="outline"><Link to="/content-review">Content and claims review</Link></Button>
        <Button asChild variant="outline"><Link to="/content-approval">Canonical content approval</Link></Button>
        <Button asChild variant="outline"><Link to="/launch-control">Launch-day control center</Link></Button>
        <Button asChild variant="outline"><Link to="/integration-safety">Integration and provider safety</Link></Button><Button asChild variant="outline"><Link to="/incident-console">Incident and escalation console</Link></Button><Button asChild variant="outline"><Link to="/evidence-inspector">Evidence integrity inspector</Link></Button><Button asChild variant="outline"><Link to="/owner-action-closure">Owner action closure board</Link></Button><Button asChild variant="outline"><Link to="/release-evidence-bundle">Final release evidence bundle</Link></Button>
        <Button asChild variant="outline"><Link to="/access-matrix">Access matrix</Link></Button>
        <Button asChild variant="outline"><Link to="/test-session-workspace">Test session workspace</Link></Button>
        <Button asChild variant="outline"><Link to="/human-review-console">Human review sign-off</Link></Button>
        <Button variant="outline" onClick={download} disabled={!d.authorized}>Download redacted decision pack</Button>
      <Button asChild variant="outline"><Link to="/golive-evidence-matrix">Go-live evidence reconciliation matrix</Link></Button><Button asChild variant="outline"><Link to="/human-review-packet">Human review decision packet</Link></Button><Button asChild variant="outline"><Link to="/final-review-handoff">Final review handoff archive</Link></Button><Button asChild variant="outline"><Link to="/archive-integrity-snapshot">Release archive integrity snapshot</Link></Button><Button asChild variant="outline"><Link to="/owner-signoff-readiness">Final owner sign-off readiness</Link></Button></nav>
      <section aria-labelledby="registers">
        <h2 id="registers" className="text-xl font-semibold">Register consolidation ({rows.length})</h2>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Status of every register</caption>
          <thead><tr className="text-left">{["Register", "Check group", "Status", "Blocker reason", "Owner", "Reviewer", "Next action", "Evidence", "Last reviewed", "Reference", "Resolving checks and owner actions"].map((h) => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.key} className="border-t border-border"><td className="p-2">{r.label}</td><td className="p-2">{r.checkGroup}</td><td className="p-2 font-medium">{r.status}</td><td className="p-2">{r.reason}</td><td className="p-2">{r.ownerRole}</td><td className="p-2">{r.reviewerRole}</td><td className="p-2">{r.nextAction}</td><td className="p-2">{r.evidenceLabel}</td><td className="p-2">{r.lastReviewed ?? "not recorded"}</td><td className="break-all p-2">{r.ref ?? "none"}</td><td className="p-2">{[...r.checks, ...r.ownerActions].join(", ") || "manual handoff only"}</td></tr>)}</tbody>
        </table></div>
      </section>
      <section aria-labelledby="handoff">
        <h2 id="handoff" className="text-xl font-semibold">Owner handoff checklist</h2>
        <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">{checklist.map((a) => <li key={a}>{a.replace(/^- \[ \] /, "")}</li>)}</ul>
      </section>
      <section aria-labelledby="signoff" className="space-y-3">
        <h2 id="signoff" className="text-xl font-semibold">Final two-person sign-off</h2>
        <p className="text-sm">Round {so.round || "none"} · Endorsed roles: {so.endorsedRoles.join(", ") || "none"} · Concern recorded: {so.concern ? "yes" : "no"} · Complete: {so.complete ? "yes" : "no"}</p>
        <p className="text-sm text-muted-foreground">A Superadmin and a different Operations admin must each endorse the same latest round. Any concern closes the round unresolved. Sign-offs are append-only and never edited.</p>
        {d.authorized ? <div className="flex flex-wrap gap-3"><Button disabled={busy} variant="outline" className="min-h-11" onClick={() => void record("endorsed")}>Endorse current round</Button><Button disabled={busy} variant="outline" className="min-h-11" onClick={() => void record("concern")}>Record concern</Button></div> : <p className="text-sm">Blocked: sign-off needs a signed-in global Superadmin or Operations admin with two-step sign-in.</p>}
        {d.signoffs && d.signoffs.length > 0 && <ul className="space-y-1 text-sm">{d.signoffs.map((x) => <li key={x.id} className="break-words">Round {x.round} · {x.outcome} · {x.signer_role}{x.mine ? " (you)" : ""} · {x.created_at} · {x.correlation_id}</li>)}</ul>}
      </section>
      {msg && <p role="alert" className="text-sm">{msg}</p>}
    </main>
  );
}
export const Route = createFileRoute("/golive-decision-pack")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Final go-live decision pack — iCareTele" }, { name: "description", content: "Private redacted executive consolidation of every readiness register." }, { property: "og:title", content: "Final go-live decision pack — iCareTele" }, { property: "og:description", content: "Private decision pack. Production readiness is not claimed." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: GoLiveDecisionPack,
});
