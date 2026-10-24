import { requireStaffRoute } from "@/lib/staff-route-guard";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { useI18n } from "@/i18n";
import {
  getIntegrationStatus,
  listIntegrationConflicts,
  listNotificationDeliveries,
  resolveIntegrationConflict,
  simulateMcsEvent,
} from "@/lib/integration.functions";
import { listConsultations } from "@/lib/partnercare.functions";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/integrations")({beforeLoad:()=>requireStaffRoute("super"),staticData:{sitemap:false},
  head: () => ({
    meta: [{name:'robots',content:'noindex, nofollow'},
      { title: "Integration health — THAIKANYA PartnerCare" },
      {
        name: "description",
        content: "Clinical provider connection status, webhook events, conflicts and patient message delivery.",
      },
      { property: "og:title", content: "Integration health — THAIKANYA PartnerCare" },
      { property: "og:description", content: "Clinical connection status, events, conflicts and messages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IntegrationsPage,
});

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "warn" | undefined }) {
  return (
    <div className="surface space-y-1 p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`font-display text-2xl font-semibold ${tone === "warn" ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function IntegrationsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const statusFn = useServerFn(getIntegrationStatus);
  const conflictsFn = useServerFn(listIntegrationConflicts);
  const deliveriesFn = useServerFn(listNotificationDeliveries);
  const resolveFn = useServerFn(resolveIntegrationConflict);
  const simulateFn = useServerFn(simulateMcsEvent);
  const consultationsFn = useServerFn(listConsultations);

  const { data: status } = useQuery({ queryKey: ["integration-status"], queryFn: () => statusFn({}) });
  const { data: conflicts } = useQuery({ queryKey: ["integration-conflicts"], queryFn: () => conflictsFn({}) });
  const { data: deliveries } = useQuery({ queryKey: ["notification-deliveries"], queryFn: () => deliveriesFn({}) });
  const { data: consultations } = useQuery({ queryKey: ["consultations"], queryFn: () => consultationsFn({}) });

  const resolveMutation = useMutation({
    mutationFn: (conflictId: string) => resolveFn({ data: { conflictId } }),
    onSuccess: () => {
      toast.success(t("integrations.resolved"));
      queryClient.invalidateQueries({ queryKey: ["integration-conflicts"] });
      queryClient.invalidateQueries({ queryKey: ["integration-status"] });
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const simulateMutation = useMutation({
    mutationFn: (input: { consultationId: string; event: "consultation.started" | "consultation.completed" }) =>
      simulateFn({ data: input }),
    onSuccess: () => {
      toast.success(t("integrations.simulated"));
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const rehearsable = (consultations ?? []).filter((c) => ["WAITING", "STARTED"].includes(c.status));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title={t("integrations.title")} subtitle={t("integrations.subtitle")} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("integrations.mode")} value={status?.mode ?? "—"} />
        <Stat
          label={t("integrations.failures")}
          value={status?.failuresLast24h ?? 0}
          tone={status?.failuresLast24h ? "warn" : undefined}
        />
        <Stat
          label={t("integrations.conflicts")}
          value={status?.openConflicts ?? 0}
          tone={status?.openConflicts ? "warn" : undefined}
        />
        <Stat
          label={t("integrations.lastEvent")}
          value={status?.lastEventAt ? new Date(status.lastEventAt).toLocaleString() : "—"}
        />
      </div>

      <div className="surface space-y-2 p-5 text-sm">
        <p className="font-semibold">{t("integrations.configuration")}</p>
        <p className="text-muted-foreground">
          {t("integrations.endpoint")}: <span className="font-mono text-xs">{status?.webhookUrl}</span>
        </p>
        <ul className="space-y-1 text-muted-foreground">
          <li>
            {t("integrations.baseUrl")}: {status?.baseUrlConfigured ? t("common.yes") : t("common.no")}
          </li>
          <li>
            {t("integrations.apiKey")}: {status?.apiKeyConfigured ? t("common.yes") : t("common.no")}
          </li>
          <li>
            {t("integrations.webhookSecret")}: {status?.webhookSecretConfigured ? t("common.yes") : t("common.no")}
          </li>
        </ul>
        {status?.mode === "MOCK" && (
          <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs">{t("integrations.mockNotice")}</p>
        )}
      </div>

      {status?.mode === "MOCK" && rehearsable.length > 0 && (
        <section className="surface space-y-3 p-5">
          <p className="text-sm font-semibold">{t("integrations.rehearse")}</p>
          <div className="space-y-2">
            {rehearsable.slice(0, 5).map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-mono text-xs" dir="ltr">
                  {c.consultation_id}
                </span>
                <StatusBadge value={c.status} />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={simulateMutation.isPending}
                  onClick={() => simulateMutation.mutate({ consultationId: c.id, event: "consultation.started" })}
                >
                  {t("integrations.markStarted")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={simulateMutation.isPending}
                  onClick={() => simulateMutation.mutate({ consultationId: c.id, event: "consultation.completed" })}
                >
                  {t("integrations.markCompleted")}
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("integrations.events")}</h2>
        <div className="surface overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("integrations.event")}</TableHead>
                <TableHead>{t("integrations.processing")}</TableHead>
                <TableHead>{t("integrations.received")}</TableHead>
                <TableHead>{t("integrations.error")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!status?.recentEvents.length && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    {t("common.empty")}
                  </TableCell>
                </TableRow>
              )}
              {status?.recentEvents.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">
                    {e.event_type}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={e.processing_status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{new Date(e.received_at).toLocaleString()}</TableCell>
                  <TableCell className="max-w-[18rem] truncate text-xs text-muted-foreground">
                    {e.last_error ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("integrations.conflicts")}</h2>
        <div className="surface overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("integrations.conflictType")}</TableHead>
                <TableHead>{t("integrations.processing")}</TableHead>
                <TableHead>{t("consultations.createdAt")}</TableHead>
                <TableHead className="text-end">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!conflicts?.length && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    {t("common.empty")}
                  </TableCell>
                </TableRow>
              )}
              {conflicts?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">
                    {c.conflict_type}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={c.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{new Date(c.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-end">
                    {c.status === "OPEN" && (
                      <Button size="sm" variant="ghost" onClick={() => resolveMutation.mutate(c.id)}>
                        {t("integrations.resolve")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("integrations.messages")}</h2>
        <div className="surface overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("integrations.channel")}</TableHead>
                <TableHead>{t("integrations.template")}</TableHead>
                <TableHead>{t("integrations.processing")}</TableHead>
                <TableHead>{t("integrations.queued")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!deliveries?.length && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    {t("common.empty")}
                  </TableCell>
                </TableRow>
              )}
              {deliveries?.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{d.channel}</TableCell>
                  <TableCell className="font-mono text-xs" dir="ltr">
                    {d.template}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={d.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{new Date(d.queued_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
