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
import { readHumanReview, openHumanReviewRound, recordHumanReviewDecision } from "@/lib/human-review.functions";
import { buildGate, type Ack, type GateRow } from "@/lib/publish-gate";
import { groupHandoff, type EvidenceEntry } from "@/lib/release-evidence";
import type { BackupEntry } from "@/lib/backup-evidence";
import type { ProtectionEntry } from "@/lib/protection-evidence";
import type { ContentEntry } from "@/lib/content-review";
import type { AccessEntry } from "@/lib/access-matrix";
import type { StoredRun } from "@/lib/verification-campaign";
import type { Entry as OwnerEntry } from "@/lib/owner-action-queue";
import type { Entry as PrereqEntry } from "@/lib/production-test-readiness";
import { buildDecisionPack, packSummary } from "@/lib/decision-pack";
import { DECISION_REASONS, SIMULATED_EXAMPLE, humanReviewExport, reviewState, roundSummary, type DecisionReason, type ReviewConsole } from "@/lib/human-review";
import { nextActions, queueRows } from "@/lib/owner-action-queue";
import { READINESS_NOTICE } from "@/lib/verification-campaign";

type Loaded = { signedIn: boolean; authorized: boolean; gate: GateRow[] | null; owner: OwnerEntry[] | null; prereqs: PrereqEntry[] | null; runs: StoredRun[] | null; review: ReviewConsole | null };
const EMPTY: Loaded = { signedIn: false, authorized: false, gate: null, owner: null, prereqs: null, runs: null, review: null };

