import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { containsSensitive } from "./release-readiness";
import { unsafeText } from "./release-evidence";
import { REVIEW_ITEMS, type Ack } from "./publish-gate";

export const readReviews = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.rpc("release_review_console" as never);
  if (error) throw new Error("RELEASE_ACCESS_DENIED");
  if (containsSensitive(data)) throw new Error("REDACTION_FAILED");
  return data as unknown as Ack[];
});
const keys = REVIEW_ITEMS.map((i) => i.key) as [string, ...string[]];
export const acknowledgeReview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ item: z.enum(keys), outcome: z.enum(["acknowledged", "concern"]), note: z.string().trim().min(3).max(300).refine((n) => !unsafeText(n), "REDACTED_CONTENT_REQUIRED") }).strict().parse(v))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("release_review_ack" as never, { _item: data.item, _outcome: data.outcome, _note: data.note } as never);
    if (error) { const k = ["MFA", "INVALID_ARGUMENTS", "RELEASE_SCOPE_REQUIRED"].find((x) => error.message.includes(x)); throw new Error(k ?? "RELEASE_ACTION_DENIED"); }
    return r as unknown as { id: string; round: number; correlation_id: string; created_at: string };
  });
