import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {requestCommandSchema} from './request-lifecycle.schema';

export const requestCommand=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>requestCommandSchema.parse(v)).handler(async({data,context})=>{
 const {op,id,key,...args}=data;
 const {data:result,error}=await context.supabase.rpc('consultation_request_command',{_op:op,_id:id,_key:key,_args:args});
 if(error)throw new Error(error.message);return result as {id:string;state:string;consultationId:string|null};
});
export const readRequests=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const s=context.supabase;
 const [requests,events,intakes,roles]=await Promise.all([
  s.from('consultation_requests').select('id,intake_id,partner_id,location_id,patient_id,consultation_id,state,created_at,updated_at').order('updated_at',{ascending:false}).limit(300),
  s.from('consultation_request_events').select('id,request_id,from_state,to_state,actor_user_id,reason,correlation_id,created_at').order('created_at',{ascending:false}).limit(1000),
  s.from('partner_intakes').select('id,partner_id,location_id,status,consultation_id,evaluated_at').in('status',['READY','REQUESTED','MANUAL_REVIEW','BLOCKED']).order('evaluated_at',{ascending:false}).limit(300),
  s.from('user_roles').select('role,partner_id,status').eq('user_id',context.userId).eq('status','ACTIVE'),
 ]);
 for(const r of [requests,events,intakes,roles])if(r.error)throw new Error(r.error.message);
 const rows=await Promise.all((requests.data??[]).map(async r=>{
  const [p,a,c,customer,branch]=await Promise.all([
   s.rpc('partner_customer_write',{_u:context.userId,_p:r.partner_id,_l:r.location_id}),
   s.rpc('partner_review_scope',{_u:context.userId,_p:r.partner_id}),
   r.consultation_id?s.from('consultations').select('id,status,credit_status,care_kind,scheduled_at,assigned_doctor_id').eq('id',r.consultation_id).maybeSingle():Promise.resolve({data:null,error:null}),
   s.rpc('privacy_customer_display',{_patient:r.patient_id}),
   s.from('locations').select('name').eq('id',r.location_id).maybeSingle(),
  ]);if(p.error||a.error||c.error||customer.error||branch.error)throw new Error('REQUEST_SCOPE_UNAVAILABLE');
  let canClinical=false;
  if(c.data?.assigned_doctor_id){const d=await s.from('doctors').select('auth_user_id').eq('id',c.data.assigned_doctor_id).maybeSingle();if(d.error)throw new Error('DOCTOR_SCOPE_UNAVAILABLE');canClinical=d.data?.auth_user_id===context.userId;}
  return {...r,canPartner:p.data===true,canReview:a.data===true,canClinical,consultation:c.data,customer:customer.data as unknown as {first_name:string;last_name:string;restricted:boolean}|null,branch:branch.data};
 }));
 const candidates=await Promise.all((intakes.data??[]).filter(i=>!rows.some(r=>r.intake_id===i.id)).map(async i=>{const p=await s.rpc('partner_customer_write',{_u:context.userId,_p:i.partner_id,_l:i.location_id});if(p.error)throw new Error('REQUEST_SCOPE_UNAVAILABLE');return {...i,canPartner:p.data===true};}));
 return {requests:rows,events:events.data??[],intakes:candidates.filter(i=>i.canPartner),roles:roles.data??[]};
});