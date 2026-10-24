import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { readIncidentConsole, recordIncident, confirmIncident } from "@/lib/incident-console.functions";
import { CLASSES, ENVIRONMENTS, NO_CONTROL_NOTICE, REQUIRED_ACTIONS, ROLES, SCOPES, SEVERITIES, SIMULATED_SIM, STATUSES, STOP_CONDITION_KEYS, TRIGGERS, classStatus, escalationGate, incidentExport, itemGroup, unsafeIncidentText, type Item } from "@/lib/incident-console";
import { STOP_CONDITIONS } from "@/lib/launch-control";

type Form = { lineage: string; incident_class: string; severity: string; trigger: string; scope: string; environment: string; status: string; owner: string; reviewer: string; ref: string; action: string; stop: string; blocker: string; date: string };

/** Private Incident and Escalation Console. Redacted metadata only: never deploys, publishes,
 *  sends notifications or calls external services, and exposes no kill-switch. */
function IncidentConsole() {
  const rd = useServerFn(readIncidentConsole), rec = useServerFn(recordIncident), rev = useServerFn(confirmIncident);
  const [auth, setAuth] = useState<"out" | "denied" | "ok">("out");
  const [items, setItems] = useState<Item[] | null>(null);
  const [msg, setMsg] = useState("");
  const load = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setItems(null); return setAuth("out"); }
    try { setItems(await rd()); setAuth("ok"); } catch { setItems(null); setAuth("denied"); }
  };
  useEffect(() => { void load(); }, []);
  const signedIn = auth === "ok";
  const field = "mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-2";
  const err = (e: unknown) => setMsg(e instanceof Error ? ({ MFA: "Two-step sign-in required.", SECOND_REVIEWER_REQUIRED: "A different reviewer must confirm.", STALE_VERSION: "A newer version exists.", CLASS_MISMATCH: "A new version must keep the same incident class." } as Record<string, string>)[e.message] ?? "Not recorded: not allowed, or text was refused." : "Not recorded.");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Form;
    if (unsafeIncidentText(f.ref ?? "") || unsafeIncidentText(f.blocker ?? "")) return setMsg("Remove keys, tokens, links, emails, numbers, file names, personal data or medical wording.");
    try { const r = await rec({ data: { lineage: f.lineage || null, incident_class: f.incident_class as "data_integrity", severity: f.severity as "low", trigger: f.trigger as "monitoring_signal", scope: f.scope as "monitoring", environment: f.environment as "preview", status: f.status as "open", owner: f.owner as "SUPER_ADMIN", reviewer: f.reviewer as "SUPER_ADMIN", ref: f.ref, action: f.action as (typeof REQUIRED_ACTIONS)[number], stop: f.stop as "none", blocker: f.blocker || null, date: f.date || null } }); setMsg(`Recorded version ${r.version} (${r.correlation_id}).`); await load(); } catch (x) { err(x); }
  };
  const respond = async (id: string, outcome: "confirmed" | "concern") => {
    try { await rev({ data: { id, outcome } }); setMsg("Review recorded."); await load(); } catch (x) { err(x); }
  };
  const download = () => { if (!(signedIn)) return; const b = new Blob([incidentExport(items, signedIn)], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "incident-console.md"; a.click(); URL.revokeObjectURL(a.href); };
  const sel = (name: string, opts: readonly string[], labels?: Record<string, string>) => <select name={name} className={field}>{opts.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}</select>;
  const w = CLASSES.map((c) => ({ ...c, ...classStatus(c.key, items, signedIn) }));
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <PageHeader title="Incident and Escalation Console" subtitle={`Redacted metadata only. ${NO_CONTROL_NOTICE} A status change counts only after a different signed-in reviewer confirms its latest version. Readiness is NOT claimed.`} />
      <nav aria-label="Verification navigation" className="flex flex-wrap gap-3">
        <Button asChild variant="outline"><Link to="/launch-control">Launch-day control center</Link></Button>
        <Button asChild variant="outline"><Link to="/release-runbook">Release runbook</Link></Button>
        <Button asChild variant="outline"><Link to="/golive-decision-pack">Final go-live decision pack</Link></Button>
        <Button asChild variant="outline"><Link to="/human-review-console">Human review sign-off</Link></Button>
        <Button asChild variant="outline"><Link to="/integration-safety">Integration and provider safety</Link></Button>
        <Button asChild variant="outline"><Link to="/evidence-inspector">Evidence integrity inspector</Link></Button><Button asChild variant="outline"><Link to="/release-evidence-bundle">Final release evidence bundle</Link></Button>
        <Button asChild variant="outline"><Link to="/publish-gate">Publish gate</Link></Button><Button asChild variant="outline"><Link to="/readiness-decision-ledger">Readiness change and decision ledger</Link></Button>
      </nav>
      <Button disabled={!(signedIn)} onClick={download} variant="outline" className="min-h-11">Download redacted incident handoff export</Button>
      <p className="text-sm">Incident classes: passed {w.filter((c) => c.status === "passed").length} · pending {w.filter((c) => c.status === "pending").length} · blocked {w.filter((c) => c.status === "blocked").length} · unverified {w.filter((c) => c.status === "unverified").length} of {CLASSES.length}. Open: {w.filter((c) => c.status !== "passed").length}.</p>
      <section aria-labelledby="gates" className="space-y-2">
        <h2 id="gates" className="text-xl font-semibold">Escalation checklist — explicit stop and rollback gates</h2>
        <p className="text-sm">Stop the activity and follow the release runbook rollback decision tree if ANY condition is met:</p>
        <ul className="list-disc pl-5 text-sm">{STOP_CONDITIONS.map((s) => <li key={s}>{s}</li>)}</ul>
        <p className="text-sm">Rollback gate: a high or critical severity incident with any active stop condition maps to rollback-recommended; every action stays manual. {escalationGate("high", "data_integrity") === "rollback_gate" ? "Gate mapping verified in code." : ""}</p>
      </section>
      <section aria-labelledby="classes" className="space-y-3">
        <h2 id="classes" className="text-xl font-semibold">Incident classes</h2>
        {!signedIn && <p className="text-sm">Blocked: {auth === "out" ? "signed out — incident records are not read, and nothing is assumed." : "your account cannot read incident records."}</p>}
        {w.map((c) => (
          <div key={c.key} className="rounded-md border border-border p-3">
            <h3 className="font-semibold">{c.label} — {c.status}</h3><p className="text-sm text-muted-foreground">{c.reason}</p>
            <p className="mt-1 text-sm">Launch-day checklist: {c.launch.join(", ") || "none"} · owner actions: {c.ownerActions.join(", ") || "none"} · integration safety category: {c.integration} · verification checks: {c.checks.join(", ") || "none"}</p>
            <ul className="mt-2 space-y-2 text-sm">{(items ?? []).filter((e) => e.latest && e.incident_class === c.key).map((e) => <li key={e.id}>{e.severity} · trigger {e.trigger_category} · scope {e.affected_scope} · {e.environment} · status {e.status} · v{e.version} · {itemGroup(e).reason} · owner {e.owner_role} · reviewer {e.reviewer_role} · stop: {e.stop_condition} · ref {e.evidence_ref} · action: {e.required_action}{e.blocker_reason ? ` · blocker: ${e.blocker_reason}` : ""} · reviewed {e.review_date ?? "missing"} · {e.created_at} · {e.correlation_id}
              {signedIn && !e.mine && <span className="ml-2 inline-flex gap-2"><Button size="sm" className="min-h-11" onClick={() => respond(e.id, "confirmed")}>Confirm</Button><Button size="sm" variant="outline" className="min-h-11" onClick={() => respond(e.id, "concern")}>Concern</Button></span>}</li>)}</ul>
          </div>))}
      </section>
      <section aria-labelledby="add" className="space-y-3">
        <h2 id="add" className="text-xl font-semibold">Record incident metadata (new version, cannot be edited)</h2>
        {signedIn ? (
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">Previous version (optional)<select name="lineage" className={field}><option value="">New incident record</option>{(items ?? []).filter((e) => e.latest).map((e) => <option key={e.lineage} value={e.lineage}>{e.incident_class} {e.severity} v{e.version}</option>)}</select></label>
            <label className="text-sm">Incident class{sel("incident_class", CLASSES.map((c) => c.key), Object.fromEntries(CLASSES.map((c) => [c.key, c.label])))}</label>
            <label className="text-sm">Severity{sel("severity", SEVERITIES)}</label>
            <label className="text-sm">Trigger category{sel("trigger", TRIGGERS)}</label>
            <label className="text-sm">Affected register or check group{sel("scope", SCOPES)}</label>
            <label className="text-sm">Environment label{sel("environment", ENVIRONMENTS)}</label>
            <label className="text-sm">Status{sel("status", STATUSES)}</label>
            <label className="text-sm">Owner role{sel("owner", ROLES)}</label>
            <label className="text-sm">Reviewer role{sel("reviewer", [...ROLES].reverse())}</label>
            <label className="text-sm">Required action{sel("action", REQUIRED_ACTIONS)}</label>
            <label className="text-sm">Stop condition{sel("stop", STOP_CONDITION_KEYS)}</label>
            <label className="text-sm">Review date<input type="date" name="date" className={field} /></label>
            <label className="text-sm md:col-span-3">Safe evidence label<input name="ref" required minLength={3} maxLength={120} className={field} /></label>
            <label className="text-sm md:col-span-3">Blocker reason (optional, redacted)<input name="blocker" minLength={3} maxLength={200} className={field} /></label>
            <Button type="submit" className="min-h-11 md:col-span-3">Record incident metadata</Button>
          </form>
        ) : <p className="text-sm">Blocked: recording and confirming need a signed-in global Superadmin or Operations admin with two-step sign-in; confirmation must come from a different person.</p>}
        {msg && <p role="alert" className="text-sm">{msg}</p>}
      </section>
      <section aria-labelledby="sim" className="space-y-2">
        <h2 id="sim" className="text-xl font-semibold">Synthetic incident simulator (read-only)</h2>
        <p className="text-sm">{SIMULATED_SIM.label}</p>
        <ol className="list-decimal pl-5 text-sm">{SIMULATED_SIM.steps.map((s) => <li key={s.step}>{s.step} — outbound requests: {s.outboundCalls}</li>)}</ol>
        <p className="text-sm">{SIMULATED_SIM.conclusion}</p>
      </section>
    </main>
  );
}
export const Route = createFileRoute("/incident-console")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Incident and Escalation Console — iCareTele" }, { name: "description", content: "Internal append-only incident planning and evidence surface." }, { property: "og:title", content: "Incident and Escalation Console — iCareTele" }, { property: "og:description", content: "Internal incident and escalation console." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: IncidentConsole,
});
