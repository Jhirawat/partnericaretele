import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  getClinicMode,
  getPatientClinical,
  listDoctors,
  recordConsent,
  saveDoctor,
  setClinicMode,
  setDoctorStatus,
  submitIntake,
  updateInternalConsultation,
} from "@/lib/clinic.functions";
import { listConsultations } from "@/lib/partnercare.functions";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/clinic")({staticData:{sitemap:false},
  head: () => ({
    meta: [{name:'robots',content:'noindex, nofollow'},
      { title: "Clinic OS — Thaikanya iCareTele" },
      { name: "description", content: "Internal clinic system: mode, doctors, consent, intake and the consultation queue." },
      { property: "og:title", content: "Clinic OS — Thaikanya iCareTele" },
      { property: "og:description", content: "Run telemedicine consultations fully inside iCareTele." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClinicPage,
});

const MODE_LABEL: Record<string, string> = {
  INTERNAL: "Internal iCareTele Clinic System",
  MCS: "MCS Connected Mode",
  HYBRID: "Hybrid Mode",
};

const ERRORS: Record<string, string> = {
  PATIENT_CONSENT_REQUIRED: "The patient must give consent before the consultation can start.",
  MCS_NOT_CONFIGURED: "MCS is not connected yet. The internal clinic system stays active.",
};
const msg = (e: Error) => ERRORS[e.message] ?? e.message;

function ClinicPage() {
  const qc = useQueryClient();
  const modeFn = useServerFn(getClinicMode);
  const setModeFn = useServerFn(setClinicMode);
  const doctorsFn = useServerFn(listDoctors);
  const statusFn = useServerFn(setDoctorStatus);
  const consultFn = useServerFn(listConsultations);
  const updateFn = useServerFn(updateInternalConsultation);

  const { data: mode } = useQuery({ queryKey: ["clinic-mode"], queryFn: () => modeFn({}) });
  const { data: doctors } = useQuery({ queryKey: ["doctors"], queryFn: () => doctorsFn({}) });
  const { data: consultations } = useQuery({ queryKey: ["consultations"], queryFn: () => consultFn({}) });

  const modeMut = useMutation({
    mutationFn: (m: "INTERNAL" | "MCS" | "HYBRID") => setModeFn({ data: { mode: m } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clinic-mode"] }); toast.success("Clinic mode saved"); },
    onError: (e: Error) => toast.error(msg(e)),
  });
  const docStatus = useMutation({
    mutationFn: (v: { id: string; status: "ACTIVE" | "SUSPENDED" | "PENDING" }) => statusFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
    onError: (e: Error) => toast.error(msg(e)),
  });
  const update = useMutation({
    mutationFn: (v: { consultationId: string; doctorId?: string | null; status?: "WAITING" | "STARTED" | "COMPLETED" | "CANCELLED" | "NO_SHOW"; videoLink?: string }) => updateFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["consultations"] }); toast.success("Consultation updated"); },
    onError: (e: Error) => toast.error(msg(e)),
  });

  const activeDoctors = (doctors ?? []).filter((d) => d.status === "ACTIVE");
  const open = (consultations ?? []).filter((c: any) => !["COMPLETED", "CANCELLED", "FAILED", "NO_SHOW"].includes(c.status));

  return (
    <div className="space-y-8">
      <PageHeader title="Clinic OS" subtitle="Consultations run fully inside iCareTele. MCS is optional." />

      <section className="surface space-y-3 p-5">
        <h2 className="font-display text-lg font-semibold">Clinic system mode</h2>
        <p className="text-sm text-muted-foreground">
          MCS live connection is optional. iCareTele Internal Clinic System is active and can run independently.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={mode?.mode ?? "INTERNAL"} onValueChange={(v) => modeMut.mutate(v as never)}>
            <SelectTrigger className="w-[300px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(MODE_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k} disabled={k !== "INTERNAL" && !mode?.mcsReady}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!mode?.mcsReady && <span className="text-xs text-muted-foreground">MCS and Hybrid unlock once MCS details are added.</span>}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Doctors</h2>
          <DoctorDialog />
        </div>
        <div className="surface overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>License</TableHead><TableHead>Specialty</TableHead>
              <TableHead>Fee</TableHead><TableHead>Sign-in</TableHead><TableHead>Status</TableHead><TableHead />
            </TableRow></TableHeader>
            <TableBody>
              {(doctors ?? []).map((d) => {
                const expired = d.license_expires_on && d.license_expires_on < new Date().toISOString().slice(0, 10);
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.full_name}</TableCell>
                    <TableCell>{d.license_number}{d.license_expires_on && <span className={`block text-xs ${expired ? "text-destructive" : "text-muted-foreground"}`}>{expired ? "Expired " : "Until "}{d.license_expires_on}</span>}</TableCell>
                    <TableCell>{d.specialty ?? "—"}</TableCell>
                    <TableCell>฿{Number(d.consultation_fee).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{d.auth_user_id ? "Linked" : "Not linked"}</TableCell>
                    <TableCell><StatusBadge value={d.status} /></TableCell>
                    <TableCell className="space-x-2 text-right">
                      {d.status !== "ACTIVE" && <Button size="sm" onClick={() => docStatus.mutate({ id: d.id, status: "ACTIVE" })}>Approve</Button>}
                      {d.status === "ACTIVE" && <Button size="sm" variant="outline" onClick={() => docStatus.mutate({ id: d.id, status: "SUSPENDED" })}>Suspend</Button>}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!doctors?.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No doctors yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Consultation queue</h2>
        <div className="surface overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Consultation</TableHead><TableHead>Patient</TableHead><TableHead>Doctor</TableHead>
              <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {open.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.consultation_id}</TableCell>
                  <TableCell>{c.patients?.first_name} {c.patients?.last_name}</TableCell>
                  <TableCell>
                    <Select value={c.assigned_doctor_id ?? ""} onValueChange={(v) => update.mutate({ consultationId: c.id, doctorId: v })}>
                      <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="Assign doctor" /></SelectTrigger>
                      <SelectContent>{activeDoctors.map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><StatusBadge value={c.status} /></TableCell>
                  <TableCell className="space-x-2 whitespace-nowrap text-right">
                    <PatientClinicalDialog patientId={c.patient_id} />
                    <VideoLinkDialog consultationId={c.id} current={c.external_video_link} onSave={(link) => update.mutate({ consultationId: c.id, videoLink: link })} />
                    {c.status !== "STARTED" && <Button size="sm" onClick={() => update.mutate({ consultationId: c.id, status: "STARTED" })}>Start</Button>}
                    {c.status === "STARTED" && <Button size="sm" onClick={() => update.mutate({ consultationId: c.id, status: "COMPLETED" })}>Complete</Button>}
                    <Button size="sm" variant="outline" onClick={() => update.mutate({ consultationId: c.id, status: "NO_SHOW" })}>No show</Button>
                    <Button size="sm" variant="ghost" onClick={() => update.mutate({ consultationId: c.id, status: "CANCELLED" })}>Cancel</Button>
                  </TableCell>
                </TableRow>
              ))}
              {!open.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No open consultations.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function DoctorDialog() {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveDoctor);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ fullName: "", licenseNumber: "", licenseExpiresOn: "", specialty: "", phone: "", email: "", availability: "", consultationFee: "0", signatureUrl: "" });
  const m = useMutation({
    mutationFn: () => saveFn({ data: { ...f, consultationFee: Number(f.consultationFee) } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["doctors"] }); setOpen(false); toast.success("Doctor saved — approve to activate"); },
    onError: (e: Error) => toast.error(msg(e)),
  });
  const field = (k: keyof typeof f, label: string, type = "text") => (
    <div className="space-y-1"><Label>{label}</Label><Input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>Add doctor</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add doctor</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {field("fullName", "Doctor name")}
          {field("licenseNumber", "License number")}
          {field("licenseExpiresOn", "License expiry", "date")}
          {field("specialty", "Specialty")}
          {field("phone", "Phone")}
          {field("email", "Sign-in email", "email")}
          {field("consultationFee", "Consultation fee (THB)", "number")}
          {field("availability", "Availability")}
          <div className="sm:col-span-2">{field("signatureUrl", "Signature image link")}</div>
        </div>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>Save</Button>
      </DialogContent>
    </Dialog>
  );
}

function VideoLinkDialog({ current, onSave }: { consultationId: string; current: string | null; onSave: (l: string) => void }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState(current ?? "");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">{current ? "Video ✓" : "Video link"}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Video link (Google Meet, Zoom, LINE, other)</DialogTitle></DialogHeader>
        <Input placeholder="https://meet.google.com/..." value={link} onChange={(e) => setLink(e.target.value)} />
        {current && <a className="text-sm text-primary underline" href={current} target="_blank" rel="noreferrer">Open current link</a>}
        <Button onClick={() => { onSave(link); setOpen(false); }}>Save</Button>
      </DialogContent>
    </Dialog>
  );
}

