import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {z} from 'zod';
import {certificateCommandSchema,certificateDownloadSchema,validateCertificateBytes,MAX_CERTIFICATE_BYTES} from './certificates.schema';

export const certificateCommand=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>certificateCommandSchema.parse(v)).handler(async({data,context})=>{
 const {op,id,key,...args}=data;
 const {data:result,error}=await context.supabase.rpc('certificate_command',{_op:op,_id:id,_key:key,_args:args});
 if(error)throw new Error('CERTIFICATE_ACTION_DENIED');
 return result;
});
export const uploadCertificate=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>{
 if(!(v instanceof FormData))throw new Error('INVALID_UPLOAD');
 const meta=certificateDownloadSchema.parse({id:v.get('id'),key:v.get('key'),reason:v.get('reason')});
 const file=v.get('file');if(!(file instanceof File)||file.size>MAX_CERTIFICATE_BYTES)throw new Error('INVALID_FILE');
 return {...meta,file};
}).handler(async({data,context})=>{
 const bytes=new Uint8Array(await data.file.arrayBuffer());
 validateCertificateBytes(bytes,data.file.type,data.file.size);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const revisionId=data.key;
 const {data:prepared,error}=await context.supabase.rpc('certificate_command',{_op:'PREPARE',_id:data.id,_key:data.key,_args:{reason:data.reason,revisionId,mimeType:data.file.type,sizeBytes:bytes.length,sha256:hash}});
 if(error)throw new Error('CERTIFICATE_UPLOAD_DENIED');
 const p=prepared as {path?:string};if(!p.path)throw new Error('CERTIFICATE_UPLOAD_DENIED');
 // Scope was checked by the JWT-derived command before loading privileged storage access.
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const stored=await supabaseAdmin.storage.from('care-certificates').upload(p.path,bytes,{contentType:data.file.type,upsert:false});
 if(stored.error){
  // Retry only accepts the identical immutable object already stored at this revision path.
  const existing=await supabaseAdmin.storage.from('care-certificates').download(p.path);
  if(existing.error||!existing.data)throw new Error('CERTIFICATE_STORAGE_FAILED');
  const existingHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await existing.data.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(existingHash!==hash)throw new Error('CERTIFICATE_STORAGE_FAILED');
 }
 const finalized=await context.supabase.rpc('certificate_command',{_op:'UPLOAD',_id:data.id,_key:crypto.randomUUID(),_args:{reason:data.reason,revisionId}});
 if(finalized.error)throw new Error('CERTIFICATE_FINALIZE_FAILED');
 return {id:data.id};
});
export const downloadCertificate=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>certificateDownloadSchema.parse(v)).handler(async({data,context})=>{
 const {data:result,error}=await context.supabase.rpc('certificate_command',{_op:'DOWNLOAD',_id:data.id,_args:{reason:data.reason},_key:data.key});
 const r=result as {path?:string}|null;
 if(error||!r?.path)throw new Error('CERTIFICATE_DOWNLOAD_DENIED');
 const signed=await context.supabase.storage.from('care-certificates').createSignedUrl(r.path,60,{download:true});
 if(signed.error)throw new Error('CERTIFICATE_DOWNLOAD_DENIED');
 return {url:signed.data.signedUrl};
});
export const readCertificates=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const s=context.supabase;
 const [docs,requests,events]=await Promise.all([
 s.from('care_certificates').select('id,request_id,state,current_revision_id,channel,updated_at').order('updated_at',{ascending:false}).limit(300),
 s.from('consultation_requests').select('id,partner_id,location_id').eq('state','completed').limit(300),
 s.from('care_certificate_events').select('id,certificate_id,revision_id,operation,from_state,to_state,reason,actor_user_id,correlation_id,created_at').order('created_at',{ascending:false}).limit(1000),
 ]);
 if(docs.error||requests.error||events.error)throw new Error('CERTIFICATE_READ_DENIED');
 const cases=await Promise.all((requests.data??[]).map(async r=>{
 const [write,admin]=await Promise.all([s.rpc('certificate_scope',{_request:r.id,_u:context.userId,_mode:'WRITE'}),s.rpc('certificate_scope',{_request:r.id,_u:context.userId,_mode:'ADMIN'})]);
 if(write.error||admin.error)throw new Error('CERTIFICATE_SCOPE_UNAVAILABLE');
 return {...r,canUpload:write.data===true,canReview:admin.data===true};
 }));
 return {documents:docs.data??[],cases,events:events.data??[]};
});