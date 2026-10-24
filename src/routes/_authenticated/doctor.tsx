import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/i18n";
import { readCare } from "@/lib/care.functions";
import {
  listAppointments,
  confirmAppointment,
  cancelAppointment,
  completeAppointment,
  noShowAppointment,
  type AppointmentItem,
} from "@/lib/care-appointments.functions";
import {
  listOrgDoctors,
  listOrgPatients,
  getPatientHistory,
  listConsultationNotes,
  addConsultationNote,
} from "@/lib/care-doctor.functions";
import { openVideoRoom, endVideoRoom } from "@/lib/care-video.functions";
import {
  getClinicalNote,
  startClinicalNote,
  saveClinicalNote,
  finalizeClinicalNote,
} from "@/lib/care-clinical.functions";
import { scheduleFollowup, markFollowupDone, cancelFollowup, listFollowups } from "@/lib/care-followups.functions";
import {
  getAppointmentDocument,
  draftAppointmentDocument,
  saveAppointmentDocument,
  issueAppointmentDocument,
} from "@/lib/care-documents.functions";
import {
  grantCareRelationship,
  revokeCareRelationship,
  listCareRelationships,
} from "@/lib/care-relationships.functions";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/doctor")({staticData:{sitemap:false},
  head: () => ({
    meta: [{name:'robots',content:'noindex, nofollow'},
      { title: "Care team — THAIKANYA PartnerCare" },
      { name: "description", content: "Appointments, patient records, notes and care relationships." },
      { property: "og:title", content: "Care team — THAIKANYA PartnerCare" },
      { property: "og:description", content: "Appointments, patient records, notes and care relationships." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CareTeamPage,
});

function CareTeamPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const readFn = useServerFn(readCare);
  const listFn = useServerFn(listAppointments);
  const confirmFn = useServerFn(confirmAppointment);
  const cancelFn = useServerFn(cancelAppointment);
  const completeFn = useServerFn(completeAppointment);
  const noShowFn = useServerFn(noShowAppointment);
  const doctorsFn = useServerFn(listOrgDoctors);
  const patientsFn = useServerFn(listOrgPatients);
  const historyFn = useServerFn(getPatientHistory);
  const notesFn = useServerFn(listConsultationNotes);
  const addNoteFn = useServerFn(addConsultationNote);
  const grantFn = useServerFn(grantCareRelationship);
  const revokeFn = useServerFn(revokeCareRelationship);
  const relsFn = useServerFn(listCareRelationships);
  const clinicalReadFn = useServerFn(getClinicalNote);
  const clinicalStartFn = useServerFn(startClinicalNote);
  const clinicalSaveFn = useServerFn(saveClinicalNote);
  const clinicalFinalizeFn = useServerFn(finalizeClinicalNote);
  const followupScheduleFn = useServerFn(scheduleFollowup);
  const followupDoneFn = useServerFn(markFollowupDone);
  const followupCancelFn = useServerFn(cancelFollowup);
  const followupsFn = useServerFn(listFollowups);
  const docReadFn = useServerFn(getAppointmentDocument);
  const docDraftFn = useServerFn(draftAppointmentDocument);
  const docSaveFn = useServerFn(saveAppointmentDocument);
  const docIssueFn = useServerFn(issueAppointmentDocument);

  const care = useQuery({
    queryKey: ["care-team-org"],
    queryFn: () => readFn({ data: { org: null, page: 0, query: "", filter: "ALL" } }),
  });
  const orgId = care.data?.organisationId ?? null;

  const appointments = useQuery({
    queryKey: ["care-team-appointments", orgId],
    queryFn: () => listFn({ data: { partnerId: orgId! } }),
    enabled: Boolean(orgId),
  });
  const doctors = useQuery({
    queryKey: ["care-team-doctors", orgId],
    queryFn: () => doctorsFn({ data: { partnerId: orgId! } }),
    enabled: Boolean(orgId),
  });

  const [patientQuery, setPatientQuery] = useState("");
  const patients = useQuery({
    queryKey: ["care-team-patients", orgId, patientQuery],
    queryFn: () => patientsFn({ data: { partnerId: orgId!, query: patientQuery || undefined } }),
    enabled: Boolean(orgId),
  });

  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const history = useQuery({
    queryKey: ["care-team-history", selectedPatient],
    queryFn: () => historyFn({ data: { patientId: selectedPatient! } }),
    enabled: Boolean(selectedPatient),
  });
  const relationships = useQuery({
    queryKey: ["care-team-rels", selectedPatient],
    queryFn: () => relsFn({ data: { patientId: selectedPatient! } }),
    enabled: Boolean(selectedPatient),
  });

  const [selectedConsultation, setSelectedConsultation] = useState<string | null>(null);
  const notes = useQuery({
    queryKey: ["care-team-notes", selectedConsultation],
    queryFn: () => notesFn({ data: { consultationId: selectedConsultation! } }),
    enabled: Boolean(selectedConsultation),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["care-team-appointments"] });
    void queryClient.invalidateQueries({ queryKey: ["care-team-history"] });
    void queryClient.invalidateQueries({ queryKey: ["care-team-rels"] });
    void queryClient.invalidateQueries({ queryKey: ["care-team-notes"] });
  };

  const act = useMutation({
    mutationFn: async (input: { op: "CONFIRM" | "CANCEL" | "COMPLETE" | "NO_SHOW"; id: string; doctorId?: string | undefined }) => {
      const payload = {
        appointmentId: input.id,
        ...(input.doctorId ? { doctorId: input.doctorId } : {}),
        idempotencyKey: crypto.randomUUID(),
      };
      if (input.op === "CONFIRM") return confirmFn({ data: payload });
      if (input.op === "CANCEL") return cancelFn({ data: payload });
      if (input.op === "COMPLETE") return completeFn({ data: payload });
      return noShowFn({ data: payload });
    },
    onSuccess: () => {
      toast.success(t("careTeam.updated"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const video = useMutation({
    mutationFn: async (input: { op: "OPEN" | "END"; id: string }) => {
      const payload = { appointmentId: input.id, idempotencyKey: crypto.randomUUID() };
      if (input.op === "OPEN") return openVideoRoom({ data: payload });
      return endVideoRoom({ data: payload });
    },
    onSuccess: () => {
      toast.success(t("careTeam.updated"));
      refresh();
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("VIDEO_PROVIDER_NOT_CONFIGURED")
          ? t("careTeam.videoNotConfigured")
          : e.message || t("common.error"),
      ),
  });

  const [noteText, setNoteText] = useState("");
  const addNote = useMutation({
    mutationFn: () => addNoteFn({ data: { consultationId: selectedConsultation!, notes: noteText } }),
    onSuccess: () => {
      toast.success(t("careTeam.noteSaved"));
      setNoteText("");
      void queryClient.invalidateQueries({ queryKey: ["care-team-notes", selectedConsultation] });
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const [selectedAppointment, setSelectedAppointment] = useState<string | null>(null);
  const clinicalNote = useQuery({
    queryKey: ["care-team-clinical-note", selectedAppointment],
    queryFn: () => clinicalReadFn({ data: { appointmentId: selectedAppointment! } }),
    enabled: Boolean(selectedAppointment),
  });
  const [noteDraft, setNoteDraft] = useState({ subjective: "", objective: "", assessment: "", plan: "" });
  const [noteLoaded, setNoteLoaded] = useState<string | null>(null);
  const note = clinicalNote.data?.note ?? null;
  if (note && noteLoaded !== note.id) {
    setNoteLoaded(note.id);
    setNoteDraft({
      subjective: note.subjective ?? "",
      objective: note.objective ?? "",
      assessment: note.assessment ?? "",
      plan: note.plan ?? "",
    });
  }
  const clinicalAct = useMutation({
    mutationFn: async (op: "START" | "SAVE" | "FINALIZE") => {
      const payload = {
        appointmentId: selectedAppointment!,
        ...noteDraft,
        idempotencyKey: crypto.randomUUID(),
      };
      if (op === "START") return clinicalStartFn({ data: payload });
      if (op === "SAVE") return clinicalSaveFn({ data: payload });
      return clinicalFinalizeFn({ data: payload });
    },
    onSuccess: (_r, op) => {
      toast.success(op === "FINALIZE" ? t("careTeam.noteFinalized") : t("careTeam.noteSaved"));
      void queryClient.invalidateQueries({ queryKey: ["care-team-clinical-note", selectedAppointment] });
      void queryClient.invalidateQueries({ queryKey: ["care-team-appointments"] });
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("NOTE_INCOMPLETE")
          ? t("careTeam.noteIncomplete")
          : e.message || t("common.error"),
      ),
  });

  const appointmentDoc = useQuery({
    queryKey: ["care-team-document", selectedAppointment],
    queryFn: () => docReadFn({ data: { appointmentId: selectedAppointment! } }),
    enabled: Boolean(selectedAppointment),
  });
  const [docDraft, setDocDraft] = useState({ title: "", body: "" });
  const [docLoaded, setDocLoaded] = useState<string | null>(null);
  const doc = appointmentDoc.data?.document ?? null;
  if (doc && docLoaded !== doc.id) {
    setDocLoaded(doc.id);
    setDocDraft({ title: doc.title, body: doc.body });
  }
  const docAct = useMutation({
    mutationFn: async (op: "DRAFT" | "SAVE" | "ISSUE") => {
      const payload = {
        appointmentId: selectedAppointment!,
        title: docDraft.title,
        body: docDraft.body,
        idempotencyKey: crypto.randomUUID(),
      };
      if (op === "DRAFT") return docDraftFn({ data: payload });
      if (op === "SAVE") return docSaveFn({ data: payload });
      return docIssueFn({ data: payload });
    },
    onSuccess: (_r, op) => {
      toast.success(op === "ISSUE" ? t("careTeam.docIssued") : t("careTeam.docSaved"));
      void queryClient.invalidateQueries({ queryKey: ["care-team-document", selectedAppointment] });
      void queryClient.invalidateQueries({ queryKey: ["care-team-appointments"] });
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("DOCUMENT_INCOMPLETE")
          ? t("careTeam.docIncomplete")
          : e.message.includes("CLINICAL_NOT_COMPLETED")
            ? t("careTeam.docNeedsCompletedNote")
            : e.message || t("common.error"),
      ),
  });

  const followups = useQuery({
    queryKey: ["care-team-followups", selectedPatient],
    queryFn: () => followupsFn({ data: { patientId: selectedPatient! } }),
    enabled: Boolean(selectedPatient),
  });
  const [followupDue, setFollowupDue] = useState("");
  const [followupInstructions, setFollowupInstructions] = useState("");
  const followupAct = useMutation({
    mutationFn: async (input: { op: "SCHEDULE" | "DONE" | "CANCEL"; appointmentId?: string; followupId?: string }) => {
      const payload = {
        ...(input.appointmentId ? { appointmentId: input.appointmentId } : {}),
        ...(input.followupId ? { followupId: input.followupId } : {}),
        ...(input.op === "SCHEDULE"
          ? { dueAt: new Date(followupDue).toISOString(), instructions: followupInstructions }
          : {}),
        idempotencyKey: crypto.randomUUID(),
      };
      if (input.op === "SCHEDULE") return followupScheduleFn({ data: payload });
      if (input.op === "DONE") return followupDoneFn({ data: payload });
      return followupCancelFn({ data: payload });
    },
    onSuccess: () => {
      toast.success(t("careTeam.updated"));
      setFollowupDue("");
      setFollowupInstructions("");
      void queryClient.invalidateQueries({ queryKey: ["care-team-followups"] });
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const [grantDoctor, setGrantDoctor] = useState("");
  const [grantUntil, setGrantUntil] = useState("");
  const grant = useMutation({
    mutationFn: () =>
      grantFn({
        data: {
          patientId: selectedPatient!,
          doctorId: grantDoctor,
          validUntil: grantUntil ? new Date(grantUntil).toISOString() : null,
        },
      }),
    onSuccess: () => {
      toast.success(t("careTeam.relationshipGranted"));
      setGrantDoctor("");
      setGrantUntil("");
      void queryClient.invalidateQueries({ queryKey: ["care-team-rels", selectedPatient] });
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  const [revokeReason, setRevokeReason] = useState("");
  const revoke = useMutation({
    mutationFn: (relationshipId: string) =>
      revokeFn({ data: { relationshipId, reason: revokeReason || "revoked by care team" } }),
    onSuccess: () => {
      toast.success(t("careTeam.relationshipRevoked"));
      setRevokeReason("");
      void queryClient.invalidateQueries({ queryKey: ["care-team-rels", selectedPatient] });
    },
    onError: (e: Error) => toast.error(e.message || t("common.error")),
  });

  if (care.isPending) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  if (!orgId) return <p className="text-sm text-muted-foreground">{t("common.empty")}</p>;

  const doctorName = (id: string | null) =>
    id ? (doctors.data?.doctors.find((d) => d.id === id)?.full_name ?? id.slice(0, 8)) : "—";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader title={t("careTeam.title")} subtitle={t("careTeam.subtitle")} />

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("careTeam.appointments")}</h2>
        {!appointments.data?.appointments.length && (
          <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
        )}
        <div className="space-y-3">
          {(appointments.data?.appointments ?? []).map((a: AppointmentItem) => (
            <div key={a.id} className="surface flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium" dir="ltr">
                  {new Date(a.starts_at).toLocaleString()} – {new Date(a.ends_at).toLocaleTimeString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("careTeam.doctor")}: {doctorName(a.doctor_id)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={a.state} />
                {a.state === "REQUESTED" && (
                  <>
                    <Button
                      size="sm"
                      disabled={act.isPending}
                      onClick={() =>
                        act.mutate({ op: "CONFIRM", id: a.id, doctorId: doctors.data?.doctors[0]?.id })
                      }
                    >
                      {t("careTeam.confirm")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ op: "CANCEL", id: a.id })}
                    >
                      {t("careTeam.cancel")}
                    </Button>
                  </>
                )}
                {a.state === "CONFIRMED" && (
                  <>
                    <Button
                      size="sm"
                      variant={selectedAppointment === a.id ? "default" : "outline"}
                      onClick={() => setSelectedAppointment(selectedAppointment === a.id ? null : a.id)}
                    >
                      {t("careTeam.clinicalNote")}
                    </Button>
                    {["NONE", "FAILED"].includes(a.video_state) && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={video.isPending}
                        onClick={() => video.mutate({ op: "OPEN", id: a.id })}
                      >
                        {t("careTeam.openVideoRoom")}
                      </Button>
                    )}
                    {a.video_state === "READY" && (
                      <>
                        {a.video_room_url && (
                          <Button size="sm" variant="outline" asChild>
                            <a href={a.video_room_url} target="_blank" rel="noreferrer">
                              {t("careTeam.joinVideoRoom")}
                            </a>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={video.isPending}
                          onClick={() => video.mutate({ op: "END", id: a.id })}
                        >
                          {t("careTeam.endVideoRoom")}
                        </Button>
                      </>
                    )}
                    <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ op: "COMPLETE", id: a.id })}>
                      {t("careTeam.complete")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ op: "NO_SHOW", id: a.id })}
                    >
                      {t("careTeam.noShow")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ op: "CANCEL", id: a.id })}
                    >
                      {t("careTeam.cancel")}
                    </Button>
                  </>
                )}
                {a.state === "COMPLETED" && (
                  <Button
                    size="sm"
                    variant={selectedAppointment === a.id ? "default" : "outline"}
                    onClick={() => setSelectedAppointment(selectedAppointment === a.id ? null : a.id)}
                  >
                    {t("careTeam.followups")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {selectedAppointment && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">{t("careTeam.clinicalNote")}</h2>
          {clinicalNote.isPending ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : !note ? (
            <div className="surface p-4">
              <p className="mb-3 text-sm text-muted-foreground">{t("careTeam.noNoteYet")}</p>
              <Button size="sm" disabled={clinicalAct.isPending} onClick={() => clinicalAct.mutate("START")}>
                {t("careTeam.startNote")}
              </Button>
            </div>
          ) : (
            <div className="surface space-y-4 p-4">
              <div className="flex items-center gap-2">
                <StatusBadge value={note.status} />
                {note.finalized_at && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(note.finalized_at).toLocaleString()}
                  </span>
                )}
              </div>
              {(
                [
                  ["subjective", t("careTeam.noteSubjective")],
                  ["objective", t("careTeam.noteObjective")],
                  ["assessment", t("careTeam.noteAssessment")],
                  ["plan", t("careTeam.notePlan")],
                ] as const
              ).map(([field, label]) => (
                <div key={field} className="space-y-2">
                  <Label>{label}</Label>
                  <Textarea
                    rows={2}
                    value={noteDraft[field]}
                    disabled={note.status === "FINAL"}
                    onChange={(e) => setNoteDraft((d) => ({ ...d, [field]: e.target.value }))}
                  />
                </div>
              ))}
              {note.status === "DRAFT" && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={clinicalAct.isPending}
                    onClick={() => clinicalAct.mutate("SAVE")}
                  >
                    {t("careTeam.saveNote")}
                  </Button>
                  <Button size="sm" disabled={clinicalAct.isPending} onClick={() => clinicalAct.mutate("FINALIZE")}>
                    {t("careTeam.finalizeNote")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {selectedAppointment &&
        (appointments.data?.appointments ?? []).find((a) => a.id === selectedAppointment)?.state === "COMPLETED" && (
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold">{t("careTeam.visitSummary")}</h2>
            {appointmentDoc.isPending ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : !doc ? (
              <div className="surface space-y-3 p-4">
                <p className="text-sm text-muted-foreground">{t("careTeam.noDocumentYet")}</p>
                <div className="space-y-2">
                  <Label>{t("careTeam.docTitle")}</Label>
                  <Input value={docDraft.title} onChange={(e) => setDocDraft((d) => ({ ...d, title: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>{t("careTeam.docBody")}</Label>
                  <Textarea rows={4} value={docDraft.body} onChange={(e) => setDocDraft((d) => ({ ...d, body: e.target.value }))} />
                </div>
                <Button size="sm" disabled={docAct.isPending} onClick={() => docAct.mutate("DRAFT")}>
                  {t("careTeam.startDocument")}
                </Button>
              </div>
            ) : (
              <div className="surface space-y-4 p-4">
                <div className="flex items-center gap-2">
                  <StatusBadge value={doc.status} />
                  {doc.issued_at && (
                    <span className="text-xs text-muted-foreground">{new Date(doc.issued_at).toLocaleString()}</span>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>{t("careTeam.docTitle")}</Label>
                  <Input
                    value={docDraft.title}
                    disabled={doc.status === "ISSUED"}
                    onChange={(e) => setDocDraft((d) => ({ ...d, title: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("careTeam.docBody")}</Label>
                  <Textarea
                    rows={5}
                    value={docDraft.body}
                    disabled={doc.status === "ISSUED"}
                    onChange={(e) => setDocDraft((d) => ({ ...d, body: e.target.value }))}
                  />
                </div>
                {doc.status === "DRAFT" && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={docAct.isPending} onClick={() => docAct.mutate("SAVE")}>
                      {t("careTeam.saveDocument")}
                    </Button>
                    <Button size="sm" disabled={docAct.isPending} onClick={() => docAct.mutate("ISSUE")}>
                      {t("careTeam.issueDocument")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

      {selectedAppointment && (appointments.data?.appointments ?? []).find((a) => a.id === selectedAppointment)?.state === "COMPLETED" && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">{t("careTeam.followups")}</h2>
          <div className="surface grid gap-4 p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="followup-due">{t("careTeam.followupDue")}</Label>
              <Input
                id="followup-due"
                type="datetime-local"
                value={followupDue}
                onChange={(e) => setFollowupDue(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="followup-instructions">{t("careTeam.followupInstructions")}</Label>
              <Input
                id="followup-instructions"
                value={followupInstructions}
                onChange={(e) => setFollowupInstructions(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                size="sm"
                disabled={followupAct.isPending || !followupDue || !followupInstructions.trim()}
                onClick={() => followupAct.mutate({ op: "SCHEDULE", appointmentId: selectedAppointment })}
              >
                {t("careTeam.scheduleFollowup")}
              </Button>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("careTeam.patients")}</h2>
        <Input
          value={patientQuery}
          onChange={(e) => setPatientQuery(e.target.value)}
          placeholder={t("careTeam.searchPatients")}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {(patients.data?.patients ?? []).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPatient(p.id)}
              className={`surface p-3 text-start text-sm ${selectedPatient === p.id ? "ring-2 ring-primary" : ""}`}
            >
              <span className="font-medium">
                {p.first_name} {p.last_name}
              </span>
              <span className="ms-2 font-mono text-xs text-muted-foreground" dir="ltr">
                {p.external_patient_id}
              </span>
            </button>
          ))}
        </div>
      </section>

      {selectedPatient ? (
        <>
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold">{t("careTeam.history")}</h2>
            {!history.data?.entries?.length && (
              <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
            )}
            <div className="space-y-2">
              {(history.data?.entries ?? []).map((e) => {
                const entry = e as { id: string; reference?: string; status?: string; created_at?: string };
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setSelectedConsultation(entry.id)}
                    className={`surface flex w-full flex-wrap items-center justify-between gap-2 p-3 text-start ${
                      selectedConsultation === entry.id ? "ring-2 ring-primary" : ""
                    }`}
                  >
                    <span className="font-mono text-xs" dir="ltr">
                      {entry.reference ?? entry.id.slice(0, 8)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {entry.created_at ? new Date(entry.created_at).toLocaleString() : ""}
                    </span>
                    {entry.status && <StatusBadge value={entry.status} />}
                  </button>
                );
              })}
            </div>
          </section>

          {selectedConsultation && (
            <section className="space-y-3">
              <h2 className="font-display text-lg font-semibold">{t("careTeam.notes")}</h2>
              <div className="space-y-2">
                {(notes.data?.notes ?? []).map((n) => (
                  <div key={n.id} className="surface space-y-1 p-3">
                    <p className="whitespace-pre-wrap text-sm">{n.notes}</p>
                    <p className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
              <div className="surface space-y-3 p-4">
                <Textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder={t("careTeam.notePlaceholder")}
                  rows={3}
                />
                <Button
                  size="sm"
                  disabled={addNote.isPending || noteText.trim().length === 0}
                  onClick={() => addNote.mutate()}
                >
                  {t("careTeam.addNote")}
                </Button>
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold">{t("careTeam.followups")}</h2>
            {!followups.data?.followups.length && (
              <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
            )}
            <div className="space-y-2">
              {(followups.data?.followups ?? []).map((f) => (
                <div key={f.id} className="surface flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="text-sm">
                    <span className="font-medium" dir="ltr">{new Date(f.due_at).toLocaleString()}</span>
                    <span className="ms-2 text-muted-foreground">{f.instructions}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge value={f.status} />
                    {f.status === "SCHEDULED" && (
                      <>
                        <Button size="sm" variant="outline" disabled={followupAct.isPending}
                          onClick={() => followupAct.mutate({ op: "DONE", followupId: f.id })}>
                          {t("careTeam.followupDone")}
                        </Button>
                        <Button size="sm" variant="outline" disabled={followupAct.isPending}
                          onClick={() => followupAct.mutate({ op: "CANCEL", followupId: f.id })}>
                          {t("careTeam.cancel")}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold">{t("careTeam.relationships")}</h2>
            <div className="space-y-2">
              {(relationships.data?.relationships ?? []).map((r) => (
                <div key={r.id} className="surface flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="text-sm">
                    <span className="font-medium">{doctorName(r.doctor_id)}</span>
                    <span className="ms-2 text-xs text-muted-foreground">
                      {r.valid_until ? new Date(r.valid_until).toLocaleDateString() : "—"}
                    </span>
                  </div>
                  {r.revoked_at ? (
                    <StatusBadge value="REVOKED" />
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(r.id)}
                    >
                      {t("careTeam.revoke")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="surface grid gap-4 p-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("careTeam.doctor")}</Label>
                <Select value={grantDoctor} onValueChange={setGrantDoctor}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(doctors.data?.doctors ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="grant-until">{t("careTeam.validUntil")}</Label>
                <Input
                  id="grant-until"
                  type="date"
                  value={grantUntil}
                  onChange={(e) => setGrantUntil(e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="revoke-reason">{t("careTeam.revokeReason")}</Label>
                <Input
                  id="revoke-reason"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                />
              </div>
              <div className="sm:col-span-3">
                <Button size="sm" disabled={grant.isPending || !grantDoctor} onClick={() => grant.mutate()}>
                  {t("careTeam.grant")}
                </Button>
              </div>
            </div>
          </section>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("careTeam.selectPatient")}</p>
      )}
    </div>
  );
}
