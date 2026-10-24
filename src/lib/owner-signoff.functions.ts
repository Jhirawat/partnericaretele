import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { inputSchema } from './owner-signoff';
export const readOwnerSignoff = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc('owner_signoff_readiness_console');
  if (error) throw new Error(error.message.includes('MFA') ? 'MFA' : 'OWNER_BOARD_ACCESS_DENIED');
  return inputSchema.parse(data);
});