/** Private human review sign-off console. It never publishes and never runs production tests. */
function HumanReviewConsole() {
  const rr = useServerFn(readRelease), re = useServerFn(readEvidence), rv = useServerFn(readReviews), rb = useServerFn(readBackups), rp = useServerFn(readProtection), rc = useServerFn(readContentReviews), ra = useServerFn(readAccessAudit), rh = useServerFn(readCampaignHistory), ro = useServerFn(readOwnerActions), rt = useServerFn(readTestPrerequisites), rx = useServerFn(readHumanReview), open = useServerFn(openHumanReviewRound), decide = useServerFn(recordHumanReviewDecision);
  const [d, setD] = useState<Loaded>(EMPTY);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return setD(EMPTY);
    try {
      const [rel, ev, acks, backup, protection, content, access, runs, owner, prereqs, review] = await Promise.all([rr(), re(), rv(), rb(), rp(), rc(), ra(), rh(), ro(), rt(), rx()]);
      const gate = buildGate({ checklist: groupHandoff(rel.items ?? null, ev as EvidenceEntry[]), acks: acks as Ack[], backup: backup as BackupEntry[], protection: protection as ProtectionEntry[], content: content as ContentEntry[], access: access as AccessEntry[], signedIn: true });
      setD({ signedIn: true, authorized: true, gate, owner: owner as OwnerEntry[], prereqs: prereqs as PrereqEntry[], runs: runs as StoredRun[], review: review as ReviewConsole });
    } catch { setD({ signedIn: true, authorized: false, gate: null, owner: null, prereqs: null, runs: null, review: null }); }
  };
  useEffect(() => { void load(); }, []);
  const rows = useMemo(() => buildDecisionPack({ authorized: d.authorized, gate: d.gate, owner: d.owner, prereqs: d.prereqs, runs: d.runs }), [d]);
  const state = useMemo(() => reviewState(rows, d.review, d.authorized), [rows, d.review, d.authorized]);
  const s = packSummary(rows);
  const so = roundSummary(d.review);
  const checklist = nextActions(queueRows(d.owner ?? [], d.authorized));
  const download = () => { try { const b = new Blob([humanReviewExport(rows, state, d.review, checklist)], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "human-review-packet.md"; a.click(); URL.revokeObjectURL(a.href); } catch { setMsg("Export refused: safe metadata could not be verified."); } };
  const act = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); setMsg(ok); await load(); } catch { setMsg("Not recorded: a signed-in global Superadmin or Operations admin with two-step sign-in is required; the round must be the latest open one and the opener cannot review it."); } finally { setBusy(false); } };
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <PageHeader title="Human review sign-off console" subtitle="Controlled final review surface for a future human approval round. It never publishes, never runs production tests and never auto-promotes a round." />
      <p className="border-l-4 border-warning pl-4">{READINESS_NOTICE}</p>
      <p role="status" className="rounded-lg border border-border p-4 font-medium">Review state: {state.state} — {state.reason}</p>
      <p role="status" className="text-sm">Passed {s.passed} · Pending {s.pending} · Blocked {s.blocked} · Unverified {s.unverified} (total {s.total}) · Open blockers {state.gaps.length}</p>
      {!d.authorized && <p role="alert" className="text-sm">{d.signedIn ? "Your account cannot read release records; every register is shown as blocked." : "Signed out: no register or round is read, so every item is blocked. A global Superadmin or Operations admin with two-step sign-in is required."}</p>}
      <nav aria-label="Console navigation" className="flex flex-wrap gap-3">
        <Button asChild variant="outline"><Link to="/golive-decision-pack">Final go-live decision pack</Link></Button><Button asChild variant="outline"><Link to="/session-start-gate">Human session start gate</Link></Button><Button asChild variant="outline"><Link to="/session-results">Human session results</Link></Button>
        <Button asChild variant="outline"><Link to="/test-session-workspace">Test session workspace</Link></Button>
        <Button asChild variant="outline"><Link to="/owner-action-queue">Owner action queue</Link></Button>
        <Button asChild variant="outline"><Link to="/publish-gate">Publish gate</Link></Button><Button asChild variant="outline"><Link to="/readiness-decision-ledger">Readiness change and decision ledger</Link></Button><Button asChild variant="outline"><Link to="/validation-snapshot">Final validation evidence snapshot</Link></Button>
        <Button asChild variant="outline"><Link to="/release-handoff">Release handoff</Link></Button>
        <Button asChild variant="outline"><Link to="/content-approval">Canonical content approval</Link></Button>
        <Button asChild variant="outline"><Link to="/launch-control">Launch-day control center</Link></Button>
        <Button asChild variant="outline"><Link to="/integration-safety">Integration and provider safety</Link></Button><Button asChild variant="outline"><Link to="/incident-console">Incident and escalation console</Link></Button><Button asChild variant="outline"><Link to="/evidence-inspector">Evidence integrity inspector</Link></Button><Button asChild variant="outline"><Link to="/owner-action-closure">Owner action closure board</Link></Button><Button asChild variant="outline"><Link to="/release-evidence-bundle">Final release evidence bundle</Link></Button>
        <Button variant="outline" onClick={download} disabled={!d.authorized}>Download redacted review packet</Button>
      <Button asChild variant="outline"><Link to="/golive-evidence-matrix">Go-live evidence reconciliation matrix</Link></Button><Button asChild variant="outline"><Link to="/human-review-packet">Human review decision packet</Link></Button><Button asChild variant="outline"><Link to="/final-review-handoff">Final review handoff archive</Link></Button><Button asChild variant="outline"><Link to="/owner-signoff-readiness">Final owner sign-off readiness</Link></Button></nav>
      <section aria-labelledby="gaps">
        <h2 id="gaps" className="text-xl font-semibold">Open blockers ({state.gaps.length})</h2>
        <p className="mt-1 text-sm">Each gap links to the exact owner action, prerequisite and verification check that resolves it. Approval is impossible while any gap is open.</p>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Open blockers and how to resolve them</caption>
          <thead><tr className="text-left">{["Register", "Status", "Blocker reason", "Owner role", "Reviewer role", "Next action", "Resolving checks", "Owner actions"].map((h) => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
          <tbody>{state.gaps.map((g) => <tr key={g.key} className="border-t border-border"><td className="p-2">{g.label}</td><td className="p-2 font-medium">{g.status}</td><td className="p-2">{g.reason}</td><td className="p-2">SUPER_ADMIN</td><td className="p-2">OPERATIONS_ADMIN</td><td className="p-2">{g.nextAction}</td><td className="p-2">{g.checks.join(", ") || "manual handoff only"}</td><td className="p-2">{g.ownerActions.join(", ") || "none"}</td></tr>)}</tbody>
        </table></div>
      </section>
      <section aria-labelledby="rounds" className="space-y-3">
        <h2 id="rounds" className="text-xl font-semibold">Sign-off rounds</h2>
        <p className="text-sm">Latest round {so.round || "none"} · Status: {so.status} · Approved roles: {so.approvedRoles.join(", ") || "none"} · Concern recorded: {so.concern ? "yes" : "no"}</p>
        <p className="text-sm text-muted-foreground">A round is approved only when a Superadmin and a different Operations admin approve the same latest round and every hard blocker is resolved. The opener cannot review their own round, stale rounds refuse decisions, and any concern keeps the round unresolved. This console exposes no publish action.</p>
        {d.authorized ? <div className="flex flex-wrap gap-3">
          <Button disabled={busy || so.status === "open"} variant="outline" className="min-h-11" onClick={() => void act(() => open({}), "Round opened (append-only). Approval is not claimed.")}>Open new round</Button>
          <Button disabled={busy || so.status !== "open" || state.gaps.length > 0} variant="outline" className="min-h-11" onClick={() => void act(() => decide({ data: { decision: "approve", reason: "blockers_resolved" as DecisionReason } }), "Approval recorded (append-only). Readiness is not claimed.")}>Approve latest round</Button>
          <Button disabled={busy || so.status !== "open"} variant="outline" className="min-h-11" onClick={() => void act(() => decide({ data: { decision: "concern", reason: "concern_blocker_open" as DecisionReason } }), "Concern recorded (append-only); the round stays unresolved.")}>Record concern</Button>
        </div> : <p className="text-sm">Blocked: signing needs a signed-in global Superadmin or Operations admin with two-step sign-in.</p>}
        {so.status === "open" && state.gaps.length > 0 && <p className="text-sm">Approval is disabled: {state.gaps.length} blocker(s) are still open.</p>}
        {d.review && d.review.rounds.length > 0 && <ul className="space-y-1 text-sm">{d.review.rounds.map((r) => <li key={r.round} className="break-words">Round {r.round} · {r.status}{r.mine ? " (opened by you)" : ""} · {r.opened_at} · {r.correlation_id}</li>)}</ul>}
        {d.review && d.review.decisions.length > 0 && <ul className="space-y-1 text-sm">{d.review.decisions.map((x) => <li key={x.id} className="break-words">Round {x.round} · {x.decision} ({DECISION_REASONS[x.reason]}) · {x.reviewer_role}{x.mine ? " (you)" : ""} · {x.created_at} · {x.correlation_id}</li>)}</ul>}
      </section>
      <section aria-labelledby="handoff">
        <h2 id="handoff" className="text-xl font-semibold">Publish owner handoff checklist</h2>
        <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">{checklist.map((a) => <li key={a}>{a.replace(/^- \[ \] /, "")}</li>)}</ul>
      </section>
      <section aria-labelledby="simulated">
        <h2 id="simulated" className="text-xl font-semibold">{SIMULATED_EXAMPLE.label}</h2>
        <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">{SIMULATED_EXAMPLE.decisions.map((x) => <li key={x}>{x}</li>)}</ul>
      </section>
      {msg && <p role="alert" className="text-sm">{msg}</p>}
    </main>
  );
}
export const Route = createFileRoute("/human-review-console")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Human review sign-off console — iCareTele" }, { name: "description", content: "Private redacted human review sign-off console. It never publishes and readiness is not claimed." }, { property: "og:title", content: "Human review sign-off console — iCareTele" }, { property: "og:description", content: "Private human review console. Production readiness is not claimed." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: HumanReviewConsole,
});
