import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { containsSensitive } from "./release-readiness";
import { CAMPAIGN_VERSION, CHECKS, dryRun, sanitize, toStoredPayload, type StoredRun } from "./verification-campaign";

const ERR = ["MFA", "INVALID_ARGUMENTS", "RELEASE_SCOPE_REQUIRED", "SECOND_REVIEWER_REQUIRED", "SIMULATED_NOT_CONFIRMABLE"];
const fail = (m: string) => new Error(ERR.find((x) => m.includes(x)) ?? "RELEASE_ACTION_DENIED");
const safe = (max: number) => z.string().trim().min(3).max(max).refine((n) => sanitize(n) !== null, "REDACTED_CONTENT_REQUIRED");

export const readCampaignHistory = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc("campaign_console" as never);
  if (error) throw new Error("RELEASE_ACCESS_DENIED");
  if (containsSensitive(data)) throw new Error("REDACTION_FAILED");
  return data as unknown as StoredRun[];
});
/** Records a planning snapshot. Real checks are not executed; every result is pending, blocked or unverified. */
export const recordCampaignRun = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ label: safe(120), simulated: z.boolean() }).strict().parse(v))
  .handler(async ({ data: d, context }) => {
    const results = toStoredPayload(dryRun()).map((r) => ({ ...r, status: r.status === "blocked" ? "blocked" : "pending" }));
    if (results.length !== CHECKS.length) throw new Error("INVALID_ARGUMENTS");
    const { data, error } = await context.supabase.rpc("campaign_run_record" as never, { _version: CAMPAIGN_VERSION, _label: d.label, _simulated: d.simulated, _results: results } as never);
    if (error) throw fail(error.message);
    return data as unknown as { id: string; run_no: number; correlation_id: string };
  });
export const confirmCampaignResult = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid(), outcome: z.enum(["confirmed", "rejected"]), note: safe(300) }).strict().parse(v))
  .handler(async ({ data: d, context }) => {
    const { data, error } = await context.supabase.rpc("campaign_result_confirm" as never, { _id: d.id, _outcome: d.outcome, _note: d.note } as never);
    if (error) throw fail(error.message);
    return data as unknown as { id: string; correlation_id: string };
  });
