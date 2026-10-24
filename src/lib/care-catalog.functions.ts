import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Phase 05: versioned service catalog. Authorization and MFA step-up are enforced
// inside the database command; the actor comes from the verified session only.

const versionInput = z
  .object({
    partnerId: z.string().uuid(),
    serviceId: z.string().uuid().nullable().optional(),
    name: z.string().min(1).max(200),
    nameTh: z.string().max(200).optional(),
    description: z.string().max(2000).optional(),
    durationMinutes: z.number().int().min(5).max(480).optional(),
    scope: z.string().max(500).optional(),
    priceMinor: z.number().int().min(0),
    currency: z.literal("THB").optional(),
    cancellationPolicy: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    effectiveFrom: z.string().datetime().optional(),
    effectiveTo: z.string().datetime().nullable().optional(),
  })
  .strict();

export const createServiceVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => versionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("care_service_version_command", {
      _op: "CREATE",
      _args: {
        partner_id: data.partnerId,
        service_id: data.serviceId ?? null,
        name: data.name,
        name_th: data.nameTh ?? null,
        description: data.description ?? null,
        duration_minutes: data.durationMinutes ?? 30,
        scope: data.scope ?? null,
        price_minor: data.priceMinor,
        currency: data.currency ?? "THB",
        cancellation_policy: data.cancellationPolicy ?? {},
        effective_from: data.effectiveFrom ?? null,
        effective_to: data.effectiveTo ?? null,
      },
    });
    if (error) throw new Error(error.message);
    return r as { id: string; op: string };
  });

export const setServiceVersionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ id: z.string().uuid(), op: z.enum(["APPROVE", "RETIRE"]) })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("care_service_version_command", {
      _op: data.op,
      _args: { id: data.id },
    });
    if (error) throw new Error(error.message);
    return r as { id: string; op: string };
  });

export interface CatalogItem {
  id: string;
  service_id: string | null;
  version: number;
  name: string;
  name_th: string | null;
  description: string | null;
  duration_minutes: number;
  scope: string | null;
  price_minor: number;
  currency: string;
  cancellation_policy: Record<string, string | number | boolean | null>;
  effective_from: string;
  effective_to: string | null;
}

export const getServiceCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ partnerId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("care_catalog", {
      _org: data.partnerId,
    });
    if (error) throw new Error(error.message);
    return { catalog: (rows as unknown as CatalogItem[] | null) ?? [] };
  });
