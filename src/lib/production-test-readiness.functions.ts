import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { entriesSchema, recordSchema } from './production-test-readiness';
const messages = ['SECOND_REVIEWER_REQUIRED','LATEST_VERSION_REQUIRED','AVAILABILITY_NOT_ATTESTED','REVIEW_DATE_EXPIRED','MFA'];
function fail(message: string) { return new Error(messages.find(m=>message.includes(m)) ?? 'PREREQUISITE_ACCESS_DENIED'); }
export const readTestPrerequisites = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async ({context})=>{
 const {data,error} = await context.supabase.rpc('test_prerequisite_console');
 if(error) throw fail(error.message);
 return entriesSchema.parse(data);
});
export const recordTestPrerequisite = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>recordSchema.parse(v)).handler(async ({data:d,context})=>{
 const {error} = await context.supabase.rpc('test_prerequisite_record',{_key:d.key,_status:d.status,_evidence:d.evidence,_due:d.due});
 if(error) throw fail(error.message);
 return {recorded:true};
});
export const confirmTestPrerequisite = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>z.object({id:z.uuid(),outcome:z.enum(['confirmed','rejected'])}).strict().parse(v)).handler(async ({data:d,context})=>{
 const {error} = await context.supabase.rpc('test_prerequisite_confirm',{_id:d.id,_outcome:d.outcome});
 if(error) throw fail(error.message);
 return {recorded:true};
});
