import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { inputSchema } from './golive-evidence-matrix';
export const readGoLiveMatrix = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
 const { data, error } = await context.supabase.rpc('golive_evidence_matrix_console');
 if (error) throw new Error('MATRIX_ACCESS_DENIED');
 return inputSchema.parse(data);
});
