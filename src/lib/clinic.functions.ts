import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Internal iCareTele clinic system: mode, doctors, consent, intake, consultation workflow. */

const uuid = z.string().uuid();
export const CLINIC_MODES = ["INTERNAL", "MCS", "HYBRID"] as const;

async function audit(
  supabase: any,
  userId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
  partnerId: string | null = null,
) {
  await supabase.from("audit_log").insert({
    actor_user_id: userId,
    partner_id: partnerId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
}

export const getClinicMode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "clinic_system_mode")
      .maybeSingle();
    const mode = typeof data?.value === "string" ? data.value : "INTERNAL";
    const { getMcsConfig } = await import("./mcs/adapter.server");
    return { mode, mcsReady: getMcsConfig().mode === "LIVE" };
  });

export const setClinicMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ mode: z.enum(CLINIC_MODES) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const gate = await supabase.rpc("staff_access_check", { _scope: "super" });
    if (gate.error || gate.data !== "ALLOWED") throw new Error("STAFF_ACCESS_DENIED");
    if (data.mode !== "INTERNAL") {
      const { getMcsConfig } = await import("./mcs/adapter.server");
      if (getMcsConfig().mode !== "LIVE") throw new Error("MCS_NOT_CONFIGURED");
    }
    const { error } = await supabase
      .from("platform_settings")
      .upsert({ key: "clinic_system_mode", value: data.mode, updated_by: userId, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    await audit(supabase, userId, "CLINIC_MODE_CHANGED", "platform_setting", "clinic_system_mode", { mode: data.mode });
    return { mode: data.mode };
  });

export const listDoctors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("doctors")
      .select("id, full_name, license_number, license_expires_on, specialty, phone, email, status, availability, consultation_fee, location_id, auth_user_id, signature_url")
      .order("full_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const doctorInput = z.object({
  id: uuid.optional(),
  fullName: z.string().trim().min(2).max(120),
  licenseNumber: z.string().trim().min(2).max(60),
  licenseExpiresOn: z.string().optional().or(z.literal("")),
  specialty: z.string().max(120).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  email: z.string().email().max(200).optional().or(z.literal("")),
  availability: z.string().max(300).optional().or(z.literal("")),
  consultationFee: z.coerce.number().min(0).max(1_000_000),
  signatureUrl: z.string().url().max(500).optional().or(z.literal("")),
});

export const saveDoctor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => doctorInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = {
      full_name: data.fullName,
      license_number: data.licenseNumber,
      license_expires_on: data.licenseExpiresOn || null,
      specialty: data.specialty || null,
      phone: data.phone || null,
      email: data.email || null,
      availability: data.availability || null,
      consultation_fee: data.consultationFee,
      signature_url: data.signatureUrl || null,
    };
    // Link the doctor's sign-in account by email, if one exists.
    let authUserId: string | null = null;
    if (data.email) {
      const { data: prof } = await supabase.from("profiles").select("id").ilike("email", data.email).maybeSingle();
      authUserId = prof?.id ?? null;
    }
    const q = data.id
      ? supabase.from("doctors").update({ ...row, ...(authUserId ? { auth_user_id: authUserId } : {}) }).eq("id", data.id)
      : supabase.from("doctors").insert({ ...row, auth_user_id: authUserId });
    const { data: saved, error } = await q.select("id").single();
    if (error) throw new Error(error.message);
    await audit(supabase, userId, data.id ? "DOCTOR_UPDATED" : "DOCTOR_CREATED", "doctor", saved.id, { license: data.licenseNumber });
    return saved;
  });

export const setDoctorStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: uuid, status: z.enum(["PENDING", "ACTIVE", "SUSPENDED"]) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "ACTIVE") Object.assign(patch, { approved_by: userId, approved_at: new Date().toISOString() });
    const { error } = await supabase.from("doctors").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(supabase, userId, `DOCTOR_${data.status}`, "doctor", data.id);
    return { ok: true };
  });

export const getPatientClinical = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ patientId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const [consents, intakes] = await Promise.all([
      context.supabase.from("patient_consents").select("id, consent_type, version, accepted, created_at").eq("patient_id", data.patientId).order("created_at", { ascending: false }),
      context.supabase.from("patient_intakes").select("id, chief_complaint, medical_history, current_medications, allergies, created_at").eq("patient_id", data.patientId).order("created_at", { ascending: false }),
    ]);
    return { consents: consents.data ?? [], intakes: intakes.data ?? [] };
  });

export const recordConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ patientId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("patient_consents")
      .insert({ patient_id: data.patientId, recorded_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(supabase, userId, "PATIENT_CONSENT_RECORDED", "patient", data.patientId, { consent_id: row.id });
    return row;
  });

export const submitIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        patientId: uuid,
        chiefComplaint: z.string().trim().min(2).max(2000),
        medicalHistory: z.string().max(4000).optional().or(z.literal("")),
        currentMedications: z.string().max(2000).optional().or(z.literal("")),
        allergies: z.string().max(1000).optional().or(z.literal("")),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("patient_intakes")
      .insert({
        patient_id: data.patientId,
        chief_complaint: data.chiefComplaint,
        medical_history: data.medicalHistory || null,
        current_medications: data.currentMedications || null,
        allergies: data.allergies || null,
        submitted_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(supabase, userId, "PATIENT_INTAKE_SUBMITTED", "patient", data.patientId, { intake_id: row.id });
    return row;
  });

export const updateInternalConsultation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        consultationId: uuid,
        doctorId: uuid.nullable().optional(),
        status: z.enum(["WAITING", "STARTED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
        videoLink: z.string().url().max(500).optional().or(z.literal("")),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = {};
    if (data.doctorId !== undefined) patch["assigned_doctor_id"] = data.doctorId;
    if (data.videoLink !== undefined) patch["external_video_link"] = data.videoLink || null;
    if (data.status) {
      patch["status"] = data.status;
      const now = new Date().toISOString();
      if (data.status === "STARTED") patch["started_at"] = now;
      if (data.status === "COMPLETED") patch["completed_at"] = now;
    }
    const { data: row, error } = await supabase
      .from("consultations")
      .update(patch as never)
      .eq("id", data.consultationId)
      .select("id, partner_id, status, credit_status")
      .single();
    if (error) {
      if (error.message.includes("PATIENT_CONSENT_REQUIRED")) throw new Error("PATIENT_CONSENT_REQUIRED");
      throw new Error(error.message);
    }

    // Credit settlement mirrors the MCS lifecycle.
    if (row.credit_status === "RESERVED" && (data.status === "COMPLETED" || data.status === "CANCELLED" || data.status === "NO_SHOW")) {
      const type = data.status === "COMPLETED" ? "CONSUME" : "RELEASE";
      const { error: creditError } = await supabase.rpc("apply_credit_transaction", {
        _partner_id: row.partner_id,
        _type: type,
        _quantity: 1,
        _idempotency_key: `${type.toLowerCase()}:${row.id}`,
        _consultation_id: row.id,
        _actor: userId,
        _metadata: { source: "internal" },
      });
      if (!creditError) {
        await supabase.from("consultations").update({ credit_status: type === "CONSUME" ? "CONSUMED" : "RELEASED" }).eq("id", row.id);
      }
    }

    await audit(supabase, userId, data.status ? `CONSULTATION_${data.status}` : "CONSULTATION_UPDATED", "consultation", row.id, { ...patch, source: "internal" }, row.partner_id);
    return row;
  });
