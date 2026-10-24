import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { readTestPrerequisites } from "@/lib/production-test-readiness.functions";
import { readTestSessions, recordTestSession, confirmTestSession } from "@/lib/test-session.functions";
import { SESSION_SUITES, SESSION_STATUSES, EVIDENCE_LABELS, planWorkspace, workspaceSummary, simulatedPlan, sessionExport, type Session, type SuiteKey } from "@/lib/test-session";
import type { Entry as PrereqEntry } from "@/lib/production-test-readiness";
import { READINESS_NOTICE } from "@/lib/verification-campaign";

type Loaded = { signedIn: boolean; authorized: boolean; prereqs: PrereqEntry[] | null; sessions: Session[] | null };
const EMPTY: Loaded = { signedIn: false, authorized: false, prereqs: null, sessions: null };

/** Private test session workspace. Prepares the real signed-in campaign; never runs it and never marks a check passed. */
function TestSessionWorkspace() {
  const rt = useServerFn(readTestPrerequisites), rs = useServerFn(readTestSessions), record = useServerFn(recordTestSession), confirm = useServerFn(confirmTestSession);
  const [d, setD] = useState<Loaded>(EMPTY);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSim, setShowSim] = useState(false);
  const load = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return setD(EMPTY);
    try {
      const [prereqs, sessions] = await Promise.all([rt(), rs()]);
      setD({ signedIn: true, authorized: true, prereqs: prereqs as PrereqEntry[], sessions: sessions as Session[] });
    } catch { setD({ signedIn: true, authorized: false, prereqs: null, sessions: null }); }
  };
  useEffect(() => { void load(); }, []);
  const rows = useMemo(() => planWorkspace(d.prereqs, d.sessions, d.authorized), [d]);
  const s = workspaceSummary(rows);
  const sim = useMemo(() => simulatedPlan(), []);
  const download = () => { try { const b = new Blob([sessionExport(rows, d.sessions)], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "test-session-handoff.md"; a.click(); URL.revokeObjectURL(a.href); } catch { setMsg("Export refused: safe metadata could not be verified."); } };
  const save = async (suite: SuiteKey, status: "planned" | "ready" | "blocked") => { setBusy(true); try { await record({ data: { suite, status, evidence: "Owner handoff review" } }); setMsg("Session recorded (append-only). The campaign has not been run."); await load(); } catch (e) { setMsg(e instanceof Error && e.message.includes("PREREQUISITES_UNAVAILABLE") ? "Not recorded: the start gate is closed — one or more mapped prerequisites are not independently confirmed as available." : "Not recorded: a global Superadmin or Operations admin with two-step sign-in is required; active, paused and completed states cannot be recorded here."); } finally { setBusy(false); } };
  const review = async (id: string, outcome: "confirmed" | "rejected") => { setBusy(true); try { await confirm({ data: { id, outcome } }); setMsg("Review recorded (append-only)."); await load(); } catch { setMsg("Not recorded: only the latest version can be reviewed, and the reviewer must be a different signed-in global admin."); } finally { setBusy(false); } };
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <PageHeader title="Production test session workspace" subtitle="Prepares the eventual real signed-in campaign. It never runs the campaign, never starts automatically and never marks a check passed." />
      <p className="border-l-4 border-warning pl-4">{READINESS_NOTICE}</p>
      <p role="status" className="text-sm">Planned {s.planned} · Ready {s.ready} · Active {s.active} · Paused {s.paused} · Completed {s.completed} · Blocked {s.blocked} · Unverified {s.unverified} (total {s.total}) · Open blockers {s.openBlockers}</p>
      {!d.authorized && <p role="alert" className="text-sm">{d.signedIn ? "Your account cannot read session records; every suite is shown as blocked." : "Signed out: no session or prerequisite is read, so every suite is blocked. A global Superadmin or Operations admin with two-step sign-in is required."}</p>}
      <nav aria-label="Workspace navigation" className="flex flex-wrap gap-3">
        <Button asChild variant="outline"><Link to="/golive-decision-pack">Go-live decision pack</Link></Button><Button asChild variant="outline"><Link to="/session-start-gate">Human session start gate</Link></Button><Button asChild variant="outline"><Link to="/session-results">Human session results</Link></Button>
        <Button asChild variant="outline"><Link to="/human-review-console">Human review sign-off</Link></Button>
        <Button asChild variant="outline"><Link to="/verification-campaign">Verification campaign</Link></Button>
        <Button asChild variant="outline"><Link to="/production-test-readiness">Production test readiness</Link></Button>
        <Button asChild variant="outline"><Link to="/owner-action-queue">Owner action queue</Link></Button>
        <Button asChild variant="outline"><Link to="/publish-gate">Publish gate</Link></Button>
        <Button variant="outline" onClick={download} disabled={!d.authorized}>Download redacted session handoff</Button>
      </nav>
      <section aria-labelledby="planner">
        <h2 id="planner" className="text-xl font-semibold">Suite planner ({rows.length} suites)</h2>
        <p className="mt-1 text-sm text-muted-foreground">Each suite lists the exact checks, prerequisites and owner actions it depends on. A session can move from planned to ready only when every mapped prerequisite is independently confirmed as available — the gate never opens automatically.</p>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Planned session for every suite</caption>
          <thead><tr className="text-left">{["Suite", "Checks", "Prerequisites", "Owner actions", "Expected", "Status", "Start gate", "Blocker", "Next action", "Version", "Actions"].map((h) => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.key} className="border-t border-border"><td className="p-2">{r.label}</td><td className="p-2">{r.checks.join(", ")}</td><td className="p-2">{r.prerequisites.join(", ") || "none"}</td><td className="p-2">{r.ownerActions.join(", ") || "none"}</td><td className="p-2">{r.expected}</td><td className="p-2 font-medium">{r.status}</td><td className="p-2">{r.gate.ready ? "Open: a human may plan the real run" : r.gate.reason}</td><td className="p-2">{r.session?.blocker_reason ?? "not recorded"}</td><td className="p-2">{r.session?.next_action ?? "Plan the session"}</td><td className="p-2">{r.session ? `v${r.session.version}` : "none"}</td>
            <td className="p-2">{d.authorized ? <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => void save(r.key, "planned")}>Plan</Button>
              <Button size="sm" variant="outline" className="min-h-11" disabled={busy || !r.gate.ready} onClick={() => void save(r.key, "ready")}>Mark ready</Button>
              <Button size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => void save(r.key, "blocked")}>Record blocker</Button>
              {r.session && !r.session.mine && <Button size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => void review(r.session!.id, "confirmed")}>Confirm</Button>}
              {r.session && !r.session.mine && <Button size="sm" variant="outline" className="min-h-11" disabled={busy} onClick={() => void review(r.session!.id, "rejected")}>Reject</Button>}
            </div> : "Blocked"}</td></tr>)}</tbody>
        </table></div>
      </section>
      <section aria-labelledby="simulated">
        <h2 id="simulated" className="text-xl font-semibold">Simulated planning (SIMULATED)</h2>
        <p className="mt-1 text-sm text-muted-foreground">Fixture-only planning, kept separate from recorded sessions. Simulated entries are never recorded and never count as a real signed-in run.</p>
        <Button variant="outline" className="mt-3" onClick={() => setShowSim((v) => !v)}>{showSim ? "Hide simulated plan" : "Show simulated plan"}</Button>
        {showSim && <ul className="mt-3 space-y-1 text-sm">{sim.map((x) => <li key={x.correlationId} className="break-words">SIMULATED · {x.label} · {x.status} · {x.note} · {x.timestamp} · {x.correlationId}</li>)}</ul>}
      </section>
      {d.sessions && d.sessions.length > 0 && <section aria-labelledby="history">
        <h2 id="history" className="text-xl font-semibold">Append-only session history ({d.sessions.length})</h2>
        <ul className="mt-3 space-y-1 text-sm">{d.sessions.map((x) => <li key={x.id} className="break-words">{x.suite_key} v{x.version} · {x.status} · {x.environment_label} · {x.prerequisite_state} · {x.blocker_reason} · reviews: {x.reviews.length ? x.reviews.map((r) => `${r.outcome}${r.independent ? " (independent)" : ""}`).join(", ") : "none"} · {x.created_at} · {x.correlation_id}</li>)}</ul>
      </section>}
      {msg && <p role="alert" className="text-sm">{msg}</p>}
    </main>
  );
}
export const Route = createFileRoute("/test-session-workspace")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Production test session workspace — iCareTele" }, { name: "description", content: "Private redacted session planner for the real signed-in verification campaign." }, { property: "og:title", content: "Production test session workspace — iCareTele" }, { property: "og:description", content: "Private session workspace. Production readiness is not claimed." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: TestSessionWorkspace,
});
