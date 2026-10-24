import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Activity, Sparkles } from "lucide-react";

import { listConsultationEvents } from "@/lib/clinical-events.functions";

import { useI18n } from "@/i18n";
import {
  cancelConsultation,
  createConsultation,
  listConsultationNotes,
  listConsultations,
  listPatients,
  summariseConsultationNotes,
} from "@/lib/partnercare.functions";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { CaseSummaryView, isCaseSummary } from "@/components/CaseSummaryView";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export const Route = createFileRoute("/_authenticated/consultations")({staticData:{sitemap:false},
  head: () => ({
    meta: [{name:'robots',content:'noindex, nofollow'},
      { title: "Consultations — THAIKANYA PartnerCare" },
      {
        name: "description",
        content: "Consultation entitlement, notes and AI case summaries for operations staff.",
      },
      { property: "og:title", content: "Consultations — THAIKANYA PartnerCare" },
      { property: "og:description", content: "Consultation entitlement, notes and AI case summaries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConsultationsPage,
});

function NotesDialog({ consultationId, label }: { consultationId: string; label: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const notesFn = useServerFn(listConsultationNotes);
  const summariseFn = useServerFn(summariseConsultationNotes);

  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const { data: history } = useQuery({
    queryKey: ["consultation-notes", consultationId],
    queryFn: () => notesFn({ data: { consultationId } }),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () => summariseFn({ data: { consultationId, notes } }),
    onSuccess: () => {
      toast.success(t("consultations.generated"));
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["consultation-notes", consultationId] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Sparkles className="size-4" />
          {t("consultations.notes")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("consultations.notes")} · <span className="font-mono text-sm">{label}</span>
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
            <Label htmlFor="notes">{t("consultations.notesLabel")}</Label>
            <Textarea
              id="notes"
              rows={7}
              value={notes}
              placeholder={t("consultations.notesPlaceholder")}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            {t("consultations.summaryDisclaimer")}
          </p>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending || notes.trim().length < 20}>
              {mutation.isPending ? t("consultations.generating") : t("consultations.generate")}
            </Button>
          </DialogFooter>
        </form>

        <div className="space-y-4 border-t border-border pt-4">
          <p className="text-sm font-semibold">{t("consultations.history")}</p>
          {!history?.length && <p className="text-sm text-muted-foreground">{t("consultations.noSummaries")}</p>}
          {history?.map((row) => (
            <div key={row.id} className="surface space-y-3 p-4">
              <p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString()}</p>
              {isCaseSummary(row.summary) ? (
                <CaseSummaryView summary={row.summary} />
              ) : (
                <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
              )}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">{t("consultations.notesLabel")}</summary>
                <p className="mt-2 whitespace-pre-wrap">{row.notes}</p>
              </details>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Live clinical timeline: every entry comes from a signed MCS event. */
function TimelineDialog({ consultationId, label }: { consultationId: string; label: string }) {
  const { t } = useI18n();
  const eventsFn = useServerFn(listConsultationEvents);
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["consultation-events", consultationId],
    queryFn: () => eventsFn({ data: { consultationId } }),
    enabled: open,
    refetchInterval: open ? 15000 : false,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Activity className="size-4" />
          {t("consultations.timeline")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("consultations.timeline")} · <span className="font-mono text-sm">{label}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="surface space-y-1 p-4 text-sm">
          <p>
            <span className="text-muted-foreground">{t("consultations.clinicalReference")}: </span>
            <span className="font-mono" dir="ltr">
              {data?.consultation.mcs_consultation_id ?? t("common.none")}
            </span>
          </p>
          <p>
            <span className="text-muted-foreground">{t("consultations.hn")}: </span>
            <span className="font-mono" dir="ltr">
              {data?.consultation.hn_snapshot ?? t("common.none")}
            </span>
          </p>
          <p>
            <span className="text-muted-foreground">{t("consultations.lastEvent")}: </span>
            {data?.consultation.mcs_last_event_at
              ? new Date(data.consultation.mcs_last_event_at).toLocaleString()
              : t("common.none")}
          </p>
        </div>

        {!!data?.conflicts.length && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="font-semibold text-destructive">{t("consultations.conflict")}</p>
            {data.conflicts.map((c) => (
              <p key={c.id} className="mt-1 text-xs text-muted-foreground">
                {c.conflict_type} · {c.status} · {new Date(c.created_at).toLocaleString()}
              </p>
            ))}
          </div>
        )}

        <ol className="space-y-3 border-s border-border ps-4">
          {(data?.events ?? []).map((e) => (
            <li key={e.id} className="space-y-1">
              <p className="text-sm font-medium">{e.action.replaceAll("_", " ").toLowerCase()}</p>
              <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</p>
            </li>
          ))}
          {!data?.events.length && <p className="text-sm text-muted-foreground">{t("consultations.noEvents")}</p>}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

function ConsultationsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listConsultations);
  const patientsFn = useServerFn(listPatients);
  const createFn = useServerFn(createConsultation);
  const cancelFn = useServerFn(cancelConsultation);

  const [open, setOpen] = useState(false);
  const [patientId, setPatientId] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["consultations"], queryFn: () => listFn({}) });
  const { data: patients } = useQuery({ queryKey: ["patients"], queryFn: () => patientsFn({}) });

  const mutation = useMutation({
    mutationFn: (input: { partnerId: string; patientId: string }) => createFn({ data: input }),
    onSuccess: () => {
      toast.success(t("consultations.created"));
      setOpen(false);
      setPatientId("");
      queryClient.invalidateQueries({ queryKey: ["consultations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["credit-position"] });
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const cancelMutation = useMutation({
    mutationFn: (input: { consultationId: string; reason: string }) => cancelFn({ data: input }),
    onSuccess: () => {
      toast.success(t("consultations.cancelled"));
      queryClient.invalidateQueries({ queryKey: ["consultations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["credit-position"] });
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const eligible = (patients ?? []).filter((p) => p.partner_id);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t("consultations.title")}
        subtitle={t("consultations.subtitle")}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={!eligible.length}>{t("consultations.new")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("consultations.new")}</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const patient = eligible.find((p) => p.id === patientId);
                  if (!patient?.partner_id) return;
                  mutation.mutate({ partnerId: patient.partner_id, patientId });
                }}
              >
                <div className="space-y-2">
                  <Label>{t("consultations.patient")}</Label>
                  <Select value={patientId} onValueChange={setPatientId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("consultations.patient")} />
                    </SelectTrigger>
                    <SelectContent>
                      {eligible.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.first_name} {p.last_name} · {p.external_patient_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {t("consultations.awaiting")}
                </p>
                <DialogFooter>
                  <Button type="submit" disabled={mutation.isPending || !patientId}>
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
              <TableHead>{t("consultations.id")}</TableHead>
              <TableHead>{t("consultations.patient")}</TableHead>
              <TableHead>{t("consultations.status")}</TableHead>
              <TableHead>{t("consultations.credit")}</TableHead>
              <TableHead>{t("consultations.source")}</TableHead>
              <TableHead>{t("consultations.createdAt")}</TableHead>
              <TableHead className="text-end">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !data?.length && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  {t("common.empty")}
                </TableCell>
              </TableRow>
            )}
            {data?.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs" dir="ltr">
                  {c.consultation_id}
                </TableCell>
                <TableCell className="font-medium">
                  {c.patients ? `${c.patients.first_name} ${c.patients.last_name}` : "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge value={c.status} />
                </TableCell>
                <TableCell>
                  <StatusBadge value={c.credit_status} prefix="credit" />
                </TableCell>
                <TableCell className="text-muted-foreground">{c.source}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(c.created_at).toLocaleString()}
                </TableCell>
                <TableCell className="space-x-1 text-end">
                  {c.room_url && ["WAITING", "STARTED"].includes(c.status) && (
                    <Button asChild variant="ghost" size="sm">
                      <a href={c.room_url} target="_blank" rel="noreferrer">
                        {t("consultations.join")}
                      </a>
                    </Button>
                  )}
                  <NotesDialog consultationId={c.id} label={c.consultation_id} />
                  <TimelineDialog consultationId={c.id} label={c.consultation_id} />
                  {!["COMPLETED", "CANCELLED", "FAILED"].includes(c.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const reason = window.prompt(t("consultations.cancelReason"));
                        if (reason) cancelMutation.mutate({ consultationId: c.id, reason });
                      }}
                    >
                      {t("consultations.cancel")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
