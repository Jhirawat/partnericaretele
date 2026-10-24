import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { signoffsSchema, signSchema } from './decision-pack';
const messages = ['MFA', 'INVALID_ARGUMENTS', 'RELEASE_SCOPE_REQUIRED'];
function fail(message: string) { return new Error(messages.find((m) => message.includes(m)) ?? 'DECISION_PACK_ACCESS_DENIED'); }
export const readDecisionSignoffs = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc('decision_pack_console');
  if (error) throw fail(error.message);
  return signoffsSchema.parse(data);
});
export const recordDecisionSignoff = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => signSchema.parse(v)).handler(async ({ data: d, context }) => {
  const { data, error } = await context.supabase.rpc('decision_pack_sign', { _outcome: d.outcome });
  if (error) throw fail(error.message);
  return data as unknown as { id: string; round: number; correlation_id: string };
});
