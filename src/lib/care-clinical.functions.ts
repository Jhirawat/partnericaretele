// Phase 13: appointment clinical notes. All writes go through
// care_clinical_command in the database — the client supplies intent only;
// assigned-doctor, licence-validity and finalisation rules are enforced
// server-side. Final notes are immutable (database guard trigger).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RpcResult = { data: unknown; error: { message: string } | null };
const callRpc = (supabase: unknown, fn: string, args?: Record<string, unknown>) =>
  (supabase as { rpc: (name: string, a?: Record<string, unknown>) => Promise<RpcResult> }).rpc(fn, args);

export interface ClinicalNote {
  id: string;
  appointment_id: string;
  patient_id: string;
  doctor_id: string;
  status: "DRAFT" | "FINAL";
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Read the clinical note for an appointment (patient, assigned doctor, org staff, platform). */
export const getClinicalNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ appointmentId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const { data: note, error } = await callRpc(context.supabase, "care_clinical_read", {
      _appointment: data.appointmentId,
    });
    if (error) throw new Error(error.message);
    return { note: (note as ClinicalNote | null) ?? null };
  });

const commandInput = z
  .object({
    appointmentId: z.string().uuid(),
    subjective: z.string().max(4000).optional(),
    objective: z.string().max(4000).optional(),
    assessment: z.string().max(4000).optional(),
    plan: z.string().max(4000).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

function clinicalCommand(op: "START" | "SAVE" | "FINALIZE") {
  return createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((input) => commandInput.parse(input))
    .handler(async ({ data, context }) => {
      const { data: result, error } = await callRpc(context.supabase, "care_clinical_command", {
        _op: op,
        _args: {
          appointment_id: data.appointmentId,
          ...(data.subjective !== undefined ? { subjective: data.subjective } : {}),
          ...(data.objective !== undefined ? { objective: data.objective } : {}),
          ...(data.assessment !== undefined ? { assessment: data.assessment } : {}),
          ...(data.plan !== undefined ? { plan: data.plan } : {}),
        },
        _key: data.idempotencyKey,
      });
      if (error) throw new Error(error.message);
      return result as { id: string; status: string };
    });
}

export const startClinicalNote = clinicalCommand("START");
export const saveClinicalNote = clinicalCommand("SAVE");
export const finalizeClinicalNote = clinicalCommand("FINALIZE");
