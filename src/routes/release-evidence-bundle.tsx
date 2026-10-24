import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { Download, RefreshCw, FileCheck2, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { readReleaseBundle, captureReleaseArtifact, confirmReleaseArtifact } from '@/lib/release-bundle.functions';
import { NOTICE, SIMULATED, integritySummary, bundleExport, type Bundle } from '@/lib/release-bundle';
function ReleaseEvidenceBundle(){
 const read=useServerFn(readReleaseBundle),capture=useServerFn(captureReleaseArtifact),confirm=useServerFn(confirmReleaseArtifact);
 const [data,setData]=useState<Bundle|null>(null),[authorized,setAuthorized]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function load(){const {data:session}=await supabase.auth.getSession();if(!session.session){setData(null);setAuthorized(false);return;}try{setData(await read());setAuthorized(true);}catch{setData(null);setAuthorized(false);}}
 useEffect(()=>{void load();},[]);
 const s=integritySummary(data,authorized);
 async function act(fn:()=>Promise<unknown>){setBusy(true);try{await fn();await load();setMessage('Append-only evidence recorded. Source readiness is not inferred.');}catch(e){const code=e instanceof Error?e.message:'';setMessage(code==='STALE_VERSION'?'Not recorded: snapshot or source evidence is stale.':code==='SECOND_REVIEWER_REQUIRED'?'Not recorded: a different reviewer is required.':'Not recorded: current evidence, authorized scope and two-step sign-in are required.');}finally{setBusy(false);}}
 function download(){try{const url=URL.createObjectURL(new Blob([bundleExport(data,authorized)],{type:'text/markdown'}));const a=document.createElement('a');a.href=url;a.download='icaretele-final-release-evidence.md';a.click();URL.revokeObjectURL(url);}catch{setMessage('Export refused: unsafe or invalid metadata.');}}
 return <main className="mx-auto max-w-6xl space-y-8 p-6">
  <PageHeader title="Final Release Evidence Bundle and Artifact Ledger" subtitle="Redacted register metadata for final human review" />
  <p className="border-l-4 border-warning pl-4 font-medium">{NOTICE}</p>
  <nav aria-label="Release evidence navigation" className="flex flex-wrap gap-3">
   <Button asChild variant="outline"><Link to="/golive-decision-pack">Final go-live decision pack</Link></Button>
   <Button asChild variant="outline"><Link to="/human-review-console">Human review sign-off</Link></Button>
   <Button asChild variant="outline"><Link to="/launch-control">Launch-day control center</Link></Button>
   <Button asChild variant="outline"><Link to="/incident-console">Incident console</Link></Button>
   <Button asChild variant="outline"><Link to="/evidence-inspector">Evidence integrity inspector</Link></Button>
   <Button asChild variant="outline"><Link to="/owner-action-closure">Owner action closure board</Link></Button><Button asChild variant="outline"><Link to="/owner-action-queue">Owner action queue</Link></Button>
   <Button asChild variant="outline"><Link to="/publish-gate">Publish gate</Link></Button><Button asChild variant="outline"><Link to="/readiness-decision-ledger">Readiness change and decision ledger</Link></Button><Button asChild variant="outline"><Link to="/validation-snapshot">Final validation evidence snapshot</Link></Button><Button asChild variant="outline"><Link to="/session-results">Human session results</Link></Button>
  <Button asChild variant="outline"><Link to="/golive-evidence-matrix">Go-live evidence reconciliation matrix</Link></Button><Button asChild variant="outline"><Link to="/human-review-packet">Human review decision packet</Link></Button><Button asChild variant="outline"><Link to="/final-review-handoff">Final review handoff archive</Link></Button><Button asChild variant="outline"><Link to="/archive-integrity-snapshot">Release archive integrity snapshot</Link></Button></nav>
  <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={download} disabled={!authorized}><Download />Download redacted evidence packet</Button><Button variant="outline" onClick={()=>void load()} disabled={busy||!authorized}><RefreshCw />Refresh metadata</Button></div>
  <p role="status" className="font-medium">Passed {s.passed} · Pending {s.pending} · Blocked {s.blocked} · Unverified {s.unverified} · Open {s.open.length} of {s.total}</p>
  {!authorized&&<p role="alert">Blocked: signed out or unauthorized. No register metadata is read or displayed. A global Superadmin or Operations reviewer with two-step sign-in is required.</p>}
  <section aria-labelledby="artifacts"><h2 id="artifacts" className="text-xl font-semibold">Artifact ledger — latest snapshots</h2>
   <ul className="mt-3 divide-y divide-border">{s.rows.map(r=><li key={r.key} className="space-y-3 py-5">
    <h3 className="font-semibold">{r.label} — {r.status}</h3>
    <p className="text-sm text-muted-foreground">Category: register metadata · Expected evidence: {r.evidence} · Owner: {r.ownerRole} · Independent reviewer: {r.reviewerRole}</p>
    <p className="text-sm">Source register: {r.key} · Version: {r.snapshot?.version??'not recorded'} · Source version: {r.source?.source_version??'not read'} · Source artifacts: {r.source?.source_count??'not read'}</p>
    <ul className="list-disc pl-5 text-sm">{r.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>
    <p className="break-words text-sm text-muted-foreground">Last reviewed: {r.lastReviewed??'not recorded'} · Timestamp: {r.snapshot?.created_at??'not recorded'} · Correlation: {r.snapshot?.correlation_id??'not recorded'}</p>
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm"><Link className="text-primary underline" to="/owner-action-queue">Owner action: {r.ownerAction}</Link><Link className="text-primary underline" to="/verification-campaign">Verification check: {r.check}</Link><Link className="text-primary underline" to="/human-review-console">Sign-off: {r.signoff}</Link></div>
    {authorized&&<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={()=>void act(()=>capture({data:{register:r.key,version:r.snapshot?.version??0}}))}><FileCheck2 />Capture metadata snapshot</Button>{r.snapshot&&!r.snapshot.mine&&!r.snapshot.reviews.some(v=>v.mine)&&<><Button variant="outline" disabled={busy||r.reasons.some(v=>/Stale|mismatch/.test(v))} onClick={()=>{const snapshot=r.snapshot;if(snapshot)void act(()=>confirm({data:{id:snapshot.id,outcome:'confirmed'}}));}}><ShieldCheck />Confirm assembly only</Button><Button variant="outline" disabled={busy} onClick={()=>{const snapshot=r.snapshot;if(snapshot)void act(()=>confirm({data:{id:snapshot.id,outcome:'concern'}}));}}>Record concern</Button></>}</div>}
   </li>)}</ul>
  </section>
  <section aria-labelledby="integrity"><h2 id="integrity" className="text-xl font-semibold">Bundle integrity summary</h2><ul className="mt-3 divide-y divide-border text-sm">{s.rules.map(r=><li key={r.rule} className="py-3"><strong>{r.rule} — {r.status}</strong><p className="text-muted-foreground">{r.reason}</p></li>)}</ul><p className="mt-3 text-sm">Exact discrepancies: {s.discrepancies.length}. Each ledger discrepancy retains its responsible owner action, verification check and independent sign-off requirement. Confirmation validates assembly only; source evidence remains unverified until its authoritative review is complete.</p></section>
  <section aria-labelledby="fixtures"><h2 id="fixtures" className="text-xl font-semibold">SIMULATED fixture suite</h2><ul className="mt-3 space-y-3 text-sm">{SIMULATED.map(f=><li key={f.label}>{f.label} — {f.status} · missing {f.missing} · duplicate {f.duplicates} · stale {String(f.stale)} · independent {String(f.independent)} · outbound calls {f.outboundCalls} · never passed or approved</li>)}</ul></section>
  {message&&<p role="alert">{message}</p>}
 </main>;
}
export const Route=createFileRoute('/release-evidence-bundle')({staticData:{sitemap:false},head:()=>({meta:[{title:'Final Release Evidence Bundle and Artifact Ledger — iCareTele'},{name:'description',content:'Private redacted evidence assembly for independent final human review. Production readiness is not claimed.'},{property:'og:title',content:'Final Release Evidence Bundle — iCareTele'},{property:'og:description',content:'Private artifact ledger. Production readiness is not claimed.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'},{name:'robots',content:'noindex, nofollow'}]}),component:ReleaseEvidenceBundle});
