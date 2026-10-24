import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/i18n";
import {
  cancelCreditOrder,
  createCreditOrder,
  getCreditPosition,
  listCreditLedger,
  listCreditOrders,
  settleCreditOrder,
} from "@/lib/commerce.functions";
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

export const Route = createFileRoute("/_authenticated/credits")({staticData:{sitemap:false},
  head: () => ({
    meta: [{name:'robots',content:'noindex, nofollow'},
      { title: "CareCredits — THAIKANYA PartnerCare" },
      {
        name: "description",
        content: "Partner CareCredit balances, package orders and the immutable credit ledger.",
      },
      { property: "og:title", content: "CareCredits — THAIKANYA PartnerCare" },
      { property: "og:description", content: "Partner CareCredit balances, orders and ledger." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CreditsPage,
});

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

function CreditsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const positionFn = useServerFn(getCreditPosition);
  const ordersFn = useServerFn(listCreditOrders);
  const ledgerFn = useServerFn(listCreditLedger);
  const createFn = useServerFn(createCreditOrder);
  const settleFn = useServerFn(settleCreditOrder);
  const cancelFn = useServerFn(cancelCreditOrder);

  const [open, setOpen] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [credits, setCredits] = useState("1200");
  const [amount, setAmount] = useState("400000");
  const [paymentMethod, setPaymentMethod] = useState<"INVOICE" | "BANK_TRANSFER" | "PROMPTPAY" | "CARD">("INVOICE");

  const { data: positions } = useQuery({ queryKey: ["credit-position"], queryFn: () => positionFn({}) });
  const { data: orders } = useQuery({ queryKey: ["credit-orders"], queryFn: () => ordersFn({}) });
  const { data: ledger } = useQuery({ queryKey: ["credit-ledger"], queryFn: () => ledgerFn({ data: {} }) });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["credit-position"] });
    queryClient.invalidateQueries({ queryKey: ["credit-orders"] });
    queryClient.invalidateQueries({ queryKey: ["credit-ledger"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["audit"] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createFn({
        data: { partnerId, credits: Number(credits), amount: Number(amount), paymentMethod },
      }),
    onSuccess: () => {
      toast.success(t("credits.orderCreated"));
      setOpen(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const settleMutation = useMutation({
    mutationFn: (input: { orderId: string; paymentReference: string }) => settleFn({ data: input }),
    onSuccess: () => {
      toast.success(t("credits.settled"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => cancelFn({ data: { orderId } }),
    onSuccess: () => {
      toast.success(t("credits.cancelled"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t("credits.title")}
        subtitle={t("credits.subtitle")}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!positions?.length}>{t("credits.newOrder")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("credits.newOrder")}</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label>{t("credits.partner")}</Label>
                  <Select value={partnerId} onValueChange={setPartnerId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("credits.partner")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(positions ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.display_name} · {p.partner_code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="credits">{t("credits.credits")}</Label>
                    <Input id="credits" value={credits} onChange={(e) => setCredits(e.target.value)} inputMode="numeric" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">{t("credits.amount")}</Label>
                    <Input id="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("credits.paymentMethod")}</Label>
                  <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INVOICE">{t("credits.methodInvoice")}</SelectItem>
                      <SelectItem value="BANK_TRANSFER">{t("credits.methodTransfer")}</SelectItem>
                      <SelectItem value="PROMPTPAY">{t("credits.methodPromptPay")}</SelectItem>
                      <SelectItem value="CARD">{t("credits.methodCard")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {t("credits.manualNotice")}
                </p>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending || !partnerId}>
                    {t("common.create")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(positions ?? []).map((p) => (
          <div key={p.id} className="surface space-y-2 p-5">
            <p className="text-sm font-semibold">{p.display_name}</p>
            <p className="font-mono text-xs text-muted-foreground" dir="ltr">
              {p.partner_code}
            </p>
            <p className="font-display text-3xl font-semibold">{p.credit_balance}</p>
            <p className="text-xs text-muted-foreground">
              {t("credits.reserved")}: {p.reserved} · {t("credits.consumed")}: {p.consumed}
            </p>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("credits.orders")}</h2>
        <div className="surface overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("credits.orderCode")}</TableHead>
                <TableHead>{t("credits.partner")}</TableHead>
                <TableHead>{t("credits.credits")}</TableHead>
                <TableHead>{t("credits.amount")}</TableHead>
                <TableHead>{t("credits.status")}</TableHead>
                <TableHead className="text-end">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!orders?.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    {t("common.empty")}
                  </TableCell>
                </TableRow>
              )}
              {orders?.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">
                    {o.order_code}
                  </TableCell>
                  <TableCell className="font-medium">{o.partners?.display_name ?? "—"}</TableCell>
                  <TableCell>{o.credits}</TableCell>
                  <TableCell>{money(Number(o.amount), o.currency)}</TableCell>
                  <TableCell>
                    <StatusBadge value={o.status} />
                  </TableCell>
                  <TableCell className="space-x-2 text-end">
                    {o.status === "AWAITING_PAYMENT" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => {
                            const reference = window.prompt(t("credits.referencePrompt"));
                            if (reference) settleMutation.mutate({ orderId: o.id, paymentReference: reference });
                          }}
                        >
                          {t("credits.settle")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => cancelMutation.mutate(o.id)}>
                          {t("common.cancel")}
                        </Button>
                      </>
                    )}
                    {o.status === "PAID" && (
                      <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                        {o.payment_reference}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("credits.ledger")}</h2>
        <div className="surface overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("credits.type")}</TableHead>
                <TableHead>{t("credits.quantity")}</TableHead>
                <TableHead>{t("credits.balanceAfter")}</TableHead>
                <TableHead>{t("credits.reference")}</TableHead>
                <TableHead>{t("consultations.createdAt")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!ledger?.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    {t("common.empty")}
                  </TableCell>
                </TableRow>
              )}
              {ledger?.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <StatusBadge value={row.type} prefix="credit" />
                  </TableCell>
                  <TableCell>{row.quantity}</TableCell>
                  <TableCell>{row.balance_after}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground" dir="ltr">
                    {row.reference_id ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{new Date(row.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
