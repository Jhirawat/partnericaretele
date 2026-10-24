// Phase 15: appointment visit summaries. All writes go through
// care_document_command in the database — the client supplies intent only;
// assigned-doctor, completed-clinical-state and immutability rules are
// enforced server-side. Issued documents are immutable (guard trigger).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RpcResult = { data: unknown; error: { message: string } | null };
const callRpc = (supabase: unknown, fn: string, args?: Record<string, unknown>) =>
  (supabase as { rpc: (name: string, a?: Record<string, unknown>) => Promise<RpcResult> }).rpc(fn, args);

export interface AppointmentDocument {
  id: string;
  appointment_id: string;
  patient_id: string;
  partner_id: string;
  doctor_id: string;
  title: string;
  body: string;
  status: "DRAFT" | "ISSUED";
  issued_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Read the visit summary for an appointment (patient, assigned doctor, org staff, platform). */
export const getAppointmentDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ appointmentId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    // care_appointment_documents predates generated types; RLS scopes the read.
    const { data: doc, error } = await (context.supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (c: string, v: string) => {
            maybeSingle: () => Promise<{ data: AppointmentDocument | null; error: { message: string } | null }>;
          };
        };
      };
    })
      .from("care_appointment_documents")
      .select("id, appointment_id, patient_id, partner_id, doctor_id, title, body, status, issued_at, created_at, updated_at")
      .eq("appointment_id", data.appointmentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { document: doc ?? null };
  });

const commandInput = z
  .object({
    appointmentId: z.string().uuid(),
    title: z.string().max(300).optional(),
    body: z.string().max(20000).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

function documentCommand(op: "DRAFT" | "SAVE" | "ISSUE") {
  return createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((input) => commandInput.parse(input))
    .handler(async ({ data, context }) => {
      const { data: result, error } = await callRpc(context.supabase, "care_document_command", {
        _op: op,
        _args: {
          appointment_id: data.appointmentId,
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.body !== undefined ? { body: data.body } : {}),
        },
        _key: data.idempotencyKey,
      });
      if (error) throw new Error(error.message);
      return result as { id: string; status: string };
    });
}

export const draftAppointmentDocument = documentCommand("DRAFT");
export const saveAppointmentDocument = documentCommand("SAVE");
export const issueAppointmentDocument = documentCommand("ISSUE");
