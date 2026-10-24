import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {mcsHandoffCommandSchema} from './mcs-handoff.schema';

export const mcsHandoffCommand=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>mcsHandoffCommandSchema.parse(v)).handler(async({data,context})=>{
 const {op,id,key,...args}=data;
 const {data:result,error}=await context.supabase.rpc('mcs_handoff_command',{_op:op,_id:id,_key:key,_args:args});
 if(error)throw new Error(error.message);
 return result as {id:string;requestId:string;state:string;mcsCaseId:string|null};
});

export const readMcsHandoffs=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const s=context.supabase;
 const [handoffs,events,requests,roles]=await Promise.all([
  s.from('care_mcs_handoffs').select('id,request_id,partner_id,location_id,state,mcs_case_id,patient_link,doctor_link,operator_user_id,packet,created_at,updated_at').order('updated_at',{ascending:false}).limit(300),
  s.from('care_mcs_handoff_events').select('id,handoff_id,from_state,to_state,actor_user_id,reason,correlation_id,created_at').order('created_at',{ascending:false}).limit(1000),
  s.from('consultation_requests').select('id,intake_id,partner_id,location_id,patient_id,consultation_id,state').in('state',['accepted','scheduled','in_consultation','completed']).order('updated_at',{ascending:false}).limit(300),
  s.from('user_roles').select('role,partner_id,status').eq('user_id',context.userId).eq('status','ACTIVE'),
 ]);
 for(const r of [handoffs,events,requests,roles])if(r.error)throw new Error(r.error.message);
 const rows=await Promise.all((handoffs.data??[]).map(async h=>{
  const [w,a]=await Promise.all([
   s.rpc('partner_customer_write',{_u:context.userId,_p:h.partner_id,_l:h.location_id}),
   s.rpc('partner_review_scope',{_u:context.userId,_p:h.partner_id}),
  ]);
  if(w.error||a.error)throw new Error('HANDOFF_SCOPE_UNAVAILABLE');
  return {...h,canOperate:w.data===true||a.data===true};
 }));
 const candidates=await Promise.all((requests.data??[]).filter(r=>!rows.some(h=>h.request_id===r.id)).map(async r=>{
  const [w,a]=await Promise.all([
   s.rpc('partner_customer_write',{_u:context.userId,_p:r.partner_id,_l:r.location_id}),
   s.rpc('partner_review_scope',{_u:context.userId,_p:r.partner_id}),
  ]);
  if(w.error||a.error)throw new Error('HANDOFF_SCOPE_UNAVAILABLE');
  return {...r,canOperate:w.data===true||a.data===true};
 }));
 return {handoffs:rows,events:events.data??[],requests:candidates.filter(r=>r.canOperate),roles:roles.data??[]};
});
