import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { LOCALES, useI18n } from "@/i18n";
import { createPatient, listPartners, listPatients } from "@/lib/partnercare.functions";
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

export const Route = createFileRoute("/_authenticated/patients")({staticData:{sitemap:false},
  head: () => ({
    meta: [{name:'robots',content:'noindex, nofollow'},
      { title: "Patients — THAIKANYA PartnerCare" },
      { name: "description", content: "Patient identity mapping and partner attribution. HN stays with the clinical system." },
      { property: "og:title", content: "Patients — THAIKANYA PartnerCare" },
      { property: "og:description", content: "Patient identity mapping and partner attribution." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PatientsPage,
});

function PatientsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listPatients);
  const partnersFn = useServerFn(listPartners);
  const createFn = useServerFn(createPatient);

  const [open, setOpen] = useState(false);
  const empty = {
    partnerId: "",
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    preferredLanguage: "th" as (typeof LOCALES)[number]["code"],
  };
  const [form, setForm] = useState(empty);

  const { data, isLoading } = useQuery({ queryKey: ["patients"], queryFn: () => listFn({}) });
  const { data: partners } = useQuery({ queryKey: ["partners"], queryFn: () => partnersFn({}) });

  const mutation = useMutation({
    mutationFn: (input: typeof form) => createFn({ data: input }),
    onSuccess: () => {
      toast.success(t("patients.created"));
      setOpen(false);
      setForm(empty);
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t("patients.title")}
        subtitle={t("patients.subtitle")}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!partners?.length}>{t("patients.new")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("patients.new")}</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate(form);
                }}
              >
                <div className="space-y-2">
                  <Label>{t("patients.partner")}</Label>
                  <Select value={form.partnerId} onValueChange={(v) => setForm({ ...form, partnerId: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("patients.partner")} />
                    </SelectTrigger>
                    <SelectContent>
                      {partners?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">{t("patients.firstName")}</Label>
                    <Input
                      id="firstName"
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">{t("patients.lastName")}</Label>
                    <Input
                      id="lastName"
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("patients.email")}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t("patients.phone")}</Label>
                    <Input
                      id="phone"
                      value={form.phoneNumber}
                      onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("patients.language")}</Label>
                  <Select
                    value={form.preferredLanguage}
                    onValueChange={(v) =>
                      setForm({ ...form, preferredLanguage: v as (typeof LOCALES)[number]["code"] })
                    }
                  >
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
                <DialogFooter>
                  <Button type="submit" disabled={mutation.isPending || !form.partnerId}>
                    {t("common.create")}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("patients.externalId")}</TableHead>
              <TableHead>{t("patients.firstName")}</TableHead>
              <TableHead>{t("patients.email")}</TableHead>
              <TableHead>{t("patients.hn")}</TableHead>
              <TableHead>{t("patients.language")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !data?.length && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  {t("common.empty")}
                </TableCell>
              </TableRow>
            )}
            {data?.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs" dir="ltr">
                  {p.external_patient_id}
                </TableCell>
                <TableCell className="font-medium">
                  {p.first_name} {p.last_name}
                </TableCell>
                <TableCell className="text-muted-foreground">{p.email ?? "—"}</TableCell>
                <TableCell dir="ltr" className="font-mono text-xs">
                  {p.hn ?? <span className="font-sans text-muted-foreground">{t("patients.hnPending")}</span>}
                </TableCell>
                <TableCell>{p.preferred_language}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
