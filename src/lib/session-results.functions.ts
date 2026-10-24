import { z } from 'zod';
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { confirmSchema, consoleSchema, recordSchema } from './session-results';
const messages = ['MFA', 'INVALID_ARGUMENTS', 'RELEASE_SCOPE_REQUIRED', 'SESSION_NOT_AUTHORIZED', 'PREREQUISITES_UNAVAILABLE', 'ORDER_REQUIRED', 'STALE_VERSION', 'SECOND_REVIEWER_REQUIRED', 'DUPLICATE_REVIEW', 'ROLE_SEPARATION_REQUIRED'];
function fail(message: string) { return new Error(messages.find((m) => message.includes(m)) ?? 'SESSION_RESULTS_ACCESS_DENIED'); }
export const readSessionResults = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc('session_result_console');
  if (error) throw fail(error.message);
  return consoleSchema.parse(data);
});
export const recordSessionResult = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => recordSchema.parse(v)).handler(async ({ data: d, context }) => {
  const { data, error } = await context.supabase.rpc('session_result_record_save', { _session: d.session, _suite: d.suite, _version: d.version, _status: d.status, _result_label: d.result_label, _blocker_reason: d.blocker_reason, _next_action: d.next_action });
  if (error) throw fail(error.message);
  return data as unknown as { id: string; version: number; correlation_id: string };
});
export const confirmSessionResult = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => confirmSchema.parse(v)).handler(async ({ data: d, context }) => {
  const { data, error } = await context.supabase.rpc('session_result_confirm', { _id: d.id, _slot: d.slot, _outcome: d.outcome });
  if (error) throw fail(error.message);
  return data as unknown as { id: string; correlation_id: string };
});