function PatientClinicalDialog({ patientId }: { patientId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const getFn = useServerFn(getPatientClinical);
  const consentFn = useServerFn(recordConsent);
  const intakeFn = useServerFn(submitIntake);
  const { data } = useQuery({ queryKey: ["patient-clinical", patientId], queryFn: () => getFn({ data: { patientId } }), enabled: open });
  const [f, setF] = useState({ chiefComplaint: "", medicalHistory: "", currentMedications: "", allergies: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["patient-clinical", patientId] });
  const consent = useMutation({ mutationFn: () => consentFn({ data: { patientId } }), onSuccess: () => { refresh(); toast.success("Consent recorded"); }, onError: (e: Error) => toast.error(msg(e)) });
  const intake = useMutation({ mutationFn: () => intakeFn({ data: { patientId, ...f } }), onSuccess: () => { refresh(); toast.success("Intake saved"); }, onError: (e: Error) => toast.error(msg(e)) });
  const hasConsent = data?.consents.some((c) => c.accepted);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">Consent & intake</Button></DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Consent & intake</DialogTitle></DialogHeader>
        <div className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
          <span>{hasConsent ? "Telemedicine consent on file" : "No consent yet — consultation cannot start"}</span>
          {!hasConsent && <Button size="sm" onClick={() => consent.mutate()}>Record consent</Button>}
        </div>
        {data?.intakes[0] && (
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium">Latest intake</p>
            <p>{data.intakes[0].chief_complaint}</p>
            {data.intakes[0].allergies && <p className="text-muted-foreground">Allergies: {data.intakes[0].allergies}</p>}
          </div>
        )}
        <div className="space-y-2">
          <Label>Main concern</Label><Textarea value={f.chiefComplaint} onChange={(e) => setF({ ...f, chiefComplaint: e.target.value })} />
          <Label>Medical history</Label><Textarea value={f.medicalHistory} onChange={(e) => setF({ ...f, medicalHistory: e.target.value })} />
          <Label>Current medications</Label><Input value={f.currentMedications} onChange={(e) => setF({ ...f, currentMedications: e.target.value })} />
          <Label>Allergies</Label><Input value={f.allergies} onChange={(e) => setF({ ...f, allergies: e.target.value })} />
          <Button onClick={() => intake.mutate()} disabled={intake.isPending}>Save intake</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
