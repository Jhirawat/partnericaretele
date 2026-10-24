// Phase 06: subscription entitlement server functions.
// Entitlement is evaluated in the database (care_entitlement); the client
// supplies only a patient/service reference — never an entitlement verdict.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface EntitlementResult {
  entitled: boolean;
  reason: string;
  membership_id?: string;
  period_id?: string;
  used?: number;
  quota?: number | null;
  unlimited?: boolean;
  auto_renew?: boolean;
  source?: "MANUAL" | "STRIPE";
}

export const checkEntitlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        patientId: z.string().uuid(),
        at: z.string().datetime().optional(),
        serviceId: z.string().uuid().optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("care_entitlement", {
      _patient: data.patientId,
      _at: data.at ?? new Date().toISOString(),
      ...(data.serviceId ? { _service: data.serviceId } : {}),
    });
    if (error) throw new Error(error.message);
    return { entitlement: result as unknown as EntitlementResult };
  });

export interface PlanVersionItem {
  id: string;
  plan_code: string;
  version: number;
  name: string;
  name_th: string | null;
  price_minor: number;
  currency: string;
  duration_months: number;
  quota: number | null;
  unlimited: boolean;
  service_coverage: string[];
  auto_renew: boolean;
  status: "DRAFT" | "APPROVED" | "RETIRED";
}

export const listPlanVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("care_plan_versions")
      .select(
        "id, plan_code, version, name, name_th, price_minor, currency, duration_months, quota, unlimited, service_coverage, auto_renew, status",
      )
      .order("plan_code")
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return { plans: (rows as unknown as PlanVersionItem[] | null) ?? [] };
  });

export const recordMembershipPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        membershipId: z.string().uuid(),
        planVersionId: z.string().uuid(),
        periodStart: z.string().datetime(),
        periodEnd: z.string().datetime(),
        paymentId: z.string().uuid().optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: periodId, error } = await context.supabase.rpc("care_record_period", {
      _membership: data.membershipId,
      _plan_version: data.planVersionId,
      _start: data.periodStart,
      _end: data.periodEnd,
      ...(data.paymentId ? { _payment: data.paymentId } : {}),
    });
    if (error) throw new Error(error.message);
    return { periodId: periodId as string };
  });
