import { createFileRoute } from "@tanstack/react-router";

import { normalizeMCSPayload, verifyWebhook } from "@/lib/mcs/adapter.server";

/**
 * MCS Cloud webhook receiver.
 * Signature-verified, replay-protected and idempotent: the raw event is stored
 * first, then processed. Notifications are queued, never sent inline.
 */
export const Route = createFileRoute("/api/public/mcs-webhook")({staticData:{sitemap:false},
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();

        const verification = await verifyWebhook({
          rawBody,
          signature: request.headers.get("x-mcs-signature"),
          timestamp: request.headers.get("x-mcs-timestamp"),
        });
        if (!verification.ok) {
          console.error(`[MCS webhook] rejected: ${verification.reason}`);
          return new Response("Unauthorized", { status: 401 });
        }

        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const event = normalizeMCSPayload(payload);
        if (!event) return new Response("Unsupported payload", { status: 400 });

        const eventId =
          request.headers.get("x-mcs-event-id") ??
          `${event.eventType}:${event.mcsConsultationId}:${event.occurredAt}`;

        const { createHash } = await import("node:crypto");
        const payloadHash = createHash("sha256").update(rawBody).digest("hex");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: stored, error: storeError } = await supabaseAdmin
          .from("webhook_events")
          .insert({
            provider: "MCS",
            external_event_id: eventId,
            event_type: event.eventType,
            payload: payload as never,
            payload_hash: payloadHash,
          })
          .select("id")
          .single();

        // Duplicate delivery: already durably accepted, acknowledge without reprocessing.
        if (storeError?.code === "23505") {
          return Response.json({ received: true, duplicate: true });
        }
        if (storeError || !stored) {
          console.error(`[MCS webhook] store failed: ${storeError?.message}`);
          return new Response("Storage error", { status: 500 });
        }

        try {
          const { processMcsEvent } = await import("@/lib/mcs/events.server");
          const result = await processMcsEvent(supabaseAdmin, event, stored.id);
          await supabaseAdmin
            .from("webhook_events")
            .update({
              processing_status: result.outcome,
              processed_at: new Date().toISOString(),
              last_error: "reason" in result ? (result.reason ?? null) : null,
            })
            .eq("id", stored.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[MCS webhook] processing failed: ${message}`);
          await supabaseAdmin
            .from("webhook_events")
            .update({ processing_status: "FAILED", last_error: message })
            .eq("id", stored.id);
        }

        return Response.json({ received: true });
      },
    },
  },
});
