import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { readCarePortal, supportCare, careDocumentLink, mutateCare } from "@/lib/care.functions";
import { bangkokDate } from "@/lib/service-credit-policy";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CareHistory } from "@/components/CareHistory";
export const Route = createFileRoute("/_authenticated/care-patient")({staticData:{sitemap:false},
  head: () => ({ meta: [{name:'robots',content:'noindex, nofollow'},{ title: "Patient care — iCareTele" }, { name: "description", content: "Private patient care history, coverage and follow-up." }, { property: "og:title", content: "Patient care — iCareTele" }, { property: "og:description", content: "Private patient care and follow-up." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: PatientCare,
});
function PatientCare() {
  const { locale } = useI18n();
  const c = (th: string, en: string) => (locale === "th" ? th : en);
  const read = useServerFn(readCarePortal);
  const consent = useServerFn(supportCare);
  const link = useServerFn(careDocumentLink);
  const command = useServerFn(mutateCare);
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["care-patient"], queryFn: () => read() });
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await cache.invalidateQueries({ queryKey: ["care-patient"] });
      toast.success(c("บันทึกแล้ว", "Saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  if (q.isPending) return <p role="status">{c("กำลังโหลด", "Loading…")}</p>;
  if (q.error) return <p role="alert">{q.error.message}</p>;
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">{c("การดูแลของฉัน", "My care")}</h1>
      <p className="rounded-xl bg-secondary p-4 text-sm">
        {c("เดโม — ยังไม่ได้เชื่อมต่อระบบคลินิก", "Demo — clinical integration not connected")}.{" "}
        {c(
          "ไม่มีการต่ออายุอัตโนมัติ แพทย์ต้องประเมินและวางแผนการดูแลก่อนออกเอกสารทุกครั้ง",
          "No automatic renewal. A doctor assesses and plans care before any document is issued.",
        )}
      </p>
      {!q.data.patients.length && (
        <p className="surface p-6">
          {c(
            "รอคลินิกเชื่อมประวัติผู้ป่วยกับบัญชีที่ยืนยันแล้ว ติดต่อคลินิกเพื่อเริ่มต้น",
            "Ask the clinic to link your verified patient record to this account to begin.",
          )}
        </p>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {q.data.packages.map((p) => (
          <article key={p.id} className="surface p-6">
            <h2 className="text-xl font-semibold">Annual Care</h2>
            <p className="mt-5 text-3xl font-semibold">
              {Math.max(0, p.remaining - p.reserved)} / 12
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {c("พร้อมใช้ • กันไว้", "Available • reserved")} {p.reserved} · {c("ใช้แล้ว", "used")}{" "}
              {p.used}
            </p>
            <p className="mt-4 text-sm">
              {bangkokDate(p.startsAt, locale)} — {bangkokDate(p.expiresAt, locale)}
            </p>
            <p className="mt-2 text-xs">
              {p.status} · {p.channel}
            </p>
            <Button
              className="mt-4 mr-3"
              disabled={
                busy ||
                p.remaining - p.reserved <= 0 ||
                !q.data.patients.find((pt) => pt.id === p.patientId)?.partnerId
              }
              onClick={() =>
                void run(() =>
                  command({
                    data: {
                      op: "INTAKE",
                      args: {
                        partnerId:
                          q.data.patients.find((pt) => pt.id === p.patientId)?.partnerId ?? null,
                        patientId: p.patientId,
                        kind: "ANNUAL",
                        membershipId: p.id,
                      },
                      key: crypto.randomUUID(),
                    },
                  }),
                )
              }
            >
              {c("ขอรับการประเมิน — รอยืนยันคิว", "Request assessment — queue approval required")}
            </Button>
            <Button
              className="mt-4"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  command({
                    data: {
                      op: "ESCALATE",
                      args: {
                        id: p.id,
                        reason: "Patient requests clinic follow-up about annual coverage",
                      },
                      key: crypto.randomUUID(),
                    },
                  }),
                )
              }
            >
              {c("ขอให้คลินิกติดตามสิทธิ", "Request coverage follow-up")}
            </Button>
          </article>
        ))}
      </div>
      <section className="surface p-6">
        <h2 className="font-semibold">
          {c("นัดหมายและประวัติ", "Bookings and encounter history")}
        </h2>
        {q.data.encounters.map((e) => (
          <div
            key={e.id}
            className="mt-4 flex flex-wrap justify-between gap-3 border-t border-border pt-3 text-sm"
          >
            <span>
              {e.reference} · {e.status}
            </span>
            <span>
              {e.completedAt
                ? bangkokDate(e.completedAt, locale)
                : e.scheduledAt
                  ? bangkokDate(e.scheduledAt, locale)
                  : c("รอจัดคิว", "Awaiting scheduling")}
            </span>
            {["CREATED", "WAITING"].includes(e.status) && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    command({
                      data: {
                        op: "CANCEL",
                        args: { id: e.id, reason: "Patient cancelled before service" },
                        key: crypto.randomUUID(),
                      },
                    }),
                  )
                }
              >
                {c("ยกเลิกก่อนเริ่ม", "Cancel before start")}
              </Button>
            )}
          </div>
        ))}
      </section>
      <section className="surface p-6">
        <h2 className="font-semibold">{c("เอกสารที่ได้รับอนุญาต", "Authorised documents")}</h2>
        {q.data.documents.map((d) => (
          <div key={d.id} className="mt-4 flex flex-wrap justify-between gap-3 text-sm">
            <span>
              {d.kind} · {bangkokDate(d.date, locale)}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void run(async () => {
                  const result = await link({ data: { id: d.id, key: crypto.randomUUID() } });
                  const a = document.createElement("a");
                  a.href = result.url;
                  a.target = "_blank";
                  a.rel = "noopener noreferrer";
                  a.click();
                })
              }
            >
              {c("เปิดเอกสาร", "Open document")}
            </Button>
          </div>
        ))}
        {!q.data.documents.length && (
          <p className="mt-3 text-sm text-muted-foreground">
            {c(
              "ยังไม่มีเอกสารจากแพทย์",
              "No clinician documents available yet.",
            )}
          </p>
        )}
      </section>
      {q.data.patients.map((p) => (
        <form
          key={p.id}
          className="surface space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void run(() =>
              consent({
                data: {
                  op: "CONSENT",
                  args: {
                    id: p.id,
                    service: form.has("service"),
                    marketing: form.has("marketing"),
                    telemedicine: form.has("telemedicine"),
                    version: "CARE_CONSENT_REVIEW_V1",
                  },
                  key: crypto.randomUUID(),
                },
              }),
            );
          }}
        >
          <h2 className="font-semibold">
            {p.name} · {c("การติดต่อและความยินยอม", "Communication choices")}
          </h2>
          <CareHistory patientId={p.id} />
          <div className="flex items-start gap-3">
            <input
              id={`${p.id}-service`}
              name="service"
              type="checkbox"
              defaultChecked={p.serviceConsent}
            />
            <Label htmlFor={`${p.id}-service`}>
              {c("ข้อความบริการและนัดหมายทางอีเมล", "Email service reminders and appointments")}
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <input
              id={`${p.id}-marketing`}
              name="marketing"
              type="checkbox"
              defaultChecked={p.marketingConsent}
            />
            <Label htmlFor={`${p.id}-marketing`}>
              {c("ข้อความประชาสัมพันธ์ (ไม่บังคับ)", "Marketing communications (optional)")}
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <input id={`${p.id}-telemedicine`} name="telemedicine" type="checkbox" />
            <Label htmlFor={`${p.id}-telemedicine`}>
              {c(
                "บันทึกความยินยอมบริการแพทย์ตามข้อกำหนดที่คลินิกให้ทบทวน",
                "Record telemedicine consent under the clinic-reviewed terms",
              )}
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            {c(
              "หน้าทบทวน อีเมลและช่องทางอื่นยังไม่เชื่อม การบันทึกตัวเลือกนี้ไม่ใช่การรับรอง PDPA",
              "Review build: messaging channels remain disconnected. These choices do not constitute a PDPA compliance certification.",
            )}
          </p>
          <Button disabled={busy} type="submit">
            {c("บันทึกตัวเลือก", "Save choices")}
          </Button>
        </form>
      ))}
    </div>
  );
}
