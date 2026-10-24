import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { confirmSchema, recordSchema, rowsSchema } from './session-start-gate';
const CODES = ['MFA', 'STALE_VERSION', 'SECOND_REVIEWER_REQUIRED', 'ROLE_SEPARATION_REQUIRED', 'RELEASE_SCOPE_REQUIRED', 'INVALID_ARGUMENTS', 'DUPLICATE_REVIEW', 'PREREQUISITES_UNAVAILABLE', 'START_AUTHORIZATION_REQUIRED', 'ORDER_REQUIRED'];
const fail = (m: string) => new Error(CODES.find((k) => m.includes(k)) ?? 'SESSION_GATE_ACCESS_DENIED');
export const readSessionGate = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc('session_start_console');
  if (error) throw fail(error.message);
  return rowsSchema.parse(data);
});
export const recordSessionGate = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => recordSchema.parse(v)).handler(async ({ data: d, context }) => {
  const { data, error } = await context.supabase.rpc('session_start_record', { _session: d.session, _version: d.version, _status: d.status, _suite_group: d.suite_group, _blocker_reason: d.blocker_reason, _next_action: d.next_action, _source_validation_version: d.source_validation_version });
  if (error) throw fail(error.message);
  return data as unknown as { id: string; version: number; correlation_id: string };
});
export const confirmSessionGate = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => confirmSchema.parse(v)).handler(async ({ data: d, context }) => {
  const { data, error } = await context.supabase.rpc('session_start_confirm', { _id: d.id, _outcome: d.outcome });
  if (error) throw fail(error.message);
  return data as unknown as { id: string; correlation_id: string };
});
