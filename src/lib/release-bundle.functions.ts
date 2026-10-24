import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { captureSchema, confirmSchema, consoleSchema } from './release-bundle';
const fail=(message:string)=>new Error(['MFA','STALE_VERSION','SECOND_REVIEWER_REQUIRED','RELEASE_SCOPE_REQUIRED','INVALID_ARGUMENTS'].find(m=>message.includes(m))??'BUNDLE_ACTION_DENIED');
export const readReleaseBundle=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const {data,error}=await context.supabase.rpc('release_bundle_console');if(error)throw fail(error.message);return consoleSchema.parse(data);
});
export const captureReleaseArtifact=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>captureSchema.parse(v)).handler(async({data:d,context})=>{
 const {error}=await context.supabase.rpc('release_bundle_capture',{_register:d.register,_version:d.version});if(error)throw fail(error.message);return {recorded:true};
});
export const confirmReleaseArtifact=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>confirmSchema.parse(v)).handler(async({data:d,context})=>{
 const {error}=await context.supabase.rpc('release_bundle_confirm',{_id:d.id,_outcome:d.outcome});if(error)throw fail(error.message);return {recorded:true};
});
