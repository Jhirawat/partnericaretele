import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { readArchiveIntegrity } from '@/lib/archive-integrity.functions';
import { inspect, integrityExport, NOTICE, SIMULATED, type Input } from '@/lib/archive-integrity';
function ArchiveIntegrity() {
  const read = useServerFn(readArchiveIntegrity);
  const [data, setData] = useState<Input | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function load() {
    setBusy(true);
    try { const { data: s } = await supabase.auth.getSession(); if (!s.session) { setData(null); return; } setData(await read()); }
    catch { setData(null); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  const s = inspect(data, !!data);
  function download() {
    try { const url = URL.createObjectURL(new Blob([integrityExport(data, !!data)], { type: 'text/markdown' })); const a = document.createElement('a'); a.href = url; a.download = 'icaretele-archive-integrity.md'; a.click(); URL.revokeObjectURL(url); }
    catch { setMessage('Export blocked: signed-out or unsafe metadata.'); }
  }
  return <main className="mx-auto max-w-6xl space-y-7 p-6">
    <PageHeader title="Final Release Archive Integrity Snapshot" subtitle="Latest archive versions · Exact discrepancies · Independent review" />
    <p className="border-l-4 border-warning pl-4 font-medium">{NOTICE}</p>
    <nav aria-label="Archive integrity navigation" className="flex flex-wrap gap-3">
      <Button asChild variant="outline"><Link to="/final-review-handoff">Handoff archive</Link></Button>
      <Button asChild variant="outline"><Link to="/human-review-packet">Human decision packet</Link></Button>
      <Button asChild variant="outline"><Link to="/golive-decision-pack">Decision pack</Link></Button>
      <Button asChild variant="outline"><Link to="/golive-evidence-matrix">Reconciliation matrix</Link></Button>
      <Button asChild variant="outline"><Link to="/release-evidence-bundle">Evidence bundle</Link></Button>
      <Button asChild variant="outline"><Link to="/readiness-decision-ledger">Decision ledger</Link></Button>
      <Button asChild variant="outline"><Link to="/owner-action-closure">Closure board</Link></Button>
      <Button asChild variant="outline"><Link to="/publish-gate">Publish gate</Link></Button>
    <Button asChild variant="outline"><Link to="/owner-signoff-readiness">Final owner sign-off readiness</Link></Button></nav>
    {!data && <p role="alert">Blocked: signed out or unauthorized. No archive metadata is read. Global Superadmin or Operations scope and two-step sign-in required.</p>}
    <section aria-label="Integrity counts" className="space-y-2 border-y border-border py-5">
      <p role="status">Passed {s.passed} · Blocked {s.blocked} · Unverified {s.unverified} · Total {s.rows.length}</p>
      <p>Packet v{s.packetVersion || 'none'} · Archived source v{s.sourceVersion || 'none'}</p>
      <p>Open blockers {s.blockerCount} of 14 · Prerequisites {s.prerequisiteCount} of 7 · Unpassed artifacts {s.artifactCount} of 20 · Discrepancies {s.discrepancyCount ?? 'not read'}</p>
    </section>
    <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={!data || busy} onClick={download}><Download />Export redacted integrity report</Button><Button variant="outline" disabled={!data || busy} onClick={() => void load()}><RefreshCw />Refresh metadata</Button></div>
    <section aria-labelledby="integrity-rules"><h2 id="integrity-rules" className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck />Archive integrity rules</h2>
      <ul className="mt-3 divide-y divide-border">{s.rows.map(r => <li key={r.key} className="space-y-2 py-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{r.label}</h3><span>{r.status}</span></div><p className="text-sm">{r.reason}</p><p className="text-sm text-muted-foreground">Owner {r.owner_role} · Independent reviewer {r.reviewer_role} · {r.evidence_label}</p><p className="text-sm">Next action: {r.next_action}</p></li>)}</ul>
    </section>
    <section aria-labelledby="changes"><h2 id="changes" className="text-xl font-semibold">Changes since latest archived source</h2>{!data ? <p>Private version differences unavailable.</p> : <ul className="mt-3 space-y-2 text-sm">{s.changes.map(c => <li key={c.key} className="break-words">{c.key}: v{c.prior_version} {c.prior_status} → v{c.next_version} {c.next_status} · Evidence changed: {String(c.evidence_changed)}</li>)}</ul>}</section>
    <section aria-labelledby="unresolved"><h2 id="unresolved" className="text-xl font-semibold">Preserved unresolved evidence</h2><ul className="mt-3 space-y-2 text-sm">{s.unresolved.map(e => <li key={e.key} className="break-words">{e.key}: v{e.version} · {e.status}</li>)}</ul></section>
    <section aria-labelledby="history"><h2 id="history" className="text-xl font-semibold">Immutable handoff history</h2><ul className="mt-3 space-y-2 text-sm">{data?.archive.events.map(e => <li key={e.correlation_id} className="break-words">{e.handoff_type} · {e.sender_role} → {e.recipient_role} · {e.reason} · {e.created_at} · {e.correlation_id}</li>)}</ul></section>
    <section aria-label="SIMULATED"><h2 className="text-xl font-semibold">SIMULATED</h2><p>{SIMULATED.label} · Cannot acknowledge, approve or close · Outbound calls {SIMULATED.outboundCalls}</p></section>
    {message && <p role="alert">{message}</p>}
  </main>;
}
export const Route = createFileRoute('/archive-integrity-snapshot')({ staticData: { sitemap: false }, head: () => ({ meta: [{ title: 'Final Release Archive Integrity Snapshot — iCareTele' }, { name: 'description', content: 'Private read-only redacted packet and handoff integrity snapshot. Production readiness is not claimed.' }, { property: 'og:title', content: 'Final Release Archive Integrity Snapshot — iCareTele' }, { property: 'og:description', content: 'Private archive versions, honest counts and unresolved evidence without release authority.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex, nofollow' }] }), component: ArchiveIntegrity });