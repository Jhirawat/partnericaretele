import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2, ClipboardList, Clock3, Coins, FileCheck2, ShieldCheck, Users } from "lucide-react";

import { useI18n } from "@/i18n";
import { getDashboard, getMyAccess } from "@/lib/partnercare.functions";
import { StatusBadge } from "@/components/StatusBadge";
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
    { label: "dashboard.partners", value: data?.partnerCount ?? 0, icon: Users, tone: "info" },
    { label: "dashboard.patients", value: data?.patientCount ?? 0, icon: Users, tone: "success" },
    { label: "dashboard.consultations", value: data?.consultationCount ?? 0, icon: ClipboardList, tone: "warning" },
    { label: "dashboard.credits", value: data?.creditBalance ?? 0, icon: Coins, tone: "info" },
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

  const pipeline = [
    { label: t("dashboard.intake"), copy: t("dashboard.intakeCopy"), count: data?.statusCounts?.["DRAFT"] ?? 0, icon: ClipboardList, tone: "info" },
    { label: t("dashboard.screening"), copy: t("dashboard.screeningCopy"), count: data?.statusCounts?.["PENDING"] ?? 0, icon: Clock3, tone: "warning" },
    { label: t("dashboard.handoff"), copy: t("dashboard.handoffCopy"), count: data?.statusCounts?.["QUEUED"] ?? 0, icon: Users, tone: "info" },
    { label: t("dashboard.connected"), copy: t("dashboard.connectedCopy"), count: data?.statusCounts?.["IN_PROGRESS"] ?? 0, icon: FileCheck2, tone: "success" },
    { label: t("dashboard.completed"), copy: t("dashboard.completedCopy"), count: data?.statusCounts?.["COMPLETED"] ?? 0, icon: CheckCircle2, tone: "success" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">{t("brand.name")}</p>
          <h1 className="dashboard-greeting mt-2 font-display font-semibold">{t("dashboard.title")}</h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">{t("dashboard.subtitle")}</p>
        </div>
        <div className="rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground">{t("dashboard.roles")}</div>
      </div>

      <section className="dashboard-primary-action surface flex items-center justify-between gap-5 p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/70 text-primary"><ClipboardList className="size-6" /></span>
          <div><h2 className="font-display text-lg font-semibold">{t("consultations.new")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("consultations.subtitle")}</p></div>
        </div>
        <Link to="/partner-customers" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--ic-coral-500)] px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-[var(--ic-coral-700)]">{t("consultations.new")}<ArrowRight className="size-4" /></Link>
      </section>

      <div className="dashboard-stat-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => { const Icon = s.icon; return <div key={s.label} className="surface flex items-start gap-4 p-5">
          <span className="dashboard-stat-icon" data-tone={s.tone}><Icon className="size-6" /></span>
          <div><p className="text-sm text-muted-foreground">{t(s.label)}</p><p className="mt-1 font-display text-3xl font-semibold">{isLoading ? "—" : s.value.toLocaleString()}</p><p className="mt-1 text-xs text-muted-foreground">{t("dashboard.subtitle")}</p></div>
        </div>; })}
      </div>

      <section className="surface space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-xl font-semibold">{t("dashboard.pipelineTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("dashboard.pipelineSubtitle")}</p></div><Link to="/consultations" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">{t("dashboard.viewAllConsultations")} <ArrowRight className="size-4" /></Link></div>
        <div className="dashboard-pipeline"><div className="dashboard-pipeline-track flex items-start justify-between gap-3">
          {pipeline.map((stage, index) => { const Icon = stage.icon; return <div key={stage.label} className="flex min-w-[112px] flex-1 items-start gap-3">
            <div className="text-center"><div className="relative mx-auto grid size-14 place-items-center rounded-full bg-secondary text-primary"><Icon className="size-6" /><span className="absolute -right-1 -top-1 rounded-full bg-card px-1.5 py-0.5 text-xs font-bold shadow-sm">{isLoading ? "—" : stage.count}</span></div><p className="mt-2 text-sm font-semibold">{stage.label}</p><p className="mt-1 text-xs text-muted-foreground">{stage.copy}</p></div>
            {index < pipeline.length - 1 && <ArrowRight className="mt-7 hidden size-5 shrink-0 text-muted-foreground sm:block" />}
          </div>; })}
        </div></div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <section className="surface p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><h2 className="font-display text-xl font-semibold">{t("dashboard.recent")}</h2><Link to="/consultations" className="text-sm font-semibold text-primary">{t("dashboard.viewAll")} <ArrowRight className="inline size-4" /></Link></div>{data?.recent?.length ? <ul className="mt-4 divide-y divide-border">{data.recent.map((c) => <li key={c.id} className="flex items-center justify-between gap-4 py-3"><div><p className="font-mono text-xs">{c.consultation_id}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</p></div><StatusBadge value={c.status} /></li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">{t("common.empty")}</p>}</section>
        <section className="surface p-5 sm:p-6"><h2 className="font-display text-xl font-semibold">{t("dashboard.roles")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("dashboard.scopeLabel")}</p><div className="mt-4 flex flex-wrap gap-2">{access?.roles.length ? access.roles.map((r, i) => <span key={i} className="rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground">{r.role.replaceAll("_", " ")}</span>) : <p className="text-sm text-muted-foreground">{t("dashboard.noRoles")}</p>}</div><div className="mt-6 rounded-xl bg-muted p-4 text-sm text-muted-foreground"><ShieldCheck className="mr-2 inline size-4 text-primary" />{t("dashboard.secureScope")}</div></section>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{secondary.map((s) => <div key={s.label} className="surface p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(s.label)}</p><p className="mt-2 font-display text-xl font-semibold">{isLoading ? "—" : typeof s.value === "number" ? s.value.toLocaleString() : s.value}</p></div>)}</div>
    </div>
  );
}
