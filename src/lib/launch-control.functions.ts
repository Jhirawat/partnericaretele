import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { containsSensitive } from "./release-readiness";
import { itemsSchema, recordSchema, confirmInputSchema, type Item } from "./launch-control";

const ERR = ["MFA", "INVALID_ARGUMENTS", "RELEASE_SCOPE_REQUIRED", "SECOND_REVIEWER_REQUIRED", "STALE_VERSION", "GROUP_MISMATCH"];
const fail = (m: string) => new Error(ERR.find((x) => m.includes(x)) ?? "LAUNCH_CONTROL_ACTION_DENIED");

export const readLaunchControl = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc("launch_control_console" as never);
  if (error) throw fail(error.message);
  if (containsSensitive(data)) throw new Error("REDACTION_FAILED");
  return itemsSchema.parse(data) as Item[];
});
export const recordLaunchControl = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => recordSchema.parse(v))
  .handler(async ({ data: d, context }) => {
    const { data, error } = await context.supabase.rpc("launch_control_record" as never, { _lineage: d.lineage, _group: d.group, _phase: d.phase, _candidate: d.candidate, _environment: d.environment, _window: d.window, _trigger: d.trigger, _status: d.status, _owner: d.owner, _reviewer: d.reviewer, _ref: d.ref, _action: d.action, _blocker: d.blocker, _date: d.date } as never);
    if (error) throw fail(error.message);
    return data as unknown as { id: string; version: number; correlation_id: string };
  });
export const confirmLaunchControl = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => confirmInputSchema.parse(v))
  .handler(async ({ data: d, context }) => {
    const { data, error } = await context.supabase.rpc("launch_control_confirm" as never, { _id: d.id, _outcome: d.outcome } as never);
    if (error) throw fail(error.message);
    return data as unknown as { id: string; correlation_id: string };
  });
