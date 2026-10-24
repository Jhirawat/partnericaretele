import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/i18n";
import { listPartners } from "@/lib/partnercare.functions";
import {
  addCommissionRule,
  approveTherapistEarning,
  createCommissionPlan,
  getRevenueSummary,
  listCommissionPlans,
  listPayments,
  listTherapistEarnings,
} from "@/lib/booking.functions";
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

export const Route = createFileRoute("/_authenticated/finance")({staticData:{sitemap:false},
  head: () => ({
    meta: [{name:'robots',content:'noindex, nofollow'},
      { title: "Revenue & commission — THAIKANYA PartnerCare" },
      { name: "description", content: "Wellness takings, payment records, commission plans and therapist earnings." },
      { property: "og:title", content: "Revenue & commission — THAIKANYA PartnerCare" },
      { property: "og:description", content: "Takings, payments, commission plans and therapist earnings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinancePage,
});

function FinancePage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const summaryFn = useServerFn(getRevenueSummary);
  const paymentsFn = useServerFn(listPayments);
  const plansFn = useServerFn(listCommissionPlans);
  const earningsFn = useServerFn(listTherapistEarnings);
  const partnersFn = useServerFn(listPartners);
  const createPlanFn = useServerFn(createCommissionPlan);
  const addRuleFn = useServerFn(addCommissionRule);
  const approveFn = useServerFn(approveTherapistEarning);

  const [planOpen, setPlanOpen] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [planCode, setPlanCode] = useState("STANDARD");
  const [planName, setPlanName] = useState("Standard therapist commission");
  const [ruleFor, setRuleFor] = useState<string | null>(null);
  const [rate, setRate] = useState("20");

  const { data: summary } = useQuery({ queryKey: ["revenue"], queryFn: () => summaryFn({}) });
  const { data: payments } = useQuery({ queryKey: ["payments"], queryFn: () => paymentsFn({ data: {} }) });
  const { data: plans } = useQuery({ queryKey: ["commission-plans"], queryFn: () => plansFn({}) });
  const { data: earnings } = useQuery({ queryKey: ["earnings"], queryFn: () => earningsFn({}) });
  const { data: partners } = useQuery({ queryKey: ["partners"], queryFn: () => partnersFn({}) });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["commission-plans"] });
    queryClient.invalidateQueries({ queryKey: ["earnings"] });
    queryClient.invalidateQueries({ queryKey: ["revenue"] });
  }

  const planMutation = useMutation({
    mutationFn: () => createPlanFn({ data: { partnerId, code: planCode, name: planName } }),
    onSuccess: () => {
      toast.success(t("finance.planCreated"));
      setPlanOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const ruleMutation = useMutation({
    mutationFn: () =>
      addRuleFn({
        data: { planId: ruleFor!, basis: "PERCENT_OF_SERVICE", rate: Number(rate), fixedAmount: 0, priority: 100 },
      }),
    onSuccess: () => {
      toast.success(t("finance.ruleAdded"));
      setRuleFor(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const approveMutation = useMutation({
    mutationFn: (input: { id: string; status: "APPROVED" | "PAID" | "VOID" }) => approveFn({ data: input }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t("finance.title")}
        subtitle={t("finance.subtitle")}
        action={
          <Dialog open={planOpen} onOpenChange={setPlanOpen}>
            <DialogTrigger asChild>
              <Button disabled={!partners?.length}>{t("finance.newPlan")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("finance.newPlan")}</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  planMutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label>{t("locations.organisation")}</Label>
                  <Select value={partnerId} onValueChange={setPartnerId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("locations.organisation")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(partners ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="planCode">{t("locations.code")}</Label>
                    <Input id="planCode" value={planCode} onChange={(e) => setPlanCode(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="planName">{t("locations.name")}</Label>
                    <Input id="planName" value={planName} onChange={(e) => setPlanName(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={planMutation.isPending || !partnerId}>
                    {t("common.create")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label={t("finance.revenue30d")} value={`${summary?.currency ?? "THB"} ${(summary?.revenue30d ?? 0).toLocaleString()}`} />
        <Stat label={t("finance.payments")} value={String(summary?.paymentCount ?? 0)} />
        <Stat label={t("finance.bookings30d")} value={String(summary?.bookings30d ?? 0)} />
        <Stat
          label={t("finance.commissionPending")}
          value={`${summary?.currency ?? "THB"} ${(summary?.commissionPending ?? 0).toLocaleString()}`}
        />
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("finance.plans")}</h2>
        <div className="surface overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("locations.name")}</TableHead>
                <TableHead>{t("locations.organisation")}</TableHead>
                <TableHead>{t("finance.rules")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(plans ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.partners?.display_name ?? "—"}</TableCell>
                  <TableCell>
                    {(p.commission_rules ?? []).map((r) => `${r.rate}%`).join(", ") || t("common.none")}
                  </TableCell>
                  <TableCell className="text-end">
                    <Button size="sm" variant="outline" onClick={() => setRuleFor(p.id)}>
                      {t("finance.addRule")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!plans?.length && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    {t("common.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("finance.earnings")}</h2>
        <div className="surface overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("therapists.name")}</TableHead>
                <TableHead>{t("finance.earnedOn")}</TableHead>
                <TableHead>{t("bookings.amount")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(earnings ?? []).map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    {e.therapists?.first_name} {e.therapists?.last_name}
                  </TableCell>
                  <TableCell>{e.earned_on}</TableCell>
                  <TableCell dir="ltr">
                    {e.currency} {Number(e.amount).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={e.status} />
                  </TableCell>
                  <TableCell className="space-x-2 text-end">
                    {e.status === "PENDING" && (
                      <Button size="sm" variant="outline" onClick={() => approveMutation.mutate({ id: e.id, status: "APPROVED" })}>
                        {t("finance.approve")}
                      </Button>
                    )}
                    {e.status === "APPROVED" && (
                      <Button size="sm" onClick={() => approveMutation.mutate({ id: e.id, status: "PAID" })}>
                        {t("finance.markPaid")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!earnings?.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    {t("common.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("finance.payments")}</h2>
        <div className="surface overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("bookings.reference")}</TableHead>
                <TableHead>{t("locations.location")}</TableHead>
                <TableHead>{t("bookings.paymentChannel")}</TableHead>
                <TableHead>{t("bookings.amount")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(payments ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">
                    {p.reference}
                  </TableCell>
                  <TableCell>{p.locations?.name ?? "—"}</TableCell>
                  <TableCell>{t(`payChannel.${p.channel}`)}</TableCell>
                  <TableCell dir="ltr">
                    {p.currency} {Number(p.amount).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={p.status} />
                  </TableCell>
                </TableRow>
              ))}
              {!payments?.length && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    {t("common.empty")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <Dialog open={!!ruleFor} onOpenChange={(v) => !v && setRuleFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("finance.addRule")}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              ruleMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="rate">{t("finance.ratePercent")}</Label>
              <Input id="rate" value={rate} inputMode="decimal" onChange={(e) => setRate(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={ruleMutation.isPending}>
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold" dir="ltr">
        {value}
      </p>
    </div>
  );
}
