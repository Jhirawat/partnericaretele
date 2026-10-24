import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/i18n";
import { listPartners } from "@/lib/partnercare.functions";
import {
  createTherapist,
  listLocations,
  listServices,
  listTherapists,
  setTherapistEligibility,
  setTherapistStatus,
} from "@/lib/wellness.functions";
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

export const Route = createFileRoute("/_authenticated/therapists")({staticData:{sitemap:false},
  head: () => ({
    meta: [{name:'robots',content:'noindex, nofollow'},
      { title: "Therapists — THAIKANYA PartnerCare" },
      { name: "description", content: "Therapist roster, employment type and which services each can deliver." },
      { property: "og:title", content: "Therapists — THAIKANYA PartnerCare" },
      { property: "og:description", content: "Therapist roster and service skills." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TherapistsPage,
});

function TherapistsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const partnersFn = useServerFn(listPartners);
  const locationsFn = useServerFn(listLocations);
  const servicesFn = useServerFn(listServices);
  const therapistsFn = useServerFn(listTherapists);
  const createFn = useServerFn(createTherapist);
  const statusFn = useServerFn(setTherapistStatus);
  const eligibilityFn = useServerFn(setTherapistEligibility);

  const [open, setOpen] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [homeLocationId, setHomeLocationId] = useState("");
  const [staffCode, setStaffCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [skillsFor, setSkillsFor] = useState<string | null>(null);

  const { data: partners } = useQuery({ queryKey: ["partners"], queryFn: () => partnersFn({}) });
  const { data: locations } = useQuery({ queryKey: ["locations"], queryFn: () => locationsFn({}) });
  const { data: services } = useQuery({ queryKey: ["services"], queryFn: () => servicesFn({}) });
  const { data: therapists } = useQuery({ queryKey: ["therapists"], queryFn: () => therapistsFn({}) });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["therapists"] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          partnerId,
          ...(homeLocationId ? { homeLocationId } : {}),
          staffCode,
          firstName,
          lastName,
          phone,
          employmentType: "EMPLOYEE" as const,
        },
      }),
    onSuccess: () => {
      toast.success(t("therapists.created"));
      setOpen(false);
      setStaffCode("");
      setFirstName("");
      setLastName("");
      setPhone("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: "ACTIVE" | "INACTIVE" | "SUSPENDED" }) => statusFn({ data: input }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const eligibilityMutation = useMutation({
    mutationFn: (input: { therapistId: string; serviceId: string; enabled: boolean }) =>
      eligibilityFn({ data: { ...input, skillLevel: 3 } }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const activeTherapist = (therapists ?? []).find((th) => th.id === skillsFor) ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t("therapists.title")}
        subtitle={t("therapists.subtitle")}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!partners?.length}>{t("therapists.newTherapist")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("therapists.newTherapist")}</DialogTitle>
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
                <div className="space-y-2">
                  <Label>{t("locations.location")}</Label>
                  <Select value={homeLocationId} onValueChange={setHomeLocationId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("common.none")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(locations ?? [])
                        .filter((l) => !partnerId || l.partner_id === partnerId)
                        .map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="staffCode">{t("therapists.staffCode")}</Label>
                    <Input id="staffCode" value={staffCode} onChange={(e) => setStaffCode(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tphone">{t("locations.phone")}</Label>
                    <Input id="tphone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">{t("patients.firstName")}</Label>
                    <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">{t("patients.lastName")}</Label>
                    <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || !partnerId || !staffCode || !firstName || !lastName}
                  >
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
              <TableHead>{t("therapists.name")}</TableHead>
              <TableHead>{t("locations.organisation")}</TableHead>
              <TableHead>{t("locations.location")}</TableHead>
              <TableHead>{t("therapists.skills")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(therapists ?? []).map((th) => (
              <TableRow key={th.id}>
                <TableCell>
                  <span className="font-medium">
                    {th.first_name} {th.last_name}
                  </span>
                  <span className="ms-2 font-mono text-xs text-muted-foreground" dir="ltr">
                    {th.staff_code}
                  </span>
                </TableCell>
                <TableCell>{th.partners?.display_name ?? "—"}</TableCell>
                <TableCell>{th.locations?.name ?? "—"}</TableCell>
                <TableCell>{(th.therapist_service_eligibility ?? []).length}</TableCell>
                <TableCell>
                  <StatusBadge value={th.status} />
                </TableCell>
                <TableCell className="space-x-2 text-end">
                  <Button size="sm" variant="outline" onClick={() => setSkillsFor(th.id)}>
                    {t("therapists.manageSkills")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      statusMutation.mutate({ id: th.id, status: th.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })
                    }
                  >
                    {th.status === "ACTIVE" ? t("common.deactivate") : t("common.activate")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!therapists?.length && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  {t("common.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <Dialog open={!!skillsFor} onOpenChange={(v) => !v && setSkillsFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("therapists.manageSkills")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {(services ?? [])
              .filter((s) => !activeTherapist || s.partner_id === activeTherapist.partner_id)
              .map((s) => {
                const enabled = (activeTherapist?.therapist_service_eligibility ?? []).some(
                  (e) => e.service_id === s.id,
                );
                return (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <span className="text-sm">{s.name}</span>
                    <Button
                      size="sm"
                      variant={enabled ? "secondary" : "outline"}
                      onClick={() =>
                        activeTherapist &&
                        eligibilityMutation.mutate({
                          therapistId: activeTherapist.id,
                          serviceId: s.id,
                          enabled: !enabled,
                        })
                      }
                    >
                      {enabled ? t("common.remove") : t("common.add")}
                    </Button>
                  </div>
                );
              })}
            {!services?.length && <p className="text-sm text-muted-foreground">{t("common.empty")}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
