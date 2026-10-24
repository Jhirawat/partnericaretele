import {test,expect} from 'bun:test';
import {CHECKLIST_KEYS,groupHandoff,handoffMarkdown,handoffSummary,unsafeText,type EvidenceEntry} from '../src/lib/release-evidence';
import type {ReleaseItem} from '../src/lib/release-readiness';
const it=(key:string,effective:string|null):ReleaseItem=>({key,category:'security',sensitive:true,owner_role:'SUPER_ADMIN',versions:1,latest:effective?{id:'i',version:1,status:'passed',effective:effective as never,evidence_reference:'EV',reason:'r',mine:false,correlation_id:'c',created_at:'',approval:null}:null});
const ev=(item_key:string,o:Partial<EvidenceEntry>={}):EvidenceEntry=>({id:crypto.randomUUID(),lineage:'l',version:1,item_key,evidence_type:'automated',reference_label:'EV-1',owner_role:'SUPER_ADMIN',next_action:'review',status:'passed',blocked_reason:null,review_due:null,correlation_id:crypto.randomUUID(),created_at:'2026-10-20T00:00:00Z',mine:false,latest:true,...o});
test('offline package reports all 15 items unverified and never ready',()=>{const r=groupHandoff(null,[]);expect(r.length).toBe(15);expect(r.every(x=>x.group==='unverified'&&x.reason==='signed_in_access_unavailable')).toBe(true);expect(handoffSummary(r).releaseReady).toBe(false);});
test('evidence alone never passes an item',()=>{const r=groupHandoff([it('audit_integrity',null)],[ev('audit_integrity')]);expect(r.find(x=>x.key==='audit_integrity')!.group).toBe('pending');});
test('passed sign-off on manual item needs manual production evidence',()=>{
  expect(groupHandoff([it('rls_storage','passed')],[ev('rls_storage')]).find(x=>x.key==='rls_storage')!.group).toBe('pending');
  expect(groupHandoff([it('rls_storage','passed')],[ev('rls_storage',{evidence_type:'manual_production'})]).find(x=>x.key==='rls_storage')!.group).toBe('passed');
  expect(groupHandoff([it('sla_controls','passed')],[]).find(x=>x.key==='sla_controls')!.group).toBe('passed');
});
test('blocked and expired evidence are honest',()=>{
  expect(groupHandoff([it('audit_integrity','passed')],[ev('audit_integrity',{status:'blocked',blocked_reason:'x'})]).find(x=>x.key==='audit_integrity')!.group).toBe('blocked');
  expect(groupHandoff([it('audit_integrity','failed')],[]).find(x=>x.key==='audit_integrity')!.group).toBe('blocked');
  const e=groupHandoff([],[ev('sla_controls',{review_due:'2026-01-01'})],'2026-10-20').find(x=>x.key==='sla_controls')!;expect(e.group).toBe('unverified');expect(e.reason).toBe('evidence_expired');
  expect(groupHandoff([],[ev('sla_controls',{latest:false})]).find(x=>x.key==='sla_controls')!.group).toBe('unverified');
});
test('export groups items, separates evidence kinds and never claims readiness',()=>{
  const md=handoffMarkdown(groupHandoff(CHECKLIST_KEYS.map(k=>it(k,'passed')),CHECKLIST_KEYS.map(k=>ev(k,{evidence_type:'manual_production'}))),'2026-10-20T00:00:00.000Z','signed_in');
  expect(md).toContain('## Passed (15)');expect(md).toContain('NOT CLAIMED');expect(md).toContain('manual production evidence: 1');expect(md).toContain('## Unverified (0)');
  expect(()=>handoffMarkdown(groupHandoff([],[ev('sla_controls',{reference_label:'ops@example.com'})]),'t','offline')).toThrow('REDACTION_FAILED');
});
test('redaction rule',()=>{for(const s of ['a@b.co','https://x','sb_secret_x','0812345678','-----BEGIN'])expect(unsafeText(s)).toBe(true);expect(unsafeText('LIVE-RLS-2026-10-20')).toBe(false);});
