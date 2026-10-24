import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { readIntegrationSafety, recordIntegrationSafety, confirmIntegrationSafety } from "@/lib/integration-safety.functions";
import { CATEGORIES, CHANGE_CONTROL_NOTICE, ENVIRONMENTS, ITEM_STATUSES, REQUIRED_ACTIONS, ROLES, SIMULATED_SIM, categoryStatus, integrationExport, itemGroup, type Item } from "@/lib/integration-safety";
import { unsafeContent } from "@/lib/content-review";

type Form = { lineage: string; category: string; capability: string; environment: string; status: string; owner: string; reviewer: string; ref: string; action: string; blocker: string; date: string };

/** Private Integration and Provider Safety Register. Redacted metadata only: never activates,
 *  connects or calls any external provider and never reads production configuration. */
function IntegrationSafety() {
  const rd = useServerFn(readIntegrationSafety), rec = useServerFn(recordIntegrationSafety), rev = useServerFn(confirmIntegrationSafety);
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
  const err = (e: unknown) => setMsg(e instanceof Error ? ({ MFA: "Two-step sign-in required.", SECOND_REVIEWER_REQUIRED: "A different reviewer must confirm.", STALE_VERSION: "A newer version exists.", CATEGORY_MISMATCH: "A new version must keep the same provider category." } as Record<string, string>)[e.message] ?? "Not recorded: not allowed, or text was refused." : "Not recorded.");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Form;
    if (unsafeContent(f.ref ?? "") || unsafeContent(f.capability ?? "") || unsafeContent(f.blocker ?? "")) return setMsg("Remove keys, tokens, links, emails, numbers, file names or personal data.");
    try { const r = await rec({ data: { lineage: f.lineage || null, category: f.category as "payment", capability: f.capability, environment: f.environment as "preview", status: f.status as "disabled", owner: f.owner as "SUPER_ADMIN", reviewer: f.reviewer as "SUPER_ADMIN", ref: f.ref, action: f.action as (typeof REQUIRED_ACTIONS)[number], blocker: f.blocker || null, date: f.date || null } }); setMsg(`Recorded version ${r.version} (${r.correlation_id}).`); await load(); } catch (x) { err(x); }
  };
  const respond = async (id: string, outcome: "confirmed" | "concern") => {
    try { await rev({ data: { id, outcome } }); setMsg("Review recorded."); await load(); } catch (x) { err(x); }
  };
  const download = () => { if (!(signedIn)) return; const b = new Blob([integrationExport(items, signedIn)], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "integration-safety.md"; a.click(); URL.revokeObjectURL(a.href); };
  const sel = (name: string, opts: readonly string[], labels?: Record<string, string>) => <select name={name} className={field}>{opts.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}</select>;
  const w = CATEGORIES.map((c) => ({ ...c, ...categoryStatus(c.key, items, signedIn) }));
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <PageHeader title="Integration and Provider Safety Register" subtitle={`Redacted metadata only. No external service is connected; this page never activates, connects or calls any provider. ${CHANGE_CONTROL_NOTICE} A capability counts as proven disabled only after a different signed-in reviewer confirms its latest version. Readiness is NOT claimed.`} />
      <nav aria-label="Verification navigation" className="flex flex-wrap gap-3">
        <Button asChild variant="outline"><Link to="/launch-control">Launch-day control center</Link></Button><Button asChild variant="outline"><Link to="/incident-console">Incident and escalation console</Link></Button>
        <Button asChild variant="outline"><Link to="/golive-decision-pack">Final go-live decision pack</Link></Button>
        <Button asChild variant="outline"><Link to="/human-review-console">Human review sign-off</Link></Button>
        <Button asChild variant="outline"><Link to="/release-handoff">Release handoff</Link></Button>
        <Button asChild variant="outline"><Link to="/publish-gate">Publish gate</Link></Button>
        <Button asChild variant="outline"><Link to="/owner-action-queue">Owner action queue</Link></Button>
      </nav>
      <Button disabled={!(signedIn)} onClick={download} variant="outline" className="min-h-11">Download redacted integration safety export</Button>
      <p className="text-sm">Categories: passed {w.filter((c) => c.status === "passed").length} · pending {w.filter((c) => c.status === "pending").length} · blocked {w.filter((c) => c.status === "blocked").length} · unverified {w.filter((c) => c.status === "unverified").length} of {CATEGORIES.length}. Open: {w.filter((c) => c.status !== "passed").length}.</p>
      <section aria-labelledby="cats" className="space-y-3">
        <h2 id="cats" className="text-xl font-semibold">Provider categories</h2>
        {!signedIn && <p className="text-sm">Blocked: {auth === "out" ? "signed out — integration safety records are not read, and nothing is assumed disabled." : "your account cannot read integration safety records."}</p>}
        {w.map((c) => (
          <div key={c.key} className="rounded-md border border-border p-3">
            <h3 className="font-semibold">{c.label} — {c.status}</h3><p className="text-sm text-muted-foreground">{c.reason}</p>
            <p className="mt-1 text-sm">Verification checks: {c.checks.join(", ") || "none"} · launch-day checklist: {c.launch.join(", ") || "none"} · owner actions: {c.ownerActions.join(", ") || "none"}</p>
            <ul className="mt-2 space-y-2 text-sm">{(items ?? []).filter((e) => e.latest && e.category === c.key).map((e) => <li key={e.id}>{e.capability} · {e.environment} · state {e.status} · v{e.version} · {itemGroup(e).reason} · owner {e.owner_role} · reviewer {e.reviewer_role} · ref {e.evidence_ref} · action: {e.required_action}{e.blocker_reason ? ` · blocker: ${e.blocker_reason}` : ""} · reviewed {e.review_date ?? "missing"} · {e.created_at} · {e.correlation_id}
              {signedIn && !e.mine && <span className="ml-2 inline-flex gap-2"><Button size="sm" className="min-h-11" onClick={() => respond(e.id, "confirmed")}>Confirm</Button><Button size="sm" variant="outline" className="min-h-11" onClick={() => respond(e.id, "concern")}>Concern</Button></span>}</li>)}</ul>
          </div>))}
      </section>
      <section aria-labelledby="add" className="space-y-3">
        <h2 id="add" className="text-xl font-semibold">Record provider safety metadata (new version, cannot be edited)</h2>
        {signedIn ? (
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">Previous version (optional)<select name="lineage" className={field}><option value="">New item</option>{(items ?? []).filter((e) => e.latest).map((e) => <option key={e.lineage} value={e.lineage}>{e.category} {e.capability} v{e.version}</option>)}</select></label>
            <label className="text-sm">Provider category{sel("category", CATEGORIES.map((c) => c.key), Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label])))}</label>
            <label className="text-sm">Capability label (redacted)<input name="capability" required minLength={3} maxLength={80} className={field} /></label>
            <label className="text-sm">Environment label{sel("environment", ENVIRONMENTS)}</label>
            <label className="text-sm">Status{sel("status", ITEM_STATUSES)}</label>
            <label className="text-sm">Owner role{sel("owner", ROLES)}</label>
            <label className="text-sm">Reviewer role{sel("reviewer", [...ROLES].reverse())}</label>
            <label className="text-sm">Required action{sel("action", REQUIRED_ACTIONS)}</label>
            <label className="text-sm">Review date<input type="date" name="date" className={field} /></label>
            <label className="text-sm md:col-span-3">Safe evidence label<input name="ref" required minLength={3} maxLength={120} className={field} /></label>
            <label className="text-sm md:col-span-3">Blocker reason (optional, redacted)<input name="blocker" minLength={3} maxLength={200} className={field} /></label>
            <Button type="submit" className="min-h-11 md:col-span-3">Record provider safety metadata</Button>
          </form>
        ) : <p className="text-sm">Blocked: recording and confirming need a signed-in global Superadmin or Operations admin with two-step sign-in; confirmation must come from a different person.</p>}
        {msg && <p role="alert" className="text-sm">{msg}</p>}
      </section>
      <section aria-labelledby="sim" className="space-y-2">
        <h2 id="sim" className="text-xl font-semibold">Synthetic simulator (read-only)</h2>
        <p className="text-sm">{SIMULATED_SIM.label}</p>
        <ul className="list-disc pl-5 text-sm">{SIMULATED_SIM.rows.map((r) => <li key={r.provider}>{r.provider} — state {r.state} — outbound calls: {r.outboundCalls}</li>)}</ul>
        <p className="text-sm">{SIMULATED_SIM.conclusion}</p>
      </section>
    </main>
  );
}
export const Route = createFileRoute("/integration-safety")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Integration and Provider Safety Register — iCareTele" }, { name: "description", content: "Internal register proving external capabilities remain disabled before launch." }, { property: "og:title", content: "Integration and Provider Safety Register — iCareTele" }, { property: "og:description", content: "Internal integration safety register." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: IntegrationSafety,
});
