/**
 * Patient notification queue.
 *
 * Notifications are queued durably and dispatched separately from webhook
 * acknowledgement. Templates carry no diagnosis, prescription or other
 * sensitive clinical detail — only that a doctor is ready and a reference.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;
export type Channel = Database["public"]["Enums"]["notification_channel"];
export type TemplateKey = "consultation_ready" | "consultation_completed" | "consultation_cancelled";

type Locale = "en" | "th" | "ja" | "zh-CN" | "ar";

interface Template {
  subject: string;
  body: string;
  short: string;
}

const TEMPLATES: Record<TemplateKey, Record<Locale, Template>> = {
  consultation_ready: {
    th: {
      subject: "[THAIKANYA] แพทย์พร้อมให้คำปรึกษาแล้ว",
      body: "เรียน คุณ {{patient_name}}\n\nขณะนี้แพทย์พร้อมให้บริการ Telemedicine ตามนัดหมายของท่านแล้ว กรุณาเข้าสู่ระบบเพื่อรับการปรึกษาจากแพทย์\n\nหมายเลขอ้างอิง: {{consultation_id}}",
      short: "คุณ {{first_name}} แพทย์พร้อมให้คำปรึกษาแล้ว กรุณาเข้าสู่ THAIKANYA Care เพื่อเตรียมรับการปรึกษาค่ะ",
    },
    en: {
      subject: "[THAIKANYA] Your doctor is ready",
      body: "Dear {{patient_name}},\n\nYour doctor is now ready for your telemedicine consultation. Please sign in to join.\n\nConsultation reference: {{consultation_id}}",
      short: "{{first_name}}, your doctor is ready. Please open THAIKANYA Care to join your consultation.",
    },
    ja: {
      subject: "[THAIKANYA] 医師の準備が整いました",
      body: "{{patient_name}} 様\n\nオンライン診療の準備が整いました。ログインしてご参加ください。\n\n受付番号: {{consultation_id}}",
      short: "{{first_name}} 様、医師の準備が整いました。THAIKANYA Care からご参加ください。",
    },
    "zh-CN": {
      subject: "[THAIKANYA] 医生已准备就绪",
      body: "尊敬的 {{patient_name}}：\n\n医生已准备好为您进行远程问诊，请登录加入。\n\n问诊编号：{{consultation_id}}",
      short: "{{first_name}}，医生已准备就绪，请打开 THAIKANYA Care 加入问诊。",
    },
    ar: {
      subject: "[THAIKANYA] الطبيب جاهز الآن",
      body: "عزيزنا {{patient_name}}،\n\nالطبيب جاهز الآن لاستشارتك عن بُعد. يُرجى تسجيل الدخول للانضمام.\n\nرقم الاستشارة: {{consultation_id}}",
      short: "{{first_name}}، الطبيب جاهز الآن. يُرجى فتح THAIKANYA Care للانضمام.",
    },
  },
  consultation_completed: {
    th: {
      subject: "[THAIKANYA] การปรึกษาเสร็จสิ้นแล้ว",
      body: "เรียน คุณ {{patient_name}}\n\nการปรึกษาของท่านเสร็จสิ้นแล้ว\n\nหมายเลขอ้างอิง: {{consultation_id}}",
      short: "คุณ {{first_name}} การปรึกษาของท่านเสร็จสิ้นแล้วค่ะ",
    },
    en: {
      subject: "[THAIKANYA] Consultation completed",
      body: "Dear {{patient_name}},\n\nYour consultation is complete.\n\nConsultation reference: {{consultation_id}}",
      short: "{{first_name}}, your consultation is complete.",
    },
    ja: {
      subject: "[THAIKANYA] 診療が完了しました",
      body: "{{patient_name}} 様\n\n診療が完了しました。\n\n受付番号: {{consultation_id}}",
      short: "{{first_name}} 様、診療が完了しました。",
    },
    "zh-CN": {
      subject: "[THAIKANYA] 问诊已完成",
      body: "尊敬的 {{patient_name}}：\n\n您的问诊已完成。\n\n问诊编号：{{consultation_id}}",
      short: "{{first_name}}，您的问诊已完成。",
    },
    ar: {
      subject: "[THAIKANYA] اكتملت الاستشارة",
      body: "عزيزنا {{patient_name}}،\n\nاكتملت استشارتك.\n\nرقم الاستشارة: {{consultation_id}}",
      short: "{{first_name}}، اكتملت استشارتك.",
    },
  },
  consultation_cancelled: {
    th: {
      subject: "[THAIKANYA] การปรึกษาถูกยกเลิก",
      body: "เรียน คุณ {{patient_name}}\n\nการปรึกษาของท่านถูกยกเลิก กรุณาติดต่อสถานพยาบาลของท่าน\n\nหมายเลขอ้างอิง: {{consultation_id}}",
      short: "คุณ {{first_name}} การปรึกษาของท่านถูกยกเลิก กรุณาติดต่อสถานพยาบาลค่ะ",
    },
    en: {
      subject: "[THAIKANYA] Consultation cancelled",
      body: "Dear {{patient_name}},\n\nYour consultation was cancelled. Please contact your clinic.\n\nConsultation reference: {{consultation_id}}",
      short: "{{first_name}}, your consultation was cancelled. Please contact your clinic.",
    },
    ja: {
      subject: "[THAIKANYA] 診療がキャンセルされました",
      body: "{{patient_name}} 様\n\n診療はキャンセルされました。クリニックへご連絡ください。\n\n受付番号: {{consultation_id}}",
      short: "{{first_name}} 様、診療はキャンセルされました。",
    },
    "zh-CN": {
      subject: "[THAIKANYA] 问诊已取消",
      body: "尊敬的 {{patient_name}}：\n\n您的问诊已取消，请联系您的诊所。\n\n问诊编号：{{consultation_id}}",
      short: "{{first_name}}，您的问诊已取消，请联系诊所。",
    },
    ar: {
      subject: "[THAIKANYA] أُلغيت الاستشارة",
      body: "عزيزنا {{patient_name}}،\n\nأُلغيت استشارتك. يُرجى التواصل مع العيادة.\n\nرقم الاستشارة: {{consultation_id}}",
      short: "{{first_name}}، أُلغيت استشارتك. يُرجى التواصل مع العيادة.",
    },
  },
};

function fill(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

export function renderTemplate(template: TemplateKey, locale: string, vars: Record<string, string>) {
  const set = TEMPLATES[template];
  const chosen = set[(locale as Locale) in set ? (locale as Locale) : "en"];
  return {
    subject: fill(chosen.subject, vars),
    body: fill(chosen.body, vars),
    short: fill(chosen.short, vars),
  };
}

/** Queue one delivery per enabled + addressable channel. Never sends inline. */
export async function queuePatientNotification(
  admin: Admin,
  args: {
    template: TemplateKey;
    patientId: string;
    consultationId: string;
    partnerId: string | null;
    consultationReference: string;
  },
) {
  const { data: patient } = await admin
    .from("patients")
    .select(
      "id, first_name, last_name, email, whatsapp_number, phone_number, line_user_id, preferred_language, notify_email, notify_whatsapp, notify_line",
    )
    .eq("id", args.patientId)
    .maybeSingle();
  if (!patient) return;

  const vars = {
    patient_name: `${patient.first_name} ${patient.last_name}`.trim(),
    first_name: patient.first_name,
    consultation_id: args.consultationReference,
  };
  const rendered = renderTemplate(args.template, patient.preferred_language, vars);

  const rows: Array<{
    channel: Channel;
    destination: string | null;
  }> = [];
  if (patient.notify_email && patient.email) rows.push({ channel: "EMAIL", destination: patient.email });
  if (patient.notify_whatsapp && (patient.whatsapp_number || patient.phone_number))
    rows.push({ channel: "WHATSAPP", destination: patient.whatsapp_number ?? patient.phone_number });
  if (patient.notify_line && patient.line_user_id) rows.push({ channel: "LINE", destination: patient.line_user_id });

  if (!rows.length) return;

  await admin.from("notification_deliveries").insert(
    rows.map((row) => ({
      patient_id: patient.id,
      consultation_id: args.consultationId,
      partner_id: args.partnerId,
      channel: row.channel,
      destination: row.destination,
      template: args.template,
      locale: patient.preferred_language,
      payload: (rendered ?? {}) as NonNullable<
        Database["public"]["Tables"]["notification_deliveries"]["Insert"]["payload"]
      >,
    })),
  );
}

