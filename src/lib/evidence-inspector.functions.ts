import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { containsSensitive } from "./release-readiness";
import { itemsSchema, recordSchema, confirmInputSchema, type Item } from "./evidence-inspector";

const ERR = ["MFA", "INVALID_ARGUMENTS", "RELEASE_SCOPE_REQUIRED", "SECOND_REVIEWER_REQUIRED", "STALE_VERSION", "RULE_MISMATCH"];
const fail = (m: string) => new Error(ERR.find((x) => m.includes(x)) ?? "INSPECTOR_ACTION_DENIED");

export const readEvidenceInspector = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc("evidence_inspector" as never);
  if (error) throw fail(error.message);
  if (containsSensitive(data)) throw new Error("REDACTION_FAILED");
  return itemsSchema.parse(data) as Item[];
});
export const recordInspection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => recordSchema.parse(v))
  .handler(async ({ data: d, context }) => {
    const { data, error } = await context.supabase.rpc("evidence_inspector_record" as never, { _lineage: d.lineage, _rule: d.rule, _register: d.register, _expected: d.expected, _observed: d.observed, _blocker: d.blocker, _owner: d.owner, _reviewer: d.reviewer, _ref: d.ref, _action: d.action, _date: d.date } as never);
    if (error) throw fail(error.message);
    return data as unknown as { id: string; version: number; correlation_id: string };
  });
export const confirmInspection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => confirmInputSchema.parse(v))
  .handler(async ({ data: d, context }) => {
    const { data, error } = await context.supabase.rpc("evidence_inspector_confirm" as never, { _id: d.id, _outcome: d.outcome } as never);
    if (error) throw fail(error.message);
    return data as unknown as { id: string; correlation_id: string };
  });
