import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * PartnerCare Phase 1 server functions.
 * All reads/writes run as the signed-in user, so tenant isolation is enforced
 * by row level security, not by these handlers alone.
 */

const uuid = z.string().uuid();

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, full_name, preferred_language")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("id, role, partner_id, status").eq("user_id", userId),
    ]);

    return {
      userId,
      email: profile?.email ?? null,
      fullName: profile?.full_name ?? null,
      roles: (roles ?? []).map((r) => ({
        role: r.role,
        partnerId: r.partner_id,
        status: r.status,
      })),
    };
  });

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const gate = await supabase.rpc("staff_access_check", { _scope: "staff" });
    if (gate.error || gate.data !== "ALLOWED") throw new Error("STAFF_ACCESS_DENIED");

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const [
      partners,
      patients,
      consultations,
      recent,
      ledger,
      webhookFailures,
      webhookTotal,
      conflicts,
      memberships,
    ] = await Promise.all([
      supabase.from("partners").select("id, credit_balance"),
      supabase.from("patients").select("id", { count: "exact", head: true }),
      supabase
        .from("consultations")
        .select("status, credit_status, created_at, started_at, completed_at"),
      supabase
        .from("consultations")
        .select("id, consultation_id, status, credit_status, source, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase.from("credit_transactions").select("type, quantity"),
      supabase
        .from("webhook_events")
        .select("id", { count: "exact", head: true })
        .eq("processing_status", "FAILED")
        .gte("received_at", last24h),
      supabase
        .from("webhook_events")
        .select("id", { count: "exact", head: true })
        .gte("received_at", last24h),
      supabase
        .from("integration_conflicts")
        .select("id", { count: "exact", head: true })
        .eq("status", "OPEN"),
      supabase.from("memberships").select("status, membership_plans(price)").eq("status", "ACTIVE"),
    ]);

    const statusCounts: Record<string, number> = {};
    let today = 0;
    let thisMonth = 0;
    let durationTotal = 0;
    let durationSamples = 0;
    let reservedCredits = 0;

    for (const row of consultations.data ?? []) {
      statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
      if (row.created_at >= startOfDay) today += 1;
      if (row.created_at >= startOfMonth) thisMonth += 1;
      if (row.credit_status === "RESERVED") reservedCredits += 1;
      if (row.started_at && row.completed_at) {
        durationTotal += (Date.parse(row.completed_at) - Date.parse(row.started_at)) / 60000;
        durationSamples += 1;
      }
    }

    let creditsSold = 0;
    let creditsConsumed = 0;
    for (const txn of ledger.data ?? []) {
      if (txn.type === "PURCHASE") creditsSold += txn.quantity;
      if (txn.type === "CONSUME") creditsConsumed += txn.quantity;
    }

    const membershipRevenue = (memberships.data ?? []).reduce(
      (sum, m) => sum + Number(m.membership_plans?.price ?? 0),
      0,
    );
    const webhookSeen = webhookTotal.count ?? 0;

    return {
      partnerCount: partners.data?.length ?? 0,
      creditBalance: (partners.data ?? []).reduce((sum, p) => sum + (p.credit_balance ?? 0), 0),
      patientCount: patients.count ?? 0,
      consultationCount: consultations.data?.length ?? 0,
      statusCounts,
      recent: recent.data ?? [],
      creditsSold,
      creditsConsumed,
      creditsReserved: reservedCredits,
      consultationsToday: today,
      consultationsThisMonth: thisMonth,
      averageDurationMinutes: durationSamples ? Math.round(durationTotal / durationSamples) : null,
      membershipRevenue,
      activeMemberships: memberships.data?.length ?? 0,
      webhookFailures24h: webhookFailures.count ?? 0,
      webhookFailureRate: webhookSeen
        ? Math.round(((webhookFailures.count ?? 0) / webhookSeen) * 100)
        : 0,
      openConflicts: conflicts.count ?? 0,
    };
  });

export const listPartners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("partners")
      .select(
        "id, partner_code, legal_name, display_name, status, country_code, credit_balance, created_at, email, phone",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const partnerInput = z.object({
  legalName: z.string().min(2).max(160),
  displayName: z.string().min(2).max(160),
  partnerCode: z.string().min(2).max(32),
  countryCode: z.string().min(2).max(2),
});

export const createPartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => partnerInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("partners")
      .insert({
        legal_name: data.legalName,
        display_name: data.displayName,
        partner_code: data.partnerCode.toUpperCase(),
        country_code: data.countryCode.toUpperCase(),
      })
      .select("id, partner_code, display_name")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: row.id,
      action: "PARTNER_CREATED",
      entity_type: "partner",
      entity_id: row.id,
      metadata: { partner_code: row.partner_code },
    });

    return row;
  });

