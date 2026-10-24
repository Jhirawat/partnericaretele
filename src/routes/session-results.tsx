import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { Download, GitBranch, RefreshCw, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { confirmSessionResult, readSessionResults, recordSessionResult } from '@/lib/session-results.functions';
import { EVIDENCE, ENVIRONMENT, NEXT_ACTIONS, NOTICE, REASONS, RESULT_LABELS, SESSION_KEYS, SESSION_LABELS, SIMULATED, STATUSES, SUITES, recordSchema, resultsPacket, reviewSlot, summary, type Console, type SuiteRow } from '@/lib/session-results';

function SessionResults() {
  const read = useServerFn(readSessionResults), record = useServerFn(recordSessionResult), confirm = useServerFn(confirmSessionResult);
  const [data, setData] = useState<Console | null>(null), [authorized, setAuthorized] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function load() { const { data: session } = await supabase.auth.getSession(); if (!session.session) { setData(null); setAuthorized(false); return; } try { setData(await read()); setAuthorized(true); } catch { setData(null); setAuthorized(false); } }
  useEffect(() => { void load(); }, []);
  const s = summary(data, authorized);
  const errors: Record<string, string> = { SESSION_NOT_AUTHORIZED: 'Results require an explicitly started, in-progress authorized session.', PREREQUISITES_UNAVAILABLE: 'Hard prerequisites are not all independently confirmed.', ORDER_REQUIRED: 'Suites must be recorded in dependency order.', STALE_VERSION: 'The suite version changed; reload and record a new version.', SECOND_REVIEWER_REQUIRED: 'A different signed-in reviewer is required.', ROLE_SEPARATION_REQUIRED: 'The two reviewers must hold different global roles.', DUPLICATE_REVIEW: 'This version already has that review.', INVALID_ARGUMENTS: 'Only safe, consistent closed-vocabulary metadata is accepted.' };
  async function act(fn: () => Promise<unknown>) { setBusy(true); try { await fn(); await load(); setMessage('Append-only result event recorded. Production readiness is not claimed.'); } catch (e) { setMessage(errors[e instanceof Error ? e.message : ''] ?? 'Not recorded: authorized global scope and two-step sign-in are required.'); } finally { setBusy(false); } }
  function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const f = new FormData(event.currentTarget); const session = f.get('session'); const suite = f.get('suite'); const row = data?.sessions.find((x) => x.session_key === session)?.suites.find((x) => x.suite_key === suite); const p = recordSchema.safeParse({ session, suite, version: row?.record?.version ?? 0, status: f.get('status'), result_label: f.get('result_label'), blocker_reason: f.get('blocker_reason'), next_action: f.get('next_action') }); if (!p.success) { setMessage('Only safe, consistent result metadata is accepted.'); return; } void act(() => record({ data: p.data })); }
  function download() { try { const url = URL.createObjectURL(new Blob([resultsPacket(data, authorized)], { type: 'text/markdown' })); const a = document.createElement('a'); a.href = url; a.download = 'icaretele-session-results-packet.md'; a.click(); URL.revokeObjectURL(url); } catch { setMessage('Export refused: signed-out, invalid or unsafe metadata.'); } }
  const field = 'mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-3';
  return <main className="mx-auto max-w-6xl space-y-8 p-6">
    <PageHeader title="Human Test Session Results Recorder and Reconciliation" subtitle="Post-session recording for a future manually started human verification session" />
    <p className="border-l-4 border-warning pl-4 font-medium">{NOTICE}</p>
    <nav aria-label="Session results navigation" className="flex flex-wrap gap-3">
      <Button asChild variant="outline"><Link to="/session-start-gate">Session start gate</Link></Button>
      <Button asChild variant="outline"><Link to="/production-test-readiness">Production test readiness</Link></Button>
      <Button asChild variant="outline"><Link to="/test-session-workspace">Test session workspace</Link></Button>
      <Button asChild variant="outline"><Link to="/validation-snapshot">Validation evidence snapshot</Link></Button>
      <Button asChild variant="outline"><Link to="/release-evidence-bundle">Release evidence bundle</Link></Button>
      <Button asChild variant="outline"><Link to="/owner-action-closure">Owner action closure board</Link></Button>
      <Button asChild variant="outline"><Link to="/human-review-console">Human review sign-off</Link></Button>
      <Button asChild variant="outline"><Link to="/golive-decision-pack">Final go-live decision pack</Link></Button>
      <Button asChild variant="outline"><Link to="/publish-gate">Publish gate</Link></Button>
    <Button asChild variant="outline"><Link to="/golive-evidence-matrix">Go-live evidence reconciliation matrix</Link></Button><Button asChild variant="outline"><Link to="/human-review-packet">Human review decision packet</Link></Button></nav>
    <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={!authorized || busy} onClick={download}><Download />Download redacted results packet</Button><Button variant="outline" disabled={!authorized || busy} onClick={() => void load()}><RefreshCw />Refresh</Button></div>
    <p role="status" className="font-medium">Missing prerequisites {s.missing.length} · Results passed {s.sessions.reduce((n, x) => n + x.counts.passed, 0)} of 36 · Reconciliation mismatches {s.mismatches.length} · Readiness claimed: no</p>
    {!authorized && <p role="alert">Blocked: signed out or unauthorized. No result metadata is read. A global Superadmin or Operations reviewer with two-step sign-in is required.</p>}
    <section aria-labelledby="sessions"><h2 id="sessions" className="text-xl font-semibold">Planned suite results (latest valid versions)</h2>
      {s.sessions.map((sess) => <div key={sess.key} className="mt-4"><h3 className="font-semibold">{sess.label} — session {sess.session?.session_status ?? 'unavailable'} v{sess.session?.session_version ?? 0} · {sess.session?.authorized ? 'authorized' : 'not authorized'}</h3>
        <ol className="mt-2 list-decimal space-y-3 pl-6">{(sess.session?.suites ?? SUITES.map((x) => ({ ord: x.ord, suite_key: x.key, expected: x.expected, artifact: x.artifact, blocker: x.blocker, check_id: x.check, status: 'unverified' as const, reason: 'Result not recorded' as const, record: null }))).map((row: SuiteRow) => { const slot = reviewSlot(row); return <li key={row.suite_key}>
          <span className="font-semibold">{row.suite_key}</span> — {row.status} · Reason: {row.reason}
          <p className="text-sm">Expected: {row.expected} · Evidence: {EVIDENCE} · Environment: {ENVIRONMENT}</p>
          <p className="text-sm">Owner: {row.record?.owner_role ?? 'not recorded'} · First reviewer: {row.record?.review1?.reviewer_role ?? 'required'} · Second reviewer: {row.record?.review2?.reviewer_role ?? 'required (other role)'} · Source session v{row.record?.source_session_version ?? 0}</p>
          <div className="flex flex-wrap gap-3 text-sm"><Link className="text-primary underline" to="/release-evidence-bundle">Artifact: {row.artifact}</Link><Link className="text-primary underline" to="/owner-action-closure">Owner action: {row.blocker}</Link><Link className="text-primary underline" to="/verification-campaign">Check: {row.check_id}</Link></div>
          <p className="break-words text-sm text-muted-foreground">Result v{row.record?.version ?? 'none'} · {row.record?.created_at ?? 'not recorded'} · {row.record?.correlation_id ?? 'not recorded'}</p>
          {authorized && slot && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => row.record && void act(() => confirm({ data: { id: row.record!.id, slot, outcome: 'confirmed' } }))}><ShieldCheck />Confirm as reviewer {slot}</Button><Button variant="outline" disabled={busy} onClick={() => row.record && void act(() => confirm({ data: { id: row.record!.id, slot, outcome: 'concern' } }))}>Record concern</Button></div>}
        </li>; })}</ol></div>)}
    </section>
    <section aria-labelledby="dependencies"><h2 id="dependencies" className="flex items-center gap-2 text-xl font-semibold"><GitBranch />Dependent blockers (derived; never auto-closed)</h2>
      <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">{s.blockers.length === 0 ? <li>Not read: signed out or unauthorized.</li> : s.blockers.map((b) => <li key={b.blocker}><span className="font-semibold">{b.blocker}</span> — {b.state} · Suites: {b.suites.join(', ')} · Closure granted: no · <Link className="text-primary underline" to="/owner-action-closure">Owner action closure</Link></li>)}</ul>
    </section>
    <section aria-labelledby="reconciliation"><h2 id="reconciliation" className="text-xl font-semibold">Cross-register reconciliation</h2>
      <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">{s.reconciliation.length === 0 ? <li>Not read: signed out or unauthorized.</li> : s.reconciliation.map((r) => <li key={r.register}><span className="font-semibold">{r.register}</span> — expected {r.expected}, observed {r.observed} · {r.match ? 'consistent' : `MISMATCH — ${r.next_action}`}</li>)}</ul>
      <p className="mt-2 text-sm text-muted-foreground">Mismatches never auto-close blockers and never claim readiness.</p>
    </section>
    {authorized && <section aria-labelledby="new-result"><h2 id="new-result" className="text-xl font-semibold">Record suite result</h2><p className="mt-2 text-sm text-muted-foreground">Recording never starts a session or runs tests. The server refuses results without an explicitly started authorized session, out-of-order suites, stale versions and unsafe values.</p>
      <form onSubmit={submit} className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm">Session<select name="session" className={field}>{SESSION_KEYS.map((k) => <option key={k} value={k}>{SESSION_LABELS[k]}</option>)}</select></label>
        <label className="text-sm">Suite<select name="suite" className={field}>{SUITES.map((x) => <option key={x.key} value={x.key}>{x.ord}. {x.label}</option>)}</select></label>
        <label className="text-sm">Observed status<select name="status" className={field}>{STATUSES.map((k) => <option key={k}>{k}</option>)}</select></label>
        <label className="text-sm">Safe result label<select name="result_label" className={field}>{RESULT_LABELS.map((k) => <option key={k}>{k}</option>)}</select></label>
        <label className="text-sm">Blocker reason<select name="blocker_reason" className={field}>{REASONS.map((k) => <option key={k}>{k}</option>)}</select></label>
        <label className="text-sm">Next action<select name="next_action" className={field}>{NEXT_ACTIONS.map((k) => <option key={k}>{k}</option>)}</select></label>
        <Button disabled={busy} type="submit" variant="outline" className="md:col-span-2">Save append-only result version</Button>
      </form></section>}
    <section aria-labelledby="simulation"><h2 id="simulation" className="text-xl font-semibold">SIMULATED fixtures</h2><ul className="mt-3 space-y-2 text-sm">{SIMULATED.map((f) => <li key={f.label}>{f.label} — {f.result} · Cannot start, approve or complete · Not production evidence · Outbound calls {f.outboundCalls}</li>)}</ul></section>
    {message && <p role="alert">{message}</p>}
  </main>;
}
export const Route = createFileRoute('/session-results')({ staticData: { sitemap: false }, head: () => ({ meta: [{ title: 'Human Test Session Results — iCareTele' }, { name: 'description', content: 'Private redacted recording and reconciliation of a future manually started human verification session. Production readiness is not claimed.' }, { property: 'og:title', content: 'Human Test Session Results — iCareTele' }, { property: 'og:description', content: 'Private session result metadata with two-reviewer independent confirmation. No automatic start.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex, nofollow' }] }), component: SessionResults });