interface SendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

async function sendEmail(to: string, subject: string, body: string): Promise<SendResult> {
  const apiKey = process.env["RESEND_API_KEY"];
  const from = process.env["NOTIFICATION_FROM_EMAIL"] ?? "THAIKANYA PartnerCare <onboarding@resend.dev>";
  if (!apiKey) return { ok: false, skipped: true, error: "Email provider not configured" };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text: body }),
  });
  if (!response.ok) return { ok: false, error: `Email provider failed [${response.status}]: ${await response.text()}` };
  return { ok: true };
}

async function sendWhatsApp(to: string, text: string): Promise<SendResult> {
  const token = process.env["WHATSAPP_ACCESS_TOKEN"];
  const phoneId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
  if (!token || !phoneId) return { ok: false, skipped: true, error: "WhatsApp provider not configured" };

  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to.replace(/[^\d+]/g, ""),
      type: "text",
      text: { body: text },
    }),
  });
  if (!response.ok) return { ok: false, error: `WhatsApp failed [${response.status}]: ${await response.text()}` };
  return { ok: true };
}

async function sendLine(to: string, text: string): Promise<SendResult> {
  const token = process.env["LINE_CHANNEL_ACCESS_TOKEN"];
  if (!token) return { ok: false, skipped: true, error: "LINE provider not configured" };

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });
  if (!response.ok) return { ok: false, error: `LINE failed [${response.status}]: ${await response.text()}` };
  return { ok: true };
}

