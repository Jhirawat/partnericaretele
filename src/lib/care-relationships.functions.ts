import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Phase 04: audited care-relationship commands. Authorization (platform admin or
// owning-org manager + MFA step-up) is enforced inside the database functions;
// the verified actor comes from the session, never from client input.

export const grantCareRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        patientId: z.string().uuid(),
        doctorId: z.string().uuid(),
        validUntil: z.string().datetime().nullable().optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("care_grant_relationship", {
      _patient: data.patientId,
      _doctor: data.doctorId,
      _valid_until: data.validUntil ?? null,
    } as unknown as { _patient: string; _doctor: string; _valid_until: string });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const revokeCareRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ relationshipId: z.string().uuid(), reason: z.string().min(1).max(500) }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("care_revoke_relationship", {
      _id: data.relationshipId,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCareRelationships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ patientId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("care_relationships")
      .select("id, patient_id, doctor_id, partner_id, valid_from, valid_until, revoked_at, created_at")
      .eq("patient_id", data.patientId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { relationships: rows ?? [] };
  });
