import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {z} from 'zod';
import type {NotificationData} from './notification-outbox.types';
import {disabledOutboxWorker,notificationEvents} from './notification-outbox.types';
export const readNotificationCenter=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>z.object({manage:z.boolean(),status:z.string(),unread:z.boolean()}).parse(v)).handler(async({data,context})=>{
 const {data:result,error}=await context.supabase.rpc('notification_center',{_manage:data.manage,_status:data.status,_unread:data.unread});if(error)throw new Error('NOTIFICATION_ACCESS_DENIED');return result as unknown as NotificationData;
});
const commandSchema=z.discriminatedUnion('op',[
 z.object({op:z.literal('preference'),args:z.object({event_type:z.enum(notificationEvents),enabled:z.boolean()}).strict(),key:z.uuid()}),
 z.object({op:z.enum(['read','unread']),args:z.object({id:z.uuid()}).strict(),key:z.uuid()}),
 z.object({op:z.enum(['suppress','retry','manual_review']),args:z.object({id:z.uuid(),reason:z.enum(['operator_suppression','retry_requested','requires_review'])}).strict(),key:z.uuid()})
]);
export const updateNotification=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((v:unknown)=>commandSchema.parse(v)).handler(async({data,context})=>{
 const {data:result,error}=await context.supabase.rpc('notification_command',{_op:data.op,_args:data.args,_key:data.key});if(error)throw new Error('NOTIFICATION_ACTION_DENIED');return result;
});
export const inspectOutboxWorker=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const {error}=await context.supabase.rpc('notification_center',{_manage:true});if(error)throw new Error('ADMIN_SCOPE_REQUIRED');return disabledOutboxWorker();
});
export const scanNotificationReminders=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
 const {data,error}=await context.supabase.rpc('notification_sla_scan');if(error)throw new Error('REMINDER_SCAN_DENIED');return data;
});