export const listPatients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("patients")
      .select(
        "id, external_patient_id, first_name, last_name, email, phone_number, hn, preferred_language, partner_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const patientInput = z.object({
  partnerId: uuid,
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email().max(160).optional().or(z.literal("")),
  phoneNumber: z.string().max(40).optional().or(z.literal("")),
  preferredLanguage: z.enum(["en", "th", "ja", "zh-CN", "ar"]),
});

export const createPatient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => patientInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("patients")
      .insert({
        partner_id: data.partnerId,
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email || null,
        phone_number: data.phoneNumber || null,
        preferred_language: data.preferredLanguage,
      })
      .select("id, external_patient_id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: data.partnerId,
      action: "PATIENT_CREATED",
      entity_type: "patient",
      entity_id: row.id,
      metadata: { external_patient_id: row.external_patient_id },
    });

    return row;
  });

export const listConsultations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("consultations")
      .select(
        "id, consultation_id, status, credit_status, source, hn_snapshot, room_url, mcs_consultation_id, created_at, partner_id, patient_id, assigned_doctor_id, external_video_link, patients(first_name, last_name, external_patient_id)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const consultationInput = z.object({
  partnerId: uuid,
  patientId: uuid,
});

/**
 * Outbound consultation flow: validate partner + patient, reserve one
 * CareCredit, then ask the clinical provider (MCS) to open the consultation.
 * Clinical identifiers and the room link only ever come from MCS; if the
 * provider call fails the reservation is released again.
 */
export const createConsultation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => consultationInput.parse(input))
  .handler(async ({ data, context }) => {
    type Client = {
      rpc(
        name: "care_command",
        args: {
          _op: string;
          _args: { partnerId: string; patientId: string; kind: string };
          _key: string;
        },
      ): PromiseLike<{ data: { id: string }; error: { message: string } | null }>;
    };
    const result = await (context.supabase as unknown as Client).rpc("care_command", {
      _op: "INTAKE",
      _args: { partnerId: data.partnerId, patientId: data.patientId, kind: "PARTNER" },
      _key: crypto.randomUUID(),
    });
    if (result.error) throw new Error(result.error.message);
    const { data: row, error } = await context.supabase
      .from("consultations")
      .select("id,consultation_id")
      .eq("id", result.data.id)
      .single();
    if (error) throw new Error(error.message);
    return { ...row, providerMode: "DISCONNECTED" };
  });

/** Partner/admin cancellation before the doctor starts — releases the credit. */
export const cancelConsultation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ consultationId: uuid, reason: z.string().min(3).max(300) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    type Client = {
      rpc(
        name: "care_cancel_existing",
        args: { _id: string; _reason: string; _key: string },
      ): PromiseLike<{ data: { id: string; status: string }; error: { message: string } | null }>;
    };
    const result = await (context.supabase as unknown as Client).rpc("care_cancel_existing", {
      _id: data.consultationId,
      _reason: data.reason,
      _key: crypto.randomUUID(),
    });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });

const auditFilter = z
  .object({
    action: z.string().max(80).optional(),
    entityType: z.string().max(40).optional(),
    partnerId: uuid.optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    limit: z.number().int().min(1).max(5000).optional(),
  })
  .optional();

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => auditFilter.parse(input) ?? {})
  .handler(async ({ data, context }) => {
    // Keep the legacy endpoint redacted and role-scoped as well as the new viewer.
    const { data: result, error } = await context.supabase.rpc('operations_console', {
      _mode: 'audit', _filters: { action: data.action ?? '', target: data.entityType ?? '',
        organization: data.partnerId ?? '', from: data.from ?? '', to: data.to ?? '' },
    });
    if (error) throw new Error('AUDIT_ACCESS_DENIED');
    const safe = result as unknown as { rows: import('./operations-console.types').AuditRow[] };
    return safe.rows.map(r => ({ id: r.id, action: r.action, entity_type: r.target,
      entity_id: r.reference, actor_user_id: r.actor, partner_id: r.organization,
      metadata: r.summary, created_at: r.timestamp }));
  });

/* ---------------------------------------------------------------------------
 * Partner account management (platform admins)
 * ------------------------------------------------------------------------- */

const partnerUpdateInput = z.object({
  id: uuid,
  legalName: z.string().min(2).max(160),
  displayName: z.string().min(2).max(160),
  countryCode: z.string().min(2).max(2),
  email: z.string().email().max(160).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "TERMINATED"]),
});

