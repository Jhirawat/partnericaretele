// Phase 14: follow-up plans. All writes go through care_followup_command in
// the database — the client supplies intent only; assigned-doctor, completed
// -appointment and terminal-state rules are enforced server-side.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RpcResult = { data: unknown; error: { message: string } | null };
const callRpc = (supabase: unknown, fn: string, args?: Record<string, unknown>) =>
  (supabase as { rpc: (name: string, a?: Record<string, unknown>) => Promise<RpcResult> }).rpc(fn, args);

export interface Followup {
  id: string;
  appointment_id: string;
  patient_id: string;
  partner_id: string;
  doctor_id: string;
  due_at: string;
  instructions: string;
  status: "SCHEDULED" | "DONE" | "CANCELLED";
  created_at: string;
}

function followupCommand(op: "SCHEDULE" | "DONE" | "CANCEL") {
  return createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((input) =>
      z
        .object({
          appointmentId: z.string().uuid().optional(),
          followupId: z.string().uuid().optional(),
          dueAt: z.string().datetime().optional(),
          instructions: z.string().max(2000).optional(),
          idempotencyKey: z.string().uuid(),
        })
        .strict()
        .parse(input),
    )
    .handler(async ({ data, context }) => {
      const { data: result, error } = await callRpc(context.supabase, "care_followup_command", {
        _op: op,
        _args: {
          ...(data.appointmentId ? { appointment_id: data.appointmentId } : {}),
          ...(data.followupId ? { id: data.followupId } : {}),
          ...(data.dueAt ? { due_at: data.dueAt } : {}),
          ...(data.instructions !== undefined ? { instructions: data.instructions } : {}),
        },
        _key: data.idempotencyKey,
      });
      if (error) throw new Error(error.message);
      return result as { id: string; status: string };
    });
}

export const scheduleFollowup = followupCommand("SCHEDULE");
export const markFollowupDone = followupCommand("DONE");
export const cancelFollowup = followupCommand("CANCEL");

/** Follow-ups for a patient (RLS scopes: patient themself, org staff, assigned doctor, platform). */
export const listFollowups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ patientId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    // care_followups predates the next type regeneration.
    const untyped = context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: string) => {
            order: (c: string, o: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: unknown; error: { message: string } | null }>;
            };
          };
        };
      };
    };
    const { data: rows, error } = await untyped
      .from("care_followups")
      .select("id, appointment_id, patient_id, partner_id, doctor_id, due_at, instructions, status, created_at")
      .eq("patient_id", data.patientId)
      .order("due_at", { ascending: true })
      .limit(100);
    if (error) throw new Error(error.message);
    return { followups: (rows as unknown as Followup[] | null) ?? [] };
  });
