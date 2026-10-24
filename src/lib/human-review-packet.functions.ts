import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { inputSchema } from './golive-evidence-matrix';
import { packetConsoleSchema, decideSchema } from './human-review-packet';
const messages = ['MFA', 'INVALID_ARGUMENTS', 'RELEASE_SCOPE_REQUIRED', 'STALE_VERSION', 'PACKET_CURRENT', 'REVIEWER_SEPARATION', 'ROLE_SEPARATION', 'DUPLICATE_DECISION', 'HARD_BLOCKER_OPEN'];
function fail(message: string) { return new Error(messages.find((m) => message.includes(m)) ?? 'PACKET_ACCESS_DENIED'); }
export const readHumanPacket = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const [m, p] = await Promise.all([context.supabase.rpc('golive_evidence_matrix_console'), context.supabase.rpc('human_packet_console')]);
  if (m.error) throw fail(m.error.message);
  if (p.error) throw fail(p.error.message);
  return { matrix: inputSchema.parse(m.data), packet: packetConsoleSchema.parse(p.data) };
});
export const openHumanPacket = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc('human_packet_open');
  if (error) throw fail(error.message);
  return data as unknown as { packet_version: number; correlation_id: string };
});
export const decideHumanPacket = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((v: unknown) => decideSchema.parse(v)).handler(async ({ data: d, context }) => {
  const { data, error } = await context.supabase.rpc('human_packet_decide', { _version: d.packet_version, _decision: d.decision, _reason: d.reason });
  if (error) throw fail(error.message);
  return data as unknown as { id: string; packet_version: number; correlation_id: string };
});
