import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/i18n";
import { listPartners } from "@/lib/partnercare.functions";
import { createService, listServices, setServiceActive } from "@/lib/wellness.functions";
import { PageHeader } from "@/components/PageHeader";
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

export const Route = createFileRoute("/_authenticated/services")({staticData:{sitemap:false},
  head: () => ({
    meta: [{name:'robots',content:'noindex, nofollow'},
      { title: "Service menu — THAIKANYA PartnerCare" },
      { name: "description", content: "Treatment and wellness service catalogue with durations and prices." },
      { property: "og:title", content: "Service menu — THAIKANYA PartnerCare" },
      { property: "og:description", content: "Treatment and wellness services, durations and prices." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServicesPage,
});

const CATEGORIES = ["MASSAGE", "SPA", "AESTHETIC", "MEDICAL", "WELLNESS", "HOME_SERVICE"] as const;

function ServicesPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const partnersFn = useServerFn(listPartners);
  const servicesFn = useServerFn(listServices);
  const createFn = useServerFn(createService);
  const activeFn = useServerFn(setServiceActive);

  const [open, setOpen] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("MASSAGE");
  const [duration, setDuration] = useState("60");
  const [price, setPrice] = useState("1500");

  const { data: partners } = useQuery({ queryKey: ["partners"], queryFn: () => partnersFn({}) });
  const { data: services } = useQuery({ queryKey: ["services"], queryFn: () => servicesFn({}) });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["services"] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          partnerId,
          code,
          name,
          category,
          durationMinutes: Number(duration),
          bufferMinutes: 10,
          price: Number(price),
          currency: "THB",
        },
      }),
    onSuccess: () => {
      toast.success(t("services.created"));
      setOpen(false);
      setCode("");
      setName("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const activeMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => activeFn({ data: input }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t("services.title")}
        subtitle={t("services.subtitle")}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!partners?.length}>{t("services.newService")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("services.newService")}</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  createMutation.mutate();
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
                    <Label htmlFor="scode">{t("locations.code")}</Label>
                    <Input id="scode" value={code} onChange={(e) => setCode(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sname">{t("locations.name")}</Label>
                    <Input id="sname" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("services.category")}</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {t(`category.${c}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="duration">{t("services.duration")}</Label>
                    <Input
                      id="duration"
                      value={duration}
                      inputMode="numeric"
                      onChange={(e) => setDuration(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="price">{t("services.price")}</Label>
                    <Input id="price" value={price} inputMode="numeric" onChange={(e) => setPrice(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending || !partnerId || !code || !name}>
                    {t("common.create")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <section className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("locations.name")}</TableHead>
              <TableHead>{t("services.category")}</TableHead>
              <TableHead>{t("services.duration")}</TableHead>
              <TableHead>{t("services.price")}</TableHead>
              <TableHead>{t("locations.organisation")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(services ?? []).map((s) => {
              const active = (s.service_prices ?? []).find((p) => p.active);
              return (
                <TableRow key={s.id} className={s.active ? undefined : "opacity-60"}>
                  <TableCell>
                    <span className="font-medium">{s.name}</span>
                    <span className="ms-2 font-mono text-xs text-muted-foreground" dir="ltr">
                      {s.code}
                    </span>
                  </TableCell>
                  <TableCell>{t(`category.${s.category}`)}</TableCell>
                  <TableCell>{s.duration_minutes} min</TableCell>
                  <TableCell dir="ltr">
                    {active ? `${active.currency} ${Number(active.price).toLocaleString()}` : "—"}
                  </TableCell>
                  <TableCell>{s.partners?.display_name ?? "—"}</TableCell>
                  <TableCell className="text-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => activeMutation.mutate({ id: s.id, active: !s.active })}
                    >
                      {s.active ? t("common.deactivate") : t("common.activate")}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {!services?.length && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  {t("common.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
