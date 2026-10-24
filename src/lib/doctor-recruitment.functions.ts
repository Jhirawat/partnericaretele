// Doctor recruitment, verification, assignment and availability.
// Every write goes through the database doctor_command, which derives the actor from the session,
// enforces organization/branch scope and step-up MFA. The client supplies intent only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const reason = z.string().trim().max(1000).optional();

export const doctorCommandSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("REGISTER"),
    fullName: z.string().trim().min(2).max(120),
    licenseNumber: z.string().trim().min(2).max(60),
    licenseExpiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")),
    specialty: z.string().trim().max(120),
    phone: z.string().trim().max(40),
    email: z.string().trim().email().max(200).or(z.literal("")),
    locationId: uuid.or(z.literal("")),
  }).strict(),
  z.object({ op: z.enum(["LINK_ACCOUNT", "VERIFY", "REINSTATE"]), id: uuid }).strict(),
  z.object({ op: z.enum(["SUSPEND", "REVOKE_ACCESS"]), id: uuid, reason: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ op: z.literal("ASSIGN"), id: uuid, partnerId: uuid, locationId: uuid.or(z.literal("")) }).strict(),
  z.object({ op: z.literal("SET_ASSIGNMENT"), id: uuid, status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]), reason }).strict(),
  z.object({
    op: z.literal("SET_AVAILABILITY"),
    id: uuid,
    slots: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }).strict()).max(28),
  }).strict(),
]);
export type DoctorCommand = z.infer<typeof doctorCommandSchema>;

export const doctorCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => doctorCommandSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { op, ...rest } = data;
    const id = "id" in rest ? (rest as { id: string }).id : null;
    const args = { ...rest } as Record<string, unknown>;
    delete args['id'];
    const { data: result, error } = await context.supabase.rpc("doctor_command", { _op: op, _id: id, _args: args } as never);
    if (error) throw new Error(error.message);
    return { ok: true, status: (result as { status?: string } | null)?.status ?? null };
  });

export interface DoctorRow { id: string; full_name: string; license_number: string; license_expires_on: string | null; specialty: string | null; email: string | null; phone: string | null; status: string; location_id: string | null; auth_user_id: string | null; approved_at: string | null }
export interface AssignmentRow { id: string; doctor_id: string; partner_id: string; location_id: string | null; status: string; reason: string | null; updated_at: string }
export interface SlotRow { id: string; assignment_id: string; weekday: number; start_time: string; end_time: string }

/** Admin queue: doctors, assignments, organizations and branches visible under RLS. */
export const readDoctorRecruitment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = context.supabase;
    const [doctors, assignments, partners, locations, roles] = await Promise.all([
      s.from("doctors").select("id, full_name, license_number, license_expires_on, specialty, email, phone, status, location_id, auth_user_id, approved_at").order("created_at", { ascending: false }),
      s.from("doctor_assignments").select("id, doctor_id, partner_id, location_id, status, reason, updated_at"),
      s.from("partners").select("id, display_name").order("display_name"),
      s.from("locations").select("id, partner_id, name").order("name"),
      s.from("user_roles").select("role, partner_id, status").eq("user_id", context.userId),
    ]);
    for (const r of [doctors, assignments, partners, locations, roles]) if (r.error) throw new Error(r.error.message);
    return {
      doctors: (doctors.data ?? []) as unknown as DoctorRow[],
      assignments: (assignments.data ?? []) as unknown as AssignmentRow[],
      partners: (partners.data ?? []) as { id: string; display_name: string }[],
      locations: (locations.data ?? []) as { id: string; partner_id: string; name: string }[],
      roles: (roles.data ?? []) as { role: string; partner_id: string | null; status: string }[],
    };
  });

/** Doctor workspace: own record, own assignments and own availability. */
export const readDoctorWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = context.supabase;
    const { data: doctor, error } = await s.from("doctors").select("id, full_name, license_number, license_expires_on, specialty, email, phone, status, location_id, auth_user_id, approved_at").eq("auth_user_id", context.userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!doctor) return { doctor: null, assignments: [] as (AssignmentRow & { partner_name: string | null; location_name: string | null })[], slots: [] as SlotRow[] };
    const [a, sl, p, l] = await Promise.all([
      s.from("doctor_assignments").select("id, doctor_id, partner_id, location_id, status, reason, updated_at").eq("doctor_id", doctor.id),
      s.from("doctor_availability").select("id, assignment_id, weekday, start_time, end_time").eq("doctor_id", doctor.id).order("weekday"),
      s.from("partners").select("id, display_name"),
      s.from("locations").select("id, name"),
    ]);
    if (a.error) throw new Error(a.error.message);
    if (sl.error) throw new Error(sl.error.message);
    const pn = new Map((p.data ?? []).map((x) => [x.id, x.display_name]));
    const ln = new Map((l.data ?? []).map((x) => [x.id, x.name]));
    return {
      doctor: doctor as unknown as DoctorRow,
      assignments: ((a.data ?? []) as unknown as AssignmentRow[]).map((x) => ({ ...x, partner_name: pn.get(x.partner_id) ?? null, location_name: x.location_id ? ln.get(x.location_id) ?? null : null })),
      slots: (sl.data ?? []) as unknown as SlotRow[],
    };
  });
