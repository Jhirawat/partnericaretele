import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useI18n } from "@/i18n";
import { getDashboard, getMyAccess } from "@/lib/partnercare.functions";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { requireStaffRoute } from "@/lib/staff-route-guard";

export const Route = createFileRoute("/_authenticated/dashboard")({staticData:{sitemap:false},
  beforeLoad: () => requireStaffRoute("staff"),
  head: () => ({
    meta: [{name:'robots',content:'noindex, nofollow'},
      { title: "Operations overview — THAIKANYA PartnerCare" },
      { name: "description", content: "Live partner, patient and consultation position across your authorised scope." },
      { property: "og:title", content: "Operations overview — THAIKANYA PartnerCare" },
      { property: "og:description", content: "Live partner, patient and consultation position." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { t } = useI18n();
  const dashboardFn = useServerFn(getDashboard);
  const accessFn = useServerFn(getMyAccess);

  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => dashboardFn({}) });
  const { data: access } = useQuery({ queryKey: ["access"], queryFn: () => accessFn({}) });

  const stats = [
    { label: "dashboard.partners", value: data?.partnerCount ?? 0 },
    { label: "dashboard.patients", value: data?.patientCount ?? 0 },
    { label: "dashboard.consultations", value: data?.consultationCount ?? 0 },
    { label: "dashboard.credits", value: data?.creditBalance ?? 0 },
  ];

  const secondary = [
    { label: "dashboard.today", value: data?.consultationsToday ?? 0 },
    { label: "dashboard.thisMonth", value: data?.consultationsThisMonth ?? 0 },
    { label: "dashboard.avgDuration", value: data?.averageDurationMinutes ?? "—" },
    { label: "dashboard.creditsSold", value: data?.creditsSold ?? 0 },
    { label: "dashboard.creditsUsed", value: data?.creditsConsumed ?? 0 },
    { label: "dashboard.creditsReserved", value: data?.creditsReserved ?? 0 },
    { label: "dashboard.membershipRevenue", value: data?.membershipRevenue ?? 0 },
    { label: "dashboard.integrationHealth", value: data?.webhookFailures24h ?? 0 },
    { label: "dashboard.openConflicts", value: data?.openConflicts ?? 0 },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="surface p-5">
            <p className="text-sm text-muted-foreground">{t(s.label)}</p>
            <p className="mt-2 font-display text-3xl font-semibold">
              {isLoading ? "—" : s.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {secondary.map((s) => (
          <div key={s.label} className="surface p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{t(s.label)}</p>
            <p className="mt-1 font-display text-xl font-semibold">
              {isLoading ? "—" : typeof s.value === "number" ? s.value.toLocaleString() : s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="surface p-6">
        <h2 className="text-base font-semibold">{t("dashboard.roles")}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {access?.roles.length ? (
            access.roles.map((r, i) => (
              <span
                key={i}
                className="rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground"
              >
                {r.role.replaceAll("_", " ")}
              </span>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">{t("dashboard.noRoles")}</p>
          )}
        </div>
      </div>

      <div className="surface p-6">
        <h2 className="text-base font-semibold">{t("dashboard.recent")}</h2>
        {data?.recent?.length ? (
          <ul className="mt-4 divide-y divide-border">
            {data.recent.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <span className="font-mono text-xs">{c.consultation_id}</span>
                <StatusBadge value={c.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{t("common.empty")}</p>
        )}
      </div>
    </div>
  );
}
