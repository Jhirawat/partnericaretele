import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { inputSchema } from './archive-integrity';
export const readArchiveIntegrity = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc('release_archive_integrity_console');
  if (error) throw new Error(error.message.includes('MFA') ? 'MFA' : 'ARCHIVE_ACCESS_DENIED');
  return inputSchema.parse(data);
});