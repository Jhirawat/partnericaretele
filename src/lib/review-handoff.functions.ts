import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { archiveSchema, commandSchema } from './review-handoff';
const codes=['MFA','RELEASE_SCOPE_REQUIRED','INVALID_ARGUMENTS','STALE_VERSION','SELF_HANDOFF','ROLE_SEPARATION','DUPLICATE_HANDOFF','DUPLICATE_ACKNOWLEDGEMENT','HANDOFF_TERMINAL','SHARE_REQUIRED'];
const fail=(s:string)=>new Error(codes.find(c=>s.includes(c))??'ARCHIVE_ACCESS_DENIED');
export const readReviewHandoff=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{const {data,error}=await context.supabase.rpc('review_handoff_console');if(error)throw fail(error.message);return archiveSchema.parse(data);});
// PostgreSQL accepts null for _root on creation; generated RPC types omit argument nullability.
export const recordReviewHandoff=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>commandSchema.parse(v)).handler(async({data:d,context})=>{const {error}=await context.supabase.rpc('review_handoff_command',{_packet:d.packet_version,_source:d.source_version,_root:d.root_id as unknown as string,_type:d.handoff_type,_recipient:d.recipient_role,_reason:d.reason});if(error)throw fail(error.message);return {recorded:true};});
