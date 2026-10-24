import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { Download, RefreshCw, FilePlus2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import type { Input } from '@/lib/golive-evidence-matrix';
import { readHumanPacket, openHumanPacket, decideHumanPacket } from '@/lib/human-review-packet.functions';
import { NOTICE, PACKET_REASONS, SIMULATED_EXAMPLE, CHECKLIST, SECTION_GROUPS, assemblePacket, packetExport, type PacketConsole, type PacketReason } from '@/lib/human-review-packet';

const GROUPS = [...new Set(SECTION_GROUPS.map((g) => g.label))];
function HumanReviewPacket() {
  const read = useServerFn(readHumanPacket), open = useServerFn(openHumanPacket), decide = useServerFn(decideHumanPacket);
  const [data, setData] = useState<{ matrix: Input; packet: PacketConsole } | null>(null), [authorized, setAuthorized] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [reason, setReason] = useState<PacketReason>('concern_blocker_open');
  async function load() {
    setBusy(true);
    try { const { data: s } = await supabase.auth.getSession(); if (!s.session) { setData(null); setAuthorized(false); return; } setData(await read()); setAuthorized(true); }
    catch { setData(null); setAuthorized(false); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  const p = assemblePacket(data?.matrix ?? null, data?.packet ?? null, authorized);
  async function act(fn: () => Promise<unknown>, ok: string) { setBusy(true); setMessage(''); try { await fn(); setMessage(ok); await load(); } catch (e) { setMessage(`Refused: ${(e as Error).message}`); } finally { setBusy(false); } }
  function download() { try { const url = URL.createObjectURL(new Blob([packetExport(p, authorized)], { type: 'text/markdown' })); const a = document.createElement('a'); a.href = url; a.download = 'icaretele-human-review-packet.md'; a.click(); URL.revokeObjectURL(url); } catch { setMessage('Export refused: signed-out or unsafe metadata.'); } }
  const isConcern = reason.startsWith('concern_');
  return <main className="mx-auto max-w-6xl space-y-8 p-6">
    <PageHeader title="Final Human Review Decision Packet" subtitle="Latest evidence · Two independent reviewers · No release authority" />
    <p className="border-l-4 border-warning pl-4 font-medium">{NOTICE}</p>
    <nav aria-label="Packet navigation" className="flex flex-wrap gap-3">
      <Button asChild variant="outline"><Link to="/golive-decision-pack">Decision pack</Link></Button>
      <Button asChild variant="outline"><Link to="/golive-evidence-matrix">Reconciliation matrix</Link></Button>
      <Button asChild variant="outline"><Link to="/validation-snapshot">Validation snapshot</Link></Button>
      <Button asChild variant="outline"><Link to="/session-start-gate">Session start gate</Link></Button>
      <Button asChild variant="outline"><Link to="/session-results">Session results</Link></Button>
      <Button asChild variant="outline"><Link to="/release-evidence-bundle">Evidence bundle</Link></Button>
      <Button asChild variant="outline"><Link to="/owner-action-closure">Closure board</Link></Button>
      <Button asChild variant="outline"><Link to="/readiness-decision-ledger">Decision ledger</Link></Button>
      <Button asChild variant="outline"><Link to="/human-review-console">Human sign-off</Link></Button>
      <Button asChild variant="outline"><Link to="/publish-gate">Publish gate</Link></Button>
    <Button asChild variant="outline"><Link to="/final-review-handoff">Final review handoff archive</Link></Button><Button asChild variant="outline"><Link to="/archive-integrity-snapshot">Release archive integrity snapshot</Link></Button><Button asChild variant="outline"><Link to="/owner-signoff-readiness">Final owner sign-off readiness</Link></Button></nav>
    {!authorized && <p role="alert">Blocked: signed out or unauthorized. No packet metadata is read. Global Superadmin or Operations scope and two-step sign-in are required.</p>}
    <section aria-label="Packet counts" className="border-y border-border py-5 space-y-1">
      <p role="status" className="font-semibold">State: {p.state} · Packet version {p.packetVersion || 'none'}{p.latest && !p.latest.current ? ' (stale)' : ''}</p>
      <p>Open blockers {p.openBlockers} of 14 · Open prerequisites {p.openPrerequisites} of 7 · Unpassed artifacts {p.unpassedArtifacts} of 20 · Discrepancies {p.discrepancies.length} of {p.sections.length} · Readiness claimed: no</p>
    </section>
    {p.conflicts.length > 0 && <section aria-labelledby="conflicts"><h2 id="conflicts" className="text-xl font-semibold">Conflicts and mismatches</h2><ul className="mt-2 list-disc pl-5">{p.conflicts.map((c) => <li key={c}>{c}</li>)}</ul></section>}
    <section aria-labelledby="decide" className="space-y-3"><h2 id="decide" className="text-xl font-semibold">Reviewer decision</h2>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={!authorized || busy} onClick={() => void act(() => open(), 'New packet version opened.')}><FilePlus2 />Open new packet version</Button>
        <select aria-label="Decision reason" className="min-w-0 max-w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value as PacketReason)}>{Object.entries(PACKET_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <Button disabled={!authorized || busy || !p.packetVersion || (!isConcern && !p.canApprove)} onClick={() => void act(() => decide({ data: { packet_version: p.packetVersion, decision: isConcern ? 'concern' : 'approve', reason } }), 'Decision recorded.')}>{isConcern ? 'Record concern' : 'Record approval'}</Button>
        <Button variant="outline" disabled={!authorized || busy} onClick={download}><Download />Export redacted packet</Button>
        <Button variant="outline" disabled={!authorized || busy} onClick={() => void load()}><RefreshCw />Refresh</Button>
      </div>
      <p className="text-sm text-muted-foreground">Approval stays disabled while any blocker, prerequisite or artifact is open; the server enforces this, plus self-review, duplicate, role and stale-version rejection.</p>
      <ul className="text-sm">{p.decisions.map((d) => <li key={d.id}>v{d.packet_version}: {d.decision} — {PACKET_REASONS[d.reason]} · {d.reviewer_role}{d.mine ? ' (you)' : ''} · {d.correlation_id}</li>)}</ul>
    </section>
    {GROUPS.map((g) => { const rows = p.sections.filter((s) => s.group === g); return <section key={g} aria-label={g}><h2 className="text-xl font-semibold">{g} ({rows.filter((r) => r.status !== 'passed').length} open of {rows.length})</h2>
      <ul className="mt-3 divide-y divide-border">{rows.map((s) => <li key={s.key} className="space-y-1 py-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><span className="min-w-0 break-words font-medium">{s.label}</span><span className="font-semibold">{s.status}</span></div>
        <p>Expected: {s.expected}</p><p>Blocker reason: {s.blockerReason}</p>
        <p className="break-words text-muted-foreground">Owner: {s.ownerRole} · Reviewers: {s.firstReviewerRole} then {s.secondReviewerRole} · Evidence: {s.evidence.join(', ')} · Source v{s.sourceVersion} · Packet v{s.packetVersion} · {s.correlation ?? 'Not recorded'}</p>
        <p>Next action: {s.nextAction}</p>
      </li>)}</ul></section>; })}
    <section aria-labelledby="handoff"><h2 id="handoff" className="text-xl font-semibold">Reviewer handoff checklist</h2><ul className="mt-2 space-y-1 text-sm">{CHECKLIST.map((c) => <li key={c}>{c.replace('- [ ] ', '☐ ')}</li>)}</ul></section>
    <section aria-labelledby="sim"><h2 id="sim" className="text-xl font-semibold">SIMULATED</h2><p className="text-sm">{SIMULATED_EXAMPLE.label} · Outbound calls {SIMULATED_EXAMPLE.outboundCalls}</p></section>
    {message && <p role="alert">{message}</p>}
  </main>;
}
export const Route = createFileRoute('/human-review-packet')({ staticData: { sitemap: false }, head: () => ({ meta: [{ title: 'Final Human Review Decision Packet — iCareTele' }, { name: 'description', content: 'Private redacted decision packet for two independent human reviewers. Production readiness is not claimed.' }, { property: 'og:title', content: 'Final Human Review Decision Packet — iCareTele' }, { property: 'og:description', content: 'Private latest-version review packet without release authority.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex, nofollow' }] }), component: HumanReviewPacket });
