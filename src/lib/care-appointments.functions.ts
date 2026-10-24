// Phase 07: appointment server functions.
// All state changes go through care_appointment_command in the database —
// the client supplies intent only; entitlement, overlap and transition rules
// are enforced server-side.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const bookInput = z
  .object({
    patientId: z.string().uuid(),
    serviceVersionId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    paymentId: z.string().uuid().optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const bookAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => bookInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("care_appointment_command", {
      _op: "BOOK",
      _args: {
        patient_id: data.patientId,
        service_version_id: data.serviceVersionId,
        starts_at: data.startsAt,
        ends_at: data.endsAt,
        ...(data.paymentId ? { payment_id: data.paymentId } : {}),
      },
      _key: data.idempotencyKey,
    });
    if (error) throw new Error(error.message);
    return result as { id: string; state: string };
  });

const transitionInput = z
  .object({
    appointmentId: z.string().uuid(),
    doctorId: z.string().uuid().optional(),
    reason: z.string().max(500).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

function transition(op: "CONFIRM" | "CANCEL" | "COMPLETE" | "NO_SHOW") {
  return createServerFn({ method: "POST" })
    .middleware([requireSupabaseAuth])
    .inputValidator((input) => transitionInput.parse(input))
    .handler(async ({ data, context }) => {
      const { data: result, error } = await context.supabase.rpc("care_appointment_command", {
        _op: op,
        _args: {
          id: data.appointmentId,
          ...(data.doctorId ? { doctor_id: data.doctorId } : {}),
          ...(data.reason ? { reason: data.reason } : {}),
        },
        _key: data.idempotencyKey,
      });
      if (error) throw new Error(error.message);
      return result as { id: string; op: string };
    });
}

export const confirmAppointment = transition("CONFIRM");
export const cancelAppointment = transition("CANCEL");
export const completeAppointment = transition("COMPLETE");
export const noShowAppointment = transition("NO_SHOW");

// Phase 09: patient self-service booking. The database derives the patient,
// organisation and entitlement from the verified session; the client supplies
// only the chosen service version and time window.
const patientBookInput = z
  .object({
    serviceVersionId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

// care_patient_book / care_my_catalog predate the next type regeneration.
type RpcResult = { data: unknown; error: { message: string } | null };
const callRpc = (supabase: unknown, fn: string, args?: Record<string, unknown>) =>
  (supabase as { rpc: (name: string, a?: Record<string, unknown>) => Promise<RpcResult> }).rpc(fn, args);

export const bookMyAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => patientBookInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await callRpc(context.supabase, "care_patient_book", {
      _service_version: data.serviceVersionId,
      _starts: data.startsAt,
      _ends: data.endsAt,
      _key: data.idempotencyKey,
    });
    if (error) throw new Error(error.message);
    return result as { id: string; state: string };
  });

/** Approved service versions of the caller's own patient organisation. */
export const getMyBookingCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await callRpc(context.supabase, "care_my_catalog");
    if (error) throw new Error(error.message);
    return { catalog: (rows as CatalogItem[] | null) ?? [] };
  });

export interface CatalogItem {
  id: string;
  service_id: string | null;
  version: number;
  name: string;
  name_th: string | null;
  description: string | null;
  duration_minutes: number;
  price_minor: number;
  currency: string;
}

/** The caller's own appointments (RLS scopes to the linked patient record). */
export const listMyAppointments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ patientId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("care_appointments")
      .select(
        "id, partner_id, patient_id, doctor_id, service_version_id, starts_at, ends_at, state, payment_state, video_state, video_room_url, clinical_state, funding_state, document_state, cancellation_reason, created_at",
      )
      .eq("patient_id", data.patientId)
      .order("starts_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { appointments: (rows as unknown as AppointmentItem[] | null) ?? [] };
  });

export interface AppointmentItem {
  id: string;
  partner_id: string;
  patient_id: string;
  doctor_id: string | null;
  service_version_id: string;
  starts_at: string;
  ends_at: string;
  state: "REQUESTED" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  payment_state: string;
  video_state: string;
  video_room_url: string | null;
  clinical_state: string;
  funding_state: string;
  document_state: string;
  cancellation_reason: string | null;
  created_at: string;
}

export const listAppointments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        partnerId: z.string().uuid(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("care_appointments")
      .select(
        "id, partner_id, patient_id, doctor_id, service_version_id, starts_at, ends_at, state, payment_state, video_state, video_room_url, clinical_state, funding_state, document_state, cancellation_reason, created_at",
      )
      .eq("partner_id", data.partnerId)
      .order("starts_at", { ascending: true });
    if (data.from) query = query.gte("starts_at", data.from);
    if (data.to) query = query.lt("starts_at", data.to);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { appointments: (rows as unknown as AppointmentItem[] | null) ?? [] };
  });
