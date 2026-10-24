import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Wellness operations: locations, rooms, service catalogue and therapists.
 * Everything runs as the signed-in user so row level security enforces the
 * partner / location boundary.
 */

const uuid = z.string().uuid();

/* -------------------------------------------------------------------------- */
/* Locations and rooms                                                        */
/* -------------------------------------------------------------------------- */

export const listLocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("locations")
      .select(
        "id, partner_id, code, name, city, address, phone, country_code, timezone, status, created_at, partners!locations_partner_id_fkey(display_name, partner_type)",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const locationInput = z.object({
  partnerId: uuid,
  code: z.string().min(2).max(24),
  name: z.string().min(2).max(120),
  city: z.string().max(80).optional().or(z.literal("")),
  address: z.string().max(240).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  countryCode: z.string().min(2).max(2).default("TH"),
  timezone: z.string().min(2).max(64).default("Asia/Bangkok"),
});

export const createLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => locationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("locations")
      .insert({
        partner_id: data.partnerId,
        code: data.code.toUpperCase(),
        name: data.name,
        city: data.city || null,
        address: data.address || null,
        phone: data.phone || null,
        country_code: data.countryCode.toUpperCase(),
        timezone: data.timezone,
      })
      .select("id, code, name")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: data.partnerId,
      location_id: row.id,
      action: "LOCATION_CREATED",
      entity_type: "location",
      entity_id: row.id,
      metadata: { code: row.code, name: row.name },
    });
    return row;
  });

export const setLocationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid, status: z.enum(["ACTIVE", "INACTIVE"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("locations")
      .update({ status: data.status })
      .eq("id", data.id)
      .select("id, partner_id, status")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: row.partner_id,
      location_id: row.id,
      action: "LOCATION_STATUS_CHANGED",
      entity_type: "location",
      entity_id: row.id,
      metadata: { status: row.status },
    });
    return row;
  });

export const listRooms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ locationId: uuid.optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("rooms")
      .select("id, location_id, code, name, capacity, active, locations(name)")
      .order("code");
    if (data.locationId) query = query.eq("location_id", data.locationId);
    const { data: rows, error } = await query.limit(300);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        locationId: uuid,
        code: z.string().min(1).max(24),
        name: z.string().min(1).max(120),
        capacity: z.number().int().min(1).max(50).default(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("rooms")
      .insert({
        location_id: data.locationId,
        code: data.code.toUpperCase(),
        name: data.name,
        capacity: data.capacity,
      })
      .select("id, code, name")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/* -------------------------------------------------------------------------- */
/* Services                                                                   */
/* -------------------------------------------------------------------------- */

export const listServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("services")
      .select(
        "id, partner_id, code, name, name_th, category, duration_minutes, buffer_minutes, requires_room, requires_therapist, active, partners(display_name), service_prices(id, price, currency, channel, location_id, active)",
      )
      .order("name")
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const serviceInput = z.object({
  partnerId: uuid,
  code: z.string().min(2).max(24),
  name: z.string().min(2).max(120),
  nameTh: z.string().max(120).optional().or(z.literal("")),
  category: z.enum(["MASSAGE", "SPA", "AESTHETIC", "MEDICAL", "WELLNESS", "HOME_SERVICE"]),
  durationMinutes: z.number().int().min(10).max(600),
  bufferMinutes: z.number().int().min(0).max(120).default(10),
  price: z.number().min(0),
  currency: z.string().min(3).max(3).default("THB"),
});

export const createService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => serviceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("services")
      .insert({
        partner_id: data.partnerId,
        code: data.code.toUpperCase(),
        name: data.name,
        name_th: data.nameTh || null,
        category: data.category,
        duration_minutes: data.durationMinutes,
        buffer_minutes: data.bufferMinutes,
      })
      .select("id, code, name")
      .single();
    if (error) throw new Error(error.message);

    const { error: priceError } = await supabase.from("service_prices").insert({
      service_id: row.id,
      price: data.price,
      currency: data.currency.toUpperCase(),
      channel: "WALK_IN",
    });
    if (priceError) throw new Error(priceError.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: data.partnerId,
      action: "SERVICE_CREATED",
      entity_type: "service",
      entity_id: row.id,
      metadata: { code: row.code, price: data.price, currency: data.currency },
    });
    return row;
  });

export const setServiceActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid, active: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("services")
      .update({ active: data.active })
      .eq("id", data.id)
      .select("id, active")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/* -------------------------------------------------------------------------- */
/* Therapists                                                                 */
/* -------------------------------------------------------------------------- */

export const listTherapists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("therapists")
      .select(
        "id, partner_id, home_location_id, staff_code, first_name, last_name, display_name, phone, email, employment_type, status, languages, partners(display_name), locations(name), therapist_service_eligibility(service_id, skill_level, services(name))",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const therapistInput = z.object({
  partnerId: uuid,
  homeLocationId: uuid.optional(),
  staffCode: z.string().min(2).max(24),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  phone: z.string().max(40).optional().or(z.literal("")),
  email: z.string().email().max(160).optional().or(z.literal("")),
  employmentType: z.enum(["EMPLOYEE", "FREELANCE", "CONTRACT"]).default("EMPLOYEE"),
});

export const createTherapist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => therapistInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("therapists")
      .insert({
        partner_id: data.partnerId,
        home_location_id: data.homeLocationId ?? null,
        staff_code: data.staffCode.toUpperCase(),
        first_name: data.firstName,
        last_name: data.lastName,
        phone: data.phone || null,
        email: data.email || null,
        employment_type: data.employmentType,
      })
      .select("id, staff_code")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: data.partnerId,
      action: "THERAPIST_CREATED",
      entity_type: "therapist",
      entity_id: row.id,
      metadata: { staff_code: row.staff_code },
    });
    return row;
  });

export const setTherapistStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: uuid, status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("therapists")
      .update({ status: data.status })
      .eq("id", data.id)
      .select("id, partner_id, status")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: row.partner_id,
      action: "THERAPIST_STATUS_CHANGED",
      entity_type: "therapist",
      entity_id: row.id,
      metadata: { status: row.status },
    });
    return row;
  });

export const setTherapistEligibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        therapistId: uuid,
        serviceId: uuid,
        enabled: z.boolean(),
        skillLevel: z.number().int().min(1).max(5).default(3),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!data.enabled) {
      const { error } = await supabase
        .from("therapist_service_eligibility")
        .delete()
        .eq("therapist_id", data.therapistId)
        .eq("service_id", data.serviceId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await supabase.from("therapist_service_eligibility").insert({
      therapist_id: data.therapistId,
      service_id: data.serviceId,
      skill_level: data.skillLevel,
    });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });

export const listTherapistAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ therapistId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("therapist_availability")
      .select("id, weekday, start_time, end_time, location_id")
      .eq("therapist_id", data.therapistId)
      .order("weekday");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addTherapistAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        therapistId: uuid,
        locationId: uuid.optional(),
        weekday: z.number().int().min(0).max(6),
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("therapist_availability").insert({
      therapist_id: data.therapistId,
      location_id: data.locationId ?? null,
      weekday: data.weekday,
      start_time: data.startTime,
      end_time: data.endTime,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeTherapistAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("therapist_availability").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
