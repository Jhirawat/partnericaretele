import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/i18n";
import {
  assignPartnerAccess,
  createPartner,
  listPartnerMembers,
  listPartners,
  revokePartnerAccess,
  setPartnerStatus,
  updatePartner,
} from "@/lib/partnercare.functions";
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

export const Route = createFileRoute("/_authenticated/partners")({staticData:{sitemap:false},
  head: () => ({
    meta: [{name:'robots',content:'noindex, nofollow'},
      { title: "Partners — THAIKANYA PartnerCare" },
      {
        name: "description",
        content: "Create, edit, deactivate and assign access to partner accounts and CareCredit wallets.",
      },
      { property: "og:title", content: "Partners — THAIKANYA PartnerCare" },
      { property: "og:description", content: "Partner account management, status and CareCredit wallets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PartnersPage,
});

const STATUSES = ["PENDING", "ACTIVE", "SUSPENDED", "TERMINATED"] as const;
const PARTNER_ROLES = ["PARTNER_OWNER", "PARTNER_MANAGER", "PARTNER_STAFF"] as const;

type Partner = {
  id: string;
  partner_code: string;
  legal_name: string;
  display_name: string;
  status: string;
  country_code: string;
  credit_balance: number;
  email: string | null;
  phone: string | null;
};

function EditPartnerDialog({ partner }: { partner: Partner }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const updateFn = useServerFn(updatePartner);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    legalName: partner.legal_name,
    displayName: partner.display_name,
    countryCode: partner.country_code,
    email: partner.email ?? "",
    phone: partner.phone ?? "",
    status: partner.status,
  });

  const mutation = useMutation({
    mutationFn: () => updateFn({ data: { id: partner.id, ...form, status: form.status as "ACTIVE" } }),
    onSuccess: () => {
      toast.success(t("partners.updated"));
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {t("partners.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("partners.edit")} · <span className="font-mono text-sm">{partner.partner_code}</span>
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`legal-${partner.id}`}>{t("partners.legalName")}</Label>
            <Input
              id={`legal-${partner.id}`}
              value={form.legalName}
              onChange={(e) => setForm({ ...form, legalName: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`display-${partner.id}`}>{t("partners.displayName")}</Label>
            <Input
              id={`display-${partner.id}`}
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`email-${partner.id}`}>{t("partners.email")}</Label>
              <Input
                id={`email-${partner.id}`}
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`phone-${partner.id}`}>{t("partners.phone")}</Label>
              <Input
                id={`phone-${partner.id}`}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`country-${partner.id}`}>{t("partners.country")}</Label>
              <Input
                id={`country-${partner.id}`}
                maxLength={2}
                value={form.countryCode}
                onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t("partners.status")}</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccessDialog({ partner }: { partner: Partner }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const membersFn = useServerFn(listPartnerMembers);
  const assignFn = useServerFn(assignPartnerAccess);
  const revokeFn = useServerFn(revokePartnerAccess);

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("PARTNER_STAFF");

  const { data: members } = useQuery({
    queryKey: ["partner-members", partner.id],
    queryFn: () => membersFn({ data: { partnerId: partner.id } }),
    enabled: open,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["partner-members", partner.id] });

  const assign = useMutation({
    mutationFn: () =>
      assignFn({ data: { partnerId: partner.id, email, role: role as "PARTNER_STAFF" } }),
    onSuccess: () => {
      toast.success(t("partners.granted"));
      setEmail("");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const revoke = useMutation({
    mutationFn: (roleId: string) => revokeFn({ data: { roleId } }),
    onSuccess: () => {
      toast.success(t("partners.revoked"));
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          {t("partners.access")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t("partners.access")} · {partner.display_name}
          </DialogTitle>
        </DialogHeader>

        <form
          className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            assign.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`member-${partner.id}`}>{t("partners.memberEmail")}</Label>
            <Input
              id={`member-${partner.id}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t("partners.role")}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARTNER_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`role.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={assign.isPending || !email}>
            {t("partners.grant")}
          </Button>
        </form>

        <div className="space-y-2 border-t border-border pt-4">
          {!members?.length && <p className="text-sm text-muted-foreground">{t("partners.noMembers")}</p>}
          {members?.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.fullName || m.email || m.user_id}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t(`role.${m.role}`)} · {t(`status.${m.status === "REMOVED" ? "TERMINATED" : m.status === "INVITED" ? "PENDING" : m.status}`)}
                </p>
              </div>
              {m.status !== "REMOVED" && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(m.id)}
                >
                  {t("partners.revoke")}
                </Button>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PartnersPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listPartners);
  const createFn = useServerFn(createPartner);
  const statusFn = useServerFn(setPartnerStatus);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ legalName: "", displayName: "", partnerCode: "", countryCode: "TH" });

  const { data, isLoading } = useQuery({ queryKey: ["partners"], queryFn: () => listFn({}) });

  const mutation = useMutation({
    mutationFn: (input: typeof form) => createFn({ data: input }),
    onSuccess: () => {
      toast.success(t("partners.created"));
      setOpen(false);
      setForm({ legalName: "", displayName: "", partnerCode: "", countryCode: "TH" });
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: "ACTIVE" | "SUSPENDED" }) => statusFn({ data: input }),
    onSuccess: () => {
      toast.success(t("partners.statusChanged"));
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t("partners.title")}
        subtitle={t("partners.subtitle")}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>{t("partners.new")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("partners.new")}</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutation.mutate(form);
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="legalName">{t("partners.legalName")}</Label>
                  <Input
                    id="legalName"
                    value={form.legalName}
                    onChange={(e) => setForm({ ...form, legalName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="displayName">{t("partners.displayName")}</Label>
                  <Input
                    id="displayName"
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="partnerCode">{t("partners.code")}</Label>
                    <Input
                      id="partnerCode"
                      value={form.partnerCode}
                      onChange={(e) => setForm({ ...form, partnerCode: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="countryCode">{t("partners.country")}</Label>
                    <Input
                      id="countryCode"
                      maxLength={2}
                      value={form.countryCode}
                      onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={mutation.isPending}>
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
              <TableHead>{t("partners.code")}</TableHead>
              <TableHead>{t("partners.displayName")}</TableHead>
              <TableHead>{t("partners.country")}</TableHead>
              <TableHead>{t("partners.status")}</TableHead>
              <TableHead className="text-end">{t("partners.credits")}</TableHead>
              <TableHead className="text-end">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !data?.length && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  {t("common.empty")}
                </TableCell>
              </TableRow>
            )}
            {data?.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.partner_code}</TableCell>
                <TableCell className="font-medium">{p.display_name}</TableCell>
                <TableCell>{p.country_code}</TableCell>
                <TableCell>
                  <StatusBadge value={p.status} />
                </TableCell>
                <TableCell className="text-end tabular-nums">{p.credit_balance.toLocaleString()}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <EditPartnerDialog partner={p as Partner} />
                    <AccessDialog partner={p as Partner} />
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={statusMutation.isPending}
                      onClick={() =>
                        statusMutation.mutate({
                          id: p.id,
                          status: p.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE",
                        })
                      }
                    >
                      {p.status === "ACTIVE" ? t("partners.deactivate") : t("partners.activate")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
