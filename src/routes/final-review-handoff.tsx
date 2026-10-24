import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { Download, RefreshCw, FilePlus2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { readReviewHandoff, recordReviewHandoff } from '@/lib/review-handoff.functions';
import { NOTICE, SIMULATED, diffVersions, archiveExport, type Archive, type commandSchema } from '@/lib/review-handoff';
import { CHECKLIST } from '@/lib/human-review-packet';
import type { z } from 'zod';
function ReviewHandoff(){
 const read=useServerFn(readReviewHandoff),record=useServerFn(recordReviewHandoff);
 const [data,setData]=useState<Archive|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function load(){setBusy(true);try{const {data:s}=await supabase.auth.getSession();if(!s.session){setData(null);return;}setData(await read());}catch{setData(null);}finally{setBusy(false);}}
 useEffect(()=>{void load();},[]);
 async function act(v:z.infer<typeof commandSchema>){setBusy(true);setMessage('');try{await record({data:v});setMessage('Handoff metadata recorded. No message sent.');await load();}catch(e){setMessage(`Refused: ${(e as Error).message}`);}finally{setBusy(false);}}
 function download(){try{const url=URL.createObjectURL(new Blob([archiveExport(data,!!data)],{type:'text/markdown'}));const a=document.createElement('a');a.href=url;a.download='icaretele-final-review-handoff.md';a.click();URL.revokeObjectURL(url);}catch{setMessage('Export blocked: signed-out or unsafe metadata.');}}
 const recipient=data?.role==='SUPER_ADMIN'?'OPERATIONS_ADMIN':'SUPER_ADMIN';
 const roots=data?.events.filter(e=>e.handoff_type==='created')??[];
 return <main className="mx-auto max-w-6xl space-y-7 p-6">
 <PageHeader title="Final Review Handoff and Audit Archive" subtitle="Immutable review history · Independent receipt · No release authority"/>
 <p className="border-l-4 border-warning pl-4 font-medium">{NOTICE}</p>
 <nav aria-label="Archive navigation" className="flex flex-wrap gap-3">
 <Button asChild variant="outline"><Link to="/human-review-packet">Human decision packet</Link></Button>
 <Button asChild variant="outline"><Link to="/golive-decision-pack">Go-live decision pack</Link></Button>
 <Button asChild variant="outline"><Link to="/golive-evidence-matrix">Reconciliation matrix</Link></Button>
 <Button asChild variant="outline"><Link to="/human-review-console">Human sign-off</Link></Button>
 <Button asChild variant="outline"><Link to="/release-evidence-bundle">Evidence bundle</Link></Button>
 <Button asChild variant="outline"><Link to="/readiness-decision-ledger">Decision ledger</Link></Button>
 <Button asChild variant="outline"><Link to="/owner-action-closure">Closure board</Link></Button>
 <Button asChild variant="outline"><Link to="/publish-gate">Publish gate</Link></Button><Button asChild variant="outline"><Link to="/archive-integrity-snapshot">Release archive integrity snapshot</Link></Button>
 <Button asChild variant="outline"><Link to="/owner-signoff-readiness">Final owner sign-off readiness</Link></Button></nav>
 {!data&&<p role="alert">Blocked: signed out or unauthorized. Global Superadmin or Operations scope and two-step sign-in required. No archive metadata is read.</p>}
 <section aria-label="Handoff counts" className="space-y-2 border-y border-border py-5">
 <p role="status">Packet version {data?.current.packet_version||'none'} · {data?.current.packet_current?'current':'unavailable or stale'} · {data?.current.decision_state??'blocked'}</p>
 <p>Open blockers {data?.current.blocker_count??14} of 14 · Prerequisites {data?.current.prerequisite_count??7} of 7 · Unpassed artifacts {data?.current.artifact_count??20} of 20 · Discrepancies {data?.current.discrepancy_count??'not read'}</p>
 </section>
 <div className="flex flex-wrap gap-3">
 <Button variant="outline" disabled={!data?.current.packet_current||busy} onClick={()=>data&&void act({packet_version:data.current.packet_version,source_version:0,root_id:null,handoff_type:'created',recipient_role:recipient,reason:'review-requested'})}><FilePlus2/>Record handoff</Button>
 <Button variant="outline" disabled={!data||busy} onClick={download}><Download/>Export archive</Button>
 <Button variant="outline" disabled={busy} onClick={()=>void load()}><RefreshCw/>Refresh</Button>
 </div>
 <section aria-labelledby="history"><h2 id="history" className="text-xl font-semibold">Handoff history</h2>
 {roots.length===0&&<p className="mt-3 text-muted-foreground">No handoffs available.</p>}
 <ul className="divide-y divide-border">{roots.map(root=>{const snap=data?.snapshots.find(s=>s.id===root.snapshot_id);const history=data?.events.filter(e=>e.root_id===root.id)??[];const terminal=history.some(e=>['acknowledged','returned','concern','expired'].includes(e.handoff_type));const sender=root.mine;const reviewer=!!data&&data.role===root.recipient_role&&!root.mine;const enabled=!!snap?.current&&!terminal&&!busy;const shared=history.some(e=>e.handoff_type==='shared');
 const command=(type:'shared'|'acknowledged'|'returned'|'concern'|'expired',reason:'review-requested'|'receipt-confirmed'|'blockers-open'|'review-concern'|'window-expired')=>{if(snap)void act({packet_version:snap.packet_version,source_version:snap.source_version,root_id:root.id,handoff_type:type,recipient_role:root.recipient_role,reason});};
 return <li key={root.id} className="space-y-3 py-4"><p className="font-medium">Packet v{snap?.packet_version} / source v{snap?.source_version} · {snap?.current?'current':'stale'} · {root.sender_role} → {root.recipient_role}</p><p className="break-words text-sm">{root.created_at} · {root.correlation_id}</p><ul className="space-y-1 text-sm">{history.map(e=><li key={e.id} className="break-words">{e.handoff_type} · {e.reason} · {e.next_action} · {e.created_at} · {e.correlation_id}</li>)}</ul><div className="flex flex-wrap gap-2">
 {sender&&<><Button variant="outline" disabled={!enabled||shared} onClick={()=>command('shared','review-requested')}>Record shared</Button><Button variant="outline" disabled={!enabled} onClick={()=>command('expired','window-expired')}>Record expiry</Button></>}
 {reviewer&&<><Button disabled={!enabled||!shared} onClick={()=>command('acknowledged','receipt-confirmed')}>Acknowledge receipt</Button><Button variant="outline" disabled={!enabled} onClick={()=>command('returned','blockers-open')}>Return for evidence</Button><Button variant="outline" disabled={!enabled} onClick={()=>command('concern','review-concern')}>Record concern</Button></>}
 </div></li>;})}</ul></section>
 <section aria-labelledby="diffs"><h2 id="diffs" className="text-xl font-semibold">Immutable packet version changes</h2><ul className="divide-y divide-border">{data?.snapshots.map((s,i)=><li key={s.id} className="space-y-2 py-4"><h3 className="font-medium">Packet v{s.packet_version} · Source v{s.source_version}</h3><p>Blockers {s.blocker_count} · Prerequisites {s.prerequisite_count} · Unpassed artifacts {s.artifact_count} · Discrepancies {s.discrepancy_count}</p><ul className="space-y-1 text-sm">{diffVersions(data.snapshots[i-1]?.manifest??[],s.manifest).map(d=><li key={d.key} className="break-words">{d.key}: v{d.prior_version} {d.prior_status} → v{d.next_version} {d.next_status}{d.evidence_changed?' · evidence changed':''}</li>)}</ul></li>)}</ul>
 {data&&<><h3 className="mt-4 font-medium">Changes since latest archived source</h3><ul className="mt-2 space-y-1 text-sm">{diffVersions(data.snapshots.at(-1)?.manifest??[],data.current.manifest).map(d=><li key={d.key} className="break-words">{d.key}: v{d.prior_version} {d.prior_status} → v{d.next_version} {d.next_status}{d.evidence_changed?' · evidence changed':''}</li>)}</ul></>}
 </section>
 <section aria-labelledby="unresolved"><h2 id="unresolved" className="text-xl font-semibold">Unresolved evidence and blockers</h2><ul className="mt-3 space-y-1 text-sm">{data?.current.manifest.filter(e=>!['passed','closed'].includes(e.status)).map(e=><li key={e.key} className="break-words">{e.key} v{e.version}: {e.status}</li>)}</ul></section>
 <section aria-labelledby="checklist"><h2 id="checklist" className="text-xl font-semibold">Reviewer checklist</h2><ul className="mt-3 space-y-1 text-sm">{CHECKLIST.map(c=><li key={c}>{c.replace('- [ ] ','☐ ')}</li>)}</ul></section>
 <section aria-label="SIMULATED"><h2 className="text-xl font-semibold">SIMULATED</h2><p>{SIMULATED.label} · Cannot acknowledge, approve or close · Outbound calls {SIMULATED.outboundCalls}</p></section>
 {message&&<p role="alert">{message}</p>}
 </main>;
}
export const Route=createFileRoute('/final-review-handoff')({staticData:{sitemap:false},head:()=>({meta:[{title:'Final Review Handoff and Audit Archive — iCareTele'},{name:'description',content:'Private immutable redacted human review handoff archive without release authority.'},{property:'og:title',content:'Final Review Handoff and Audit Archive — iCareTele'},{property:'og:description',content:'Independent receipt history and immutable evidence version changes. Production readiness is not claimed.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'},{name:'robots',content:'noindex, nofollow'}]}),component:ReviewHandoff});
