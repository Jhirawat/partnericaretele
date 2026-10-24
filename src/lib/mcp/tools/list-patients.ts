import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_patients",
  title: "List patients",
  description: "List patients the signed-in user is allowed to see, optionally filtered by name or patient reference.",
  inputSchema: {
    search: z.string().trim().max(80).optional().describe("Part of a name or patient reference."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum rows (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = supabaseForUser(ctx)
      .from("patients")
      .select("id, external_patient_id, first_name, last_name, hn, partner_id, preferred_language, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (search) {
      const s = search.replace(/[%,()]/g, "");
      q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,external_patient_id.ilike.%${s}%`);
    }
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const patients = (data ?? []).map((p) => ({
      id: p.id,
      reference: p.external_patient_id,
      name: `${p.first_name} ${p.last_name}`,
      hn: p.hn,
      partner_id: p.partner_id,
      language: p.preferred_language,
      created_at: p.created_at,
    }));
    return { content: [{ type: "text", text: JSON.stringify(patients) }], structuredContent: { patients } };
  },
});
