import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { settingSchema, settingsResultSchema } from "./site-settings";

export const readSiteSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ scope: z.enum(["admin", "doctor", "customer", "manage"]) }).strict().parse(input))
  .handler(async ({ data, context }) => {
    if (data.scope === "manage") {
      const gate = await context.supabase.rpc("staff_access_check", { _scope: "super" });
      if (gate.error || gate.data !== "ALLOWED") throw new Error("Site settings are unavailable for this account.");
    }
    const result = await context.supabase.rpc("site_settings_read", { _scope: data.scope });
    if (result.error) throw new Error("Site settings are unavailable for this account.");
    return settingsResultSchema.parse(result.data);
  });
export const saveSiteSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const gate = await context.supabase.rpc("staff_access_check", { _scope: "super" });
    if (gate.error || gate.data !== "ALLOWED") throw new Error("Superadmin verification is required.");
    const result = await context.supabase.rpc("site_settings_save", { _key: data.key, _value: data.value, _expected: data.expected });
    if (result.error) throw new Error(result.error.message.includes("STALE_SETTING_VERSION") ? "Settings changed since you opened this page. Reload before saving." : "Settings could not be saved. Check your permissions and values.");
    return { saved: true };
  });