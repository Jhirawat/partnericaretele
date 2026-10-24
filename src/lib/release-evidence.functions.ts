import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {z} from 'zod';
import {containsSensitive} from './release-readiness';
import {evidenceStatuses,evidenceTypes,REFERENCE_PATTERN,unsafeText,type EvidenceEntry} from './release-evidence';
export const readEvidence=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {data,error}=await context.supabase.rpc('release_evidence_console' as never);if(error)throw new Error('RELEASE_ACCESS_DENIED');
  if(containsSensitive(data))throw new Error('REDACTION_FAILED');return data as unknown as EvidenceEntry[];
});
const safe=(min:number,max:number)=>z.string().trim().min(min).max(max).refine(v=>!unsafeText(v),'REDACTED_CONTENT_REQUIRED');
export const evidenceCommand=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>z.object({key:z.uuid(),args:z.object({
  item_key:z.string().regex(/^[a-z_]{3,40}$/),lineage:z.uuid().optional(),evidence_type:z.enum(evidenceTypes),reference_label:safe(3,120).regex(REFERENCE_PATTERN),
  next_action:safe(3,300),status:z.enum(evidenceStatuses),blocked_reason:safe(3,300).optional(),review_due:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict().refine(a=>!['blocked','unverified'].includes(a.status)||!!a.blocked_reason,'BLOCKED_REASON_REQUIRED')}).parse(v)).handler(async({data,context})=>{
  const {data:r,error}=await context.supabase.rpc('release_evidence_command' as never,{_args:data.args,_key:data.key} as never);
  if(error){const known=['EVIDENCE_NOT_FOUND','IDEMPOTENCY_CONFLICT','MFA','INVALID_ARGUMENTS','RELEASE_SCOPE_REQUIRED'].find(k=>error.message.includes(k));throw new Error(known??'RELEASE_ACTION_DENIED');}
  return r as unknown as {id:string;lineage:string;version:number;correlation_id:string};
});
