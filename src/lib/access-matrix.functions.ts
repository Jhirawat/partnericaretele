import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { containsSensitive } from "./release-readiness";
import { MATRIX_KEYS, unsafeAccess, type AccessEntry } from "./access-matrix";

const ERR = ["MFA", "INVALID_ARGUMENTS", "RELEASE_SCOPE_REQUIRED", "SECOND_REVIEWER_REQUIRED", "STALE_VERSION", "ITEM_MISMATCH"];
const fail = (m: string) => new Error(ERR.find((x) => m.includes(x)) ?? "RELEASE_ACTION_DENIED");
const safe = (max: number) => z.string().trim().min(3).max(max).refine((n) => !unsafeAccess(n), "REDACTED_CONTENT_REQUIRED");
const role = z.enum(["SUPER_ADMIN", "OPERATIONS_ADMIN"]);

export const readAccessAudit = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc("access_audit_console" as never);
  if (error) throw new Error("RELEASE_ACCESS_DENIED");
  if (containsSensitive(data)) throw new Error("REDACTION_FAILED");
  return data as unknown as AccessEntry[];
});
export const recordAccessAudit = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ lineage: z.string().uuid().nullable(), key: z.enum(MATRIX_KEYS as [string, ...string[]]), expected: z.enum(["allow", "deny"]), scope: safe(120), sensitivity: z.enum(["public", "confidential", "clinical", "restricted", "aggregate"]), owner: role, reviewer: role, status: z.enum(["pending", "blocked", "unverified"]), ref: safe(120), next: safe(300) }).strict().parse(v))
  .handler(async ({ data: d, context }) => {
    const { data, error } = await context.supabase.rpc("access_audit_record" as never, { _lineage: d.lineage, _key: d.key, _expected: d.expected, _scope: d.scope, _sens: d.sensitivity, _owner: d.owner, _reviewer: d.reviewer, _status: d.status, _ref: d.ref, _next: d.next } as never);
    if (error) throw fail(error.message);
    return data as unknown as { id: string; version: number; correlation_id: string };
  });
export const confirmAccessAudit = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid(), outcome: z.enum(["confirmed", "rejected"]), note: safe(300) }).strict().parse(v))
  .handler(async ({ data: d, context }) => {
    const { data, error } = await context.supabase.rpc("access_audit_confirm" as never, { _id: d.id, _outcome: d.outcome, _note: d.note } as never);
    if (error) throw fail(error.message);
    return data as unknown as { id: string; correlation_id: string };
  });
