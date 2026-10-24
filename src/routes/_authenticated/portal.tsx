import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useI18n, LOCALES, type Locale } from "@/i18n";
import { claimPatientRecord, getMyPatientPortal, updateMyNotificationPreferences } from "@/lib/portal.functions";
import { listPlanVersions } from "@/lib/care-entitlements.functions";
import { purchasePrepaidPackage, getMyPrepaidBalance } from "@/lib/prepaid.functions";
import { bookMyAppointment, getMyBookingCatalog, listMyAppointments } from "@/lib/care-appointments.functions";
import { getClinicalNote } from "@/lib/care-clinical.functions";
import { listFollowups } from "@/lib/care-followups.functions";
import { getAppointmentDocument } from "@/lib/care-documents.functions";
import { CareEmbeddedCheckout } from "@/components/CareEmbeddedCheckout";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/portal")({staticData:{sitemap:false},
  head: () => ({
    meta: [{name:'robots',content:'noindex, nofollow'},
      { title: "My care — THAIKANYA PartnerCare" },
      {
        name: "description",
        content: "Patient view of upcoming and past consultations, membership and message preferences.",
      },
      { property: "og:title", content: "My care — THAIKANYA PartnerCare" },
      { property: "og:description", content: "Your consultations, membership and message preferences." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PortalPage,
});

function PortalPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const portalFn = useServerFn(getMyPatientPortal);
  const prefsFn = useServerFn(updateMyNotificationPreferences);
  const claimFn = useServerFn(claimPatientRecord);
  const plansFn = useServerFn(listPlanVersions);
  const purchaseFn = useServerFn(purchasePrepaidPackage);
  const balanceFn = useServerFn(getMyPrepaidBalance);
  const catalogFn = useServerFn(getMyBookingCatalog);
  const bookFn = useServerFn(bookMyAppointment);
  const myAppointmentsFn = useServerFn(listMyAppointments);
  const myFollowupsFn = useServerFn(listFollowups);

  const { data, isLoading } = useQuery({ queryKey: ["portal"], queryFn: () => portalFn({}) });
  const patientId = data?.patient?.id;
  const { data: plans } = useQuery({
    queryKey: ["prepaid-plans"],
    queryFn: () => plansFn({}),
    enabled: Boolean(patientId),
  });
  const { data: prepaidBalance } = useQuery({
    queryKey: ["prepaid-balance", patientId],
    queryFn: () => balanceFn({ data: { patientId: patientId! } }),
    enabled: Boolean(patientId),
  });
  const { data: bookingCatalog } = useQuery({
    queryKey: ["booking-catalog"],
    queryFn: () => catalogFn({}),
    enabled: Boolean(patientId),
  });
  const { data: myAppointments } = useQuery({
    queryKey: ["my-appointments", patientId],
    queryFn: () => myAppointmentsFn({ data: { patientId: patientId! } }),
  });
  const { data: myFollowups } = useQuery({
    queryKey: ["my-followups", patientId],
    queryFn: () => myFollowupsFn({ data: { patientId: patientId! } }),
    enabled: Boolean(patientId),
  });
  const [bookService, setBookService] = useState("");
  const [bookStart, setBookStart] = useState("");
  const [bookEnd, setBookEnd] = useState("");
  const bookMutation = useMutation({
    mutationFn: () =>
      bookFn({
        data: {
          serviceVersionId: bookService,
          startsAt: new Date(bookStart).toISOString(),
          endsAt: new Date(bookEnd).toISOString(),
          idempotencyKey: crypto.randomUUID(),
        },
      }),
    onSuccess: () => {
      toast.success(t("portal.booked"));
      setBookStart("");
      setBookEnd("");
      queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("ENTITLEMENT_REQUIRED") ? t("portal.bookNeedBalance") : e.message || t("common.error")),
  });
  const [checkoutPaymentId, setCheckoutPaymentId] = useState<string | null>(null);

  const purchaseMutation = useMutation({
    mutationFn: (planVersionId: string) => purchaseFn({ data: { planVersionId } }),
    onSuccess: (r) => setCheckoutPaymentId(r.purchase.id),
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const prepaidPlans = (plans?.plans ?? []).filter((p) => p.status === "APPROVED" && !p.unlimited);

  const [reference, setReference] = useState("");
  const [noteAppointment, setNoteAppointment] = useState<string | null>(null);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(false);
  const [notifyLine, setNotifyLine] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState<Locale>("en");

  useEffect(() => {
    const patient = data?.patient;
    if (!patient) return;
    setNotifyEmail(patient.notify_email);
    setNotifyWhatsapp(patient.notify_whatsapp);
    setNotifyLine(patient.notify_line);
    setWhatsappNumber(patient.whatsapp_number ?? "");
    setPreferredLanguage((patient.preferred_language as Locale) ?? "en");
  }, [data?.patient]);

  const claimMutation = useMutation({
    mutationFn: () => claimFn({ data: { externalPatientId: reference.trim() } }),
    onSuccess: () => {
      toast.success(t("portal.claimed"));
      setReference("");
      queryClient.invalidateQueries({ queryKey: ["portal"] });
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const prefsMutation = useMutation({
    mutationFn: () =>
      prefsFn({ data: { notifyEmail, notifyWhatsapp, notifyLine, whatsappNumber, preferredLanguage } }),
    onSuccess: () => {
      toast.success(t("portal.preferencesSaved"));
      queryClient.invalidateQueries({ queryKey: ["portal"] });
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  if (!data?.patient) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <PageHeader title={t("portal.title")} subtitle={t("portal.claimSubtitle")} />
        <form
          className="surface space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            claimMutation.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="reference">{t("portal.reference")}</Label>
            <Input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="TK-PT-000123"
              dir="ltr"
            />
          </div>
          <Button type="submit" disabled={claimMutation.isPending || reference.trim().length < 4}>
            {t("portal.claim")}
          </Button>
        </form>
      </div>
    );
  }

  const patient = data.patient;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={t("portal.title")}
        subtitle={`${patient.first_name} ${patient.last_name} · ${patient.external_patient_id}`}
      />

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("portal.book")}</h2>
        <p className="text-sm text-muted-foreground">{t("portal.bookSubtitle")}</p>
        {!bookingCatalog?.catalog.length ? (
          <p className="text-sm text-muted-foreground">{t("portal.bookNone")}</p>
        ) : (
          <form
            className="surface grid gap-4 p-6 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              bookMutation.mutate();
            }}
          >
            <div className="space-y-2 sm:col-span-2">
              <Label>{t("portal.bookService")}</Label>
              <Select value={bookService} onValueChange={setBookService}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {bookingCatalog.catalog.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name_th ?? s.name} · ฿{(s.price_minor / 100).toLocaleString()} · {s.duration_minutes} min
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="book-start">{t("portal.bookStart")}</Label>
              <Input
                id="book-start"
                type="datetime-local"
                value={bookStart}
                onChange={(e) => setBookStart(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="book-end">{t("portal.bookEnd")}</Label>
              <Input
                id="book-end"
                type="datetime-local"
                value={bookEnd}
                onChange={(e) => setBookEnd(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={bookMutation.isPending || !bookService || !bookStart || !bookEnd}
              >
                {t("portal.bookSubmit")}
              </Button>
            </div>
          </form>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("portal.appointments")}</h2>
        {!myAppointments?.appointments.length && (
          <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
        )}
        <div className="space-y-3">
          {(myAppointments?.appointments ?? []).map((a) => (
            <div key={a.id} className="surface space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium" dir="ltr">
                    {new Date(a.starts_at).toLocaleString()} – {new Date(a.ends_at).toLocaleTimeString()}
                  </p>
                  {a.cancellation_reason && (
                    <p className="text-xs text-muted-foreground">{a.cancellation_reason}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge value={a.state} />
                  {a.clinical_state === "COMPLETED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setNoteAppointment(noteAppointment === a.id ? null : a.id)}
                    >
                      {t("portal.viewNote")}
                    </Button>
                  )}
                  {a.video_state === "READY" && a.video_room_url ? (
                    <Button size="sm" asChild>
                      <a href={a.video_room_url} target="_blank" rel="noreferrer">
                        {t("portal.joinVideo")}
                      </a>
                    </Button>
                  ) : (
                    ["REQUESTED", "CONFIRMED"].includes(a.state) && (
                      <p className="max-w-48 text-xs text-muted-foreground">{t("portal.videoNotReady")}</p>
                    )
                  )}
                </div>
              </div>
              {noteAppointment === a.id && (
                <>
                  <PatientClinicalNote appointmentId={a.id} />
                  <PatientDocument appointmentId={a.id} />
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("portal.followups")}</h2>
        {!myFollowups?.followups.length && (
          <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
        )}
        <div className="space-y-2">
          {(myFollowups?.followups ?? []).map((f) => (
            <div key={f.id} className="surface flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="text-sm">
                <span className="font-medium" dir="ltr">{new Date(f.due_at).toLocaleString()}</span>
                <span className="ms-2 text-muted-foreground">{f.instructions}</span>
              </div>
              <StatusBadge value={f.status} />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("portal.consultations")}</h2>
        {!data.consultations.length && <p className="text-sm text-muted-foreground">{t("common.empty")}</p>}
        <div className="space-y-3">
          {data.consultations.map((c) => (
            <div key={c.id} className="surface flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="space-y-1">
                <p className="font-mono text-xs text-muted-foreground" dir="ltr">
                  {c.consultation_id}
                </p>
                <p className="text-sm text-muted-foreground">{new Date(c.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge value={c.status} />
                {c.room_url && ["WAITING", "STARTED"].includes(c.status) && (
                  <Button asChild size="sm">
                    <a href={c.room_url} target="_blank" rel="noreferrer">
                      {t("portal.join")}
                    </a>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {data.memberships.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">{t("portal.membership")}</h2>
          {data.memberships.map((m) => (
            <div key={m.id} className="surface flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm font-medium">{m.membership_plans?.name}</p>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {m.expires_at && <span>{new Date(m.expires_at).toLocaleDateString()}</span>}
                <StatusBadge value={m.status} />
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("portal.messages")}</h2>
        {!data.messages.length && <p className="text-sm text-muted-foreground">{t("common.empty")}</p>}
        {data.messages.map((m) => (
          <div key={m.id} className="surface flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">{t(`channel.${m.channel}`)}</p>
              <p className="text-xs text-muted-foreground">{new Date(m.queued_at).toLocaleString()}</p>
            </div>
            <StatusBadge value={m.status} />
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("portal.prepaid")}</h2>
        <p className="text-sm text-muted-foreground">{t("portal.prepaidSubtitle")}</p>

        {prepaidBalance && prepaidBalance.lots.length > 0 && (
          <div className="space-y-2">
            {prepaidBalance.lots.map((l) => (
              <div key={l.lot_id} className="surface flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-sm font-medium">
                  {l.kind === "COUNT"
                    ? t("portal.prepaidCount", { count: l.count_available })
                    : t("portal.prepaidValue", { amount: (l.minor_available / 100).toLocaleString() })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("portal.prepaidExpires")} {new Date(l.expires_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}

        {checkoutPaymentId ? (
          <CareEmbeddedCheckout
            paymentId={checkoutPaymentId}
            onClose={() => {
              setCheckoutPaymentId(null);
              void queryClient.invalidateQueries({ queryKey: ["prepaid-balance"] });
              void queryClient.invalidateQueries({ queryKey: ["portal"] });
            }}
          />
        ) : prepaidPlans.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("portal.prepaidEmpty")}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {prepaidPlans.map((p) => (
              <div key={p.id} className="surface space-y-3 p-4">
                <div>
                  <p className="font-medium">{p.name}</p>
                  {p.name_th && <p className="text-sm text-muted-foreground">{p.name_th}</p>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {p.quota !== null
                    ? t("portal.prepaidIncludes", { count: p.quota })
                    : t("portal.prepaidCredit", { amount: (p.price_minor / 100).toLocaleString() })}
                  {" · "}
                  {t("portal.prepaidValid", { months: p.duration_months })}
                </p>
                <Button
                  className="w-full"
                  disabled={purchaseMutation.isPending}
                  onClick={() => purchaseMutation.mutate(p.id)}
                >
                  {t("portal.prepaidBuy", { price: (p.price_minor / 100).toLocaleString() })}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="surface space-y-5 p-6">
        <h2 className="font-display text-lg font-semibold">{t("portal.preferences")}</h2>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="notify-email">{t("portal.email")}</Label>
          <Switch id="notify-email" checked={notifyEmail} onCheckedChange={setNotifyEmail} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="notify-whatsapp">{t("portal.whatsapp")}</Label>
          <Switch id="notify-whatsapp" checked={notifyWhatsapp} onCheckedChange={setNotifyWhatsapp} />
        </div>
        {notifyWhatsapp && (
          <div className="space-y-2">
            <Label htmlFor="whatsapp-number">{t("portal.whatsappNumber")}</Label>
            <Input
              id="whatsapp-number"
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              dir="ltr"
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="notify-line">{t("portal.line")}</Label>
          <Switch id="notify-line" checked={notifyLine} onCheckedChange={setNotifyLine} />
        </div>
        <div className="space-y-2">
          <Label>{t("portal.language")}</Label>
          <Select value={preferredLanguage} onValueChange={(v) => setPreferredLanguage(v as Locale)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          {t("portal.privacyNotice")}
        </p>
        <Button onClick={() => prefsMutation.mutate()} disabled={prefsMutation.isPending}>
          {t("common.save")}
        </Button>
      </section>
    </div>
  );
}

function PatientDocument({ appointmentId }: { appointmentId: string }) {
  const { t } = useI18n();
  const readFn = useServerFn(getAppointmentDocument);
  const { data } = useQuery({
    queryKey: ["my-appointment-document", appointmentId],
    queryFn: () => readFn({ data: { appointmentId } }),
  });
  const doc = data?.document;
  if (!doc || doc.status !== "ISSUED") return null;
  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground">{t("portal.visitSummary")}</p>
      <p className="text-sm font-medium">{doc.title}</p>
      <p className="whitespace-pre-wrap text-sm">{doc.body}</p>
      {doc.issued_at && (
        <p className="text-xs text-muted-foreground">{new Date(doc.issued_at).toLocaleString()}</p>
      )}
    </div>
  );
}

function PatientClinicalNote({ appointmentId }: { appointmentId: string }) {
  const { t } = useI18n();
  const readFn = useServerFn(getClinicalNote);
  const { data, isPending } = useQuery({
    queryKey: ["my-clinical-note", appointmentId],
    queryFn: () => readFn({ data: { appointmentId } }),
  });
  if (isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  const note = data?.note;
  if (!note || note.status !== "FINAL")
    return <p className="text-sm text-muted-foreground">{t("common.empty")}</p>;
  return (
    <div className="space-y-2 border-t pt-3">
      {(
        [
          [t("careTeam.noteAssessment"), note.assessment],
          [t("careTeam.notePlan"), note.plan],
        ] as const
      ).map(([label, value]) =>
        value ? (
          <div key={label}>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="whitespace-pre-wrap text-sm">{value}</p>
          </div>
        ) : null,
      )}
    </div>
  );
}
