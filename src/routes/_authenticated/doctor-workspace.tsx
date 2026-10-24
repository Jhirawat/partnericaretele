import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { doctorCommand, readDoctorWorkspace, type SlotRow } from "@/lib/doctor-recruitment.functions";
import { WEEKDAYS, doctorError, useDoctorCopy } from "@/lib/doctor-recruitment.copy";
import { useI18n } from "@/i18n";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const workspaceQuery = queryOptions({ queryKey: ["doctor-workspace"], queryFn: () => readDoctorWorkspace() });

export const Route = createFileRoute("/_authenticated/doctor-workspace")({staticData:{sitemap:false},
  loader: ({ context }) => context.queryClient.ensureQueryData(workspaceQuery),
  head: () => ({
    meta: [{name:'robots',content:'noindex, nofollow'},
      { title: "Doctor workspace — iCareTele" },
      { name: "description", content: "Your verification status, organization assignments and availability." },
      { property: "og:title", content: "Doctor workspace — iCareTele" },
      { property: "og:description", content: "Doctor status, assignments and availability." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DoctorWorkspacePage,
});

function DoctorWorkspacePage() {
  const l = useDoctorCopy();
  const { data } = useSuspenseQuery(workspaceQuery);
  if (!data.doctor) return <div className="space-y-4"><PageHeader title={l("workspaceTitle")} /><p className="text-muted-foreground">{l("notDoctor")}</p></div>;
  const d = data.doctor;
  const hint = d.status === "ACTIVE" ? "statusActive" : d.status === "SUSPENDED" ? "statusSuspended" : "statusPending";
  return (
    <div className="space-y-8">
      <PageHeader title={l("workspaceTitle")} subtitle={d.full_name} />
      <section className="surface flex flex-wrap items-center gap-3 p-5" role="status">
        <StatusBadge value={d.status} />
        <span className="text-sm">{l(hint)}</span>
        <span className="w-full text-xs text-muted-foreground">{d.license_number} · {d.specialty ?? "—"} · {d.license_expires_on ?? "—"}</span>
      </section>
      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{l("assignments")}</h2>
        {!data.assignments.length && <p className="text-muted-foreground">{l("noAssignments")}</p>}
        {data.assignments.map((a) => (
          <div key={a.id} className="surface space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{a.partner_name ?? "—"} · {a.location_name ?? l("anyBranch")}</span>
              <StatusBadge value={a.status} />
              {a.reason && <span className="text-sm text-muted-foreground">{a.reason}</span>}
            </div>
            {a.status === "ACTIVE" && d.status === "ACTIVE" && <AvailabilityEditor assignmentId={a.id} initial={data.slots.filter((s) => s.assignment_id === a.id)} />}
          </div>
        ))}
      </section>
    </div>
  );
}

function AvailabilityEditor({ assignmentId, initial }: { assignmentId: string; initial: SlotRow[] }) {
  const l = useDoctorCopy();
  const { locale } = useI18n();
  const qc = useQueryClient();
  const fn = useServerFn(doctorCommand);
  const [slots, setSlots] = useState(initial.map((s) => ({ weekday: s.weekday, start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5) })));
  const m = useMutation({
    mutationFn: () => fn({ data: { op: "SET_AVAILABILITY", id: assignmentId, slots } }),
    onSuccess: () => { toast.success(l("saved")); void qc.invalidateQueries({ queryKey: ["doctor-workspace"] }); },
    onError: (e: Error) => toast.error(doctorError(e, locale)),
  });
  const set = (i: number, patch: Partial<(typeof slots)[number]>) => setSlots(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-sm font-medium">{l("availability")}</p>
      {slots.map((s, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Select value={String(s.weekday)} onValueChange={(v) => set(i, { weekday: Number(v) })}>
            <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{WEEKDAYS.map((w, k) => <SelectItem key={k} value={String(k)}>{w[locale === "th" ? 0 : 1]}</SelectItem>)}</SelectContent>
          </Select>
          <Input className="h-8 w-28" type="time" value={s.start} onChange={(e) => set(i, { start: e.target.value })} />
          <Input className="h-8 w-28" type="time" value={s.end} onChange={(e) => set(i, { end: e.target.value })} />
          <Button size="sm" variant="ghost" onClick={() => setSlots(slots.filter((_, j) => j !== i))}>{l("remove")}</Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={slots.length >= 28} onClick={() => setSlots([...slots, { weekday: 1, start: "09:00", end: "12:00" }])}>{l("addSlot")}</Button>
        <Button size="sm" disabled={m.isPending} onClick={() => m.mutate()}>{l("save")}</Button>
      </div>
    </div>
  );
}
