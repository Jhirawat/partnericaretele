import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Patient-facing portal: own record, own consultations, own message settings. */

type PortalPatient = {
  id: string;
  external_patient_id: string;
  first_name: string;
  last_name: string;
  hn: string | null;
  email: string | null;
  phone_number: string | null;
  whatsapp_number: string | null;
  line_user_id: string | null;
  preferred_language: string | null;
  notify_email: boolean;
  notify_whatsapp: boolean;
  notify_line: boolean;
};
type PortalData = {
  patient: PortalPatient | null;
  consultations: {
    id: string;
    consultation_id: string;
    status: string;
    room_url: string | null;
    scheduled_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
  }[];
  memberships: {
    id: string;
    status: string;
    starts_at: string | null;
    expires_at: string | null;
    membership_plans: { name: string; code: string } | null;
  }[];
  messages: { id: string; channel: string; status: string; template: string; queued_at: string; sent_at: string | null }[];
};

/** Reads through the trusted get_my_patient_portal() function, scoped to the caller. */
export const getMyPatientPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_my_patient_portal");
    if (error) throw new Error(error.message);
    return data as unknown as PortalData;
  });

export const updateMyNotificationPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        notifyEmail: z.boolean(),
        notifyWhatsapp: z.boolean(),
        notifyLine: z.boolean(),
        whatsappNumber: z.string().max(40).optional().or(z.literal("")),
        preferredLanguage: z.enum(["en", "th", "ja", "zh-CN", "ar"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("patients")
      .update({
        notify_email: data.notifyEmail,
        notify_whatsapp: data.notifyWhatsapp,
        notify_line: data.notifyLine,
        whatsapp_number: data.whatsappNumber || null,
        preferred_language: data.preferredLanguage,
      })
      .eq("auth_user_id", userId)
      .select("id, notify_email, notify_whatsapp, notify_line, preferred_language")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Links a signed-in patient account to an existing patient record. */
export const claimPatientRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ externalPatientId: z.string().min(4).max(40) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // RLS blocks patients from updating unclaimed records, so the claim goes
    // through the claim_patient_record() security-definer function.
    const { data: row, error } = await supabase.rpc("claim_patient_record", {
      _external_patient_id: data.externalPatientId,
    });
    if (error || !row) {
      throw new Error("We could not find an unclaimed record with that patient reference.");
    }

    await supabase.from("audit_log").insert({
      actor_user_id: userId,
      action: "PATIENT_RECORD_CLAIMED",
      entity_type: "patient",
      entity_id: row.id,
      metadata: { external_patient_id: row.external_patient_id },
    });
    return row;
  });
