import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { confirmAccessAudit, readAccessAudit, recordAccessAudit } from "@/lib/access-matrix.functions";
import { MATRIX, accessExport, itemStatus, simulateMatrix, unsafeAccess, type AccessEntry } from "@/lib/access-matrix";
import { buildGate, gateSummary } from "@/lib/publish-gate";

type Form = { lineage: string; key: string; scope: string; owner: string; reviewer: string; status: string; ref: string; next: string };

/** Private access matrix audit. Shows expected permissions and human evidence; never reads or changes live permissions. */
function AccessMatrix() {
  const rd = useServerFn(readAccessAudit), rec = useServerFn(recordAccessAudit), conf = useServerFn(confirmAccessAudit);
  const [auth, setAuth] = useState<"out" | "denied" | "ok">("out");
  const [entries, setEntries] = useState<AccessEntry[] | null>(null);
  const [msg, setMsg] = useState("");
  const load = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setEntries(null); return setAuth("out"); }
    try { setEntries(await rd()); setAuth("ok"); } catch { setEntries(null); setAuth("denied"); }
  };
  useEffect(() => { void load(); }, []);
  const signedIn = auth === "ok";
  const hardOpen = useMemo(() => gateSummary(buildGate({ checklist: null, acks: null, signedIn, access: entries })).hardOpen, [entries, signedIn]);
  const sim = simulateMatrix();
  const field = "mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-2";
  const err = (e: unknown) => setMsg(e instanceof Error ? ({ MFA: "Two-step sign-in required.", SECOND_REVIEWER_REQUIRED: "A different reviewer must confirm.", STALE_VERSION: "A newer version exists.", ITEM_MISMATCH: "A new version must keep the same matrix item." } as Record<string, string>)[e.message] ?? "Not recorded: not allowed, or text was refused." : "Not recorded.");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Form;
    if ([f.scope, f.ref, f.next].some((t) => unsafeAccess(t ?? ""))) return setMsg("Remove links, emails, numbers, secrets or personal data.");
    const m = MATRIX.find((x) => x.key === f.key)!;
    try { const r = await rec({ data: { lineage: f.lineage || null, key: f.key, expected: m.expect, scope: f.scope, sensitivity: m.sensitivity, owner: f.owner as "SUPER_ADMIN", reviewer: f.reviewer as "SUPER_ADMIN", status: f.status as "pending", ref: f.ref, next: f.next } }); setMsg(`Recorded version ${r.version} (${r.correlation_id}).`); await load(); } catch (x) { err(x); }
  };
  const confirm = async (id: string, outcome: "confirmed" | "rejected") => {
    try { await conf({ data: { id, outcome, note: outcome === "confirmed" ? "Access evidence confirmed" : "Access evidence rejected" } }); setMsg("Confirmation recorded."); await load(); } catch (x) { err(x); }
  };
  const download = () => { if (!(signedIn)) return; const b = new Blob([accessExport(entries, signedIn, hardOpen)], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "access-matrix.md"; a.click(); URL.revokeObjectURL(a.href); };
  const sel = (name: string, opts: readonly string[]) => <select name={name} className={field}>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <PageHeader title="Access matrix audit" subtitle="Expected permissions and human evidence only. Live permissions are never read or changed here. Production readiness is NOT claimed; publishing is a separate manual owner action." />
      <section aria-labelledby="hard" className="rounded-lg border border-destructive p-4">
        <h2 id="hard" className="font-semibold">Publish gate hard blockers open ({hardOpen.length})</h2>
        <ul className="mt-2 list-disc pl-5 text-sm">{hardOpen.map((h) => <li key={h}>{h}</li>)}</ul>
        <p className="mt-2 text-sm"><Link to="/publish-gate" className="underline">Publish gate</Link> · <Link to="/release-runbook" className="underline">Release runbook</Link></p>
      </section>
      <Button disabled={!(signedIn)} onClick={download} variant="outline" className="min-h-11">Download redacted matrix export</Button>
      <section aria-labelledby="matrix" className="space-y-2">
        <h2 id="matrix" className="text-xl font-semibold">Matrix ({MATRIX.length} items)</h2>
        {!signedIn && <p className="text-sm">Blocked: {auth === "out" ? "signed out — audit records are not read." : "your account cannot read audit records."}</p>}
        <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Role by route by action</caption>
          <thead><tr className="text-left">{["Surface", "Route", "Action", "Role", "Expected", "Scope", "Sensitivity", "Simulated", "Status", "Reason", ""].map((h) => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead>
          <tbody>{MATRIX.map((m, i) => { const s = itemStatus(m.key, entries, signedIn); const latest = (entries ?? []).find((e) => e.latest && e.item_key === m.key); return (
            <tr key={m.key} className="border-t border-border"><td className="p-2">{m.surface}</td><td className="p-2">{m.route}</td><td className="p-2">{m.action}</td><td className="p-2">{m.role}</td><td className="p-2">{m.expect}</td><td className="p-2">{m.scope}</td><td className="p-2">{m.sensitivity}</td><td className="p-2">{sim[i]!.got}{sim[i]!.ok ? "" : " (mismatch)"}</td><td className="p-2">{s.status}</td><td className="p-2">{s.reason}{latest && ` · v${latest.version} · ${latest.evidence_ref} · next: ${latest.next_action} · ${latest.created_at} · ${latest.correlation_id}`}</td>
              <td className="p-2">{signedIn && latest && !latest.mine && <span className="inline-flex gap-2"><Button size="sm" className="min-h-11" onClick={() => confirm(latest.id, "confirmed")}>Confirm</Button><Button size="sm" variant="outline" className="min-h-11" onClick={() => confirm(latest.id, "rejected")}>Reject</Button></span>}</td></tr>); })}</tbody>
        </table></div>
        <p className="text-sm text-muted-foreground">"Simulated" uses fictional users only; it does not prove the live app behaves the same.</p>
      </section>
      <section aria-labelledby="add" className="space-y-3">
        <h2 id="add" className="text-xl font-semibold">Record evidence (new version, cannot be edited)</h2>
        {signedIn ? (
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">Previous version (optional)<select name="lineage" className={field}><option value="">New entry</option>{(entries ?? []).filter((e) => e.latest).map((e) => <option key={e.lineage} value={e.lineage}>{e.item_key} v{e.version}</option>)}</select></label>
            <label className="text-sm">Matrix item{sel("key", MATRIX.map((m) => m.key))}</label>
            <label className="text-sm">Required role/scope observed<input name="scope" required minLength={3} maxLength={120} className={field} /></label>
            <label className="text-sm">Owner role{sel("owner", ["SUPER_ADMIN", "OPERATIONS_ADMIN"])}</label>
            <label className="text-sm">Reviewer role{sel("reviewer", ["OPERATIONS_ADMIN", "SUPER_ADMIN"])}</label>
            <label className="text-sm">Status{sel("status", ["pending", "unverified", "blocked"])}</label>
            <label className="text-sm">Evidence reference label<input name="ref" required minLength={3} maxLength={120} className={field} /></label>
            <label className="text-sm md:col-span-2">Next action<input name="next" required minLength={3} maxLength={300} className={field} /></label>
            <Button type="submit" className="min-h-11 md:col-span-3">Record evidence</Button>
          </form>
        ) : <p className="text-sm">Blocked: recording and confirming need a signed-in global Superadmin or Operations admin with two-step sign-in; confirmation must come from a different person.</p>}
        {msg && <p role="alert" className="text-sm">{msg}</p>}
      </section>
    </main>
  );
}
export const Route = createFileRoute("/access-matrix")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Access matrix audit — iCareTele" }, { name: "description", content: "Internal role, route and action access audit." }, { property: "og:title", content: "Access matrix audit — iCareTele" }, { property: "og:description", content: "Internal access audit." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: AccessMatrix,
});
