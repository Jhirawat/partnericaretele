import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {partnerIntakeSchema} from './partner-intake.schema';
import type {IntakeEvidence,ScreeningSettings} from './partner-intake.schema';
export interface IntakeRow {id:string;patient_id:string;partner_id:string;location_id:string;config_id:string|null;evidence:IntakeEvidence;gates:{gate:number;result:'PASS'|'FAIL';reason:string;configVersion:number|null;evaluator:string;at:string}[];status:string;reason:string;emergency:boolean;evaluated_at:string;consultation_id:string|null}
export const partnerIntakeCommand=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>partnerIntakeSchema.parse(v)).handler(async({data,context})=>{
 const {op,...rest}=data;const id='id' in rest?rest.id:null;const args={...rest} as Record<string,unknown>;delete args['id'];
 const {data:result,error}=await context.supabase.rpc('partner_intake_command',{_op:op,...(id?{_id:id}:{}),_args:args as never});
 if(error)throw new Error(error.message);return result as {id:string;status?:string;consultationId?:string|null};
});
export const readPartnerIntake=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const s=context.supabase;const [customers,intakes,configs,events,locations,doctors,assignments,roles]=await Promise.all([
 s.from('partner_customers').select('patient_id,partner_id,location_id,patients(id,first_name,last_name,email,phone_number)').order('created_at',{ascending:false}),
 s.from('partner_intakes').select('id,patient_id,partner_id,location_id,config_id,evidence,gates,status,reason,emergency,evaluated_at,consultation_id').order('evaluated_at',{ascending:false}).limit(300),
 s.from('partner_screening_configs').select('id,partner_id,version,settings').order('version',{ascending:false}),
 s.from('partner_intake_events').select('id,patient_id,intake_id,action,reason,created_at').order('created_at',{ascending:false}).limit(500),
 s.from('locations').select('id,partner_id,name,partners(display_name)').eq('status','ACTIVE'),
 s.from('doctors').select('id,full_name,status,license_expires_on').eq('status','ACTIVE'),
 s.from('doctor_assignments').select('doctor_id,partner_id,location_id,status').eq('status','ACTIVE'),
 s.from('user_roles').select('role,partner_id,status').eq('user_id',context.userId),
 ]);for(const r of [customers,intakes,configs,events,locations,doctors,assignments,roles])if(r.error)throw new Error(r.error.message);
 const branches=await Promise.all((locations.data??[]).map(async l=>{const [w,e]=await Promise.all([s.rpc('partner_customer_write',{_u:context.userId,_p:l.partner_id,_l:l.id}),s.rpc('partner_screening_editor',{_u:context.userId,_p:l.partner_id})]);if(w.error||e.error)throw new Error('SCOPE_UNAVAILABLE');return {...l,canWrite:w.data===true,canConfigure:e.data===true};}));
 const safeCustomers=await Promise.all((customers.data??[]).map(async row=>{const {data:display,error}=await s.rpc('privacy_customer_display',{_patient:row.patient_id});if(error)throw new Error('CUSTOMER_PRIVACY_UNAVAILABLE');return {...row,patients:display as unknown as {id:string;first_name:string;last_name:string;email:string|null;phone_number:string|null;restricted:boolean}};}));
 return {customers:safeCustomers,intakes:(intakes.data??[]) as unknown as IntakeRow[],configs:(configs.data??[]) as unknown as {id:string;partner_id:string;version:number;settings:ScreeningSettings}[],events:events.data??[],branches,doctors:doctors.data??[],assignments:assignments.data??[],roles:roles.data??[]};
});