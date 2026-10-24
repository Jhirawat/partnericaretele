import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { ledgerSchema } from './readiness-ledger';
export const readReadinessLedger=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{const {data,error}=await context.supabase.rpc('readiness_decision_console');if(error)throw new Error('Readiness ledger access requires global review scope and two-step sign-in');return ledgerSchema.parse(data);});