export const updatePartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => partnerUpdateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("partners")
      .update({
        legal_name: data.legalName,
        display_name: data.displayName,
        country_code: data.countryCode.toUpperCase(),
        email: data.email || null,
        phone: data.phone || null,
        status: data.status,
      })
      .eq("id", data.id)
      .select("id, partner_code, display_name, status")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: row.id,
      action: "PARTNER_UPDATED",
      entity_type: "partner",
      entity_id: row.id,
      metadata: { status: row.status, partner_code: row.partner_code },
    });

    return row;
  });

export const setPartnerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: uuid, status: z.enum(["PENDING", "ACTIVE", "SUSPENDED", "TERMINATED"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("partners")
      .update({ status: data.status })
      .eq("id", data.id)
      .select("id, status, partner_code")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: row.id,
      action: data.status === "ACTIVE" ? "PARTNER_REACTIVATED" : "PARTNER_STATUS_CHANGED",
      entity_type: "partner",
      entity_id: row.id,
      metadata: { status: row.status },
    });

    return row;
  });

export const listPartnerMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ partnerId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("id, user_id, role, status, created_at")
      .eq("partner_id", data.partnerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
    const profiles = ids.length
      ? ((await supabase.from("profiles").select("id, email, full_name").in("id", ids)).data ?? [])
      : [];
    const byId = new Map(profiles.map((p) => [p.id, p]));

    return (roles ?? []).map((r) => ({
      ...r,
      email: byId.get(r.user_id)?.email ?? null,
      fullName: byId.get(r.user_id)?.full_name ?? null,
    }));
  });

export const assignPartnerAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        partnerId: uuid,
        email: z.string().email().max(160),
        role: z.enum(["PARTNER_OWNER", "PARTNER_MANAGER", "PARTNER_STAFF"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: profile, error: lookupError } = await supabase
      .from("profiles")
      .select("id, email")
      .ilike("email", data.email)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (!profile) {
      throw new Error("No PartnerCare account exists for that email. Ask them to sign up first.");
    }

    // The unique index uses COALESCE(partner_id), so ON CONFLICT can't target it —
    // look up an existing grant and reactivate it, otherwise insert.
    const { data: existing, error: existingError } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", profile.id)
      .eq("role", data.role)
      .eq("partner_id", data.partnerId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const { data: row, error } = existing
      ? await supabase
          .from("user_roles")
          .update({ status: "ACTIVE" })
          .eq("id", existing.id)
          .select("id, role, status, user_id")
          .single()
      : await supabase
          .from("user_roles")
          .insert({
            user_id: profile.id,
            partner_id: data.partnerId,
            role: data.role,
            status: "ACTIVE",
          })
          .select("id, role, status, user_id")
          .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: data.partnerId,
      action: "PARTNER_ACCESS_GRANTED",
      entity_type: "user_role",
      entity_id: row.id,
      metadata: { role: row.role, email: data.email },
    });

    return row;
  });

export const revokePartnerAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ roleId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("user_roles")
      .update({ status: "REMOVED" })
      .eq("id", data.roleId)
      .select("id, partner_id, role")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: row.partner_id,
      action: "PARTNER_ACCESS_REVOKED",
      entity_type: "user_role",
      entity_id: row.id,
      metadata: { role: row.role },
    });

    return row;
  });

/* ---------------------------------------------------------------------------
 * Consultation notes + AI structured case summary
 * ------------------------------------------------------------------------- */

export const listConsultationNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ consultationId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("consultation_notes")
      .select("id, notes, summary, model, created_at, author_user_id")
      .eq("consultation_id", data.consultationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const summariseConsultationNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ consultationId: uuid, notes: z.string().min(20).max(12000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: consultation, error: consultationError } = await supabase
      .from("consultations")
      .select("id, partner_id, consultation_id")
      .eq("id", data.consultationId)
      .single();
    if (consultationError) throw new Error(consultationError.message);

    const { generateCaseSummary, CASE_SUMMARY_MODEL } = await import("./case-summary.server");
    const summary = await generateCaseSummary(data.notes);

    const { data: row, error } = await supabase
      .from("consultation_notes")
      .insert({
        consultation_id: consultation.id,
        partner_id: consultation.partner_id,
        author_user_id: userId,
        notes: data.notes,
        summary,
        model: CASE_SUMMARY_MODEL,
      })
      .select("id, notes, summary, model, created_at, author_user_id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      partner_id: consultation.partner_id,
      action: "CONSULTATION_SUMMARY_GENERATED",
      entity_type: "consultation",
      entity_id: consultation.id,
      metadata: { consultation_id: consultation.consultation_id, model: CASE_SUMMARY_MODEL },
    });

    return row;
  });
