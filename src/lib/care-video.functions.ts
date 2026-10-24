// Phase 11: video room server functions.
// Fail closed: without a configured Daily API key no room is ever created and
// the appointment's video state is never set to READY, so no join link renders.
// All state changes go through care_video_command in the database.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RpcResult = { data: unknown; error: { message: string } | null };
const callRpc = (supabase: unknown, fn: string, args?: Record<string, unknown>) =>
  (supabase as { rpc: (name: string, a?: Record<string, unknown>) => Promise<RpcResult> }).rpc(fn, args);

const idInput = z
  .object({ appointmentId: z.string().uuid(), idempotencyKey: z.string().uuid() })
  .strict();

/** Create a Daily room (server-side only). Throws when not configured. */
async function createDailyRoom(appointmentId: string): Promise<{ name: string; url: string }> {
  const apiKey = process.env['DAILY_API_KEY'];
  if (!apiKey) throw new Error("VIDEO_PROVIDER_NOT_CONFIGURED");
  const res = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `care-${appointmentId}`,
      privacy: "private",
      properties: { enable_prejoin_ui: true, enable_knocking: false },
    }),
  });
  if (!res.ok) throw new Error(`VIDEO_PROVIDER_ERROR_${res.status}`);
  const room = (await res.json()) as { name: string; url: string };
  return { name: room.name, url: room.url };
}

/** Open a video room for a confirmed appointment (care team only). */
export const openVideoRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    // Fail closed before touching the database when no provider is configured.
    const room = await createDailyRoom(data.appointmentId);
    const { data: result, error } = await callRpc(context.supabase, "care_video_command", {
      _op: "OPEN",
      _args: { id: data.appointmentId, room_name: room.name, room_url: room.url },
      _key: data.idempotencyKey,
    });
    if (error) throw new Error(error.message);
    return result as { id: string; video_state: string };
  });

/** End an open video room (care team only). */
export const endVideoRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await callRpc(context.supabase, "care_video_command", {
      _op: "END",
      _args: { id: data.appointmentId },
      _key: data.idempotencyKey,
    });
    if (error) throw new Error(error.message);
    return result as { id: string; video_state: string };
  });
