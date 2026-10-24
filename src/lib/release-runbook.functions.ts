import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { containsSensitive } from "./release-readiness";
import { unsafeText } from "./release-evidence";
import { SCENARIOS, simulateDrill, type DrillRun, type Scenario } from "./release-runbook";

export const readDrills = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc("release_drill_console" as never);
  if (error) throw new Error("RELEASE_ACCESS_DENIED");
  if (containsSensitive(data)) throw new Error("REDACTION_FAILED");
  return data as unknown as DrillRun[];
});
const safe = (max: number) => z.string().trim().min(3).max(max).refine((n) => !unsafeText(n), "REDACTED_CONTENT_REQUIRED");
/** Runs the simulation on synthetic state server-side, then appends the result. No production data is read or changed. */
export const recordDrill = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ scenario: z.enum(Object.keys(SCENARIOS) as [Scenario, ...Scenario[]]), evidence: safe(120), next: safe(300) }).strict().parse(v))
  .handler(async ({ data, context }) => {
    const sim = simulateDrill(data.scenario);
    const { data: r, error } = await context.supabase.rpc("release_drill_record" as never, { _scenario: sim.scenario, _synthetic: true, _expected: sim.expected, _observed: sim.observed, _status: sim.status, _evidence: data.evidence, _next: data.next } as never);
    if (error) { const k = ["MFA", "INVALID_ARGUMENTS", "RELEASE_SCOPE_REQUIRED", "SYNTHETIC_ONLY"].find((x) => error.message.includes(x)); throw new Error(k ?? "RELEASE_ACTION_DENIED"); }
    return r as unknown as { id: string; correlation_id: string; created_at: string };
  });
