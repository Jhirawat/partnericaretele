import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { confirmBackup, readBackups, recordBackup } from "@/lib/backup-evidence.functions";
import { FIXTURES, backupExport, backupGateStatus, groupRegister, simulateRestore, unsafeBackup, type BackupEntry, type BackupGroup } from "@/lib/backup-evidence";

/** Private register of redacted manual backup evidence. Never proves a backup exists and never passes automatically. */
function BackupEvidence() {
  const rd = useServerFn(readBackups), rec = useServerFn(recordBackup), conf = useServerFn(confirmBackup);
  const [auth, setAuth] = useState<"out" | "denied" | "ok">("out");
  const [entries, setEntries] = useState<BackupEntry[] | null>(null);
  const [msg, setMsg] = useState("");
  const load = async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setEntries(null); return setAuth("out"); }
    try { setEntries(await rd()); setAuth("ok"); } catch { setEntries(null); setAuth("denied"); }
  };
  useEffect(() => { void load(); }, []);
  const g = groupRegister(entries); const gate = backupGateStatus(entries, auth === "ok");
  const field = "mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-2";
  const err = (e: unknown) => setMsg(e instanceof Error ? ({ MFA: "Two-step sign-in required.", SECOND_REVIEWER_REQUIRED: "A different reviewer must confirm.", STALE_VERSION: "A newer version exists." } as Record<string, string>)[e.message] ?? "Not recorded: not allowed, or text was refused." : "Not recorded.");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as { lineage: string; scope: string; env: string; backupDate: string; retention: string; restoreDate: string; result: string; owner: string; reviewer: string; ref: string; status: string; next: string };
    if ([f.scope, f.env, f.ref, f.next].some((t) => unsafeBackup(t ?? ""))) return setMsg("Remove links, keys, numbers, dumps or personal data.");
    try { const r = await rec({ data: { lineage: f.lineage || null, scope: f.scope, env: f.env, backupDate: f.backupDate || null, retention: f.retention ? Number(f.retention) : null, restoreDate: f.restoreDate || null, result: f.result as "not_tested", owner: f.owner as "SUPER_ADMIN", reviewer: f.reviewer as "SUPER_ADMIN", ref: f.ref, status: f.status as "pending", next: f.next } }); setMsg(`Recorded version ${r.version} (${r.correlation_id}).`); await load(); } catch (x) { err(x); }
  };
  const confirm = async (id: string, outcome: "confirmed" | "rejected") => {
    try { await conf({ data: { id, outcome, note: outcome === "confirmed" ? "Evidence reviewed and confirmed" : "Evidence rejected by reviewer" } }); setMsg("Confirmation recorded."); await load(); } catch (x) { err(x); }
  };
  const download = () => { if (!(auth === "ok")) return; const b = new Blob([backupExport(entries, auth === "ok")], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "backup-evidence.md"; a.click(); URL.revokeObjectURL(a.href); };
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <PageHeader title="Backup evidence register" subtitle="Records redacted manual metadata only. It does not prove a backup exists. Production readiness is NOT claimed; publishing is a separate manual owner action." />
      <p role="status" className="rounded-lg border border-border p-4 font-medium">Gate status: {gate.status} — {gate.reason}. <Link to="/publish-gate" className="underline">Publish gate</Link> · <Link to="/release-runbook" className="underline">Release runbook</Link></p>
      <Button disabled={!(auth === "ok")} onClick={download} variant="outline" className="min-h-11">Download redacted register export</Button>
      <section aria-labelledby="groups" className="space-y-2">
        <h2 id="groups" className="text-xl font-semibold">Register</h2>
        {auth !== "ok" && <p className="text-sm">Blocked: {auth === "out" ? "signed out — records are not read, and no backup is assumed." : "your account cannot read backup records."}</p>}
        {(["passed", "pending", "blocked", "unverified"] as BackupGroup[]).map((k) => (
          <div key={k}><h3 className="font-semibold">{k} ({g[k].length})</h3>
            <ul className="space-y-2 text-sm">{g[k].map((e) => <li key={e.id} className="rounded-md border border-border p-2">{e.scope_label} / {e.environment_label} v{e.version} · backup {e.backup_date ?? "missing"} · retention {e.retention_days ?? "missing"} days · restore {e.restore_result} {e.restore_test_date ?? ""} · owner {e.owner_role} · reviewer {e.reviewer_role} · ref {e.evidence_ref} · {e.reason} · next: {e.next_action} · {e.created_at} · {e.correlation_id}
              {auth === "ok" && !e.mine && <span className="ml-2 inline-flex gap-2"><Button size="sm" className="min-h-11" onClick={() => confirm(e.id, "confirmed")}>Confirm</Button><Button size="sm" variant="outline" className="min-h-11" onClick={() => confirm(e.id, "rejected")}>Reject</Button></span>}</li>)}</ul></div>
        ))}
      </section>
      <section aria-labelledby="add" className="space-y-3">
        <h2 id="add" className="text-xl font-semibold">Record evidence (new version, cannot be edited)</h2>
        {auth === "ok" ? (
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">Previous version (optional)<select name="lineage" className={field}><option value="">New entry</option>{(entries ?? []).filter((e) => e.latest).map((e) => <option key={e.lineage} value={e.lineage}>{e.scope_label} v{e.version}</option>)}</select></label>
            <label className="text-sm">Backup scope label<input name="scope" required minLength={3} maxLength={120} className={field} /></label>
            <label className="text-sm">System or environment label<input name="env" required minLength={3} maxLength={60} className={field} /></label>
            <label className="text-sm">Backup date<input type="date" name="backupDate" className={field} /></label>
            <label className="text-sm">Retention window (days)<input type="number" name="retention" min={1} max={3650} className={field} /></label>
            <label className="text-sm">Restore-test date<input type="date" name="restoreDate" className={field} /></label>
            <label className="text-sm">Restore result<select name="result" className={field}><option value="not_tested">Not tested</option><option value="success">Success</option><option value="partial">Partial</option><option value="failed">Failed</option></select></label>
            <label className="text-sm">Owner role<select name="owner" className={field}><option>SUPER_ADMIN</option><option>OPERATIONS_ADMIN</option></select></label>
            <label className="text-sm">Reviewer role<select name="reviewer" className={field}><option>OPERATIONS_ADMIN</option><option>SUPER_ADMIN</option></select></label>
            <label className="text-sm">Evidence reference label<input name="ref" required minLength={3} maxLength={120} className={field} /></label>
            <label className="text-sm">Status<select name="status" className={field}><option value="pending">Pending</option><option value="unverified">Unverified</option><option value="blocked">Blocked</option></select></label>
            <label className="text-sm">Next action<input name="next" required minLength={3} maxLength={300} className={field} /></label>
            <Button type="submit" className="min-h-11 md:col-span-3">Record evidence</Button>
          </form>
        ) : <p className="text-sm">Blocked: recording and confirming need a signed-in global Superadmin or Operations admin with two-step sign-in; confirmation must come from a different person.</p>}
        {msg && <p role="alert" className="text-sm">{msg}</p>}
      </section>
      <section aria-labelledby="sim" className="space-y-2">
        <h2 id="sim" className="text-xl font-semibold">Restore-check simulator (made-up data only)</h2>
        <ul className="text-sm">{FIXTURES.map((f) => { const r = simulateRestore(f); return <li key={f.label}>{r.label}: {r.result}{r.diffs.length ? ` (differs: ${r.diffs.join(", ")})` : ""} — {r.note}</li>; })}</ul>
      </section>
    </main>
  );
}
export const Route = createFileRoute("/backup-evidence")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Backup evidence register — iCareTele" }, { name: "description", content: "Internal register of redacted backup and restore evidence." }, { property: "og:title", content: "Backup evidence register — iCareTele" }, { property: "og:description", content: "Internal backup evidence register." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: BackupEvidence,
});
