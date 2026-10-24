import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { Download, RefreshCw, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { readOwnerSignoff } from '@/lib/owner-signoff.functions';
import { summarize, ownerExport, NOTICE, STATUSES, SIMULATED, type Input } from '@/lib/owner-signoff';
import { CHECKLIST } from '@/lib/human-review-packet';
import { pageHead } from '@/lib/seo';

function OwnerSignoff() {
  const read = useServerFn(readOwnerSignoff);
  const [data, setData] = useState<Input | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function load() {
    setBusy(true);
    try { const { data: session } = await supabase.auth.getSession(); if (!session.session) { setData(null); return; } setData(await read()); }
    catch { setData(null); } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  const s = summarize(data, !!data);
  function download() {
    try { const url = URL.createObjectURL(new Blob([ownerExport(data, !!data)], { type: 'text/markdown' })); const a = document.createElement('a'); a.href = url; a.download = 'icaretele-owner-handoff.md'; a.click(); URL.revokeObjectURL(url); }
    catch { setMessage('Export blocked: signed-out or unsafe metadata.'); }
  }
  return <main className="mx-auto max-w-6xl space-y-7 p-6">
    <PageHeader title="Final Owner Sign-off Readiness Board" subtitle="Final human handoff · Latest evidence · Independent confirmation" />
    <p className="border-l-4 border-warning pl-4 font-medium">{NOTICE}</p>
    <nav aria-label="Owner board navigation" className="flex flex-wrap gap-3">
      <Button asChild variant="outline"><Link to="/human-review-packet">Human decision packet</Link></Button>
      <Button asChild variant="outline"><Link to="/final-review-handoff">Handoff archive</Link></Button>
      <Button asChild variant="outline"><Link to="/archive-integrity-snapshot">Archive integrity</Link></Button>
      <Button asChild variant="outline"><Link to="/golive-decision-pack">Decision pack</Link></Button>
      <Button asChild variant="outline"><Link to="/golive-evidence-matrix">Reconciliation matrix</Link></Button>
      <Button asChild variant="outline"><Link to="/human-review-console">Human sign-off console</Link></Button>
      <Button asChild variant="outline"><Link to="/owner-action-closure">Closure and dependencies</Link></Button>
      <Button asChild variant="outline"><Link to="/publish-gate">Publish gate</Link></Button>
    </nav>
    {!data && <p role="alert">Blocked: signed out or unauthorized. No owner metadata is read. Global Superadmin or Operations scope and two-step sign-in required.</p>}
    <section aria-label="Owner counts" className="space-y-2 border-y border-border py-5">
      <p role="status">{STATUSES.map(k => `${k} ${s.counts[k]}`).join(' · ')} · Total {s.items.length}</p>
      <p>Open blockers {s.blockers} of 14 · Prerequisites {s.prerequisites} of 7 · Unpassed artifacts {s.artifacts} of 20</p>
      <p>Packet v{s.packetVersion || 'none'} · Source v{s.sourceVersion || 'none'} · {s.current ? 'current' : 'unavailable or stale'} · Source discrepancies {s.sourceDiscrepancies ?? 'not read'} · Unresolved owner items {s.discrepancies.length}</p>
      <p>Latest independent confirmations {s.confirmations} of 2 · Sign-off recording unavailable on this board</p>
    </section>
    <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={!data || busy} onClick={download}><Download />Export redacted owner handoff</Button><Button variant="outline" disabled={!data || busy} onClick={() => void load()}><RefreshCw />Refresh metadata</Button></div>
    {['artifact:', 'blocker:', 'prerequisite:', 'validation:', 'gate:', 'result:', 'packet-review'].map((prefix, index) => {
      const rows = s.items.filter(r => r.key.startsWith(prefix));
      const titles = ['Evidence artifacts', 'Hard blockers', 'Prerequisites', 'Validation suites', 'Session authorization', 'Human session results', 'Reviewer confirmations'];
      return <section key={prefix} aria-label={titles[index]}><h2 className="text-xl font-semibold">{titles[index]} ({rows.filter(r => r.observed_status !== 'passed').length} open of {rows.length})</h2>
        <ul className="mt-3 divide-y divide-border">{rows.map(r => <li key={r.key} className="space-y-2 py-4 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><h3 className="min-w-0 break-words font-semibold">{r.item_label}</h3><span>{r.observed_status}</span></div>
          <p>Expected: {r.expected_outcome}</p><p>Reason: {r.blocker_reason}</p>
          <p className="break-words text-muted-foreground">Owner {r.owner_role} · Independent reviewer {r.reviewer_role} · Evidence {r.evidence_label} · Source v{r.source_version} · {r.timestamp ?? 'Source timestamp unavailable'} · {r.correlation_id ?? 'Source correlation unavailable'}</p>
          <p>Dependency: {r.dependency_label}</p><p>Next action: {r.next_action}</p>
        </li>)}</ul></section>;
    })}
    <section aria-label="Reconciliation discrepancies"><h2 className="text-xl font-semibold">Unresolved reconciliation evidence</h2><ul className="mt-3 space-y-1 text-sm">{s.discrepancies.map(r => <li key={r.key}>{r.item_label} · {r.observed_status} · {r.evidence_label} · {r.blocker_reason}</li>)}</ul></section>
    <section aria-label="Version changes"><h2 className="text-xl font-semibold">Exact version changes</h2>{!data && <p>Private version differences unavailable.</p>}<ul className="mt-3 space-y-1 text-sm">{s.changes.map(c => <li key={c.key} className="break-words">{c.key}: v{c.prior_version} {c.prior_status} → v{c.next_version} {c.next_status} · Evidence changed {String(c.evidence_changed)}</li>)}</ul>
      {s.versionDiffs.map(v => <details key={v.sourceVersion} className="border-b border-border py-3"><summary>Archived source v{v.sourceVersion} · Packet v{v.packetVersion} · {v.changes.length} changes</summary><ul className="mt-2 space-y-1 text-sm">{v.changes.map(c => <li key={c.key} className="break-words">{c.key}: v{c.prior_version} {c.prior_status} → v{c.next_version} {c.next_status} · Evidence changed {String(c.evidence_changed)}</li>)}</ul></details>)}</section>
    <section aria-label="Handoff and concern history"><h2 className="text-xl font-semibold">Immutable handoff and concern history</h2><ul className="mt-3 space-y-2 text-sm">{s.events.map(e => <li key={e.correlation_id} className="break-words">{e.handoff_type} · {e.reason} · {e.sender_role} → {e.recipient_role} · {e.created_at} · {e.correlation_id}</li>)}</ul></section>
    <section aria-label="Reviewer history"><h2 className="text-xl font-semibold">Immutable reviewer history</h2><ul className="mt-3 space-y-2 text-sm">{s.decisions.map(e => <li key={e.correlation_id} className="break-words">Packet v{e.packet_version} · {e.decision} · {e.reason} · {e.reviewer_role} · {e.created_at} · {e.correlation_id}</li>)}</ul></section>
    <section aria-label="Reviewer checklist"><h2 className="flex items-center gap-2 text-xl font-semibold"><ClipboardCheck />Reviewer checklist</h2><ul className="mt-3 space-y-1 text-sm">{CHECKLIST.map(c => <li key={c}>{c.replace('- [ ] ', '☐ ')}</li>)}</ul></section>
    <section aria-label="SIMULATED"><h2 className="text-xl font-semibold">SIMULATED</h2><p>{SIMULATED.label} · Cannot sign off, approve or close · Outbound calls {SIMULATED.outboundCalls}</p></section>
    {message && <p role="alert">{message}</p>}
  </main>;
}
export const Route = createFileRoute('/owner-signoff-readiness')({ staticData: { sitemap: false }, head: () => pageHead({ path: '/owner-signoff-readiness', title: 'Final Owner Sign-off Readiness Board', thTitle: 'สรุปความพร้อมสำหรับการส่งมอบให้เจ้าของ', description: 'Private read-only owner evidence and independent human handoff. Production readiness is not claimed.', thDescription: 'ข้อมูลส่งมอบส่วนตัวสำหรับผู้ตรวจสอบอิสระ ยังไม่รับรองความพร้อมใช้งานจริง', index: false }), component: OwnerSignoff });