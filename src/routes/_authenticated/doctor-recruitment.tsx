import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { doctorCommand, readDoctorRecruitment, type DoctorCommand, type DoctorRow } from "@/lib/doctor-recruitment.functions";
import { doctorError, useDoctorCopy } from "@/lib/doctor-recruitment.copy";
import { useI18n } from "@/i18n";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { CareMfa } from "@/components/CareMfa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const recruitmentQuery = queryOptions({ queryKey: ["doctor-recruitment"], queryFn: () => readDoctorRecruitment() });

export const Route = createFileRoute("/_authenticated/doctor-recruitment")({staticData:{sitemap:false},
  loader: ({ context }) => context.queryClient.ensureQueryData(recruitmentQuery),
  head: () => ({
    meta: [{name:'robots',content:'noindex, nofollow'},
      { title: "Doctor recruitment — iCareTele" },
      { name: "description", content: "Register, verify and assign doctors within your authorized organization scope." },
      { property: "og:title", content: "Doctor recruitment — iCareTele" },
      { property: "og:description", content: "Scoped doctor verification and organization assignment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DoctorRecruitmentPage,
});

function useCommand() {
  const qc = useQueryClient();
  const fn = useServerFn(doctorCommand);
  const { locale } = useI18n();
  const l = useDoctorCopy();
  return useMutation({
    mutationFn: (v: DoctorCommand) => fn({ data: v }),
    onSuccess: () => { toast.success(l("saved")); void qc.invalidateQueries({ queryKey: ["doctor-recruitment"] }); },
    onError: (e: Error) => toast.error(doctorError(e, locale)),
  });
}

function DoctorRecruitmentPage() {
  const l = useDoctorCopy();
  const { data } = useSuspenseQuery(recruitmentQuery);
  const [filter, setFilter] = useState<"PENDING" | "ACTIVE" | "SUSPENDED" | "ALL">("PENDING");
  const staff = data.roles.some((r) => r.status === "ACTIVE" && ((r.partner_id === null && ["SUPER_ADMIN", "OPERATIONS_ADMIN"].includes(r.role)) || r.role === "OPERATIONS_ADMIN"));
  if (!staff) return <div className="space-y-4"><PageHeader title={l("adminTitle")} /><p className="text-muted-foreground">{l("noAccess")}</p></div>;
  const shown = data.doctors.filter((d) => filter === "ALL" || d.status === filter);
  return (
    <div className="space-y-8">
      <PageHeader title={l("adminTitle")} subtitle={l("adminHint")} />
      <CareMfa />
      <RegisterForm locations={data.locations} />
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">{l("queue")}</h2>
          <div className="flex gap-2">
            {(["PENDING", "ACTIVE", "SUSPENDED", "ALL"] as const).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                {l(f === "ALL" ? "all" : f === "PENDING" ? "pending" : f === "ACTIVE" ? "active" : "suspended")}
              </Button>
            ))}
          </div>
        </div>
        {!shown.length && <p className="text-muted-foreground">{l("noDoctors")}</p>}
        {shown.map((d) => <DoctorCard key={d.id} doctor={d} data={data} />)}
      </section>
    </div>
  );
}

function RegisterForm({ locations }: { locations: { id: string; name: string }[] }) {
  const l = useDoctorCopy();
  const m = useCommand();
  const empty = { fullName: "", licenseNumber: "", licenseExpiresOn: "", specialty: "", phone: "", email: "", locationId: "" };
  const [f, setF] = useState(empty);
  const field = (k: keyof typeof f, label: string, type = "text") => (
    <div className="space-y-1"><Label htmlFor={`reg-${k}`}>{label}</Label><Input id={`reg-${k}`} type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );
  return (
    <section className="surface space-y-4 p-5">
      <h2 className="font-display text-lg font-semibold">{l("register")}</h2>
      <p className="text-sm text-muted-foreground">{l("synthetic")}</p>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); m.mutate({ op: "REGISTER", ...f }, { onSuccess: () => setF(empty) }); }}>
        {field("fullName", l("fullName"))}
        {field("licenseNumber", l("license"))}
        {field("licenseExpiresOn", l("licenseExpiry"), "date")}
        {field("specialty", l("specialty"))}
        {field("email", l("email"), "email")}
        {field("phone", l("phone"))}
        <div className="space-y-1">
          <Label>{l("homeBranch")}</Label>
          <Select value={f.locationId || "none"} onValueChange={(v) => setF({ ...f, locationId: v === "none" ? "" : v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{l("none")}</SelectItem>
              {locations.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end"><Button type="submit" disabled={m.isPending || f.fullName.trim().length < 2 || f.licenseNumber.trim().length < 2}>{l("register")}</Button></div>
      </form>
    </section>
  );
}

function DoctorCard({ doctor: d, data }: { doctor: DoctorRow; data: Awaited<ReturnType<typeof readDoctorRecruitment>> }) {
  const l = useDoctorCopy();
  const m = useCommand();
  const [reason, setReason] = useState("");
  const [org, setOrg] = useState("");
  const [branch, setBranch] = useState("");
  const assignments = data.assignments.filter((a) => a.doctor_id === d.id);
  const name = (id: string) => data.partners.find((p) => p.id === id)?.display_name ?? id.slice(0, 8);
  const loc = (id: string | null) => (id ? data.locations.find((x) => x.id === id)?.name ?? id.slice(0, 8) : l("anyBranch"));
  const expired = d.license_expires_on && d.license_expires_on < new Date().toISOString().slice(0, 10);
  return (
    <div className="surface space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{d.full_name}</p>
          <p className="text-sm text-muted-foreground">
            {d.license_number} · {d.specialty ?? "—"} · <span className={expired ? "text-destructive" : ""}>{d.license_expires_on ?? "—"}</span>
          </p>
          <p className="text-xs text-muted-foreground">{d.email ?? "—"} · {d.auth_user_id ? l("linked") : l("notLinked")} · {l("homeBranch")}: {loc(d.location_id)}</p>
        </div>
        <StatusBadge value={d.status} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!d.auth_user_id && <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ op: "LINK_ACCOUNT", id: d.id })}>{l("link")}</Button>}
        {d.status === "PENDING" && <Button size="sm" disabled={m.isPending} onClick={() => m.mutate({ op: "VERIFY", id: d.id })}>{l("verify")}</Button>}
        {d.status === "SUSPENDED" && <Button size="sm" disabled={m.isPending} onClick={() => m.mutate({ op: "REINSTATE", id: d.id })}>{l("reinstate")}</Button>}
        <Input className="h-8 w-56" placeholder={l("reason")} value={reason} onChange={(e) => setReason(e.target.value)} />
        {d.status === "ACTIVE" && <Button size="sm" variant="outline" disabled={m.isPending || !reason.trim()} onClick={() => m.mutate({ op: "SUSPEND", id: d.id, reason })}>{l("suspend")}</Button>}
        <Button size="sm" variant="ghost" disabled={m.isPending || !reason.trim()} onClick={() => m.mutate({ op: "REVOKE_ACCESS", id: d.id, reason })}>{l("revoke")}</Button>
      </div>
      {d.status === "ACTIVE" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1"><Label>{l("organization")}</Label>
            <Select value={org} onValueChange={(v) => { setOrg(v); setBranch(""); }}>
              <SelectTrigger className="w-56"><SelectValue placeholder={l("organization")} /></SelectTrigger>
              <SelectContent>{data.partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>{l("branch")}</Label>
            <Select value={branch || "any"} onValueChange={(v) => setBranch(v === "any" ? "" : v)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{l("anyBranch")}</SelectItem>
                {data.locations.filter((x) => x.partner_id === org).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" disabled={m.isPending || !org} onClick={() => m.mutate({ op: "ASSIGN", id: d.id, partnerId: org, locationId: branch })}>{l("assign")}</Button>
        </div>
      )}
      {assignments.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-sm font-medium">{l("assignments")}</p>
          {assignments.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span>{name(a.partner_id)} · {loc(a.location_id)}</span>
              <StatusBadge value={a.status} />
              {a.reason && <span className="text-muted-foreground">{a.reason}</span>}
              {a.status === "ACTIVE" && <Button size="sm" variant="outline" disabled={m.isPending || !reason.trim()} onClick={() => m.mutate({ op: "SET_ASSIGNMENT", id: a.id, status: "SUSPENDED", reason })}>{l("suspend")}</Button>}
              {a.status === "SUSPENDED" && <Button size="sm" disabled={m.isPending} onClick={() => m.mutate({ op: "SET_ASSIGNMENT", id: a.id, status: "ACTIVE" })}>{l("reinstate")}</Button>}
              {a.status !== "REVOKED" && <Button size="sm" variant="ghost" disabled={m.isPending || !reason.trim()} onClick={() => m.mutate({ op: "SET_ASSIGNMENT", id: a.id, status: "REVOKED", reason })}>{l("revoke")}</Button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
