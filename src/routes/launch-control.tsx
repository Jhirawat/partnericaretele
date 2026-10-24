import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { readLaunchControl, recordLaunchControl, confirmLaunchControl } from "@/lib/launch-control.functions";
import { CHECKLISTS, ENVIRONMENTS, ITEM_STATUSES, PHASES, REQUIRED_ACTIONS, ROLES, ROLLBACK_TRIGGERS, SIMULATED_EXAMPLE, STOP_CONDITIONS, WINDOWS, checklistStatus, itemGroup, launchExport, type Item } from "@/lib/launch-control";
import { unsafeContent } from "@/lib/content-review";

type Form = { lineage: string; group: string; phase: string; candidate: string; environment: string; window: string; trigger: string; status: string; owner: string; reviewer: string; ref: string; action: string; blocker: string; date: string };

/** Private Launch-Day Control Center. Planning and evidence only: never publishes, never
 *  deploys, never calls external services and never claims the domain is live. */
function LaunchControl() {
  const rd = useServerFn(readLaunchControl), rec = useServerFn(recordLaunchControl), rev = useServerFn(confirmLaunchControl);
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
  const err = (e: unknown) => setMsg(e instanceof Error ? ({ MFA: "Two-step sign-in required.", SECOND_REVIEWER_REQUIRED: "A different reviewer must confirm.", STALE_VERSION: "A newer version exists.", GROUP_MISMATCH: "A new version must keep the same checklist group and phase." } as Record<string, string>)[e.message] ?? "Not recorded: not allowed, or text was refused." : "Not recorded.");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Form;
    if (unsafeContent(f.ref ?? "") || unsafeContent(f.candidate ?? "") || unsafeContent(f.blocker ?? "")) return setMsg("Remove links, emails, numbers, file names or personal data.");
    try { const r = await rec({ data: { lineage: f.lineage || null, group: f.group as "dns_domain_seo", phase: f.phase as "preflight", candidate: f.candidate, environment: f.environment as "preview", window: f.window as "unscheduled", trigger: f.trigger as "none", status: f.status as "planned", owner: f.owner as "SUPER_ADMIN", reviewer: f.reviewer as "SUPER_ADMIN", ref: f.ref, action: f.action as (typeof REQUIRED_ACTIONS)[number], blocker: f.blocker || null, date: f.date || null } }); setMsg(`Recorded version ${r.version} (${r.correlation_id}).`); await load(); } catch (x) { err(x); }
  };
  const respond = async (id: string, outcome: "confirmed" | "concern") => {
    try { await rev({ data: { id, outcome } }); setMsg("Review recorded."); await load(); } catch (x) { err(x); }
  };
  const download = () => { if (!(signedIn)) return; const b = new Blob([launchExport(items, signedIn)], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "launch-control.md"; a.click(); URL.revokeObjectURL(a.href); };
  const sel = (name: string, opts: readonly string[], labels?: Record<string, string>) => <select name={name} className={field}>{opts.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}</select>;
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <PageHeader title="Launch-Day Control Center" subtitle="Redacted planning and evidence metadata only. This page never publishes, never deploys and never calls external services; the domain is NOT claimed live. Readiness is NOT claimed until every checklist group is independently confirmed by a different signed-in reviewer." />
      <nav aria-label="Verification navigation" className="flex flex-wrap gap-3">
        <Button asChild variant="outline"><Link to="/golive-decision-pack">Final go-live decision pack</Link></Button>
        <Button asChild variant="outline"><Link to="/human-review-console">Human review sign-off</Link></Button>
        <Button asChild variant="outline"><Link to="/release-runbook">Release runbook</Link></Button>
        <Button asChild variant="outline"><Link to="/release-handoff">Release handoff</Link></Button>
        <Button asChild variant="outline"><Link to="/owner-action-queue">Owner action queue</Link></Button>
        <Button asChild variant="outline"><Link to="/publish-gate">Publish gate</Link></Button><Button asChild variant="outline"><Link to="/readiness-decision-ledger">Readiness change and decision ledger</Link></Button><Button asChild variant="outline"><Link to="/validation-snapshot">Final validation evidence snapshot</Link></Button>
        <Button asChild variant="outline"><Link to="/test-session-workspace">Test session workspace</Link></Button>
        <Button asChild variant="outline"><Link to="/integration-safety">Integration and provider safety</Link></Button><Button asChild variant="outline"><Link to="/incident-console">Incident and escalation console</Link></Button><Button asChild variant="outline"><Link to="/evidence-inspector">Evidence integrity inspector</Link></Button><Button asChild variant="outline"><Link to="/owner-action-closure">Owner action closure board</Link></Button><Button asChild variant="outline"><Link to="/release-evidence-bundle">Final release evidence bundle</Link></Button>
      </nav>
      <Button disabled={!(signedIn)} onClick={download} variant="outline" className="min-h-11">Download redacted launch packet</Button>
      <section aria-labelledby="groups" className="space-y-3">
        <h2 id="groups" className="text-xl font-semibold">Preflight and post-publish checklists</h2>
        {!signedIn && <p className="text-sm">Blocked: {auth === "out" ? "signed out — launch control records are not read, and nothing is assumed confirmed." : "your account cannot read launch control records."}</p>}
        {CHECKLISTS.map((c) => { const s = checklistStatus(c.key, items, signedIn); return (
          <div key={c.key} className="rounded-md border border-border p-3">
            <h3 className="font-semibold">{c.label} — {s.status}</h3><p className="text-sm text-muted-foreground">{s.reason}</p>
            <p className="mt-1 text-sm">Verification checks: {c.checks.join(", ") || "none"} · owner actions: {c.ownerActions.join(", ") || "none"} · register: {c.register} · sign-off: {SIGNOFF_REASON_LABEL}</p>
            <ul className="mt-2 space-y-2 text-sm">{(items ?? []).filter((e) => e.latest && e.checklist_group === c.key).map((e) => <li key={e.id}>{e.phase} · {e.release_candidate} · {e.environment} · window {e.planned_window} · trigger {e.rollback_trigger} · v{e.version} · {itemGroup(e).reason} · owner {e.owner_role} · reviewer {e.reviewer_role} · ref {e.evidence_ref} · action: {e.required_action}{e.blocker_reason ? ` · blocker: ${e.blocker_reason}` : ""} · reviewed {e.review_date ?? "missing"} · {e.created_at} · {e.correlation_id}
              {signedIn && !e.mine && <span className="ml-2 inline-flex gap-2"><Button size="sm" className="min-h-11" onClick={() => respond(e.id, "confirmed")}>Confirm</Button><Button size="sm" variant="outline" className="min-h-11" onClick={() => respond(e.id, "concern")}>Concern</Button></span>}</li>)}</ul>
          </div>); })}
      </section>
      <section aria-labelledby="rollback" className="space-y-2">
        <h2 id="rollback" className="text-xl font-semibold">Rollback decision checklist — explicit stop conditions</h2>
        <p className="text-sm">Stop the launch window and follow the release runbook rollback decision tree if ANY condition is met:</p>
        <ul className="list-disc pl-5 text-sm">{STOP_CONDITIONS.map((s) => <li key={s}>{s}</li>)}</ul>
      </section>
      <section aria-labelledby="add" className="space-y-3">
        <h2 id="add" className="text-xl font-semibold">Record launch metadata (new version, cannot be edited)</h2>
        {signedIn ? (
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">Previous version (optional)<select name="lineage" className={field}><option value="">New item</option>{(items ?? []).filter((e) => e.latest).map((e) => <option key={e.lineage} value={e.lineage}>{e.checklist_group} {e.phase} v{e.version}</option>)}</select></label>
            <label className="text-sm">Checklist group{sel("group", CHECKLISTS.map((c) => c.key), Object.fromEntries(CHECKLISTS.map((c) => [c.key, c.label])))}</label>
            <label className="text-sm">Phase{sel("phase", PHASES)}</label>
            <label className="text-sm">Release candidate label<input name="candidate" required minLength={3} maxLength={80} className={field} /></label>
            <label className="text-sm">Environment label{sel("environment", ENVIRONMENTS)}</label>
            <label className="text-sm">Planned window label{sel("window", WINDOWS)}</label>
            <label className="text-sm">Rollback trigger category{sel("trigger", ROLLBACK_TRIGGERS)}</label>
            <label className="text-sm">Status{sel("status", ITEM_STATUSES)}</label>
            <label className="text-sm">Owner role{sel("owner", ROLES)}</label>
            <label className="text-sm">Reviewer role{sel("reviewer", [...ROLES].reverse())}</label>
            <label className="text-sm">Required action{sel("action", REQUIRED_ACTIONS)}</label>
            <label className="text-sm">Review date<input type="date" name="date" className={field} /></label>
            <label className="text-sm md:col-span-3">Safe evidence label<input name="ref" required minLength={3} maxLength={120} className={field} /></label>
            <label className="text-sm md:col-span-3">Blocker reason (optional, redacted)<input name="blocker" minLength={3} maxLength={200} className={field} /></label>
            <Button type="submit" className="min-h-11 md:col-span-3">Record launch metadata</Button>
          </form>
        ) : <p className="text-sm">Blocked: recording and confirming need a signed-in global Superadmin or Operations admin with two-step sign-in; confirmation must come from a different person.</p>}
        {msg && <p role="alert" className="text-sm">{msg}</p>}
      </section>
      <section aria-labelledby="sim" className="space-y-2">
        <h2 id="sim" className="text-xl font-semibold">Simulated example</h2>
        <p className="text-sm">{SIMULATED_EXAMPLE.label}</p>
        <ul className="list-disc pl-5 text-sm">{SIMULATED_EXAMPLE.steps.map((x) => <li key={x}>{x}</li>)}</ul>
      </section>
    </main>
  );
}
const SIGNOFF_REASON_LABEL = "evidence_confirmed";
export const Route = createFileRoute("/launch-control")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Launch-Day Control Center — iCareTele" }, { name: "description", content: "Internal launch-day planning and evidence control center." }, { property: "og:title", content: "Launch-Day Control Center — iCareTele" }, { property: "og:description", content: "Internal launch-day control center." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: LaunchControl,
});
