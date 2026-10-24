import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { readContentApprovals, recordContentApproval, reviewContentApproval } from "@/lib/content-approval.functions";
import { APPROVAL_STATUSES, CANONICAL, CATEGORIES, REQUIRED_ACTIONS, ROLES, SIMULATED_EXAMPLE, SURFACES, UNLOCKS, approvalExport, approvalGroup, categoryStatus, type Entry } from "@/lib/content-approval";
import { unsafeContent } from "@/lib/content-review";

type Form = { lineage: string; category: string; surface: string; canonical: string; status: string; owner: string; reviewer: string; ref: string; action: string; date: string };

/** Private canonical content and commercial approval workspace. Never publishes and never makes a claim live. */
function ContentApproval() {
  const rd = useServerFn(readContentApprovals), rec = useServerFn(recordContentApproval), rev = useServerFn(reviewContentApproval);
  const [auth, setAuth] = useState<"out" | "denied" | "ok">("out");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [msg, setMsg] = useState("");
  const load = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setEntries(null); return setAuth("out"); }
    try { setEntries(await rd()); setAuth("ok"); } catch { setEntries(null); setAuth("denied"); }
  };
  useEffect(() => { void load(); }, []);
  const signedIn = auth === "ok";
  const field = "mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-2";
  const err = (e: unknown) => setMsg(e instanceof Error ? ({ MFA: "Two-step sign-in required.", SECOND_REVIEWER_REQUIRED: "A different reviewer must approve.", STALE_VERSION: "A newer version exists.", CATEGORY_MISMATCH: "A new version must keep the same category and surface." } as Record<string, string>)[e.message] ?? "Not recorded: not allowed, or text was refused." : "Not recorded.");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Form;
    if (unsafeContent(f.ref ?? "")) return setMsg("Remove links, emails, numbers, file names or personal data.");
    try { const r = await rec({ data: { lineage: f.lineage || null, category: f.category as "clinic_facts", surface: f.surface as "/", canonical: f.canonical as "available", status: f.status as "pending", owner: f.owner as "SUPER_ADMIN", reviewer: f.reviewer as "SUPER_ADMIN", ref: f.ref, action: f.action as (typeof REQUIRED_ACTIONS)[number], date: f.date || null } }); setMsg(`Recorded version ${r.version} (${r.correlation_id}).`); await load(); } catch (x) { err(x); }
  };
  const respond = async (id: string, outcome: "approved" | "concern") => {
    try { await rev({ data: { id, outcome } }); setMsg("Review recorded."); await load(); } catch (x) { err(x); }
  };
  const download = () => { if (!(signedIn)) return; const b = new Blob([approvalExport(entries, signedIn)], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "content-approval.md"; a.click(); URL.revokeObjectURL(a.href); };
  const sel = (name: string, opts: readonly string[], labels?: Record<string, string>) => <select name={name} className={field}>{opts.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}</select>;
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <PageHeader title="Canonical content and commercial approval" subtitle="Redacted approval metadata only. Nothing here publishes or makes a claim live. Readiness is NOT claimed until every category is independently approved by a different signed-in reviewer." />
      <nav aria-label="Verification navigation" className="flex flex-wrap gap-3">
        <Button asChild variant="outline"><Link to="/content-review">Content and claims review</Link></Button>
        <Button asChild variant="outline"><Link to="/golive-decision-pack">Final go-live decision pack</Link></Button>
        <Button asChild variant="outline"><Link to="/owner-action-queue">Owner action queue</Link></Button>
        <Button asChild variant="outline"><Link to="/human-review-console">Human review sign-off</Link></Button>
        <Button asChild variant="outline"><Link to="/publish-gate">Publish gate</Link></Button>
      </nav>
      <Button disabled={!(signedIn)} onClick={download} variant="outline" className="min-h-11">Download redacted approval packet</Button>
      <section aria-labelledby="cats" className="space-y-3">
        <h2 id="cats" className="text-xl font-semibold">Categories</h2>
        {!signedIn && <p className="text-sm">Blocked: {auth === "out" ? "signed out — the approval register is not read, and nothing is assumed approved." : "your account cannot read approval records."}</p>}
        {CATEGORIES.map((c) => { const s = categoryStatus(c.key, entries, signedIn); return (
          <div key={c.key} className="rounded-md border border-border p-3">
            <h3 className="font-semibold">{c.label} — {s.status}</h3><p className="text-sm text-muted-foreground">{s.reason}</p>
            <p className="mt-1 text-sm">Unlocks check {UNLOCKS.check} (suite {UNLOCKS.suite}) · owner action {c.ownerAction} · sign-off register {UNLOCKS.register} ({UNLOCKS.signoffReason})</p>
            <ul className="mt-2 space-y-2 text-sm">{(entries ?? []).filter((e) => e.latest && e.category === c.key).map((e) => <li key={e.id}>{e.surface} · v{e.version} · {approvalGroup(e).reason} · canonical source {e.canonical_source} · owner {e.owner_role} · reviewer {e.reviewer_role} · ref {e.evidence_ref} · action: {e.required_action} · reviewed {e.review_date ?? "missing"} · {e.created_at} · {e.correlation_id}
              {signedIn && !e.mine && <span className="ml-2 inline-flex gap-2"><Button size="sm" className="min-h-11" onClick={() => respond(e.id, "approved")}>Approve</Button><Button size="sm" variant="outline" className="min-h-11" onClick={() => respond(e.id, "concern")}>Concern</Button></span>}</li>)}</ul>
          </div>); })}
      </section>
      <section aria-labelledby="add" className="space-y-3">
        <h2 id="add" className="text-xl font-semibold">Record approval metadata (new version, cannot be edited)</h2>
        {signedIn ? (
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">Previous version (optional)<select name="lineage" className={field}><option value="">New entry</option>{(entries ?? []).filter((e) => e.latest).map((e) => <option key={e.lineage} value={e.lineage}>{e.category} {e.surface} v{e.version}</option>)}</select></label>
            <label className="text-sm">Category{sel("category", CATEGORIES.map((c) => c.key), Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label])))}</label>
            <label className="text-sm">Target surface{sel("surface", SURFACES)}</label>
            <label className="text-sm">Canonical source availability{sel("canonical", CANONICAL)}</label>
            <label className="text-sm">Status{sel("status", APPROVAL_STATUSES)}</label>
            <label className="text-sm">Owner role{sel("owner", ROLES)}</label>
            <label className="text-sm">Reviewer role{sel("reviewer", [...ROLES].reverse())}</label>
            <label className="text-sm">Required action{sel("action", REQUIRED_ACTIONS)}</label>
            <label className="text-sm">Review date<input type="date" name="date" className={field} /></label>
            <label className="text-sm md:col-span-3">Safe evidence label<input name="ref" required minLength={3} maxLength={120} className={field} /></label>
            <Button type="submit" className="min-h-11 md:col-span-3">Record approval metadata</Button>
          </form>
        ) : <p className="text-sm">Blocked: recording and approving need a signed-in global Superadmin or Operations admin with two-step sign-in; approval must come from a different person.</p>}
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
export const Route = createFileRoute("/content-approval")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Canonical content and commercial approval — iCareTele" }, { name: "description", content: "Internal canonical content and commercial approval workspace." }, { property: "og:title", content: "Canonical content and commercial approval — iCareTele" }, { property: "og:description", content: "Internal content approval workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: ContentApproval,
});
