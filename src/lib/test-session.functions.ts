import { z } from 'zod';
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { recordSchema, sessionsSchema } from './test-session';
const messages = ['MFA', 'INVALID_ARGUMENTS', 'RELEASE_SCOPE_REQUIRED', 'PREREQUISITES_UNAVAILABLE', 'CAMPAIGN_NOT_RUNNABLE', 'LATEST_VERSION_REQUIRED', 'SECOND_REVIEWER_REQUIRED', 'BLOCKED_SESSION'];
function fail(message: string) { return new Error(messages.find((m) => message.includes(m)) ?? 'TEST_SESSION_ACCESS_DENIED'); }
export const readTestSessions = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc('test_session_console');
  if (error) throw fail(error.message);
  return sessionsSchema.parse(data);
});
export const recordTestSession = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => recordSchema.parse(v)).handler(async ({ data: d, context }) => {
  const { data, error } = await context.supabase.rpc('test_session_record', { _suite: d.suite, _status: d.status, _evidence: d.evidence });
  if (error) throw fail(error.message);
  return data as unknown as { id: string; version: number; correlation_id: string };
});
export const confirmTestSession = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => z.object({ id: z.uuid(), outcome: z.enum(['confirmed', 'rejected']) }).strict().parse(v)).handler(async ({ data: d, context }) => {
  const { data, error } = await context.supabase.rpc('test_session_confirm', { _id: d.id, _outcome: d.outcome });
  if (error) throw fail(error.message);
  return data as unknown as { id: string; correlation_id: string };
});