/** Drains queued deliveries. Invalid destinations are not retried forever. */
export async function dispatchQueuedNotifications(admin: Admin, limit = 25) {
  // External delivery is deliberately disabled for the notification-framework phase.
  // Existing records remain untouched; keys alone never constitute approval.
  return { processed: 0, sent: 0, failed: 0, skipped: 0, disabled: true };
  /* Legacy provider implementation retained but unreachable pending explicit approval.
  const { data: queued } = await admin
    .from("notification_deliveries")
    .select("id, channel, destination, payload, attempts")
    .eq("status", "QUEUED")
    .lt("attempts", 4)
    .order("queued_at", { ascending: true })
    .limit(limit);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const delivery of queued ?? []) {
    const payload = (delivery.payload ?? {}) as { subject?: string; body?: string; short?: string };
    let result: SendResult = { ok: false, error: "No destination" };

    if (delivery.destination) {
      if (delivery.channel === "EMAIL") {
        result = await sendEmail(delivery.destination, payload.subject ?? "THAIKANYA", payload.body ?? "");
      } else if (delivery.channel === "WHATSAPP") {
        result = await sendWhatsApp(delivery.destination, payload.short ?? "");
      } else {
        result = await sendLine(delivery.destination, payload.short ?? "");
      }
    }

    const attempts = delivery.attempts + 1;
    const status = result.ok ? "SENT" : result.skipped ? "SKIPPED" : attempts >= 4 ? "FAILED" : "QUEUED";
    if (result.ok) sent += 1;
    else if (result.skipped) skipped += 1;
    else failed += 1;

    await admin
      .from("notification_deliveries")
      .update({
        status,
        attempts,
        last_error: result.error ?? null,
        sent_at: result.ok ? new Date().toISOString() : null,
      })
      .eq("id", delivery.id);
  }

  return { processed: queued?.length ?? 0, sent, failed, skipped };
  */
}
