// Phase 09: doctor / partner care-team server functions.
// Reads and writes are scoped by RLS and the database-side clinical-access and
// relationship guards; the client supplies intent only, never authority.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

export interface DoctorItem {
  id: string;
  full_name: string;
  status: string;
}

/** Active doctors visible to the caller (RLS-scoped; doctors are platform-wide). */
export const listOrgDoctors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ partnerId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ context }) => {
    const { data: rows, error } = await context.supabase
      .from("doctors")
      .select("id, full_name, status")
      .eq("status", "ACTIVE")
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return { doctors: (rows as unknown as DoctorItem[] | null) ?? [] };
  });

export interface PatientRecordItem {
  id: string;
  first_name: string;
  last_name: string;
  external_patient_id: string;
}

/** Patient records of an organisation the caller can read (RLS-scoped). */
export const listOrgPatients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ partnerId: z.string().uuid(), query: z.string().max(120).optional() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("patients")
      .select("id, first_name, last_name, external_patient_id")
      .eq("partner_id", data.partnerId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.query) q = q.or(`first_name.ilike.%${data.query}%,last_name.ilike.%${data.query}%,external_patient_id.ilike.%${data.query}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { patients: (rows as unknown as PatientRecordItem[] | null) ?? [] };
  });

/** Audited clinical history read — access decided inside the database. */
export const getPatientHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ patientId: z.string().uuid(), page: z.number().int().min(0).max(1000).optional(), query: z.string().max(120).optional() })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("care_history", {
      _patient: data.patientId,
      _page: data.page ?? 0,
      _query: data.query ?? null,
    } as unknown as { _patient: string; _page: number; _query: string });
    if (error) throw new Error(error.message);
    const r = result as { entries?: Json[]; total?: number } | null;
    return { entries: r?.entries ?? [], total: r?.total ?? 0 };
  });

export interface ConsultationNoteItem {
  id: string;
  consultation_id: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

/** Notes for a consultation the caller has clinical access to (RLS-scoped). */
export const listConsultationNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ consultationId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("consultation_notes")
      .select("id, consultation_id, notes, created_at, updated_at")
      .eq("consultation_id", data.consultationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { notes: (rows as unknown as ConsultationNoteItem[] | null) ?? [] };
  });

/** Add a clinical note. The consultation and its organisation are resolved
 *  server-side under RLS — the client never supplies a partner id. */
export const addConsultationNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ consultationId: z.string().uuid(), notes: z.string().min(1).max(5000) }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: consultation, error: cErr } = await context.supabase
      .from("consultations")
      .select("id, partner_id")
      .eq("id", data.consultationId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!consultation) throw new Error("NOT_FOUND");
    const { data: row, error } = await context.supabase
      .from("consultation_notes")
      .insert({
        consultation_id: consultation.id,
        partner_id: consultation.partner_id,
        notes: data.notes,
        author_user_id: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });
