import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { containsSensitive } from "./release-readiness";
import { unsafeProtection, type ProtectionEntry } from "./protection-evidence";

const ERR = ["MFA", "INVALID_ARGUMENTS", "RELEASE_SCOPE_REQUIRED", "SECOND_REVIEWER_REQUIRED", "STALE_VERSION"];
const fail = (m: string) => new Error(ERR.find((x) => m.includes(x)) ?? "RELEASE_ACTION_DENIED");
const safe = (min: number, max: number) => z.string().trim().min(min).max(max).refine((n) => !unsafeProtection(n), "REDACTED_CONTENT_REQUIRED");
const role = z.enum(["SUPER_ADMIN", "OPERATIONS_ADMIN"]);

export const readProtection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc("protection_evidence_console" as never);
  if (error) throw new Error("RELEASE_ACCESS_DENIED");
  if (containsSensitive(data)) throw new Error("REDACTION_FAILED");
  return data as unknown as ProtectionEntry[];
});
export const recordProtection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ lineage: z.string().uuid().nullable(), env: safe(3, 60), mig: safe(3, 60), applied: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), history: z.enum(["not_checked", "matched", "drift"]), rls: z.enum(["not_checked", "all_enabled", "gaps"]), tables: z.enum(["not_checked", "all_protected", "gaps"]), storage: z.enum(["not_checked", "private", "public_found"]), owner: role, reviewer: role, ref: safe(3, 120), status: z.enum(["pending", "blocked", "unverified"]), next: safe(3, 300) }).strict().parse(v))
  .handler(async ({ data: d, context }) => {
    const { data, error } = await context.supabase.rpc("protection_evidence_record" as never, { _lineage: d.lineage, _env: d.env, _mig: d.mig, _applied: d.applied, _history: d.history, _rls: d.rls, _tables: d.tables, _storage: d.storage, _owner: d.owner, _reviewer: d.reviewer, _ref: d.ref, _status: d.status, _next: d.next } as never);
    if (error) throw fail(error.message);
    return data as unknown as { id: string; version: number; correlation_id: string };
  });
export const confirmProtection = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ id: z.string().uuid(), outcome: z.enum(["confirmed", "rejected"]), note: safe(3, 300) }).strict().parse(v))
  .handler(async ({ data: d, context }) => {
    const { data, error } = await context.supabase.rpc("protection_evidence_confirm" as never, { _id: d.id, _outcome: d.outcome, _note: d.note } as never);
    if (error) throw fail(error.message);
    return data as unknown as { id: string; correlation_id: string };
  });
