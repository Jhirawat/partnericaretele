import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ackContentReview, readContentReviews, recordContentReview } from "@/lib/content-review.functions";
import { CONTENT_TYPES, FICTIONAL_PREVIEW, ROUTE_SCOPES, contentExport, contentGroup, previewFacts, typeStatus, unsafeContent, type ContentEntry } from "@/lib/content-review";
import { buildGate, gateSummary } from "@/lib/publish-gate";

type Form = { lineage: string; type: string; route: string; scope: string; owner: string; reviewer: string; status: string; ref: string; reason: string; next: string; date: string };

/** Private register of human content and claims reviews. Never verifies facts automatically and never publishes. */
function ContentReview() {
  const rd = useServerFn(readContentReviews), rec = useServerFn(recordContentReview), ack = useServerFn(ackContentReview);
  const [auth, setAuth] = useState<"out" | "denied" | "ok">("out");
  const [entries, setEntries] = useState<ContentEntry[] | null>(null);
  const [msg, setMsg] = useState("");
  const load = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setEntries(null); return setAuth("out"); }
    try { setEntries(await rd()); setAuth("ok"); } catch { setEntries(null); setAuth("denied"); }
  };
  useEffect(() => { void load(); }, []);
  const signedIn = auth === "ok";
  const hardOpen = useMemo(() => gateSummary(buildGate({ checklist: null, acks: null, signedIn, content: entries })).hardOpen, [entries, signedIn]);
  const field = "mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-2";
  const err = (e: unknown) => setMsg(e instanceof Error ? ({ MFA: "Two-step sign-in required.", SECOND_REVIEWER_REQUIRED: "A different reviewer must acknowledge.", STALE_VERSION: "A newer version exists.", CLAIM_TYPE_MISMATCH: "A new version must keep the same item type and route." } as Record<string, string>)[e.message] ?? "Not recorded: not allowed, or text was refused." : "Not recorded.");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Form;
    if ([f.scope, f.ref, f.reason, f.next].some((t) => unsafeContent(t ?? ""))) return setMsg("Remove links, emails, numbers, file names or personal data.");
    try { const r = await rec({ data: { lineage: f.lineage || null, type: f.type, route: f.route as "/", scope: f.scope, owner: f.owner as "SUPER_ADMIN", reviewer: f.reviewer as "SUPER_ADMIN", status: f.status as "pending", ref: f.ref, reason: f.reason, next: f.next, date: f.date || null } }); setMsg(`Recorded version ${r.version} (${r.correlation_id}).`); await load(); } catch (x) { err(x); }
  };
  const respond = async (id: string, outcome: "acknowledged" | "concern") => {
    try { await ack({ data: { id, outcome, note: outcome === "acknowledged" ? "Reviewed and acknowledged" : "Reviewer recorded a concern" } }); setMsg("Acknowledgement recorded."); await load(); } catch (x) { err(x); }
  };
  const download = () => { if (!(signedIn)) return; const b = new Blob([contentExport(entries, signedIn, hardOpen)], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "content-review.md"; a.click(); URL.revokeObjectURL(a.href); };
  const sel = (name: string, opts: readonly string[], labels?: Record<string, string>) => <select name={name} className={field}>{opts.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}</select>;
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <PageHeader title="Content and claims review" subtitle="Human review metadata only. No fact is verified automatically. Production readiness is NOT claimed; publishing is a separate manual owner action." />
      <section aria-labelledby="hard" className="rounded-lg border border-destructive p-4">
        <h2 id="hard" className="font-semibold">Publish gate hard blockers open ({hardOpen.length})</h2>
        <ul className="mt-2 list-disc pl-5 text-sm">{hardOpen.map((h) => <li key={h}>{h}</li>)}</ul>
        <p className="mt-2 text-sm"><Link to="/publish-gate" className="underline">Back to the publish gate</Link> · <Link to="/content-approval" className="underline">Canonical content approval workspace</Link></p>
      </section>
      <Button disabled={!(signedIn)} onClick={download} variant="outline" className="min-h-11">Download redacted review export</Button>
      <section aria-labelledby="types" className="space-y-3">
        <h2 id="types" className="text-xl font-semibold">Review items</h2>
        {!signedIn && <p className="text-sm">Blocked: {auth === "out" ? "signed out — reviews are not read, and nothing is assumed verified." : "your account cannot read review records."}</p>}
        {CONTENT_TYPES.map((t) => { const s = typeStatus(t.key, entries, signedIn); return (
          <div key={t.key} className="rounded-md border border-border p-3">
            <h3 className="font-semibold">{t.label}{t.claim ? " (claim)" : ""} — {s.status}</h3><p className="text-sm text-muted-foreground">{s.reason}</p>
            <ul className="mt-2 space-y-2 text-sm">{(entries ?? []).filter((e) => e.latest && e.item_type === t.key).map((e) => <li key={e.id}>{e.route_scope} · {e.scope_label} v{e.version} · {contentGroup(e).reason} · owner {e.owner_role} · reviewer {e.reviewer_role} · ref {e.evidence_ref} · reason {e.decision_reason} · next: {e.next_action} · reviewed {e.review_date ?? "missing"} · {e.created_at} · {e.correlation_id}
              {signedIn && !e.mine && <span className="ml-2 inline-flex gap-2"><Button size="sm" className="min-h-11" onClick={() => respond(e.id, "acknowledged")}>Acknowledge</Button><Button size="sm" variant="outline" className="min-h-11" onClick={() => respond(e.id, "concern")}>Concern</Button></span>}</li>)}</ul>
          </div>); })}
      </section>
      <section aria-labelledby="add" className="space-y-3">
        <h2 id="add" className="text-xl font-semibold">Record review (new version, cannot be edited)</h2>
        {signedIn ? (
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">Previous version (optional)<select name="lineage" className={field}><option value="">New entry</option>{(entries ?? []).filter((e) => e.latest).map((e) => <option key={e.lineage} value={e.lineage}>{e.item_type} {e.route_scope} v{e.version}</option>)}</select></label>
            <label className="text-sm">Item type{sel("type", CONTENT_TYPES.map((t) => t.key), Object.fromEntries(CONTENT_TYPES.map((t) => [t.key, t.label])))}</label>
            <label className="text-sm">Route or content area{sel("route", ROUTE_SCOPES)}</label>
            <label className="text-sm">Review scope label<input name="scope" required minLength={3} maxLength={120} className={field} /></label>
            <label className="text-sm">Owner role{sel("owner", ["SUPER_ADMIN", "OPERATIONS_ADMIN"])}</label>
            <label className="text-sm">Reviewer role{sel("reviewer", ["OPERATIONS_ADMIN", "SUPER_ADMIN"])}</label>
            <label className="text-sm">Status{sel("status", ["pending", "unverified", "blocked"])}</label>
            <label className="text-sm">Evidence reference label<input name="ref" required minLength={3} maxLength={120} className={field} /></label>
            <label className="text-sm">Review date<input type="date" name="date" className={field} /></label>
            <label className="text-sm md:col-span-3">Decision reason<input name="reason" required minLength={3} maxLength={300} className={field} /></label>
            <label className="text-sm md:col-span-3">Next action<input name="next" required minLength={3} maxLength={300} className={field} /></label>
            <Button type="submit" className="min-h-11 md:col-span-3">Record review</Button>
          </form>
        ) : <p className="text-sm">Blocked: recording and acknowledging need a signed-in global Superadmin or Operations admin with two-step sign-in; acknowledgement must come from a different person.</p>}
        {msg && <p role="alert" className="text-sm">{msg}</p>}
      </section>
      <section aria-labelledby="preview" className="space-y-2">
        <h2 id="preview" className="text-xl font-semibold">Fictional preview</h2>
        <p className="text-sm">{FICTIONAL_PREVIEW.note}</p>
        <ul className="list-disc pl-5 text-sm">{previewFacts(FICTIONAL_PREVIEW).map((x) => <li key={x}>{x}</li>)}</ul>
      </section>
    </main>
  );
}
export const Route = createFileRoute("/content-review")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Content and claims review — iCareTele" }, { name: "description", content: "Internal register of human content and claims reviews." }, { property: "og:title", content: "Content and claims review — iCareTele" }, { property: "og:description", content: "Internal content review register." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: ContentReview,
});
