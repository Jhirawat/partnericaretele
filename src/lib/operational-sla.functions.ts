import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {z} from 'zod';
import type {SlaData,SlaHealth} from './operational-sla.types';
export const readSla=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>z.object({mode:z.enum(['admin','super','health'])}).strict().parse(v)).handler(async({data,context})=>{
 if(data.mode!=='admin'){const gate=await context.supabase.rpc('staff_access_check',{_scope:'super'});if(gate.error||gate.data!=='ALLOWED')throw new Error('SLA_ACCESS_DENIED');}
 const {data:result,error}=await context.supabase.rpc('sla_console',{_mode:data.mode});if(error)throw new Error('SLA_ACCESS_DENIED');return result as unknown as SlaData|SlaHealth;
});
export const commandSla=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>z.object({op:z.enum(['propose','submit','approve','reject','pause','resume','acknowledge','reassign','maintenance','scan','health_check']),args:z.record(z.string(),z.union([z.string(),z.number(),z.array(z.number()),z.null()])),key:z.uuid()}).strict().parse(v)).handler(async({data,context})=>{
 const {data:result,error}=await context.supabase.rpc('sla_command',{_op:data.op,_args:data.args,_key:data.key});if(error)throw new Error('SLA_ACTION_DENIED');return result;
});