// Browser-safe evidence registry types, redaction, grouping and handoff templates. No network, no secrets.
import type {ReleaseItem} from './release-readiness';
export const evidenceStatuses=['passed','pending','blocked','unverified'] as const;
export type EvidenceStatus=typeof evidenceStatuses[number];
export const evidenceTypes=['automated','manual_production'] as const;
export type EvidenceType=typeof evidenceTypes[number];
export interface EvidenceEntry{id:string;lineage:string;version:number;item_key:string;evidence_type:EvidenceType;reference_label:string;owner_role:string;next_action:string;status:EvidenceStatus;blocked_reason:string|null;review_due:string|null;correlation_id:string;created_at:string;mine:boolean;latest:boolean}
/** Same rule set as public.release_unsafe_text: emails, URLs, keys, tokens, PEM, long digit runs. */
const UNSAFE=/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|https?:\/\/|sb_secret_|sb_publishable_|service_role|eyJ[A-Za-z0-9_-]{10,}|-----BEGIN|password|passwd|secret|token|[0-9]{9,}|[0-9][0-9 -]{11,}[0-9]/i;
export function unsafeText(t:string){return UNSAFE.test(t);}
export const REFERENCE_PATTERN=/^[A-Za-z0-9][A-Za-z0-9 _:/.#-]{2,119}$/;
/** Canonical order of the 15 checklist items (matches release_checklist_items.position). */
export const CHECKLIST_KEYS=['migration_state','rls_storage','role_scope','screening_config','doctor_assignment','credit_invariants','mcs_handoff','certificate_privacy','notification_disabled','sla_controls','privacy_retention','reconciliation_close','audit_integrity','backup_restore','preview_smoke'] as const;
/** Items that can only be closed with evidence gathered on the live production environment by a person. */
export const MANUAL_PRODUCTION_KEYS=new Set(['migration_state','rls_storage','backup_restore','role_scope','preview_smoke']);
export type HandoffGroup='passed'|'pending'|'blocked'|'unverified';
export interface HandoffRow{key:string;group:HandoffGroup;signoff:string;evidence:{automated:number;manual_production:number};latestEvidence:null|Pick<EvidenceEntry,'reference_label'|'evidence_type'|'status'|'next_action'|'blocked_reason'|'review_due'|'correlation_id'|'version'>;reason:string;manualRequired:boolean}
/**
 * Group honestly: only an effective passed/waived sign-off counts as passed. Evidence alone never passes an item.
 * failed/blocked sign-off or blocked latest evidence => blocked; no sign-off and no current evidence => unverified.
 */
export function groupHandoff(items:Pick<ReleaseItem,'key'|'latest'>[]|null,evidence:EvidenceEntry[],today=new Date().toISOString().slice(0,10)):HandoffRow[]{
  const byKey=new Map((items??[]).map(i=>[i.key,i]));
  return CHECKLIST_KEYS.map(key=>{
    const eff=byKey.get(key)?.latest?.effective??null;
    const ev=evidence.filter(e=>e.item_key===key&&e.latest);
    const current=ev.filter(e=>!e.review_due||e.review_due>=today);
    const last=[...ev].sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]??null;
    const manualRequired=MANUAL_PRODUCTION_KEYS.has(key);
    const hasManual=current.some(e=>e.evidence_type==='manual_production'&&e.status==='passed');
    let group:HandoffGroup;let reason:string;
    if(eff==='failed'||eff==='blocked'){group='blocked';reason=`signoff_${eff}`;}
    else if(ev.some(e=>e.status==='blocked')){group='blocked';reason='evidence_blocked';}
    else if((eff==='passed'||eff==='waived')&&(!manualRequired||hasManual||eff==='waived')){group='passed';reason=`signoff_${eff}`;}
    else if(eff==='passed'){group='pending';reason='manual_production_evidence_missing';}
    else if(!eff&&current.length===0){group='unverified';reason=ev.length?'evidence_expired':(items?'no_signoff_no_evidence':'signed_in_access_unavailable');}
    else {group='pending';reason=eff?'awaiting_second_approval_or_signoff':'evidence_without_signoff';}
    return {key,group,signoff:eff??'none',evidence:{automated:current.filter(e=>e.evidence_type==='automated').length,manual_production:current.filter(e=>e.evidence_type==='manual_production').length},latestEvidence:last&&{reference_label:last.reference_label,evidence_type:last.evidence_type,status:last.status,next_action:last.next_action,blocked_reason:last.blocked_reason,review_due:last.review_due,correlation_id:last.correlation_id,version:last.version},reason,manualRequired};
  });
}
export function handoffSummary(rows:HandoffRow[]){const g=(k:HandoffGroup)=>rows.filter(r=>r.group===k).map(r=>r.key);return {passed:g('passed'),pending:g('pending'),blocked:g('blocked'),unverified:g('unverified'),releaseReady:false as const};}
export const HANDOFF_TEMPLATES=[
  {id:'superadmin_signoff',title:'Global Superadmin sign-off',owner:'SUPER_ADMIN',steps:['Sign in to the preview as a global (no organization) Superadmin with MFA','Open Release readiness and run the read-only smoke checks','For each checklist item record a new sign-off version with an evidence reference label (no links, emails or IDs)','Record any failure honestly as failed or blocked with the reason']},
  {id:'second_admin_approval',title:'Second-admin approval',owner:'SUPER_ADMIN or OPERATIONS_ADMIN (a different person)',steps:['Sign in as a different global admin with MFA','Review each sensitive sign-off and its evidence entries','Approve or reject with a reason; self-approval is refused by the database','Do not approve items whose evidence is pending, blocked or expired']},
  {id:'live_db_verification',title:'Live migration / RLS / storage verification',owner:'SUPER_ADMIN',steps:['Compare the applied migration list in the backend with the repository list','Confirm row-level security is enabled on every public table and storage buckets are private','Record a manual_production evidence entry with a label such as LIVE-RLS-2026-10-20','If anything differs, record status blocked with the reason; never edit history']},
  {id:'backup_restore',title:'Backup / restore evidence',owner:'SUPER_ADMIN',steps:['Confirm a recent backup exists for the production backend','Perform a restore drill on a non-production copy only','Record a manual_production evidence entry with the drill label and review date','Do not paste backup contents, connection strings or personal data']},
] as const;
/** Redacted plain-text export. Always states that release readiness is not claimed. */
export function handoffMarkdown(rows:HandoffRow[],generatedAt:string,source:'signed_in'|'offline'){
  const s=handoffSummary(rows);const line=(r:HandoffRow)=>`- ${r.key} — sign-off: ${r.signoff}; automated evidence: ${r.evidence.automated}; manual production evidence: ${r.evidence.manual_production}${r.manualRequired?' (manual production evidence required)':''}; reason: ${r.reason}${r.latestEvidence?`; latest: ${r.latestEvidence.reference_label} v${r.latestEvidence.version} [${r.latestEvidence.status}] next: ${r.latestEvidence.next_action}${r.latestEvidence.blocked_reason?` blocked: ${r.latestEvidence.blocked_reason}`:''} ref ${r.latestEvidence.correlation_id}`:''}`;
  const sec=(t:string,k:HandoffGroup)=>[`## ${t} (${s[k].length})`,...rows.filter(r=>r.group===k).map(line),''];
  const out=[`# Release evidence handoff`,`Generated: ${generatedAt} · Source: ${source}`,`Release readiness: NOT CLAIMED. This report records evidence only; it does not approve or publish anything.`,'',...sec('Passed','passed'),...sec('Pending','pending'),...sec('Blocked','blocked'),...sec('Unverified','unverified'),'## Templates',...HANDOFF_TEMPLATES.flatMap(t=>[`### ${t.title} (owner: ${t.owner})`,...t.steps.map((x,i)=>`${i+1}. ${x}`),''])].join('\n');
  if(unsafeText(out.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,'').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g,'')))throw new Error('REDACTION_FAILED');
  return out;
}
