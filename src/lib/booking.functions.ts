import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Wellness bookings, payments and commission.
 *
 * Bookings are separate records from clinical consultations; they may link to
 * one through consultation_id, but the CareCredit lifecycle stays untouched.
 * Cash, ledger and commission posting always goes through the
 * record_booking_payment() database function so the ledger stays balanced.
 */

const uuid = z.string().uuid();

const bookingFilter = z
  .object({
    locationId: uuid.optional(),
    status: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    limit: z.number().int().min(1).max(500).optional(),
  })
  .default({});

export const listBookings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bookingFilter.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("bookings")
      .select(
        "id, booking_code, partner_id, location_id, patient_id, consultation_id, status, channel, starts_at, ends_at, currency, total_amount, paid_amount, notes, created_at, locations(name), patients(first_name, last_name, external_patient_id), booking_items(id, service_id, therapist_id, room_id, starts_at, ends_at, quantity, unit_price, line_total, cancelled, services(name, duration_minutes), therapists(first_name, last_name), rooms(name))",
      )
      .order("starts_at", { ascending: false })
      .limit(data.limit ?? 200);

    if (data.locationId) query = query.eq("location_id", data.locationId);
    if (data.status) query = query.eq("status", data.status as "DRAFT");
    if (data.from) query = query.gte("starts_at", new Date(data.from).toISOString());
    if (data.to) query = query.lte("starts_at", new Date(`${data.to}T23:59:59.999Z`).toISOString());

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const createBookingInput = z.object({
  partnerId: uuid,
  locationId: uuid,
  patientId: uuid,
  serviceId: uuid,
  therapistId: uuid.optional(),
  roomId: uuid.optional(),
  startsAt: z.string().min(10),
  channel: z.enum(["WALK_IN", "ONLINE", "PHONE", "HOTEL", "CORPORATE", "PARTNER"]).default("WALK_IN"),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export const createBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createBookingInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: service, error: serviceError } = await supabase
      .from("services")
      .select("id, name, duration_minutes, active, requires_therapist, requires_room, service_prices(price, currency, active, location_id)")
      .eq("id", data.serviceId)
      .single();
    if (serviceError) throw new Error(serviceError.message);
    if (!service.active) throw new Error("That service is not currently offered.");
    if (service.requires_therapist && !data.therapistId) throw new Error("This service needs a therapist.");
    if (service.requires_room && !data.roomId) throw new Error("This service needs a room.");

    const prices = (service.service_prices ?? []).filter((p) => p.active);
    const price = prices.find((p) => p.location_id === data.locationId) ?? prices[0];
    const unitPrice = Number(price?.price ?? 0);
    const currency = price?.currency ?? "THB";

    const startsAt = new Date(data.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new Error("Invalid start time.");
    const endsAt = new Date(startsAt.getTime() + service.duration_minutes * 60000);

    const code = `BK-${Date.now().toString(36).toUpperCase()}`;

    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        booking_code: code,
        partner_id: data.partnerId,
        location_id: data.locationId,
        patient_id: data.patientId,
        status: "CONFIRMED",
        channel: data.channel,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        currency,
        total_amount: unitPrice,
        notes: data.notes || null,
        created_by: userId,
      })
      .select("id, booking_code, starts_at, ends_at")
      .single();
    if (error) throw new Error(error.message);

    const { error: itemError } = await supabase.from("booking_items").insert({
      booking_id: booking.id,
      service_id: data.serviceId,
      therapist_id: data.therapistId ?? null,
      room_id: data.roomId ?? null,
      starts_at: booking.starts_at,
      ends_at: booking.ends_at,
      quantity: 1,
      unit_price: unitPrice,
      line_total: unitPrice,
    });

    if (itemError) {
      // Overlap exclusion constraints keep one therapist or room in one place.
      await supabase.from("bookings").delete().eq("id", booking.id);
      if (itemError.message.includes("booking_items_no_therapist_overlap")) {
        throw new Error("That therapist is already booked at this time.");
      }
      if (itemError.message.includes("booking_items_no_room_overlap")) {
        throw new Error("That room is already booked at this time.");
      }
      throw new Error(itemError.message);
    }

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: data.partnerId,
      location_id: data.locationId,
      action: "BOOKING_CREATED",
      entity_type: "booking",
      entity_id: booking.id,
      metadata: { booking_code: booking.booking_code, service: service.name, amount: unitPrice, currency },
    });

    return booking;
  });

export const setBookingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: uuid,
        status: z.enum(["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"]),
        reason: z.string().max(400).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: booking, error } = await supabase
      .from("bookings")
      .update({
        status: data.status,
        cancellation_reason: data.status === "CANCELLED" ? data.reason || "Cancelled by staff" : null,
      })
      .eq("id", data.id)
      .select("id, booking_code, partner_id, location_id, status")
      .single();
    if (error) throw new Error(error.message);

    if (data.status === "CANCELLED" || data.status === "NO_SHOW") {
      // Free the therapist and room slots.
      await supabase.from("booking_items").update({ cancelled: true }).eq("booking_id", booking.id);
    }

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: booking.partner_id,
      location_id: booking.location_id,
      action: `BOOKING_${booking.status}`,
      entity_type: "booking",
      entity_id: booking.id,
      metadata: { booking_code: booking.booking_code, reason: data.reason || null },
    });

    return booking;
  });

