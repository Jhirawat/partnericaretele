import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { reviewConsoleSchema, decideSchema } from './human-review';
const messages = ['MFA', 'INVALID_ARGUMENTS', 'RELEASE_SCOPE_REQUIRED', 'STALE_ROUND', 'ROUND_ALREADY_OPEN', 'REVIEWER_SEPARATION'];
function fail(message: string) { return new Error(messages.find((m) => message.includes(m)) ?? 'HUMAN_REVIEW_ACCESS_DENIED'); }
export const readHumanReview = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc('human_review_console');
  if (error) throw fail(error.message);
  return reviewConsoleSchema.parse(data);
});
export const openHumanReviewRound = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc('human_review_open_round');
  if (error) throw fail(error.message);
  return data as unknown as { id: string; round: number; correlation_id: string };
});
export const recordHumanReviewDecision = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => decideSchema.parse(v)).handler(async ({ data: d, context }) => {
  const { data, error } = await context.supabase.rpc('human_review_decide', { _decision: d.decision, _reason: d.reason });
  if (error) throw fail(error.message);
  return data as unknown as { id: string; round: number; correlation_id: string };
});
