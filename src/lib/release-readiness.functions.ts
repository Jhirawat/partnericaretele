import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {z} from 'zod';
import {containsSensitive,blockedSignedIn,releaseStatuses,type ReleaseData,type SmokeCheck} from './release-readiness';
import {disabledOutboxWorker} from './notification-outbox.types';
export const readRelease=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {data,error}=await context.supabase.rpc('release_console');if(error)throw new Error('RELEASE_ACCESS_DENIED');
  if(containsSensitive(data))throw new Error('REDACTION_FAILED');return data as unknown as ReleaseData;
});
export const readBanner=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {data,error}=await context.supabase.rpc('release_banner');if(error)return null;return data as unknown as {message:string;since:string}|null;
});
export const runReleaseSmoke=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {data,error}=await context.supabase.rpc('release_smoke');if(error)throw new Error('RELEASE_ACCESS_DENIED');
  const checks=[...(data as unknown as SmokeCheck[])];
  const {getMcsConfig}=await import('./mcs/adapter.server');
  checks.push({check:'mcs_adapter_mock',status:getMcsConfig().mode==='MOCK'?'passed':'failed'});
  const w=disabledOutboxWorker();checks.push({check:'outbox_provider_disabled',status:!w.enabled&&w.sent===0?'passed':'failed'});
  const {dispatchQueuedNotifications}=await import('./notifications.server');
  // A client that throws on any access proves the dispatcher never touches records or networks.
  const trap=new Proxy({},{get(){throw new Error('touched')}}) as never;
  const d=await dispatchQueuedNotifications(trap).catch(()=>null);checks.push({check:'no_external_dispatch',status:d&&d.disabled&&d.sent===0?'passed':'failed'});
  const cons=await context.supabase.rpc('release_console');checks.push({check:'privacy_redaction',status:!cons.error&&!containsSensitive(cons.data)&&!containsSensitive(data)?'passed':'failed'});
  checks.push(...blockedSignedIn(false));
  return {checks,ranAt:new Date().toISOString()};
});
export const releaseCommand=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>z.discriminatedUnion('op',[
  z.object({op:z.literal('signoff'),key:z.uuid(),args:z.object({item_key:z.string().regex(/^[a-z_]{3,40}$/),status:z.enum(releaseStatuses),evidence_reference:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_:/.#-]{2,119}$/),reason:z.string().trim().min(3).max(500)}).strict()}),
  z.object({op:z.enum(['approve','reject']),key:z.uuid(),args:z.object({signoff_id:z.uuid(),reason:z.string().trim().min(3).max(500)}).strict()}),
  z.object({op:z.literal('banner'),key:z.uuid(),args:z.object({active:z.boolean(),message:z.string().trim().min(3).max(200),reason:z.string().trim().min(3).max(500)}).strict()}),
]).parse(v)).handler(async({data,context})=>{
  const {data:r,error}=await context.supabase.rpc('release_command',{_op:data.op,_args:data.args,_key:data.key});
  if(error){const known=['INDEPENDENT_APPROVAL_REQUIRED','APPROVAL_NOT_APPLICABLE','SUPERSEDED_SIGNOFF','ALREADY_DECIDED','MFA','INVALID_ARGUMENTS'].find(k=>error.message.includes(k));throw new Error(known??'RELEASE_ACTION_DENIED');}
  return r as unknown as {id:string;correlation_id:string;effective?:string};
});
