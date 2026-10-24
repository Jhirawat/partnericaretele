import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { containsSensitive } from "./release-readiness";
import { entriesSchema, recordSchema, reviewInputSchema, type Entry } from "./content-approval";

const ERR = ["MFA", "INVALID_ARGUMENTS", "RELEASE_SCOPE_REQUIRED", "SECOND_REVIEWER_REQUIRED", "STALE_VERSION", "CATEGORY_MISMATCH"];
const fail = (m: string) => new Error(ERR.find((x) => m.includes(x)) ?? "APPROVAL_ACTION_DENIED");

export const readContentApprovals = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc("content_approval_console" as never);
  if (error) throw fail(error.message);
  if (containsSensitive(data)) throw new Error("REDACTION_FAILED");
  return entriesSchema.parse(data) as Entry[];
});
export const recordContentApproval = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => recordSchema.parse(v))
  .handler(async ({ data: d, context }) => {
    const { data, error } = await context.supabase.rpc("content_approval_record" as never, { _lineage: d.lineage, _category: d.category, _surface: d.surface, _canonical: d.canonical, _status: d.status, _owner: d.owner, _reviewer: d.reviewer, _ref: d.ref, _action: d.action, _date: d.date } as never);
    if (error) throw fail(error.message);
    return data as unknown as { id: string; version: number; correlation_id: string };
  });
export const reviewContentApproval = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => reviewInputSchema.parse(v))
  .handler(async ({ data: d, context }) => {
    const { data, error } = await context.supabase.rpc("content_approval_review" as never, { _id: d.id, _outcome: d.outcome } as never);
    if (error) throw fail(error.message);
    return data as unknown as { id: string; correlation_id: string };
  });
