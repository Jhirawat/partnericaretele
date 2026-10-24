import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {Json} from '@/integrations/supabase/types';
type OnboardingDatabase={public:{Tables:Record<string,{Row:Record<string,Json>;Insert:Record<string,Json>;Update:Record<string,Json>;Relationships:[]}>;Views:Record<string,never>;Functions:{partner_application_command:{Args:{_op:string;_id:string|null;_args:Json};Returns:Json}}}};
import {applicationSchema,documentSchema,eventSchema,applicationCommandSchema} from './partner-onboarding.schema';
// New tables/RPCs are deliberately accessed through the existing authenticated client's fetch,
// until integration-managed generated types refresh; no privileged client or browser secrets.
export const partnerApplicationCommand=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>applicationCommandSchema.parse(v)).handler(async({context,data})=>{

 // Reuse JWT-scoped client configuration; PostgREST accepts the typed RPC via its schema override.
 const client=context.supabase as unknown as SupabaseClient<OnboardingDatabase>;
 const {data:row,error}=await client.rpc('partner_application_command',{_op:data.op,_id:'id' in data?data.id:null,_args:'args' in data?(data.args??{}):{}});
 if(error) throw new Error(error.message);
 return applicationSchema.parse(row);
});
export const readPartnerApplications=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{

 const client=context.supabase as unknown as SupabaseClient<OnboardingDatabase>;
 const [a,d,e,r,p]=await Promise.all([client.from('partner_applications').select('*').order('updated_at',{ascending:false}),client.from('partner_application_documents').select('*').order('created_at',{ascending:false}),client.from('partner_application_events').select('*').order('created_at',{ascending:false}),context.supabase.from('user_roles').select('role,partner_id,status').eq('user_id',context.userId),context.supabase.from('partners').select('id,display_name')]);
 if(a.error?.code==='42P01'||a.error?.code==='PGRST205') return {setupRequired:true,userId:context.userId,applications:[],documents:[],events:[],roles:r.data??[],partners:p.data??[]};
 for(const result of [a,d,e,r,p])if(result.error)throw new Error(result.error.message);
 return {setupRequired:false,userId:context.userId,applications:z.array(applicationSchema).parse(a.data),documents:z.array(documentSchema).parse(d.data),events:z.array(eventSchema).parse(e.data),roles:r.data??[],partners:p.data??[]};
});
export const readPartnerWorkspace=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const [p,l,r]=await Promise.all([context.supabase.from('partners').select('id,display_name,legal_name,email,phone,address,status'),context.supabase.from('locations').select('id,partner_id,name,address,city,country_code'),context.supabase.from('user_roles').select('role,partner_id,status').eq('user_id',context.userId)]);
 for(const x of [p,l,r])if(x.error)throw new Error(x.error.message);
 const own=new Set((r.data??[]).filter(x=>x.status==='ACTIVE'&&['PARTNER_OWNER','PARTNER_MANAGER','PARTNER_STAFF'].includes(x.role)).map(x=>x.partner_id));
 return {partners:(p.data??[]).filter(x=>own.has(x.id)),locations:(l.data??[]).filter(x=>own.has(x.partner_id))};
});
export const savePartnerWorkspace=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>z.object({partnerId:z.string().uuid(),email:z.string().email().max(255),phone:z.string().max(80),address:z.string().max(500)}).parse(v)).handler(async({data,context})=>{
 const {data:row,error}=await context.supabase.from('partners').update({email:data.email,phone:data.phone,address:data.address}).eq('id',data.partnerId).select('id').single();if(error)throw new Error(error.message);return row;
});
export const addPartnerBranch=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>z.object({partnerId:z.string().uuid(),name:z.string().trim().min(1).max(160),address:z.string().trim().min(1).max(500),city:z.string().trim().min(1).max(120),countryCode:z.string().regex(/^[A-Z]{2}$/)}).parse(v)).handler(async({data,context})=>{
 const {data:row,error}=await context.supabase.from('locations').insert({partner_id:data.partnerId,code:`B-${crypto.randomUUID().slice(0,8)}`,name:data.name,address:data.address,city:data.city,country_code:data.countryCode}).select('id').single();if(error)throw new Error(error.message);return row;
});
