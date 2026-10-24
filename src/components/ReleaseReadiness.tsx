import {useState} from 'react';
import {queryOptions,useQuery,useQueryClient,useSuspenseQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {toast} from 'sonner';
import {readBanner,readRelease,releaseCommand,runReleaseSmoke} from '@/lib/release-readiness.functions';
import {PUBLIC_ROUTES,readiness,releaseStatuses,routeCheck,type ReleaseItem,type ReleaseStatus,type SmokeCheck} from '@/lib/release-readiness';
import {useIntakeCopy} from '@/lib/partner-intake.copy';
import {PageHeader} from './PageHeader';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from './ui/select';
import {cn} from '@/lib/utils';
import {EvidenceRegistry} from './ReleaseEvidence';
export const releaseOptions=queryOptions({queryKey:['release-readiness'],queryFn:()=>readRelease()});
const TONE:Record<string,string>={passed:'bg-success/12 text-success border-success/25',waived:'bg-info/12 text-info border-info/25',pending:'bg-warning/15 text-warning-foreground border-warning/35',failed:'bg-destructive/10 text-destructive border-destructive/25',blocked:'bg-destructive/10 text-destructive border-destructive/25',unverified:'bg-muted text-muted-foreground border-border'};
function Pill({v}:{v:string}){return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',TONE[v]??TONE['unverified'])}>{v}</span>;}
const LABELS:Record<string,[string,string]>={migration_state:['สถานะ migration ฐานข้อมูล','Database migration state'],rls_storage:['RLS และนโยบาย storage','RLS / storage policy status'],role_scope:['การตรวจบทบาทและขอบเขต','Role / scope checks'],screening_config:['อนุมัติการตั้งค่าคัดกรอง','Screening configuration approval'],doctor_assignment:['กฎการมอบหมายแพทย์','Doctor assignment rules'],credit_invariants:['เงื่อนไขคงที่ของการปรึกษาและเครดิต','Consultation / credit invariants'],mcs_handoff:['ความปลอดภัยการส่งต่อ MCS','MCS handoff safety'],certificate_privacy:['ความเป็นส่วนตัวและการตรวจใบรับรอง','Certificate privacy / review'],notification_disabled:['ปิดการส่งแจ้งเตือนภายนอก','Notification delivery disabled'],sla_controls:['การควบคุม SLA','SLA controls'],privacy_retention:['ความเป็นส่วนตัวและการเก็บรักษา','Privacy / retention controls'],reconciliation_close:['สถานะปิดงวดกระทบยอด','Reconciliation close status'],audit_integrity:['ความถูกต้องของบันทึกตรวจสอบ','Audit integrity'],backup_restore:['หลักฐานสำรองและกู้คืน','Backup / restore evidence'],preview_smoke:['ตรวจ preview เบื้องต้น','Preview smoke checks']};
export function ReleaseBanner(){const fn=useServerFn(readBanner);const {data}=useQuery({queryKey:['release-banner'],queryFn:()=>fn(),staleTime:60_000});if(!data)return null;return <div role="status" className="border-b border-warning/35 bg-warning/15 px-6 py-2 text-sm text-warning-foreground">{data.message}</div>;}
function Item({item,onDone}:{item:ReleaseItem;onDone:()=>void}){
  const c=useIntakeCopy();const cmd=useServerFn(releaseCommand);const [status,setStatus]=useState<ReleaseStatus>('pending');const [evidence,setEvidence]=useState('');const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);
  const run=async(input:Parameters<typeof cmd>[0])=>{setBusy(true);try{const r=await cmd(input);toast.success(c('บันทึกแล้ว','Recorded')+` · ${r.correlation_id}`);setReason('');onDone();}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}};
  const l=item.latest;const label=LABELS[item.key]??[item.key,item.key];
  const canDecide=item.sensitive&&l&&['passed','waived'].includes(l.status)&&!l.approval&&!l.mine;
  return <li className="space-y-3 rounded-lg border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{c(label[0],label[1])}</p><p className="text-xs text-muted-foreground">{item.category} · {c('ผู้รับผิดชอบ','Owner')}: {item.owner_role}{item.sensitive?` · ${c('ต้องอนุมัติสองขั้น','Two-step approval')}`:''}</p></div><Pill v={l?.effective??'pending'}/></div>
    {l&&<dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2"><div>v{l.version} · {c('บันทึก','Recorded')}: {l.status}</div><div>{new Date(l.created_at).toLocaleString()}</div><div>{c('หลักฐาน','Evidence')}: {l.evidence_reference}</div><div className="break-all">{c('รหัสอ้างอิง','Correlation')}: {l.correlation_id}</div><div className="sm:col-span-2">{c('เหตุผล','Reason')}: {l.reason}</div>{l.approval&&<div className="sm:col-span-2">{c('การอนุมัติ','Approval')}: {l.approval.decision} — {l.approval.reason} · {l.approval.correlation_id}</div>}{l.mine&&item.sensitive&&!l.approval&&<div className="sm:col-span-2">{c('ต้องให้ผู้ดูแลอีกคนอนุมัติ','Needs a different reviewer to approve')}</div>}</dl>}
    <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
      <Select value={status} onValueChange={v=>setStatus(v as ReleaseStatus)}><SelectTrigger aria-label={c('สถานะ','Status')}><SelectValue/></SelectTrigger><SelectContent>{releaseStatuses.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
      <Input aria-label={c('อ้างอิงหลักฐาน','Evidence reference')} placeholder="EVID-2026-10-RLS" value={evidence} onChange={e=>setEvidence(e.target.value)}/>
    </div>
    <Textarea aria-label={c('เหตุผล','Reason')} value={reason} onChange={e=>setReason(e.target.value)} rows={2}/>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={busy||reason.trim().length<3||evidence.length<3} onClick={()=>run({data:{op:'signoff',key:crypto.randomUUID(),args:{item_key:item.key,status,evidence_reference:evidence,reason}}})}>{c('บันทึกเวอร์ชันใหม่','Record new version')}</Button>
      {canDecide&&<><Button size="sm" variant="secondary" disabled={busy||reason.trim().length<3} onClick={()=>run({data:{op:'approve',key:crypto.randomUUID(),args:{signoff_id:l.id,reason}}})}>{c('อนุมัติ (ขั้นที่ 2)','Approve (step 2)')}</Button><Button size="sm" variant="outline" disabled={busy||reason.trim().length<3} onClick={()=>run({data:{op:'reject',key:crypto.randomUUID(),args:{signoff_id:l.id,reason}}})}>{c('ปฏิเสธ','Reject')}</Button></>}
    </div>
  </li>;
}
export function ReleaseWorkspace(){
  const c=useIntakeCopy();const qc=useQueryClient();const {data}=useSuspenseQuery(releaseOptions);const smoke=useServerFn(runReleaseSmoke);const cmd=useServerFn(releaseCommand);
  const [checks,setChecks]=useState<SmokeCheck[]>([]);const [ranAt,setRanAt]=useState('');const [running,setRunning]=useState(false);const [msg,setMsg]=useState('');const [why,setWhy]=useState('');
  const refresh=()=>{void qc.invalidateQueries({queryKey:['release-readiness']});void qc.invalidateQueries({queryKey:['release-banner']});};
  async function runSmoke(){setRunning(true);try{const routes=await Promise.all(PUBLIC_ROUTES.map(async p=>{try{const r=await fetch(p,{method:'GET',credentials:'omit',redirect:'manual'});return routeCheck(p,r.status||200);}catch{return routeCheck(p,0);}}));const r=await smoke();setChecks([...r.checks,...routes,{check:'signed_out_redirect',status:'unverified',note:'verified_by_preview_harness_only'}]);setRanAt(r.ranAt);}catch(e){toast.error((e as Error).message);}finally{setRunning(false);}}
  async function banner(active:boolean){try{await cmd({data:{op:'banner',key:crypto.randomUUID(),args:{active,message:active?msg:(msg||'Maintenance complete'),reason:why}}});setWhy('');refresh();}catch(e){toast.error((e as Error).message);}}
  const r=readiness(data.items,checks);
  return <div className="space-y-8">
    <PageHeader title={c('ความพร้อมก่อนเผยแพร่','Release readiness')} subtitle={c('ไม่มีการเผยแพร่หรือเชื่อมต่อระบบภายนอกจากหน้านี้','Nothing is published or connected from this page')}/>
    <section aria-label="summary" className="rounded-lg border border-border bg-card p-4 text-sm"><p className="font-medium">{r.ready?c('พร้อมเผยแพร่','Ready'):c('ยังไม่พร้อมเผยแพร่','Not ready for release')}</p><p className="text-muted-foreground">{c('รายการค้าง','Open items')}: {r.open.length} · {c('ตรวจไม่ผ่าน','Failed checks')}: {r.failed.length} · {c('ถูกบล็อก/ยังไม่ยืนยัน','Blocked / unverified')}: {checks.length?r.blocked.length:c('ยังไม่ได้รัน','not run')}</p></section>
    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-lg font-semibold">{c('ตรวจสอบเบื้องต้น (อ่านอย่างเดียว)','Smoke checks (read-only)')}</h2><Button onClick={runSmoke} disabled={running}>{running?c('กำลังตรวจ…','Running…'):c('รันการตรวจ','Run checks')}</Button></div>
      {ranAt&&<p className="text-xs text-muted-foreground">{new Date(ranAt).toLocaleString()}</p>}
      <ul className="grid gap-2 sm:grid-cols-2">{checks.map(k=><li key={k.check} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"><span>{k.check}{k.note?` · ${k.note}`:''}{typeof k.count==='number'?` · ${k.count}`:''}</span><Pill v={k.status}/></li>)}</ul>
    </section>
    <section className="space-y-3"><h2 className="font-display text-lg font-semibold">{c('รายการตรวจสอบและการลงนาม','Checklist & sign-offs')}</h2><ul className="space-y-3">{data.items.map(i=><Item key={i.key} item={i} onDone={refresh}/>)}</ul></section>
    <EvidenceRegistry items={data.items}/>
    <section className="space-y-3 rounded-lg border border-border bg-card p-4"><h2 className="font-display text-lg font-semibold">{c('แบนเนอร์ปิดปรับปรุง','Maintenance banner')}</h2><p className="text-sm text-muted-foreground">{data.banner?.active?`${c('แสดงอยู่','Showing')}: ${data.banner.message}`:c('ไม่แสดง','Off')}</p><Input aria-label={c('ข้อความ','Message')} value={msg} onChange={e=>setMsg(e.target.value)} maxLength={200}/><Input aria-label={c('เหตุผล','Reason')} placeholder={c('เหตุผล','Reason')} value={why} onChange={e=>setWhy(e.target.value)}/><div className="flex gap-2"><Button size="sm" disabled={msg.trim().length<3||why.trim().length<3} onClick={()=>banner(true)}>{c('เปิดแบนเนอร์','Show banner')}</Button><Button size="sm" variant="outline" disabled={why.trim().length<3} onClick={()=>banner(false)}>{c('ปิดแบนเนอร์','Hide banner')}</Button></div></section>
    <section className="space-y-2 rounded-lg border border-border bg-card p-4 text-sm"><h2 className="font-display text-lg font-semibold">{c('คู่มือเหตุขัดข้องและการย้อนกลับ','Incident & rollback runbook')}</h2><ol className="list-decimal space-y-1 pl-5 text-muted-foreground"><li>{c('เปิดแบนเนอร์ปิดปรับปรุงและบันทึกเหตุผล','Turn on the maintenance banner with a reason')}</li><li>{c('ย้อนโค้ดด้วยประวัติเวอร์ชัน — ห้าม reset หรือลบ migration','Roll back code via version history — never reset or delete migrations')}</li><li>{c('แก้ฐานข้อมูลด้วย migration เพิ่มเติมหรือรายการชดเชยเท่านั้น','Fix data only with additive migrations or compensating entries')}</li><li>{c('รันการตรวจอีกครั้งและลงนามเวอร์ชันใหม่','Re-run checks and record a new sign-off version')}</li></ol><p className="text-xs text-muted-foreground">docs/release-runbook.md</p></section>
  </div>;
}
