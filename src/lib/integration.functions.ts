import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Clinical provider (MCS) integration monitoring for platform staff. */

const uuid = z.string().uuid();

export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const gate = await context.supabase.rpc("staff_access_check", { _scope: "super" });
    if (gate.error || gate.data !== "ALLOWED") throw new Error("STAFF_ACCESS_DENIED");
    const { getMcsConfig } = await import("./mcs/adapter.server");
    const config = getMcsConfig();

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [recent, failures, conflicts] = await Promise.all([
      context.supabase
        .from("webhook_events")
        .select("id, event_type, processing_status, received_at, last_error, external_event_id")
        .order("received_at", { ascending: false })
        .limit(25),
      context.supabase
        .from("webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("processing_status", "FAILED")
        .gte("received_at", since),
      context.supabase
        .from("integration_conflicts")
        .select("id", { count: "exact", head: true })
        .eq("status", "OPEN"),
    ]);

    return {
      mode: config.mode,
      baseUrlConfigured: Boolean(config.baseUrl),
      apiKeyConfigured: config.hasApiKey,
      webhookSecretConfigured: config.hasWebhookSecret,
      replayWindowSeconds: config.replayWindowSeconds,
      webhookUrl: "/api/public/mcs-webhook",
      recentEvents: recent.data ?? [],
      failuresLast24h: failures.count ?? 0,
      openConflicts: conflicts.count ?? 0,
      lastEventAt: recent.data?.[0]?.received_at ?? null,
    };
  });

export const listIntegrationConflicts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("integration_conflicts")
      .select("id, conflict_type, details, status, created_at, resolved_at, partner_id, consultation_id, patient_id")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const resolveIntegrationConflict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ conflictId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("integration_conflicts")
      .update({ status: "RESOLVED", resolved_by: userId, resolved_at: new Date().toISOString() })
      .eq("id", data.conflictId)
      .select("id, status, partner_id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: row.partner_id,
      action: "INTEGRATION_CONFLICT_RESOLVED",
      entity_type: "integration_conflict",
      entity_id: row.id,
      metadata: {},
    });
    return row;
  });

export const listNotificationDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notification_deliveries")
      .select("id, channel, status, template, locale, destination, attempts, last_error, queued_at, sent_at")
      .order("queued_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Sandbox helper: replays a signed-equivalent MCS event through the same
 * processing path, so the lifecycle can be rehearsed before MCS is connected.
 * Platform admins only; refuses to run once the live integration is enabled.
 */
export const simulateMcsEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        consultationId: uuid,
        event: z.enum([
          "consultation.waiting",
          "consultation.started",
          "consultation.completed",
          "consultation.cancelled",
          "consultation.failed",
        ]),
        hn: z.string().max(40).optional().or(z.literal("")),
        doctorId: z.string().max(60).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const gate = await supabase.rpc("staff_access_check", { _scope: "super" });
    if (gate.error || gate.data !== "ALLOWED") throw new Error("STAFF_ACCESS_DENIED");

    const { getMcsConfig } = await import("./mcs/adapter.server");
    if (getMcsConfig().mode === "LIVE") {
      throw new Error("Sandbox events are disabled while the live clinical connection is active.");
    }

    const { data: consultation, error: loadError } = await supabase
      .from("consultations")
      .select("id, mcs_consultation_id")
      .eq("id", data.consultationId)
      .single();
    if (loadError) throw new Error(loadError.message);
    if (!consultation.mcs_consultation_id) throw new Error("This consultation has no clinical reference yet.");

    const occurredAt = new Date().toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processMcsEvent } = await import("./mcs/events.server");

    const { data: stored, error: storeError } = await supabaseAdmin
      .from("webhook_events")
      .insert({
        provider: "MCS_SANDBOX",
        external_event_id: `sandbox:${consultation.id}:${data.event}:${occurredAt}`,
        event_type: data.event,
        payload: { event: data.event, timestamp: occurredAt, data: { consultation_id: consultation.mcs_consultation_id } } as never,
      })
      .select("id")
      .single();
    if (storeError || !stored) throw new Error(storeError?.message ?? "Could not record sandbox event");

    const result = await processMcsEvent(
      supabaseAdmin,
      {
        eventType: data.event,
        occurredAt,
        mcsConsultationId: consultation.mcs_consultation_id,
        patientExternalId: null,
        hn: data.hn || null,
        doctorId: data.doctorId || null,
        status: null,
        startedAt: data.event === "consultation.started" ? occurredAt : null,
        completedAt: data.event === "consultation.completed" ? occurredAt : null,
        cancellationReason: data.event === "consultation.cancelled" ? "Sandbox rehearsal" : null,
      },
      stored.id,
    );

    await supabaseAdmin
      .from("webhook_events")
      .update({
        processing_status: result.outcome,
        processed_at: new Date().toISOString(),
        last_error: "reason" in result ? (result.reason ?? null) : null,
      })
      .eq("id", stored.id);

    return result;
  });
