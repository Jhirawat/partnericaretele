import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { containsSensitive } from "./release-readiness";
import { CONTENT_TYPES, ROUTE_SCOPES, unsafeContent, type ContentEntry } from "./content-review";

const ERR = ["MFA", "INVALID_ARGUMENTS", "RELEASE_SCOPE_REQUIRED", "SECOND_REVIEWER_REQUIRED", "STALE_VERSION", "CLAIM_TYPE_MISMATCH"];
const fail = (m: string) => new Error(ERR.find((x) => m.includes(x)) ?? "RELEASE_ACTION_DENIED");
const safe = (max: number) => z.string().trim().min(3).max(max).refine((n) => !unsafeContent(n), "REDACTED_CONTENT_REQUIRED");
const role = z.enum(["SUPER_ADMIN", "OPERATIONS_ADMIN"]);
const types = CONTENT_TYPES.map((t) => t.key) as unknown as [string, ...string[]];

export const readContentReviews = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc("content_review_console" as never);
  if (error) throw new Error("RELEASE_ACCESS_DENIED");
  if (containsSensitive(data)) throw new Error("REDACTION_FAILED");
  return data as unknown as ContentEntry[];
});
export const recordContentReview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ lineage: z.string().uuid().nullable(), type: z.enum(types), route: z.enum(ROUTE_SCOPES), scope: safe(120), owner: role, reviewer: role, status: z.enum(["pending", "blocked", "unverified"]), ref: safe(120), reason: safe(300), next: safe(300), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }).strict().parse(v))
  .handler(async ({ data: d, context }) => {
    const { data, error } = await context.supabase.rpc("content_review_record" as never, { _lineage: d.lineage, _type: d.type, _route: d.route, _scope: d.scope, _owner: d.owner, _reviewer: d.reviewer, _status: d.status, _ref: d.ref, _reason: d.reason, _next: d.next, _date: d.date } as never);
    if (error) throw fail(error.message);
    return data as unknown as { id: string; version: number; correlation_id: string };
  });
export const ackContentReview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid(), outcome: z.enum(["acknowledged", "concern"]), note: safe(300) }).strict().parse(v))
  .handler(async ({ data: d, context }) => {
    const { data, error } = await context.supabase.rpc("content_review_ack" as never, { _id: d.id, _outcome: d.outcome, _note: d.note } as never);
    if (error) throw fail(error.message);
    return data as unknown as { id: string; correlation_id: string };
  });
