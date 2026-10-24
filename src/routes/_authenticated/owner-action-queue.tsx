import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { readOwnerActions, recordOwnerAction, confirmOwnerAction } from '@/lib/owner-action-queue.functions';
import { EVIDENCE_LABELS, ITEMS, STATUSES, queueRows, handoffExport, nextActions, recordSchema } from '@/lib/owner-action-queue';
import { READINESS_NOTICE } from '@/lib/verification-campaign';
const options = queryOptions({queryKey:['owner-action-queue'],queryFn:async()=>{try{return {authorized:true,entries:await readOwnerActions()};}catch{return {authorized:false,entries:[]};}}});
function OwnerActionQueue() {
 const {data,refetch} = useSuspenseQuery(options);
 const record = useServerFn(recordOwnerAction), confirm = useServerFn(confirmOwnerAction);
 const [message,setMessage] = useState(''),[busy,setBusy] = useState(false);
 const rows = queueRows(data.entries,data.authorized);
 const [key,setKey] = useState<string>(ITEMS[0].key);
 const selected = ITEMS.find(i=>i.key===key);
 const counts = Object.fromEntries(STATUSES.map(s=>[s,rows.filter(r=>r.status===s).length]));
 const action = async (fn:()=>Promise<unknown>)=>{setBusy(true);try{await fn();await refetch();setMessage('New append-only record saved. Readiness is not claimed.');}catch{setMessage('Not saved: check independent reviewer, latest version, review date and two-step sign-in.');}finally{setBusy(false);}};
 const submit = (event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const f=new FormData(event.currentTarget);const input=recordSchema.safeParse({key:f.get('key'),status:f.get('status'),evidence:f.get('evidence'),due:f.get('due')});if(!input.success){setMessage('Select safe item metadata and a valid review date.');return;}void action(()=>record({data:input.data}));};
 const download = ()=>{try{const url=URL.createObjectURL(new Blob([handoffExport(data.entries,data.authorized)],{type:'text/markdown'}));const a=document.createElement('a');a.href=url;a.download='owner-action-handoff.md';a.click();URL.revokeObjectURL(url);}catch{setMessage('Export refused: safe metadata could not be verified.');}};
 return <main className="mx-auto max-w-6xl space-y-6 p-6">
  <PageHeader title="Owner action queue" subtitle="Consolidated blockers and prerequisites for production readiness handoff" />
  <p className="border-l-4 border-warning pl-4">{READINESS_NOTICE}</p>
  <nav aria-label="Verification navigation" className="flex flex-wrap gap-3"><Button asChild variant="outline"><Link to="/publish-gate">Publish gate</Link></Button><Button asChild variant="outline"><Link to="/production-test-readiness">Production test readiness</Link></Button><Button asChild variant="outline"><Link to="/verification-campaign">Unified verification campaign</Link></Button><Button asChild variant="outline"><Link to="/golive-decision-pack">Final go-live decision pack</Link></Button><Button asChild variant="outline"><Link to="/test-session-workspace">Test session workspace</Link></Button><Button asChild variant="outline"><Link to="/human-review-console">Human review sign-off</Link></Button><Button asChild variant="outline"><Link to="/content-approval">Canonical content approval</Link></Button><Button asChild variant="outline"><Link to="/launch-control">Launch-day control center</Link></Button><Button asChild variant="outline"><Link to="/evidence-inspector">Evidence integrity inspector</Link></Button><Button variant="outline" onClick={download} disabled={!data.authorized}>Download owner handoff</Button><Button asChild variant="outline"><Link to="/owner-action-closure">Owner action closure board</Link></Button><Button asChild variant="outline"><Link to="/release-evidence-bundle">Final release evidence bundle</Link></Button></nav>
  <p role="status" className="font-medium">Available {counts['available']} · Pending {counts['pending']} · Blocked {counts['blocked']} · Unverified {counts['unverified']} · Remaining {rows.filter(r=>r.status!=='available').length} of {ITEMS.length}</p>
  {!data.authorized ? <p role="alert">Blocked: a global Superadmin or Operations admin with two-step sign-in is required. No queue records are shown.</p> : <>
   <section aria-labelledby="next-heading"><h2 id="next-heading" className="text-xl font-semibold">Next actions</h2><ul className="mt-3 list-disc space-y-1 pl-6 text-sm">{nextActions(rows).map(a=><li key={a}>{a.replace(/^- \[ \] /,'')}</li>)}</ul></section>
   <section aria-labelledby="queue-heading"><h2 id="queue-heading" className="text-xl font-semibold">Owner handoff checklist</h2><ul className="divide-y divide-border">{rows.map(r=><li key={r.key} className="space-y-2 py-5">
     <h3 className="font-semibold">{r.label} · {r.status}</h3><p className="text-sm">Owner: {r.owner} · Independent reviewer: {r.reviewer} · Required action: {r.action}</p>
    <p className="text-sm">Verification suites unlocked: {r.suites.join(' · ') || 'None — separate manual publish-owner handoff'}</p>
    {r.entry ? <><p className="break-words text-sm text-muted-foreground">Version {r.entry.version} · {r.entry.evidence_label} · Review due {r.entry.review_due} · Recorded {r.entry.created_at} · {r.entry.correlation_id}</p>
     <p className="text-sm">{r.status==='available'?'Availability independently confirmed; campaign checks are not executed or passed.':r.entry.status==='available'?'Gap: independent current confirmation required.':'Gap: real availability not confirmed.'}</p>
     {r.entry.mine ? <p className="text-sm">A different signed-in reviewer must review this version.</p> : <div className="flex flex-wrap gap-2"><Button disabled={busy || r.entry.status!=='available' || r.entry.reviews.some(v=>v.mine)} onClick={()=>{const entry=r.entry;if(entry)void action(()=>confirm({data:{id:entry.id,outcome:'confirmed'}}));}} variant="outline">Confirm availability</Button><Button disabled={busy || r.entry.reviews.some(v=>v.mine)} onClick={()=>{const entry=r.entry;if(entry)void action(()=>confirm({data:{id:entry.id,outcome:'rejected'}}));}} variant="outline">Record concern</Button></div>}
    </> : <p className="text-sm text-muted-foreground">Gap: owner attestation and independent review not recorded.</p>}
   </li>)}</ul></section>
   <section aria-labelledby="record-heading"><h2 id="record-heading" className="text-xl font-semibold">Record a new version</h2>
    <form onSubmit={submit} className="mt-4 grid gap-4 md:grid-cols-2">
     <label className="text-sm">Queue item<select name="key" value={key} onChange={e=>setKey(e.target.value)} className="mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-3">{ITEMS.map(i=><option key={i.key} value={i.key}>{i.label}</option>)}</select></label>
     <label className="text-sm">Owner role<Input readOnly value={selected?.owner ?? ''} className="mt-1" /></label>
     <label className="text-sm md:col-span-2">Required action<Input readOnly value={selected?.action ?? ''} className="mt-1" /></label>
     <label className="text-sm">Recorded status<select name="status" className="mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-3">{STATUSES.map(s=><option key={s}>{s}</option>)}</select></label>
     <label className="text-sm">Safe evidence label<select name="evidence" className="mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-3">{EVIDENCE_LABELS.map(s=><option key={s}>{s}</option>)}</select></label>
     <label className="text-sm">Due / review date<Input type="date" name="due" required className="mt-1" /></label>
     <Button type="submit" disabled={busy} className="md:col-span-2">Save new queue version</Button>
    </form>
   </section>
   <section aria-labelledby="history-heading"><h2 id="history-heading" className="text-xl font-semibold">Append-only history ({data.entries.length})</h2><ul className="mt-3 space-y-2 text-sm">{data.entries.map(e=><li key={e.id} className="break-words">{ITEMS.find(i=>i.key===e.key)?.label} · v{e.version} · {e.status} (recorded assertion) · {e.latest?'latest':'superseded'} · {e.created_at} · {e.correlation_id}{e.reviews.map(r=><p key={r.correlation_id} className="text-muted-foreground">Review: {r.outcome} · {r.independent?'independent':'not independent'} · {r.created_at} · {r.correlation_id}</p>)}</li>)}</ul></section>
   <p className="text-sm text-muted-foreground">Role-specific accounts and source evidence still need separate verification. No campaign checks, account creation or publication start here.</p>
   </>}
  {message && <p role="alert">{message}</p>}
 </main>;
}
export const Route = createFileRoute('/_authenticated/owner-action-queue')({
 staticData:{sitemap:false},loader:({context})=>context.queryClient.ensureQueryData(options),
 head:()=>({meta:[{title:'Owner action queue — iCareTele'},{name:'description',content:'Private redacted owner action queue and production readiness handoff.'},{property:'og:title',content:'Owner action queue — iCareTele'},{property:'og:description',content:'Private owner handoff queue. Production readiness is not claimed.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'},{name:'robots',content:'noindex, nofollow'}]}),component:OwnerActionQueue,
});
