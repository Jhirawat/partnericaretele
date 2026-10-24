import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { containsSensitive } from "./release-readiness";
import { itemsSchema, recordSchema, confirmInputSchema, type Item } from "./incident-console";

const ERR = ["MFA", "INVALID_ARGUMENTS", "RELEASE_SCOPE_REQUIRED", "SECOND_REVIEWER_REQUIRED", "STALE_VERSION", "CLASS_MISMATCH"];
const fail = (m: string) => new Error(ERR.find((x) => m.includes(x)) ?? "INCIDENT_ACTION_DENIED");

export const readIncidentConsole = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc("incident_console" as never);
  if (error) throw fail(error.message);
  if (containsSensitive(data)) throw new Error("REDACTION_FAILED");
  return itemsSchema.parse(data) as Item[];
});
export const recordIncident = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => recordSchema.parse(v))
  .handler(async ({ data: d, context }) => {
    const { data, error } = await context.supabase.rpc("incident_record" as never, { _lineage: d.lineage, _class: d.incident_class, _severity: d.severity, _trigger: d.trigger, _scope: d.scope, _environment: d.environment, _status: d.status, _owner: d.owner, _reviewer: d.reviewer, _ref: d.ref, _action: d.action, _stop: d.stop, _blocker: d.blocker, _date: d.date } as never);
    if (error) throw fail(error.message);
    return data as unknown as { id: string; version: number; correlation_id: string };
  });
export const confirmIncident = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => confirmInputSchema.parse(v))
  .handler(async ({ data: d, context }) => {
    const { data, error } = await context.supabase.rpc("incident_confirm" as never, { _id: d.id, _outcome: d.outcome } as never);
    if (error) throw fail(error.message);
    return data as unknown as { id: string; correlation_id: string };
  });
