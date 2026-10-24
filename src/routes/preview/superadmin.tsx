import { createFileRoute } from "@tanstack/react-router";

import { PreviewShell, MockCard, MockBadge } from "@/components/PreviewShell";
import { mockSuperadmin } from "@/lib/console-mock";

export const Route = createFileRoute("/preview/superadmin")({staticData:{sitemap:false},
  head: () => ({
    meta: [
      { title: "Superadmin Console preview — iCareTele" },
      { name: "description", content: "Synthetic global dashboard across organizations. No real data or writes." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SuperadminConsole,
});

function SuperadminConsole() {
  const orgs = mockSuperadmin.organizations;
  const totals = {
    orgs: orgs.length,
    mcsBacklog: orgs.reduce((n, o) => n + o.mcsBacklog, 0),
    slaBreaches: orgs.reduce((n, o) => n + o.slaBreaches, 0),
    consulted: orgs.reduce((n, o) => n + o.funnel.consulted, 0),
  };

  return (
    <PreviewShell title="Superadmin Console" subtitle="Global view across synthetic organizations — no patient health detail shown">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MockCard title="Organizations"><p className="font-display text-3xl font-semibold">{totals.orgs}</p></MockCard>
        <MockCard title="Consultations (funnel total)"><p className="font-display text-3xl font-semibold">{totals.consulted}</p></MockCard>
        <MockCard title="MCS backlog"><p className="font-display text-3xl font-semibold">{totals.mcsBacklog}</p></MockCard>
        <MockCard title="SLA breaches"><p className="font-display text-3xl font-semibold">{totals.slaBreaches}</p></MockCard>
      </div>

      <div className="mt-6 space-y-4">
        {orgs.map((o) => (
          <MockCard key={o.name} title={o.name}>
            <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Partner status</p>
                <MockBadge value={o.partnerStatus} />
              </div>
              <div>
                <p className="text-muted-foreground">License expiry</p>
                <p className="font-medium">{o.licenseExpiry}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Doctor utilization</p>
                <p className="font-medium">{o.doctorUtilizationPct}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">Consultation funnel</p>
                <p className="font-medium">
                  {o.funnel.requested} requested → {o.funnel.screened} screened → {o.funnel.consulted} consulted → {o.funnel.certified} certified
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">MCS backlog</p>
                <p className="font-medium">{o.mcsBacklog}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Credit / reconciliation</p>
                <p className="font-medium">{o.creditSummary}</p>
              </div>
              <div>
                <p className="text-muted-foreground">SLA</p>
                <p className="font-medium">{o.slaBreaches} breach(es)</p>
              </div>
            </div>
          </MockCard>
        ))}
      </div>

      <MockCard title="Audit / system health" className="mt-6">
        <ul className="space-y-2 text-sm">
          {mockSuperadmin.systemHealth.map((h) => (
            <li key={h.label} className="flex items-center justify-between gap-2">
              <span>{h.label}</span>
              <span className="text-muted-foreground">{h.status}</span>
            </li>
          ))}
        </ul>
      </MockCard>
    </PreviewShell>
  );
}
