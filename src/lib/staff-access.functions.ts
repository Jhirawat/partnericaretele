import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkStaffAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ scope: z.enum(["super", "staff"]) }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc("staff_access_check", { _scope: data.scope });
    if (result.error) return "DENIED" as const;
    return z.enum(["ALLOWED", "DENIED", "MFA_REQUIRED", "RESET_REQUIRED"]).parse(result.data);
  });