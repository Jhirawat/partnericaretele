// Phase 08: patient prepaid package purchase + balance server functions.
// The database owns pricing, plan binding and authorization; the client only
// picks a package version id. Payment settlement and lot GRANT stay server-side.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PrepaidPurchase {
  id: string;
  amount_minor: number;
  currency: string;
  status: string;
  plan_version_id: string;
}

export const purchasePrepaidPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ planVersionId: z.string().uuid() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("care_prepaid_purchase", {
      _plan_version: data.planVersionId,
    });
    if (error) throw new Error(error.message);
    return { purchase: r as unknown as PrepaidPurchase };
  });

export interface PrepaidLotBalance {
  lot_id: string;
  kind: "COUNT" | "VALUE";
  expires_at: string;
  count_available: number;
  minor_available: number;
}

export const getMyPrepaidBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ patientId: z.string().uuid() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("care_personal_balance", {
      _patient: data.patientId,
    });
    if (error) throw new Error(error.message);
    return { lots: (r as unknown as PrepaidLotBalance[] | null) ?? [] };
  });