/* -------------------------------------------------------------------------- */
/* Payments                                                                   */
/* -------------------------------------------------------------------------- */

export const recordBookingPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        bookingId: uuid,
        amount: z.number().positive(),
        channel: z.enum(["CASH", "CARD", "PROMPTPAY", "BANK_TRANSFER", "HOTEL_FOLIO", "CORPORATE_INVOICE", "ONLINE"]),
        reference: z.string().min(3).max(64),
        feeAmount: z.number().min(0).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: payment, error } = await supabase.rpc("record_booking_payment", {
      _booking_id: data.bookingId,
      _amount: data.amount,
      _channel: data.channel,
      _reference: data.reference,
      _fee_amount: data.feeAmount,
    });
    if (error) throw new Error(error.message);

    const row = payment as unknown as { id: string; partner_id: string; location_id: string | null; amount: number };

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: row.partner_id,
      location_id: row.location_id,
      action: "BOOKING_PAYMENT_RECORDED",
      entity_type: "payment_transaction",
      entity_id: row.id,
      metadata: { reference: data.reference, amount: data.amount, channel: data.channel },
    });

    return row;
  });

export const listPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ from: z.string().optional(), to: z.string().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("payment_transactions")
      .select(
        "id, reference, partner_id, location_id, booking_id, channel, status, currency, amount, fee_amount, captured_at, created_at, locations(name), bookings(booking_code)",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.from) query = query.gte("created_at", new Date(data.from).toISOString());
    if (data.to) query = query.lte("created_at", new Date(`${data.to}T23:59:59.999Z`).toISOString());
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getRevenueSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [payments, bookings, earnings] = await Promise.all([
      supabase.from("payment_transactions").select("amount, currency, status, created_at").gte("created_at", since),
      supabase.from("bookings").select("id, status, starts_at").gte("starts_at", since),
      supabase.from("therapist_earnings").select("amount, status"),
    ]);

    const paid = (payments.data ?? []).filter((p) => p.status === "PAID");
    const revenue30d = paid.reduce((sum, p) => sum + Number(p.amount), 0);
    const currency = paid[0]?.currency ?? "THB";
    const completed = (bookings.data ?? []).filter((b) => b.status === "COMPLETED").length;
    const cancelled = (bookings.data ?? []).filter((b) => b.status === "CANCELLED" || b.status === "NO_SHOW").length;
    const commissionPending = (earnings.data ?? [])
      .filter((e) => e.status === "PENDING")
      .reduce((sum, e) => sum + Number(e.amount), 0);

    return {
      revenue30d,
      currency,
      paymentCount: paid.length,
      bookings30d: bookings.data?.length ?? 0,
      completed,
      cancelled,
      commissionPending,
    };
  });

/* -------------------------------------------------------------------------- */
/* Commission                                                                 */
/* -------------------------------------------------------------------------- */

export const listCommissionPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("commission_plans")
      .select(
        "id, partner_id, code, name, active, effective_from, partners(display_name), commission_rules(id, basis, rate, fixed_amount, priority, service_category, service_id, services(name))",
      )
      .order("effective_from", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createCommissionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ partnerId: uuid, code: z.string().min(2).max(24), name: z.string().min(2).max(120) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("commission_plans")
      .insert({ partner_id: data.partnerId, code: data.code.toUpperCase(), name: data.name })
      .select("id, code")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const addCommissionRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        planId: uuid,
        serviceCategory: z
          .enum(["MASSAGE", "SPA", "AESTHETIC", "MEDICAL", "WELLNESS", "HOME_SERVICE"])
          .optional(),
        basis: z.enum(["PERCENT_OF_SERVICE", "FIXED_PER_SERVICE", "PERCENT_OF_NET"]).default("PERCENT_OF_SERVICE"),
        rate: z.number().min(0).max(100).default(0),
        fixedAmount: z.number().min(0).default(0),
        priority: z.number().int().min(1).max(999).default(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("commission_rules").insert({
      plan_id: data.planId,
      service_category: data.serviceCategory ?? null,
      basis: data.basis,
      rate: data.rate,
      fixed_amount: data.fixedAmount,
      priority: data.priority,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listTherapistEarnings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("therapist_earnings")
      .select(
        "id, therapist_id, partner_id, currency, amount, status, earned_on, approved_at, therapists(first_name, last_name, staff_code)",
      )
      .order("earned_on", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const approveTherapistEarning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid, status: z.enum(["APPROVED", "PAID", "VOID"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("therapist_earnings")
      .update({ status: data.status, approved_by: userId, approved_at: new Date().toISOString() })
      .eq("id", data.id)
      .select("id, partner_id, status, amount")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: row.partner_id,
      action: "THERAPIST_EARNING_UPDATED",
      entity_type: "therapist_earning",
      entity_id: row.id,
      metadata: { status: row.status, amount: row.amount },
    });
    return row;
  });
