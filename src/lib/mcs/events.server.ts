/**
 * MCS webhook event processing: state machine, HN synchronisation,
 * CareCredit settlement and notification queueing.
 *
 * Every step is idempotent — a duplicated COMPLETED event must never consume a
 * second credit, and a delayed event must never regress a terminal state.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { NormalisedEvent } from "./adapter.server";
import { queuePatientNotification } from "../notifications.server";

type Admin = SupabaseClient<Database>;
type Status = Database["public"]["Enums"]["consultation_status"];

const ALLOWED: Record<Status, Status[]> = {
  CREATED: ["WAITING", "CANCELLED", "FAILED"],
  WAITING: ["STARTED", "CANCELLED", "FAILED"],
  STARTED: ["COMPLETED", "CANCELLED", "FAILED"],
  COMPLETED: [],
  CANCELLED: [],
  FAILED: [],
  NO_SHOW: [],
};

const EVENT_STATUS: Record<string, Status> = {
  "consultation.waiting": "WAITING",
  "consultation.started": "STARTED",
  "consultation.completed": "COMPLETED",
  "consultation.cancelled": "CANCELLED",
  "consultation.failed": "FAILED",
};

export function canTransition(from: Status, to: Status) {
  return ALLOWED[from].includes(to);
}

async function syncHn(
  admin: Admin,
  args: { patientId: string; partnerId: string | null; consultationId: string; incomingHn: string | null },
) {
  if (!args.incomingHn) return null;
  const { data: patient } = await admin.from("patients").select("id, hn").eq("id", args.patientId).maybeSingle();
  if (!patient) return null;

  if (!patient.hn) {
    await admin.from("patients").update({ hn: args.incomingHn }).eq("id", patient.id);
    return args.incomingHn;
  }
  if (patient.hn !== args.incomingHn) {
    // Never overwrite a conflicting HN automatically — raise it for Operations.
    await admin.from("integration_conflicts").insert({
      partner_id: args.partnerId,
      consultation_id: args.consultationId,
      patient_id: patient.id,
      conflict_type: "HN_MISMATCH",
      details: { existing_hn: patient.hn, incoming_hn: args.incomingHn },
    });
    return patient.hn;
  }
  return patient.hn;
}

export async function processMcsEvent(admin: Admin, event: NormalisedEvent, webhookEventId: string) {
  const { data: consultation } = await admin
    .from("consultations")
    .select("id, consultation_id, partner_id, patient_id, status, credit_status, mcs_last_event_at, hn_snapshot")
    .eq("mcs_consultation_id", event.mcsConsultationId)
    .maybeSingle();

  if (!consultation) {
    return { outcome: "IGNORED" as const, reason: "unknown consultation" };
  }

  // Out-of-order protection.
  if (consultation.mcs_last_event_at && Date.parse(event.occurredAt) < Date.parse(consultation.mcs_last_event_at)) {
    return { outcome: "IGNORED" as const, reason: "stale event" };
  }

  if (event.eventType === "patient.hn_assigned") {
    const hn = await syncHn(admin, {
      patientId: consultation.patient_id,
      partnerId: consultation.partner_id,
      consultationId: consultation.id,
      incomingHn: event.hn,
    });
    await admin
      .from("consultations")
      .update({ hn_snapshot: hn, mcs_last_event_at: event.occurredAt })
      .eq("id", consultation.id);
    return { outcome: "PROCESSED" as const };
  }

  const target = EVENT_STATUS[event.eventType];
  if (!target) return { outcome: "IGNORED" as const, reason: "unhandled event type" };

  const from = consultation.status;
  if (from === target) return { outcome: "PROCESSED" as const, reason: "already in target state" };
  if (!canTransition(from, target)) {
    return { outcome: "IGNORED" as const, reason: `illegal transition ${from} -> ${target}` };
  }

  const hn = await syncHn(admin, {
    patientId: consultation.patient_id,
    partnerId: consultation.partner_id,
    consultationId: consultation.id,
    incomingHn: event.hn,
  });

  const patch: Database["public"]["Tables"]["consultations"]["Update"] = {
    status: target,
    mcs_last_event_at: event.occurredAt,
    hn_snapshot: hn ?? consultation.hn_snapshot,
  };
  if (event.doctorId) patch.doctor_id = event.doctorId;
  if (target === "STARTED") patch.started_at = event.startedAt ?? event.occurredAt;
  if (target === "COMPLETED") patch.completed_at = event.completedAt ?? event.occurredAt;
  if (target === "CANCELLED" || target === "FAILED") patch.cancellation_reason = event.cancellationReason ?? null;

  // CareCredit settlement — keyed on the consultation, so replays are no-ops.
  if (target === "COMPLETED" && consultation.credit_status === "RESERVED") {
    const { error } = await admin.rpc("apply_credit_transaction", {
      _partner_id: consultation.partner_id,
      _type: "CONSUME",
      _quantity: 1,
      _idempotency_key: `consume:${consultation.id}`,
      _consultation_id: consultation.id,
      _reference_id: event.mcsConsultationId,
      _metadata: { event: event.eventType, webhook_event_id: webhookEventId },
    });
    if (error) throw new Error(error.message);
    patch.credit_status = "CONSUMED";
  }

  if ((target === "CANCELLED" || target === "FAILED") && consultation.credit_status === "RESERVED") {
    const { error } = await admin.rpc("apply_credit_transaction", {
      _partner_id: consultation.partner_id,
      _type: "RELEASE",
      _quantity: 1,
      _idempotency_key: `release:${consultation.id}`,
      _consultation_id: consultation.id,
      _reference_id: event.mcsConsultationId,
      _metadata: { event: event.eventType, webhook_event_id: webhookEventId },
    });
    if (error) throw new Error(error.message);
    patch.credit_status = "RELEASED";
  }

  await admin.from("consultations").update(patch).eq("id", consultation.id);

  await admin.from("audit_log").insert({
    partner_id: consultation.partner_id,
    action: `CONSULTATION_${target}`,
    entity_type: "consultation",
    entity_id: consultation.id,
    metadata: {
      from,
      to: target,
      event: event.eventType,
      mcs_consultation_id: event.mcsConsultationId,
      webhook_event_id: webhookEventId,
    },
  });

  if (target === "STARTED" || target === "COMPLETED" || target === "CANCELLED") {
    await queuePatientNotification(admin, {
      template:
        target === "STARTED"
          ? "consultation_ready"
          : target === "COMPLETED"
            ? "consultation_completed"
            : "consultation_cancelled",
      patientId: consultation.patient_id,
      consultationId: consultation.id,
      partnerId: consultation.partner_id,
      consultationReference: consultation.consultation_id,
    });
  }

  return { outcome: "PROCESSED" as const };
}
