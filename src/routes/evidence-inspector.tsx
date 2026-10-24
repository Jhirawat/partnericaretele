import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { readEvidenceInspector, recordInspection, confirmInspection } from "@/lib/evidence-inspector.functions";
import { NEXT_ACTIONS, OBSERVED, READ_ONLY_NOTICE, REGISTERS, ROLES, RULES, SIMULATED_SUITE, inspectorExport, itemGroup, ruleStatus, unsafeInspectorText, type Item } from "@/lib/evidence-inspector";

type Form = { lineage: string; rule: string; register: string; expected: string; observed: string; blocker: string; owner: string; reviewer: string; ref: string; action: string; date: string };

/** Private Cross-Register Evidence Integrity Inspector. Read-only consistency and safety
 *  inspector for redacted register metadata: never reads production business data, never
 *  changes permissions, never publishes or deploys, and never calls external services. */
function EvidenceInspector() {
  const rd = useServerFn(readEvidenceInspector), rec = useServerFn(recordInspection), rev = useServerFn(confirmInspection);
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
  const err = (e: unknown) => setMsg(e instanceof Error ? ({ MFA: "Two-step sign-in required.", SECOND_REVIEWER_REQUIRED: "A different reviewer must confirm.", STALE_VERSION: "A newer version exists.", RULE_MISMATCH: "A new version must keep the same rule and register." } as Record<string, string>)[e.message] ?? "Not recorded: not allowed, or text was refused." : "Not recorded.");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Form;
    if (unsafeInspectorText(f.ref ?? "") || unsafeInspectorText(f.blocker ?? "") || unsafeInspectorText(f.expected ?? "")) return setMsg("Remove keys, tokens, links, emails, numbers, file names, personal data or medical wording.");
    try { const r = await rec({ data: { lineage: f.lineage || null, rule: f.rule as "register_coverage", register: f.register as "release_runbook", expected: f.expected, observed: f.observed as "pending", blocker: f.blocker || null, owner: f.owner as "SUPER_ADMIN", reviewer: f.reviewer as "SUPER_ADMIN", ref: f.ref, action: f.action as (typeof NEXT_ACTIONS)[number], date: f.date || null } }); setMsg(`Recorded version ${r.version} (${r.correlation_id}).`); await load(); } catch (x) { err(x); }
  };
  const respond = async (id: string, outcome: "confirmed" | "concern") => {
    try { await rev({ data: { id, outcome } }); setMsg("Review recorded."); await load(); } catch (x) { err(x); }
  };
  const download = () => { if (!(signedIn)) return; const b = new Blob([inspectorExport(items, signedIn)], { type: "text/markdown" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "evidence-inspector.md"; a.click(); URL.revokeObjectURL(a.href); };
  const sel = (name: string, opts: readonly string[], labels?: Record<string, string>) => <select name={name} className={field}>{opts.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}</select>;
  const w = RULES.map((r) => ({ ...r, ...ruleStatus(r.key, items, signedIn) }));
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <PageHeader title="Cross-Register Evidence Integrity Inspector" subtitle={`Redacted metadata only. ${READ_ONLY_NOTICE} A real integrity result counts only after a different signed-in reviewer confirms its latest version. Readiness is NOT claimed.`} />
      <nav aria-label="Verification navigation" className="flex flex-wrap gap-3">
        <Button asChild variant="outline"><Link to="/golive-decision-pack">Final go-live decision pack</Link></Button>
        <Button asChild variant="outline"><Link to="/human-review-console">Human review sign-off</Link></Button>
        <Button asChild variant="outline"><Link to="/launch-control">Launch-day control center</Link></Button>
        <Button asChild variant="outline"><Link to="/incident-console">Incident console</Link></Button>
        <Button asChild variant="outline"><Link to="/owner-action-queue">Owner action queue</Link></Button>
        <Button asChild variant="outline"><Link to="/publish-gate">Publish gate</Link></Button><Button asChild variant="outline"><Link to="/readiness-decision-ledger">Readiness change and decision ledger</Link></Button><Button asChild variant="outline"><Link to="/validation-snapshot">Final validation evidence snapshot</Link></Button>
      <Button asChild variant="outline"><Link to="/owner-action-closure">Owner action closure board</Link></Button><Button asChild variant="outline"><Link to="/release-evidence-bundle">Final release evidence bundle</Link></Button><Button asChild variant="outline"><Link to="/golive-evidence-matrix">Go-live evidence reconciliation matrix</Link></Button></nav>
      <Button disabled={!(signedIn)} onClick={download} variant="outline" className="min-h-11">Download redacted integrity report</Button>
      <p className="text-sm">Inspector rules: passed {w.filter((r) => r.status === "passed").length} · pending {w.filter((r) => r.status === "pending").length} · blocked {w.filter((r) => r.status === "blocked").length} · unverified {w.filter((r) => r.status === "unverified").length} of {RULES.length}. Open: {w.filter((r) => r.status !== "passed").length}. Registers covered: {REGISTERS.length}.</p>
      <section aria-labelledby="rules" className="space-y-3">
        <h2 id="rules" className="text-xl font-semibold">Inspector rules</h2>
        {!signedIn && <p className="text-sm">Blocked: {auth === "out" ? "signed out — inspector findings are not read, and nothing is assumed." : "your account cannot read inspector findings."}</p>}
        {w.map((r) => (
          <div key={r.key} className="rounded-md border border-border p-3">
            <h3 className="font-semibold">{r.label} — {r.status}</h3><p className="text-sm text-muted-foreground">{r.reason}</p>
            <p className="mt-1 text-sm">Registers: {r.registers.join(", ")} · owner action: {r.ownerAction} · verification check: {r.check}</p>
            <ul className="mt-2 space-y-2 text-sm">{(items ?? []).filter((e) => e.latest && e.rule === r.key).map((e) => <li key={e.id}>{e.register} · expected: {e.expected_result} · observed {e.observed_status} · v{e.version} · {itemGroup(e).reason} · owner {e.owner_role} · reviewer {e.reviewer_role} · next: {e.next_action}{e.blocker_reason ? ` · blocker: ${e.blocker_reason}` : ""} · ref {e.evidence_ref} · reviewed {e.review_date ?? "missing"} · {e.created_at} · {e.correlation_id}
              {signedIn && !e.mine && <span className="ml-2 inline-flex gap-2"><Button size="sm" className="min-h-11" onClick={() => respond(e.id, "confirmed")}>Confirm</Button><Button size="sm" variant="outline" className="min-h-11" onClick={() => respond(e.id, "concern")}>Concern</Button></span>}</li>)}</ul>
          </div>))}
      </section>
      <section aria-labelledby="add" className="space-y-3">
        <h2 id="add" className="text-xl font-semibold">Record inspector finding (new version, cannot be edited)</h2>
        {signedIn ? (
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">Previous version (optional)<select name="lineage" className={field}><option value="">New inspector finding</option>{(items ?? []).filter((e) => e.latest).map((e) => <option key={e.lineage} value={e.lineage}>{e.rule} {e.register} v{e.version}</option>)}</select></label>
            <label className="text-sm">Inspector rule{sel("rule", RULES.map((r) => r.key), Object.fromEntries(RULES.map((r) => [r.key, r.label])))}</label>
            <label className="text-sm">Register{sel("register", REGISTERS)}</label>
            <label className="text-sm">Observed status{sel("observed", OBSERVED)}</label>
            <label className="text-sm">Owner role{sel("owner", ROLES)}</label>
            <label className="text-sm">Reviewer role{sel("reviewer", [...ROLES].reverse())}</label>
            <label className="text-sm">Next action{sel("action", NEXT_ACTIONS)}</label>
            <label className="text-sm">Review date<input type="date" name="date" className={field} /></label>
            <label className="text-sm md:col-span-2">Safe evidence label<input name="ref" required minLength={3} maxLength={120} className={field} /></label>
            <label className="text-sm md:col-span-3">Expected result (redacted)<input name="expected" required minLength={3} maxLength={200} className={field} /></label>
            <label className="text-sm md:col-span-3">Blocker reason (optional, redacted)<input name="blocker" minLength={3} maxLength={200} className={field} /></label>
            <Button type="submit" className="min-h-11 md:col-span-3">Record inspector finding</Button>
          </form>
        ) : <p className="text-sm">Blocked: recording and confirming need a signed-in global Superadmin or Operations admin with two-step sign-in; confirmation must come from a different person.</p>}
        {msg && <p role="alert" className="text-sm">{msg}</p>}
      </section>
      <section aria-labelledby="sim" className="space-y-2">
        <h2 id="sim" className="text-xl font-semibold">Synthetic fixture suite (read-only)</h2>
        <p className="text-sm">{SIMULATED_SUITE.label}</p>
        <ol className="list-decimal pl-5 text-sm">{SIMULATED_SUITE.cases.map((s) => <li key={s.case}>{s.case} — rule {s.rule} · {s.kind} case · declared outcome {s.outcome} · outbound requests: {s.outboundCalls}</li>)}</ol>
        <p className="text-sm">{SIMULATED_SUITE.conclusion}</p>
      </section>
    </main>
  );
}
export const Route = createFileRoute("/evidence-inspector")({
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Cross-Register Evidence Integrity Inspector — iCareTele" }, { name: "description", content: "Internal read-only integrity inspector for redacted readiness registers." }, { property: "og:title", content: "Cross-Register Evidence Integrity Inspector — iCareTele" }, { property: "og:description", content: "Internal evidence integrity inspector." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: EvidenceInspector,
});
