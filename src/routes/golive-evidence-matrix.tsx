import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { Download, RefreshCw, GitCompareArrows } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { readGoLiveMatrix } from '@/lib/golive-evidence-matrix.functions';
import { NOTICE, SIMULATED, reconcile, packet, type Input } from '@/lib/golive-evidence-matrix';
function GoLiveMatrix() {
 const read = useServerFn(readGoLiveMatrix);
 const [data, setData] = useState<Input | null>(null), [authorized, setAuthorized] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
 async function load() {
  setBusy(true);
  try { const { data: session } = await supabase.auth.getSession(); if (!session.session) { setData(null); setAuthorized(false); return; } setData(await read()); setAuthorized(true); }
  catch { setData(null); setAuthorized(false); }
  finally { setBusy(false); }
 }
 useEffect(() => { void load(); }, []);
 const s = reconcile(data, authorized);
 function download() { try { const url = URL.createObjectURL(new Blob([packet(data, authorized)], { type: 'text/markdown' })); const a = document.createElement('a'); a.href = url; a.download = 'icaretele-golive-reconciliation.md'; a.click(); URL.revokeObjectURL(url); } catch { setMessage('Export refused: signed-out or unsafe metadata.'); } }
 return <main className="mx-auto max-w-6xl space-y-8 p-6">
  <PageHeader title="Final Go-Live Evidence Reconciliation Matrix" subtitle="Latest evidence · Dependencies · Independent review" />
  <p className="border-l-4 border-warning pl-4 font-medium">{NOTICE}</p>
  <nav aria-label="Reconciliation navigation" className="flex flex-wrap gap-3">
   <Button asChild variant="outline"><Link to="/golive-decision-pack">Decision pack</Link></Button>
   <Button asChild variant="outline"><Link to="/validation-snapshot">Validation snapshot</Link></Button>
   <Button asChild variant="outline"><Link to="/session-start-gate">Session start gate</Link></Button>
   <Button asChild variant="outline"><Link to="/session-results">Session results</Link></Button>
   <Button asChild variant="outline"><Link to="/release-evidence-bundle">Evidence bundle</Link></Button>
   <Button asChild variant="outline"><Link to="/owner-action-closure">Closure board</Link></Button>
   <Button asChild variant="outline"><Link to="/readiness-decision-ledger">Decision ledger</Link></Button>
   <Button asChild variant="outline"><Link to="/evidence-inspector">Integrity inspector</Link></Button>
   <Button asChild variant="outline"><Link to="/human-review-console">Human sign-off</Link></Button>
   <Button asChild variant="outline"><Link to="/human-review-packet">Human review decision packet</Link></Button>
   <Button asChild variant="outline"><Link to="/publish-gate">Publish gate</Link></Button>
  <Button asChild variant="outline"><Link to="/final-review-handoff">Final review handoff archive</Link></Button><Button asChild variant="outline"><Link to="/archive-integrity-snapshot">Release archive integrity snapshot</Link></Button><Button asChild variant="outline"><Link to="/owner-signoff-readiness">Final owner sign-off readiness</Link></Button></nav>
  <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={!authorized || busy} onClick={download}><Download />Export redacted reconciliation</Button><Button variant="outline" disabled={!authorized || busy} onClick={() => void load()}><RefreshCw />Refresh evidence</Button></div>
  {!authorized && <p role="alert">Blocked: signed out or unauthorized. No register metadata is read. Global Superadmin or Operations scope and two-step sign-in are required.</p>}
  <section aria-label="Reconciliation counts" className="border-y border-border py-5">
   <p role="status" className="font-semibold">Passed {s.passed} · Blocked {s.blocked} · Unverified {s.unverified} · Total {s.total}</p>
   <p className="mt-2">Remaining blockers {s.remainingBlockers} of 14 · Discrepancies {s.discrepancies.length} · Readiness claimed: no</p>
  </section>
  <section aria-labelledby="matrix"><h2 id="matrix" className="flex items-center gap-2 text-xl font-semibold"><GitCompareArrows />Expected versus observed evidence</h2>
   <ul className="mt-4 divide-y divide-border">{s.rows.map(r => <li key={r.key} className="space-y-3 py-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="min-w-0 break-words font-semibold">{r.label}</h3><span className="font-medium">{r.status}</span></div>
    <dl className="grid gap-2 text-sm md:grid-cols-2"><div><dt className="text-muted-foreground">Expected</dt><dd>{r.expected}</dd></div><div><dt className="text-muted-foreground">Observed latest</dt><dd>{r.observed}</dd></div><div><dt className="text-muted-foreground">Source / result version</dt><dd>{r.sourceVersion} / {r.resultVersion}</dd></div><div><dt className="text-muted-foreground">Dependency / reviewer state</dt><dd>{r.dependency} / {r.reviewer}</dd></div></dl>
    <ul className="list-disc pl-5 text-sm">{r.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    <p className="text-sm">Next action: {r.nextAction}</p>
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
     <Link className="break-words text-primary underline" to="/owner-action-closure" hash={`action-${r.blocker}`}>Blocker: {r.blocker}</Link>
     <Link className="break-words text-primary underline" to="/owner-action-queue">Owner actions: {r.ownerActions.join(', ')}</Link>
     <Link className="break-words text-primary underline" to="/verification-campaign">Checks: {r.checks.join(', ') || 'Prerequisite review only'}</Link>
     <Link className="break-words text-primary underline" to="/release-evidence-bundle">Artifacts: {r.artifacts.join(', ')}</Link>
     <Link className="break-words text-primary underline" to="/readiness-decision-ledger">Decision event: {r.event ? `${r.event.decision} v${r.event.version}` : 'Not recorded — source event required'}</Link>
     <Link className="text-primary underline" to="/human-review-console">Sign-off: {r.signoff}</Link>
    </div>
    <p className="break-all text-sm text-muted-foreground">{r.timestamp ?? 'Not recorded'} · Correlation: {r.correlation ?? 'Not recorded'} · Event correlation: {r.event?.correlation ?? 'Not recorded'}</p>
   </li>)}</ul>
  </section>
  <section aria-labelledby="simulation"><h2 id="simulation" className="text-xl font-semibold">SIMULATED isolation</h2><ul className="mt-3 space-y-2 text-sm">{SIMULATED.map(f => <li key={f.label}>{f.label} · {f.status} · Not production evidence · Never counts as passed · Outbound calls {f.outboundCalls}</li>)}</ul></section>
  {message && <p role="alert">{message}</p>}
 </main>;
}
export const Route = createFileRoute('/golive-evidence-matrix')({ staticData: { sitemap: false }, head: () => ({ meta: [{ title: 'Final Go-Live Evidence Reconciliation Matrix — iCareTele' }, { name: 'description', content: 'Private redacted reconciliation of current readiness evidence, authorized human-session results and independent reviews. Production readiness is not claimed.' }, { property: 'og:title', content: 'Go-Live Evidence Reconciliation Matrix — iCareTele' }, { property: 'og:description', content: 'Private latest-version evidence reconciliation without release authority.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex, nofollow' }] }), component: GoLiveMatrix });
