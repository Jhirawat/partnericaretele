import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { confirmProtection, readProtection, recordProtection } from "@/lib/protection-evidence.functions";
import { PROTECTION_FIXTURES, groupProtection, protectionExport, protectionGateStatus, simulateProtection, unsafeProtection, type PGroup, type ProtectionEntry } from "@/lib/protection-evidence";

type Form = { lineage: string; env: string; mig: string; applied: string; history: string; rls: string; tables: string; storage: string; owner: string; reviewer: string; ref: string; status: string; next: string };

/** Private register of redacted manual migration/RLS/storage evidence. Reads no production schema; never passes automatically. */
function ProtectionEvidence() {
  const rd = useServerFn(readProtection), rec = useServerFn(recordProtection), conf = useServerFn(confirmProtection);
  const [auth, setAuth] = useState<"out" | "denied" | "ok">("out");
  const [entries, setEntries] = useState<ProtectionEntry[] | null>(null);
  const [msg, setMsg] = useState("");
  const load = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setEntries(null); return setAuth("out"); }
    try { setEntries(await rd()); setAuth("ok"); } catch { setEntries(null); setAuth("denied"); }
  };
  useEffect(() => { void load(); }, []);
  const g = groupProtection(entries); const gate = protectionGateStatus(entries, auth === "ok");
  const field = "mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-2";
  const err = (e: unknown) => setMsg(e instanceof Error ? ({ MFA: "Two-step sign-in required.", SECOND_REVIEWER_REQUIRED: "A different reviewer must confirm.", STALE_VERSION: "A newer version exists." } as Record<string, string>)[e.message] ?? "Not recorded: not allowed, or text was refused." : "Not recorded.");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Form;
    if ([f.env, f.mig, f.ref, f.next].some((t) => unsafeProtection(t ?? ""))) return setMsg("Remove links, keys, numbers, schema text or personal data.");
    try { const r = await rec({ data: { lineage: f.lineage || null, env: f.env, mig: f.mig, applied: f.applied || null, history: f.history as "not_checked", rls: f.rls as "not_checked", tables: f.tables as "not_checked", storage: f.storage as "not_checked", owner: f.owner as "SUPER_ADMIN", reviewer: f.reviewer as "SUPER_ADMIN", ref: f.ref, status: f.status as "pending", next: f.next } }); setMsg(`Recorded version ${r.version} (${r.correlation_id}).`); await load(); } catch (x) { err(x); }
  };
  const confirm = async (id: string, outcome: "confirmed" | "rejected") => {
    try { await conf({ data: { id, outcome, note: outcome === "confirmed" ? "Evidence reviewed and confirmed" : "Evidence rejected by reviewer" } }); setMsg("Confirmation recorded."); await load(); } catch (x) { err(x); }
  };
  const download = () => { if (!(auth === "ok")) return; const b = new Blob([protectionExport(entries, auth === "ok")], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "protection-evidence.md"; a.click(); URL.revokeObjectURL(a.href); };
  const sel = (name: string, opts: string[]) => <select name={name} className={field}>{opts.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}</select>;
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <PageHeader title="Migration, RLS and storage evidence" subtitle="Records redacted manual results only; this page reads no production schema or data. Production readiness is NOT claimed; publishing is a separate manual owner action." />
      <p role="status" className="rounded-lg border border-border p-4 font-medium">Gate status: {gate.status} — {gate.reason}. <Link to="/publish-gate" className="underline">Publish gate</Link> · <Link to="/release-runbook" className="underline">Release runbook</Link></p>
      <Button disabled={!(auth === "ok")} onClick={download} variant="outline" className="min-h-11">Download redacted register export</Button>
      <section aria-labelledby="groups" className="space-y-2">
        <h2 id="groups" className="text-xl font-semibold">Register</h2>
        {auth !== "ok" && <p className="text-sm">Blocked: {auth === "out" ? "signed out — records are not read, and nothing is assumed verified." : "your account cannot read protection records."}</p>}
        {(["passed", "pending", "blocked", "unverified"] as PGroup[]).map((k) => (
          <div key={k}><h3 className="font-semibold">{k} ({g[k].length})</h3>
            <ul className="space-y-2 text-sm">{g[k].map((e) => <li key={e.id} className="rounded-md border border-border p-2">{e.environment_label} / {e.migration_label} v{e.version} · applied {e.applied_date ?? "missing"} · history {e.migration_history} · RLS {e.rls_result} · tables {e.protected_tables} · storage {e.storage_policy} · owner {e.owner_role} · reviewer {e.reviewer_role} · ref {e.evidence_ref} · {e.reason} · next: {e.next_action} · {e.created_at} · {e.correlation_id}
              {auth === "ok" && !e.mine && <span className="ml-2 inline-flex gap-2"><Button size="sm" className="min-h-11" onClick={() => confirm(e.id, "confirmed")}>Confirm</Button><Button size="sm" variant="outline" className="min-h-11" onClick={() => confirm(e.id, "rejected")}>Reject</Button></span>}</li>)}</ul></div>
        ))}
      </section>
      <section aria-labelledby="add" className="space-y-3">
        <h2 id="add" className="text-xl font-semibold">Record evidence (new version, cannot be edited)</h2>
        {auth === "ok" ? (
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">Previous version (optional)<select name="lineage" className={field}><option value="">New entry</option>{(entries ?? []).filter((e) => e.latest).map((e) => <option key={e.lineage} value={e.lineage}>{e.environment_label} v{e.version}</option>)}</select></label>
            <label className="text-sm">Environment label<input name="env" required minLength={3} maxLength={60} className={field} /></label>
            <label className="text-sm">Migration or version label<input name="mig" required minLength={3} maxLength={60} className={field} /></label>
            <label className="text-sm">Applied-at date<input type="date" name="applied" className={field} /></label>
            <label className="text-sm">Migration history{sel("history", ["not_checked", "matched", "drift"])}</label>
            <label className="text-sm">RLS enabled{sel("rls", ["not_checked", "all_enabled", "gaps"])}</label>
            <label className="text-sm">Protected tables{sel("tables", ["not_checked", "all_protected", "gaps"])}</label>
            <label className="text-sm">Private storage policy{sel("storage", ["not_checked", "private", "public_found"])}</label>
            <label className="text-sm">Owner role{sel("owner", ["SUPER_ADMIN", "OPERATIONS_ADMIN"])}</label>
            <label className="text-sm">Reviewer role{sel("reviewer", ["OPERATIONS_ADMIN", "SUPER_ADMIN"])}</label>
            <label className="text-sm">Evidence reference label<input name="ref" required minLength={3} maxLength={120} className={field} /></label>
            <label className="text-sm">Status{sel("status", ["pending", "unverified", "blocked"])}</label>
            <label className="text-sm md:col-span-3">Next action<input name="next" required minLength={3} maxLength={300} className={field} /></label>
            <Button type="submit" className="min-h-11 md:col-span-3">Record evidence</Button>
          </form>
        ) : <p className="text-sm">Blocked: recording and confirming need a signed-in global Superadmin or Operations admin with two-step sign-in; confirmation must come from a different person.</p>}
        {msg && <p role="alert" className="text-sm">{msg}</p>}
      </section>
      <section aria-labelledby="sim" className="space-y-2">
        <h2 id="sim" className="text-xl font-semibold">Verification simulator (made-up fixtures only)</h2>
        <ul className="text-sm">{PROTECTION_FIXTURES.map((f) => { const r = simulateProtection(f); return <li key={f.label}>{f.label}: {r.result} — order {r.order ? "ok" : "out of order"}; RLS gaps {r.rls.length}; locked tables {r.locked.length}; public private-file buckets {r.storage.length}; role-scope gaps {r.scope.length}. {r.note}</li>; })}</ul>
      </section>
    </main>
  );
}
export const Route = createFileRoute("/protection-evidence")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Migration and protection evidence — iCareTele" }, { name: "description", content: "Internal register of redacted migration, RLS and storage evidence." }, { property: "og:title", content: "Migration and protection evidence — iCareTele" }, { property: "og:description", content: "Internal protection evidence register." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: ProtectionEvidence,
});
