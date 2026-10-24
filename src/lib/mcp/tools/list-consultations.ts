import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const STATUSES = ["CREATED", "WAITING", "STARTED", "COMPLETED", "CANCELLED", "FAILED", "NO_SHOW"] as const;

export default defineTool({
  name: "list_consultations",
  title: "List consultations",
  description: "List recent telemedicine consultations visible to the signed-in user, optionally by status or patient.",
  inputSchema: {
    status: z.enum(STATUSES).optional().describe("Filter by consultation status."),
    patient_id: z.string().uuid().optional().describe("Only consultations for this patient id."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum rows (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, patient_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = supabaseForUser(ctx)
      .from("consultations")
      .select("id, consultation_id, status, credit_status, patient_id, partner_id, scheduled_at, started_at, completed_at, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (status) q = q.eq("status", status);
    if (patient_id) q = q.eq("patient_id", patient_id);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const consultations = (data ?? []).map((c) => ({
      id: c.id,
      reference: c.consultation_id,
      status: c.status,
      credit_status: c.credit_status,
      patient_id: c.patient_id,
      partner_id: c.partner_id,
      scheduled_at: c.scheduled_at,
      started_at: c.started_at,
      completed_at: c.completed_at,
      created_at: c.created_at,
    }));
    return { content: [{ type: "text", text: JSON.stringify(consultations) }], structuredContent: { consultations } };
  },
});
