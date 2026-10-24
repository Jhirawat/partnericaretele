import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { entriesSchema, recordSchema } from './owner-action-queue';
const messages = ['SECOND_REVIEWER_REQUIRED','LATEST_VERSION_REQUIRED','AVAILABILITY_NOT_ATTESTED','REVIEW_DATE_EXPIRED','MFA'];
function fail(message: string) { return new Error(messages.find(m=>message.includes(m)) ?? 'OWNER_ACTION_ACCESS_DENIED'); }
export const readOwnerActions = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async ({context})=>{
 const {data,error} = await context.supabase.rpc('owner_action_console');
 if(error) throw fail(error.message);
 return entriesSchema.parse(data);
});
export const recordOwnerAction = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>recordSchema.parse(v)).handler(async ({data:d,context})=>{
 const {error} = await context.supabase.rpc('owner_action_record',{_key:d.key,_status:d.status,_evidence:d.evidence,_due:d.due});
 if(error) throw fail(error.message);
 return {recorded:true};
});
export const confirmOwnerAction = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>z.object({id:z.uuid(),outcome:z.enum(['confirmed','rejected'])}).strict().parse(v)).handler(async ({data:d,context})=>{
 const {error} = await context.supabase.rpc('owner_action_confirm',{_id:d.id,_outcome:d.outcome});
 if(error) throw fail(error.message);
 return {recorded:true};
});
