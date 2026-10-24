import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { PreviewShell, MockCard, MockBadge } from "@/components/PreviewShell";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mockAdminQueues, mockDoctors, mockMcsCases, mockPartners } from "@/lib/console-mock";

export const Route = createFileRoute("/preview/admin")({staticData:{sitemap:false},
  head: () => ({
    meta: [
      { title: "Admin Console preview — iCareTele" },
      { name: "description", content: "Synthetic admin console preview with review queues. No real data or writes." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminConsole,
});

const ALL = "ALL";

function AdminConsole() {
  const [filters, setFilters] = useState({ partner: ALL, branch: ALL, doctor: ALL, date: ALL, mcs: ALL, credit: ALL, certificate: ALL });

  const partners = mockPartners.filter((p) => filters.partner === ALL || p.name === filters.partner);
  const branches = [...new Set(mockPartners.map((p) => p.branch))];
  const mcsStatuses = [...new Set(mockMcsCases.map((c) => c.status))];

  const queues = useMemo(() => {
    const inScope = (partnerName: string) => filters.partner === ALL || partnerName === filters.partner;
    return {
      partnerReviews: mockAdminQueues.partnerReviews.filter((p) => inScope(p.name)),
      missingDocuments: mockAdminQueues.missingDocuments.filter((p) => inScope(p.name)),
      licenseExpiry: mockAdminQueues.licenseExpiry.filter((p) => inScope(p.name)),
      doctorRecruitment: mockAdminQueues.doctorRecruitment.filter((d) => (filters.doctor === ALL || d.name === filters.doctor) && inScope(d.partner)),
      mcsHandoff: mockAdminQueues.mcsHandoff.filter((c) => (filters.mcs === ALL || c.status === filters.mcs) && inScope(c.partner)),
      certificatePending: mockAdminQueues.certificatePending.filter((c) => (filters.certificate === ALL || filters.certificate === "PENDING") && inScope(c.partner)),
      creditAnomalies: mockAdminQueues.creditAnomalies.filter((c) => (filters.credit === ALL || filters.credit === "ANOMALY") && inScope(c.partner)),
      overdueSla: mockAdminQueues.overdueSla,
    };
  }, [filters]);

  const filterDefs = [
    { key: "partner" as const, label: "Partner", options: mockPartners.map((p) => p.name) },
    { key: "branch" as const, label: "Branch", options: branches },
    { key: "doctor" as const, label: "Doctor", options: mockDoctors.map((d) => d.name) },
    { key: "date" as const, label: "Date", options: ["Last 7 days", "Last 30 days"] },
    { key: "mcs" as const, label: "MCS status", options: mcsStatuses },
    { key: "credit" as const, label: "Credit status", options: ["ANOMALY", "BALANCED"] },
    { key: "certificate" as const, label: "Certificate status", options: ["PENDING", "UPLOADED"] },
  ];

  return (
    <PreviewShell title="Admin Console" subtitle="Scoped operations queues (synthetic)">
      <div className="surface mb-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {filterDefs.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label>{f.label}</Label>
            <Select value={filters[f.key]} onValueChange={(v) => setFilters((s) => ({ ...s, [f.key]: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {f.options.map((o) => (
                  <SelectItem key={o} value={o}>{o.replaceAll("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MockCard title="Partner reviews">
          <ul className="space-y-2 text-sm">
            {queues.partnerReviews.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span>{p.name}</span>
                <MockBadge value={p.status} />
              </li>
            ))}
            {!queues.partnerReviews.length && <li className="text-muted-foreground">No items</li>}
          </ul>
        </MockCard>

        <MockCard title="Missing documents">
          <ul className="space-y-2 text-sm">
            {queues.missingDocuments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span>{p.name}</span>
                <span className="text-muted-foreground">{p.missingDocuments} missing</span>
              </li>
            ))}
            {!queues.missingDocuments.length && <li className="text-muted-foreground">No items</li>}
          </ul>
        </MockCard>

        <MockCard title="License expiry">
          <ul className="space-y-2 text-sm">
            {queues.licenseExpiry.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <span>{p.name}</span>
                <span className="text-muted-foreground">{p.licenseExpiry}</span>
              </li>
            ))}
            {!queues.licenseExpiry.length && <li className="text-muted-foreground">No items</li>}
          </ul>
        </MockCard>

        <MockCard title="Doctor recruitment / assignment">
          <ul className="space-y-2 text-sm">
            {queues.doctorRecruitment.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2">
                <span>{d.name}</span>
                <MockBadge value={d.status} />
              </li>
            ))}
            {!queues.doctorRecruitment.length && <li className="text-muted-foreground">No items</li>}
          </ul>
        </MockCard>

        <MockCard title="MCS handoff">
          <ul className="space-y-2 text-sm">
            {queues.mcsHandoff.map((c) => (
              <li key={c.caseId} className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{c.mcsCaseId}</span>
                <MockBadge value={c.status} />
              </li>
            ))}
            {!queues.mcsHandoff.length && <li className="text-muted-foreground">No items</li>}
          </ul>
        </MockCard>

        <MockCard title="Certificate pending">
          <ul className="space-y-2 text-sm">
            {queues.certificatePending.map((c) => (
              <li key={c.caseId} className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{c.mcsCaseId}</span>
                <MockBadge value={c.status} />
              </li>
            ))}
            {!queues.certificatePending.length && <li className="text-muted-foreground">No items</li>}
          </ul>
        </MockCard>

        <MockCard title="Credit anomalies">
          <ul className="space-y-2 text-sm">
            {queues.creditAnomalies.map((c) => (
              <li key={c.id}>
                <span className="font-medium">{c.partner}</span>
                <span className="block text-muted-foreground">{c.detail}</span>
              </li>
            ))}
            {!queues.creditAnomalies.length && <li className="text-muted-foreground">No items</li>}
          </ul>
        </MockCard>

        <MockCard title="Overdue SLA">
          <ul className="space-y-2 text-sm">
            {queues.overdueSla.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <span>{s.item}</span>
                <span className="text-muted-foreground">{s.ageDays}d overdue</span>
              </li>
            ))}
          </ul>
        </MockCard>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        {partners.length} synthetic partner(s) in scope. Filters are visual only; nothing is read from or written to any backend.
      </p>
    </PreviewShell>
  );
}
