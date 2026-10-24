import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {z} from 'zod';
import type {ConsoleData} from './operations-console.types';
const fields=['organization','branch','doctor','from','to','request','handoff','certificate','credit','kind','status','action','target','actor'] as const;
const schema=z.object({mode:z.enum(['admin','super','audit']),filters:z.record(z.string(),z.union([z.string(),z.number()]))});
export const readOperationsConsole=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>schema.parse(v)).handler(async({data,context})=>{
 if(data.mode!=='audit'){const gate=await context.supabase.rpc('staff_access_check',{_scope:data.mode==='super'?'super':'staff'});if(gate.error||gate.data!=='ALLOWED')throw new Error('CONSOLE_ACCESS_DENIED');}
 const filters:Record<string,string|number>={page:Math.max(1,Math.min(100000,Number(data.filters['page'])||1))};
 for(const field of fields){const value=String(data.filters[field]??'').slice(0,100);if(value)filters[field]=value;}
 for(const field of ['organization','branch','doctor','actor'])if(filters[field]&&!z.string().uuid().safeParse(filters[field]).success)throw new Error('INVALID_FILTER');
 for(const field of ['from','to'])if(filters[field]&&!z.iso.date().safeParse(filters[field]).success)throw new Error('INVALID_DATE');
 const {data:result,error}=await context.supabase.rpc('operations_console',{_mode:data.mode,_filters:filters});
 if(error)throw new Error('CONSOLE_ACCESS_DENIED');
 return result as unknown as ConsoleData;
});
