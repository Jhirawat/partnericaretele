import {useMemo,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {toast} from 'sonner';
import {evidenceCommand,readEvidence} from '@/lib/release-evidence.functions';
import {CHECKLIST_KEYS,HANDOFF_TEMPLATES,evidenceStatuses,evidenceTypes,groupHandoff,handoffMarkdown,handoffSummary,unsafeText,type EvidenceEntry,type EvidenceStatus,type EvidenceType,type HandoffGroup} from '@/lib/release-evidence';
import type {ReleaseItem} from '@/lib/release-readiness';
import {useIntakeCopy} from '@/lib/partner-intake.copy';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from './ui/select';
const GROUPS:[HandoffGroup,string,string][]=[['passed','ผ่าน','Passed'],['pending','รอดำเนินการ','Pending'],['blocked','ถูกบล็อก','Blocked'],['unverified','ยังไม่ยืนยัน','Unverified']];
function download(text:string){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/markdown'}));a.download='release-evidence-handoff.md';a.click();URL.revokeObjectURL(a.href);}
/** Handoff report; works offline (items=null) where every item is reported unverified. */
export function HandoffReport({items,evidence,source}:{items:ReleaseItem[]|null;evidence:EvidenceEntry[];source:'signed_in'|'offline'}){
  const c=useIntakeCopy();const rows=useMemo(()=>groupHandoff(items,evidence),[items,evidence]);const s=handoffSummary(rows);
  return <section className="space-y-4" aria-label="handoff">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-lg font-semibold">{c('รายงานส่งต่อหลักฐาน','Evidence handoff report')}</h2><Button size="sm" variant="outline" disabled={source !== "signed_in"} onClick={()=>{if(source !== "signed_in")return;download(handoffMarkdown(rows,new Date().toISOString(),source));}}>{c('ส่งออกรายงาน (ปกปิดข้อมูล)','Export redacted report')}</Button></div>
    <p className="rounded-md border border-warning/35 bg-warning/15 px-3 py-2 text-sm text-warning-foreground">{c('ยังไม่ยืนยันความพร้อมเผยแพร่ — รายงานนี้บันทึกหลักฐานเท่านั้น','Release readiness is not claimed — this report records evidence only')}</p>
    <div className="grid gap-3 md:grid-cols-2">{GROUPS.map(([g,th,en])=><div key={g} className="rounded-lg border border-border bg-card p-3"><p className="font-medium">{c(th,en)} ({s[g].length})</p><ul className="mt-2 space-y-1 text-xs text-muted-foreground">{rows.filter(r=>r.group===g).map(r=><li key={r.key}><span className="font-mono">{r.key}</span> · {c('อัตโนมัติ','auto')} {r.evidence.automated} · {c('production ด้วยมือ','manual prod')} {r.evidence.manual_production}{r.manualRequired?' *':''} · {r.reason}</li>)}</ul></div>)}</div>
    <p className="text-xs text-muted-foreground">* {c('ต้องมีหลักฐานจาก production ที่ตรวจด้วยมือ','manual production evidence required')}</p>
  </section>;
}
export function HandoffTemplates(){const c=useIntakeCopy();return <section className="space-y-3"><h2 className="font-display text-lg font-semibold">{c('แม่แบบการส่งต่อ','Handoff templates')}</h2><div className="grid gap-3 md:grid-cols-2">{HANDOFF_TEMPLATES.map(t=><div key={t.id} className="rounded-lg border border-border bg-card p-4 text-sm"><p className="font-medium">{t.title}</p><p className="text-xs text-muted-foreground">{c('ผู้รับผิดชอบ','Owner')}: {t.owner}</p><ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">{t.steps.map(x=><li key={x}>{x}</li>)}</ol></div>)}</div></section>;}
export function EvidenceRegistry({items}:{items:ReleaseItem[]}){
  const c=useIntakeCopy();const qc=useQueryClient();const read=useServerFn(readEvidence);const cmd=useServerFn(evidenceCommand);
  const {data:evidence=[],error}=useQuery({queryKey:['release-evidence'],queryFn:()=>read()});
  const [f,setF]=useState({item_key:CHECKLIST_KEYS[0] as string,lineage:'',evidence_type:'manual_production' as EvidenceType,status:'unverified' as EvidenceStatus,reference_label:'',next_action:'',blocked_reason:'',review_due:''});
  const set=(k:keyof typeof f)=>(v:string)=>setF(p=>({...p,[k]:v}));
  const needReason=f.status==='blocked'||f.status==='unverified';
  const unsafe=[f.reference_label,f.next_action,f.blocked_reason].some(unsafeText);
  const ok=!unsafe&&f.reference_label.trim().length>=3&&f.next_action.trim().length>=3&&(!needReason||f.blocked_reason.trim().length>=3);
  async function save(){try{const r=await cmd({data:{key:crypto.randomUUID(),args:{item_key:f.item_key,evidence_type:f.evidence_type,status:f.status,reference_label:f.reference_label.trim(),next_action:f.next_action.trim(),...(f.lineage?{lineage:f.lineage}:{}),...(f.blocked_reason.trim()?{blocked_reason:f.blocked_reason.trim()}:{}),...(f.review_due?{review_due:f.review_due}:{})}}});toast.success(`v${r.version} · ${r.correlation_id}`);setF(p=>({...p,lineage:'',reference_label:'',next_action:'',blocked_reason:''}));void qc.invalidateQueries({queryKey:['release-evidence']});}catch(e){toast.error((e as Error).message);}}
  const lineages=evidence.filter(e=>e.latest&&e.item_key===f.item_key);
  return <div className="space-y-8">
    <section className="space-y-3 rounded-lg border border-border bg-card p-4"><h2 className="font-display text-lg font-semibold">{c('ทะเบียนหลักฐาน (เพิ่มได้อย่างเดียว)','Evidence registry (append-only)')}</h2>
      <p className="text-xs text-muted-foreground">{c('ใช้ป้ายอ้างอิงเท่านั้น ห้ามใส่ลิงก์ อีเมล รหัส เนื้อหาใบรับรองหรือข้อมูลส่วนบุคคล','Labels only — no links, emails, IDs, keys, certificate contents or personal data')}</p>
      {error&&<p className="text-sm text-destructive">{(error as Error).message}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={f.item_key} onValueChange={v=>setF(p=>({...p,item_key:v,lineage:''}))}><SelectTrigger aria-label={c('รายการ','Checklist item')}><SelectValue/></SelectTrigger><SelectContent>{CHECKLIST_KEYS.map(k=><SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent></Select>
        <Select value={f.lineage||'new'} onValueChange={v=>set('lineage')(v==='new'?'':v)}><SelectTrigger aria-label={c('เวอร์ชัน','Version of')}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="new">{c('หลักฐานใหม่','New evidence')}</SelectItem>{lineages.map(e=><SelectItem key={e.lineage} value={e.lineage}>{c('เวอร์ชันใหม่ของ','New version of')} {e.reference_label} (v{e.version})</SelectItem>)}</SelectContent></Select>
        <Select value={f.evidence_type} onValueChange={set('evidence_type')}><SelectTrigger aria-label={c('ประเภท','Evidence type')}><SelectValue/></SelectTrigger><SelectContent>{evidenceTypes.map(k=><SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent></Select>
        <Select value={f.status} onValueChange={set('status')}><SelectTrigger aria-label={c('สถานะ','Status')}><SelectValue/></SelectTrigger><SelectContent>{evidenceStatuses.map(k=><SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent></Select>
        <Input aria-label={c('ป้ายอ้างอิง','Reference label')} placeholder="LIVE-RLS-2026-10-20" value={f.reference_label} onChange={e=>set('reference_label')(e.target.value)} maxLength={120}/>
        <Input aria-label={c('วันที่ทบทวน/หมดอายุ','Review / expiry date')} type="date" value={f.review_due} onChange={e=>set('review_due')(e.target.value)}/>
        <Input className="sm:col-span-2" aria-label={c('ขั้นตอนถัดไป','Next action')} placeholder={c('ขั้นตอนถัดไป','Next action')} value={f.next_action} onChange={e=>set('next_action')(e.target.value)} maxLength={300}/>
        <Input className="sm:col-span-2" aria-label={c('เหตุผลที่ถูกบล็อก/ยังไม่ยืนยัน','Blocked / unverified reason')} placeholder={c('เหตุผลที่ถูกบล็อก/ยังไม่ยืนยัน','Blocked / unverified reason')} value={f.blocked_reason} onChange={e=>set('blocked_reason')(e.target.value)} maxLength={300}/>
      </div>
      {unsafe&&<p className="text-xs text-destructive">{c('พบข้อมูลที่ต้องปกปิด','Contains content that must be redacted')}</p>}
      <Button size="sm" disabled={!ok} onClick={save}>{c('เพิ่มหลักฐาน','Append evidence')}</Button>
      <ul className="space-y-1 text-xs text-muted-foreground">{evidence.map(e=><li key={e.id} className={e.latest?'':'opacity-60'}><span className="font-mono">{e.item_key}</span> · {e.reference_label} v{e.version} · {e.evidence_type} · {e.status}{e.blocked_reason?` · ${e.blocked_reason}`:''} · {c('ถัดไป','next')}: {e.next_action}{e.review_due?` · ${c('ทบทวน','review')} ${e.review_due}`:''} · {new Date(e.created_at).toLocaleString()} · {e.correlation_id}</li>)}</ul>
    </section>
    <HandoffReport items={items} evidence={evidence} source="signed_in"/>
    <HandoffTemplates/>
  </div>;
}
