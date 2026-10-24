import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/i18n";
import { listPatients } from "@/lib/partnercare.functions";
import { listLocations, listRooms, listServices, listTherapists } from "@/lib/wellness.functions";
import { createBooking, listBookings, listPayments, recordBookingPayment, setBookingStatus } from "@/lib/booking.functions";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/bookings")({staticData:{sitemap:false},
  head: () => ({
    meta: [{name:'robots',content:'noindex, nofollow'},
      { title: "Bookings — THAIKANYA PartnerCare" },
      { name: "description", content: "Wellness appointments with therapist and room allocation, check-in and payment." },
      { property: "og:title", content: "Bookings — THAIKANYA PartnerCare" },
      { property: "og:description", content: "Wellness appointments, allocation, check-in and payment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookingsPage,
});

const CHANNELS = ["WALK_IN", "ONLINE", "PHONE", "HOTEL", "CORPORATE", "PARTNER"] as const;
const PAY_CHANNELS = ["CASH", "CARD", "PROMPTPAY", "BANK_TRANSFER", "HOTEL_FOLIO", "CORPORATE_INVOICE"] as const;

function localInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function BookingsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const bookingsFn = useServerFn(listBookings);
  const locationsFn = useServerFn(listLocations);
  const servicesFn = useServerFn(listServices);
  const therapistsFn = useServerFn(listTherapists);
  const roomsFn = useServerFn(listRooms);
  const patientsFn = useServerFn(listPatients);
  const createFn = useServerFn(createBooking);
  const statusFn = useServerFn(setBookingStatus);
  const payFn = useServerFn(recordBookingPayment);
  const paymentsFn = useServerFn(listPayments);

  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [therapistId, setTherapistId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [startsAt, setStartsAt] = useState(localInputValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("WALK_IN");
  const [filterStatus, setFilterStatus] = useState("ALL");

  const [payFor, setPayFor] = useState<{ id: string; amount: number; code: string } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payChannel, setPayChannel] = useState<(typeof PAY_CHANNELS)[number]>("CASH");
  const [payReference, setPayReference] = useState("");

  const { data: bookings } = useQuery({
    queryKey: ["bookings", filterStatus],
    queryFn: () => bookingsFn({ data: filterStatus === "ALL" ? {} : { status: filterStatus } }),
  });
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: () => locationsFn({}) });
  const { data: services } = useQuery({ queryKey: ["services"], queryFn: () => servicesFn({}) });
  const { data: therapists } = useQuery({ queryKey: ["therapists"], queryFn: () => therapistsFn({}) });
  const { data: rooms } = useQuery({ queryKey: ["rooms"], queryFn: () => roomsFn({ data: {} }) });
  const { data: patients } = useQuery({ queryKey: ["patients"], queryFn: () => patientsFn({}) });
  const { data: payments } = useQuery({ queryKey: ["payments"], queryFn: () => paymentsFn({ data: {} }) });

  function nextReference(bookingId: string, code: string) {
    const count = (payments ?? []).filter((p) => p.booking_id === bookingId).length;
    return `${code}-${count + 1}`;
  }

  const location = (locations ?? []).find((l) => l.id === locationId) ?? null;
  const partnerId = location?.partner_id ?? "";

  const eligibleServices = useMemo(
    () => (services ?? []).filter((s) => s.active && (!partnerId || s.partner_id === partnerId)),
    [services, partnerId],
  );
  const eligibleTherapists = useMemo(
    () =>
      (therapists ?? []).filter(
        (th) =>
          th.status === "ACTIVE" &&
          (!partnerId || th.partner_id === partnerId) &&
          (!serviceId || (th.therapist_service_eligibility ?? []).some((e) => e.service_id === serviceId)),
      ),
    [therapists, partnerId, serviceId],
  );
  const eligibleRooms = useMemo(
    () => (rooms ?? []).filter((r) => r.active && (!locationId || r.location_id === locationId)),
    [rooms, locationId],
  );

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
    queryClient.invalidateQueries({ queryKey: ["payments"] });
    queryClient.invalidateQueries({ queryKey: ["revenue"] });
    queryClient.invalidateQueries({ queryKey: ["earnings"] });
    queryClient.invalidateQueries({ queryKey: ["audit"] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          partnerId,
          locationId,
          patientId,
          serviceId,
          ...(therapistId ? { therapistId } : {}),
          ...(roomId ? { roomId } : {}),
          startsAt: new Date(startsAt).toISOString(),
          channel,
        },
      }),
    onSuccess: () => {
      toast.success(t("bookings.created"));
      setOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const statusMutation = useMutation({
    mutationFn: (input: {
      id: string;
      status: "CONFIRMED" | "CHECKED_IN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
      reason?: string;
    }) => statusFn({ data: input }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const payMutation = useMutation({
    mutationFn: () =>
      payFn({
        data: {
          bookingId: payFor!.id,
          amount: Number(payAmount),
          channel: payChannel,
          reference: payReference,
          feeAmount: 0,
        },
      }),
    onSuccess: () => {
      toast.success(t("bookings.paymentRecorded"));
      setPayFor(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t("bookings.title")}
        subtitle={t("bookings.subtitle")}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!locations?.length}>{t("bookings.newBooking")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("bookings.newBooking")}</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label>{t("locations.location")}</Label>
                  <Select value={locationId} onValueChange={setLocationId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("locations.location")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(locations ?? [])
                        .filter((l) => l.status === "ACTIVE")
                        .map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("bookings.customer")}</Label>
                  <Select value={patientId} onValueChange={setPatientId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("bookings.customer")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(patients ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.first_name} {p.last_name} · {p.external_patient_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("bookings.service")}</Label>
                  <Select value={serviceId} onValueChange={setServiceId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("bookings.service")} />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleServices.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} · {s.duration_minutes} min
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("bookings.therapist")}</Label>
                    <Select value={therapistId} onValueChange={setTherapistId}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("common.none")} />
                      </SelectTrigger>
                      <SelectContent>
                        {eligibleTherapists.map((th) => (
                          <SelectItem key={th.id} value={th.id}>
                            {th.first_name} {th.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("bookings.room")}</Label>
                    <Select value={roomId} onValueChange={setRoomId}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("common.none")} />
                      </SelectTrigger>
                      <SelectContent>
                        {eligibleRooms.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="startsAt">{t("bookings.startsAt")}</Label>
                    <Input
                      id="startsAt"
                      type="datetime-local"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("bookings.channel")}</Label>
                    <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHANNELS.map((c) => (
                          <SelectItem key={c} value={c}>
                            {t(`channel.${c}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || !locationId || !patientId || !serviceId}
                  >
                    {t("common.create")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label>{t("common.status")}</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("common.all")}</SelectItem>
              {["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"].map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <section className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("bookings.when")}</TableHead>
              <TableHead>{t("bookings.customer")}</TableHead>
              <TableHead>{t("bookings.service")}</TableHead>
              <TableHead>{t("bookings.therapist")}</TableHead>
              <TableHead>{t("bookings.amount")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(bookings ?? []).map((b) => {
              const item = (b.booking_items ?? [])[0];
              const outstanding = Number(b.total_amount) - Number(b.paid_amount);
              const final = b.status === "COMPLETED" || b.status === "CANCELLED" || b.status === "NO_SHOW";
              return (
                <TableRow key={b.id}>
                  <TableCell>
                    <div className="text-sm">{new Date(b.starts_at).toLocaleString()}</div>
                    <div className="font-mono text-xs text-muted-foreground" dir="ltr">
                      {b.booking_code} · {b.locations?.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    {b.patients?.first_name} {b.patients?.last_name}
                  </TableCell>
                  <TableCell>{item?.services?.name ?? "—"}</TableCell>
                  <TableCell>
                    {item?.therapists ? `${item.therapists.first_name} ${item.therapists.last_name}` : "—"}
                  </TableCell>
                  <TableCell dir="ltr">
                    {b.currency} {Number(b.total_amount).toLocaleString()}
                    {outstanding > 0 && (
                      <span className="ms-2 text-xs text-warning-foreground">{t("bookings.unpaid")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={b.status} />
                  </TableCell>
                  <TableCell className="space-x-2 text-end">
                    {b.status === "CONFIRMED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => statusMutation.mutate({ id: b.id, status: "CHECKED_IN" })}
                      >
                        {t("bookings.checkIn")}
                      </Button>
                    )}
                    {(b.status === "CHECKED_IN" || b.status === "IN_PROGRESS") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => statusMutation.mutate({ id: b.id, status: "COMPLETED" })}
                      >
                        {t("bookings.complete")}
                      </Button>
                    )}
                    {outstanding > 0 && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setPayFor({ id: b.id, amount: outstanding, code: b.booking_code });
                          setPayAmount(String(outstanding));
                          setPayReference(nextReference(b.id, b.booking_code));
                        }}
                      >
                        {t("bookings.takePayment")}
                      </Button>
                    )}
                    {!final && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const reason = window.prompt(t("bookings.cancelReason")) ?? "";
                          if (reason) statusMutation.mutate({ id: b.id, status: "CANCELLED", reason });
                        }}
                      >
                        {t("common.cancel")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {!bookings?.length && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  {t("common.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <Dialog open={!!payFor} onOpenChange={(v) => !v && setPayFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bookings.takePayment")}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              payMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="payAmount">{t("bookings.amount")}</Label>
              <Input id="payAmount" value={payAmount} inputMode="decimal" onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("bookings.paymentChannel")}</Label>
              <Select value={payChannel} onValueChange={(v) => setPayChannel(v as typeof payChannel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAY_CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`payChannel.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payRef">{t("bookings.reference")}</Label>
              <Input id="payRef" value={payReference} onChange={(e) => setPayReference(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={payMutation.isPending || !payAmount || !payReference}>
                {t("bookings.recordPayment")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
