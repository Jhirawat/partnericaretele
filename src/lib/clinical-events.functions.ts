import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Clinical event timeline for one consultation.
 *
 * Every entry originates from MCS — the signed webhook receiver records an
 * audit row for each accepted state change, and unresolved identity mismatches
 * appear as conflicts. Nothing here is generated locally.
 */
export const listConsultationEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ consultationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: consultation, error } = await supabase
      .from("consultations")
      .select(
        "id, consultation_id, status, credit_status, hn_snapshot, doctor_id, room_url, mcs_consultation_id, mcs_last_event_at, scheduled_at, started_at, completed_at, cancellation_reason, created_at",
      )
      .eq("id", data.consultationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!consultation) throw new Error("Consultation not found.");

    const [{ data: events }, { data: conflicts }] = await Promise.all([
      supabase
        .from("audit_log")
        .select("id, action, metadata, created_at")
        .eq("entity_type", "consultation")
        .eq("entity_id", consultation.id)
        .order("created_at", { ascending: true })
        .limit(100),
      supabase
        .from("integration_conflicts")
        .select("id, conflict_type, details, status, created_at")
        .eq("consultation_id", consultation.id)
        .order("created_at", { ascending: false }),
    ]);

    return { consultation, events: events ?? [], conflicts: conflicts ?? [] };
  });
