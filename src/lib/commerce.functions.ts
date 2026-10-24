import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * CareCredit ledger, partner packages and patient memberships.
 * Credits move only through the atomic apply_credit_transaction ledger
 * primitive — never by writing partners.credit_balance directly.
 */

const uuid = z.string().uuid();

export const listCreditLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ partnerId: uuid.optional(), limit: z.number().int().min(1).max(1000).optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("credit_transactions")
      .select(
        "id, partner_id, consultation_id, type, quantity, balance_after, reference_id, created_at, metadata",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.partnerId) query = query.eq("partner_id", data.partnerId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getCreditPosition = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [partners, consultations] = await Promise.all([
      context.supabase
        .from("partners")
        .select("id, display_name, partner_code, status, credit_balance"),
      context.supabase.from("consultations").select("partner_id, credit_status"),
    ]);

    const reserved: Record<string, number> = {};
    const consumed: Record<string, number> = {};
    for (const row of consultations.data ?? []) {
      if (row.credit_status === "RESERVED")
        reserved[row.partner_id] = (reserved[row.partner_id] ?? 0) + 1;
      if (row.credit_status === "CONSUMED")
        consumed[row.partner_id] = (consumed[row.partner_id] ?? 0) + 1;
    }

    return (partners.data ?? []).map((p) => ({
      ...p,
      reserved: reserved[p.id] ?? 0,
      consumed: consumed[p.id] ?? 0,
    }));
  });

export const listCreditOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("credit_orders")
      .select(
        "id, order_code, partner_id, package_code, credits, amount, currency, status, payment_method, payment_reference, notes, approved_at, created_at, partners(display_name, partner_code)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createCreditOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        partnerId: uuid,
        credits: z.number().int().min(1).max(100000),
        amount: z.number().min(0).max(100000000),
        paymentMethod: z.enum(["INVOICE", "BANK_TRANSFER", "PROMPTPAY", "CARD"]),
        notes: z.string().max(500).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("credit_orders")
      .insert({
        partner_id: data.partnerId,
        credits: data.credits,
        amount: data.amount,
        payment_method: data.paymentMethod,
        notes: data.notes || null,
        created_by: userId,
        status: "AWAITING_PAYMENT",
      })
      .select("id, order_code, credits, amount, status")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: data.partnerId,
      action: "CREDIT_ORDER_CREATED",
      entity_type: "credit_order",
      entity_id: row.id,
      metadata: { order_code: row.order_code, credits: row.credits, amount: row.amount },
    });

    return row;
  });

/** Finance confirmation of an offline payment — the only way credits are issued. */
export const settleCreditOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ orderId: uuid, paymentReference: z.string().min(3).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    type Client = {
      rpc(
        name: "care_settle_historical_order",
        args: { _id: string; _reference: string; _evidence: string },
      ): PromiseLike<{
        data: { id: string; status: string; order_code: string };
        error: { message: string } | null;
      }>;
    };
    const result = await (context.supabase as unknown as Client).rpc(
      "care_settle_historical_order",
      {
        _id: data.orderId,
        _reference: data.paymentReference,
        _evidence: "FINANCE_VERIFIED:" + data.paymentReference,
      },
    );
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });

export const cancelCreditOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("credit_orders")
      .update({ status: "CANCELLED" })
      .eq("id", data.orderId)
      .eq("status", "AWAITING_PAYMENT")
      .select("id, order_code, partner_id, status")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: row.partner_id,
      action: "CREDIT_ORDER_CANCELLED",
      entity_type: "credit_order",
      entity_id: row.id,
      metadata: { order_code: row.order_code },
    });
    return row;
  });

export const adjustPartnerCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        partnerId: uuid,
        quantity: z.number().int().min(-10000).max(10000),
        reason: z.string().min(3).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const key = `adjust:${data.partnerId}:${Date.now()}`;
    const { error } = await supabase.rpc("apply_credit_transaction", {
      _partner_id: data.partnerId,
      _type: "ADJUSTMENT",
      _quantity: data.quantity,
      _idempotency_key: key,
      _actor: userId,
      _metadata: { reason: data.reason },
    });
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: data.partnerId,
      action: "CREDIT_ADJUSTED",
      entity_type: "partner",
      entity_id: data.partnerId,
      metadata: { quantity: data.quantity, reason: data.reason },
    });
    return { ok: true };
  });

/* ----------------------------- Memberships ----------------------------- */

export const listMembershipPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("membership_plans")
      .select("id, code, name, price, currency, duration_months, included_consultations, active")
      .eq("active", true)
      .order("price");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listMemberships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("memberships")
      .select(
        "id, status, starts_at, expires_at, payment_status, payment_reference, created_at, patient_id, patients(first_name, last_name, external_patient_id), membership_plans(name, code, price, currency)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ patientId: uuid, planId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("memberships")
      .insert({
        patient_id: data.patientId,
        plan_id: data.planId,
        status: "PENDING",
        payment_status: "UNPAID",
      })
      .select("id, status")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      action: "MEMBERSHIP_CREATED",
      entity_type: "membership",
      entity_id: row.id,
      metadata: { patient_id: data.patientId },
    });
    return row;
  });

/** Activates an annual membership once payment is confirmed by Finance. */
export const activateMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ membershipId: uuid, paymentReference: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: membership, error: loadError } = await supabase
      .from("memberships")
      .select("id, plan_id, status, membership_plans(duration_months)")
      .eq("id", data.membershipId)
      .single();
    if (loadError) throw new Error(loadError.message);
    if (membership.status === "ACTIVE") throw new Error("This membership is already active.");

    const months = membership.membership_plans?.duration_months ?? 12;
    const startsAt = new Date();
    const expiresAt = new Date(startsAt);
    expiresAt.setMonth(expiresAt.getMonth() + months);

    const { data: row, error } = await supabase
      .from("memberships")
      .update({
        status: "ACTIVE",
        payment_status: "PAID",
        payment_reference: data.paymentReference,
        starts_at: startsAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .eq("id", membership.id)
      .select("id, status, starts_at, expires_at")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      action: "MEMBERSHIP_ACTIVATED",
      entity_type: "membership",
      entity_id: row.id,
      metadata: { reference: data.paymentReference },
    });
    return row;
  });
