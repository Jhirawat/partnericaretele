import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { Download, ListOrdered, RefreshCw, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { confirmSessionGate, readSessionGate, recordSessionGate } from '@/lib/session-start-gate.functions';
import { ENVIRONMENT, EVIDENCE, HANDOFF, NEXT_ACTIONS, NOTICE, REASONS, SESSIONS, SIMULATED, STATUSES, SUITE_GROUPS, authorizationPacket, recordSchema, summary, type Row } from '@/lib/session-start-gate';

function SessionStartGate() {
  const read = useServerFn(readSessionGate), record = useServerFn(recordSessionGate), confirm = useServerFn(confirmSessionGate);
  const [data, setData] = useState<Row[] | null>(null), [authorized, setAuthorized] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function load() { const { data: session } = await supabase.auth.getSession(); if (!session.session) { setData(null); setAuthorized(false); return; } try { setData(await read()); setAuthorized(true); } catch { setData(null); setAuthorized(false); } }
  useEffect(() => { void load(); }, []);
  const s = summary(data, authorized);
  const errors: Record<string, string> = { STALE_VERSION: 'Session version changed; reload and record a new version.', SECOND_REVIEWER_REQUIRED: 'A different signed-in reviewer is required.', ROLE_SEPARATION_REQUIRED: 'The second reviewer must hold the other global role.', DUPLICATE_REVIEW: 'This version already has a review.', PREREQUISITES_UNAVAILABLE: 'Hard prerequisites are not all independently confirmed.', START_AUTHORIZATION_REQUIRED: 'Start requires an independently confirmed ready-for-start version.', ORDER_REQUIRED: 'Completion requires an in-progress session.', INVALID_ARGUMENTS: 'Only safe closed-vocabulary metadata is accepted.' };
  async function act(fn: () => Promise<unknown>) { setBusy(true); try { await fn(); await load(); setMessage('Append-only session event recorded. Production readiness is not claimed.'); } catch (e) { setMessage(errors[e instanceof Error ? e.message : ''] ?? 'Not recorded: authorized global scope and two-step sign-in are required.'); } finally { setBusy(false); } }
  function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const f = new FormData(event.currentTarget); const key = f.get('session'); const version = data?.find((r) => r.key === key)?.record?.version ?? 0; const p = recordSchema.safeParse({ session: key, version, status: f.get('status'), suite_group: f.get('suite_group'), blocker_reason: f.get('blocker_reason'), next_action: f.get('next_action'), source_validation_version: Number(f.get('source_validation_version') || 0) }); if (!p.success) { setMessage('Only safe, consistent session metadata is accepted.'); return; } void act(() => record({ data: p.data })); }
  function startManually(row: Row) { const r = row.record; if (!r) return; void act(() => record({ data: { session: row.key, version: r.version, status: 'in-progress', suite_group: r.suite_group, blocker_reason: 'Independent review outstanding', next_action: 'Record completion', source_validation_version: r.source_validation_version } })); }
  function download() { try { const url = URL.createObjectURL(new Blob([authorizationPacket(data, authorized)], { type: 'text/markdown' })); const a = document.createElement('a'); a.href = url; a.download = 'icaretele-session-authorization-packet.md'; a.click(); URL.revokeObjectURL(url); } catch { setMessage('Export refused: signed-out, invalid or unsafe metadata.'); } }
  const field = 'mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-3';
  return <main className="mx-auto max-w-6xl space-y-8 p-6">
    <PageHeader title="Controlled Human Test Session Start Gate" subtitle="Authorization for a future signed-in human verification session" />
    <p className="border-l-4 border-warning pl-4 font-medium">{NOTICE}</p>
    <nav aria-label="Session start gate navigation" className="flex flex-wrap gap-3">
      <Button asChild variant="outline"><Link to="/production-test-readiness">Production test readiness</Link></Button>
      <Button asChild variant="outline"><Link to="/test-session-workspace">Test session workspace</Link></Button>
      <Button asChild variant="outline"><Link to="/validation-snapshot">Validation evidence snapshot</Link></Button>
      <Button asChild variant="outline"><Link to="/owner-action-closure">Owner action closure board</Link></Button>
      <Button asChild variant="outline"><Link to="/human-review-console">Human review sign-off</Link></Button>
      <Button asChild variant="outline"><Link to="/golive-decision-pack">Final go-live decision pack</Link></Button>
      <Button asChild variant="outline"><Link to="/publish-gate">Publish gate</Link></Button><Button asChild variant="outline"><Link to="/session-results">Human session results</Link></Button>
    <Button asChild variant="outline"><Link to="/golive-evidence-matrix">Go-live evidence reconciliation matrix</Link></Button><Button asChild variant="outline"><Link to="/human-review-packet">Human review decision packet</Link></Button></nav>
    <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={!authorized || busy} onClick={download}><Download />Download redacted authorization packet</Button><Button variant="outline" disabled={!authorized || busy} onClick={() => void load()}><RefreshCw />Refresh</Button></div>
    <p role="status" className="font-medium">Missing prerequisites {s.missing.length} of 7 · Sessions completed {s.completed} of 2 · Readiness claimed: no</p>
    {!authorized && <p role="alert">Blocked: signed out or unauthorized. No session metadata is read. A global Superadmin or Operations reviewer with two-step sign-in is required.</p>}
    <section aria-labelledby="prereqs"><h2 id="prereqs" className="flex items-center gap-2 text-xl font-semibold"><ListOrdered />Hard prerequisites in dependency order</h2>
      <ol className="mt-3 list-decimal space-y-3 pl-6">{s.missing.length === 0 ? <li>All seven prerequisites independently confirmed.</li> : s.missing.map((p) => <li key={p.key}><span className="font-semibold">{p.label}</span> — missing · Owner {p.owner} · Reviewer {p.reviewer} · Sign-off: {p.signoff}<div className="flex flex-wrap gap-3 text-sm"><Link className="text-primary underline" to="/owner-action-queue">Owner action: {p.ownerAction}</Link><Link className="text-primary underline" to="/release-evidence-bundle">Artifact: {p.artifact}</Link><Link className="text-primary underline" to="/verification-campaign">Checks: {p.checks.join(', ') || 'none'}</Link></div></li>)}</ol>
    </section>
    <section aria-labelledby="sessions"><h2 id="sessions" className="text-xl font-semibold">Sessions (latest version)</h2><ul className="mt-3 divide-y divide-border">{s.sessions.map((x) => { const r = x.row?.record; return <li key={x.key} className="space-y-2 py-5">
      <h3 className="font-semibold">{x.label} — {x.status}</h3>
      <p className="text-sm">Reason: {x.reason} · Environment: {ENVIRONMENT} · Suite: {r?.suite_group ?? 'not recorded'} · Evidence: {EVIDENCE}</p>
      <p className="text-sm">Owner: {r?.owner_role ?? 'not recorded'} · Second reviewer: {r?.reviewer_role ?? 'required (other global role)'} · Next: {r?.next_action ?? 'Confirm missing prerequisites'} · Source validation v{r?.source_validation_version ?? 0}</p>
      <p className="break-words text-sm text-muted-foreground">Version {r?.version ?? 'none'} · {r?.created_at ?? 'not recorded'} · {r?.correlation_id ?? 'not recorded'}</p>
      {authorized && r && !r.mine && !r.reviewed && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void act(() => confirm({ data: { id: r.id, outcome: 'confirmed' } }))}><ShieldCheck />Confirm latest version</Button><Button variant="outline" disabled={busy} onClick={() => void act(() => confirm({ data: { id: r.id, outcome: 'concern' } }))}>Record concern</Button></div>}
      {authorized && x.row && <Button variant="outline" disabled={busy || !x.canStart} onClick={() => x.row && startManually(x.row)}>Record explicit human start</Button>}
    </li>; })}</ul></section>
    {authorized && <section aria-labelledby="new-event"><h2 id="new-event" className="text-xl font-semibold">Record session event</h2><p className="mt-2 text-sm text-muted-foreground">Recording never runs tests. Ready-for-start and start are refused server-side until every prerequisite is independently confirmed.</p>
      <form onSubmit={submit} className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm">Session<select name="session" className={field}>{SESSIONS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
        <label className="text-sm">Status<select name="status" className={field}>{STATUSES.map((k) => <option key={k}>{k}</option>)}</select></label>
        <label className="text-sm">Suite group<select name="suite_group" className={field}>{SUITE_GROUPS.map((k) => <option key={k}>{k}</option>)}</select></label>
        <label className="text-sm">Blocker reason<select name="blocker_reason" className={field}>{REASONS.map((k) => <option key={k}>{k}</option>)}</select></label>
        <label className="text-sm">Next action<select name="next_action" className={field}>{NEXT_ACTIONS.map((k) => <option key={k}>{k}</option>)}</select></label>
        <label className="text-sm">Source validation version<input name="source_validation_version" type="number" min="0" defaultValue={0} className={field} /></label>
        <Button disabled={busy} type="submit" variant="outline" className="md:col-span-2">Save append-only session version</Button>
      </form></section>}
    <section aria-labelledby="handoff"><h2 id="handoff" className="text-xl font-semibold">Handoff checklist</h2><ul className="mt-3 list-disc space-y-1 pl-6 text-sm">{HANDOFF.map((h) => <li key={h}>{h}</li>)}</ul></section>
    <section aria-labelledby="simulation"><h2 id="simulation" className="text-xl font-semibold">SIMULATED fixtures</h2><ul className="mt-3 space-y-2 text-sm">{SIMULATED.map((f) => <li key={f.label}>{f.label} — {f.result} · Cannot start, approve or complete · Not production evidence · Outbound calls {f.outboundCalls}</li>)}</ul></section>
    {message && <p role="alert">{message}</p>}
  </main>;
}
export const Route = createFileRoute('/session-start-gate')({ staticData: { sitemap: false }, head: () => ({ meta: [{ title: 'Human Test Session Start Gate — iCareTele' }, { name: 'description', content: 'Private authorization gate for a future signed-in human verification session. Production readiness is not claimed.' }, { property: 'og:title', content: 'Human Test Session Start Gate — iCareTele' }, { property: 'og:description', content: 'Private session authorization metadata with independent review. No automatic start.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex, nofollow' }] }), component: SessionStartGate });
