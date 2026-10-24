import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { PreviewShell, MockCard, MockBadge } from "@/components/PreviewShell";
import { Button } from "@/components/ui/button";
import { mockConsultations } from "@/lib/console-mock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/preview/doctor")({staticData:{sitemap:false},
  head: () => ({
    meta: [
      { title: "Doctor Workspace preview — iCareTele" },
      { name: "description", content: "Synthetic doctor queue and consultation brief. No real data or writes." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DoctorWorkspace,
});

function DoctorWorkspace() {
  const [selectedId, setSelectedId] = useState(mockConsultations[0]?.caseId);
  const selected = mockConsultations.find((c) => c.caseId === selectedId);

  return (
    <PreviewShell title="Doctor Workspace" subtitle="My queue and consultation brief — all data below is synthetic">
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <MockCard title="My Queue">
          <ul className="space-y-2">
            {mockConsultations.map((c) => (
              <li key={c.caseId}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.caseId)}
                  className={cn(
                    "w-full rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                    c.caseId === selectedId && "bg-accent",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">{c.caseId}</span>
                    <MockBadge value={c.appointmentStatus} />
                  </span>
                  <span className="mt-1 block font-medium">{c.patientName}, {c.patientAge}</span>
                  <span className="block text-xs text-muted-foreground">{c.partner} · {c.branch}</span>
                </button>
              </li>
            ))}
          </ul>
        </MockCard>

        {selected && (
          <div className="space-y-4">
            <MockCard title={`Consultation Brief — ${selected.caseId}`}>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Patient</dt><dd className="font-medium">{selected.patientName}, {selected.patientAge}</dd></div>
                <div><dt className="text-muted-foreground">Partner / branch</dt><dd className="font-medium">{selected.partner} · {selected.branch}</dd></div>
                <div><dt className="text-muted-foreground">Reason</dt><dd className="font-medium">{selected.reason}</dd></div>
                <div><dt className="text-muted-foreground">Chief complaint</dt><dd className="font-medium">{selected.chiefComplaint}</dd></div>
                <div><dt className="text-muted-foreground">Duration</dt><dd className="font-medium">{selected.durationMinutes} min</dd></div>
                <div><dt className="text-muted-foreground">Medication / allergy note</dt><dd className="font-medium">{selected.medicationAllergyNote}</dd></div>
                <div><dt className="text-muted-foreground">Screening summary</dt><dd className="font-medium">{selected.screeningSummary}</dd></div>
                <div><dt className="text-muted-foreground">Consent</dt><dd className="font-medium">{selected.consent ? "Recorded" : "Not recorded"}</dd></div>
                <div><dt className="text-muted-foreground">Appointment status</dt><dd><MockBadge value={selected.appointmentStatus} /></dd></div>
              </dl>
            </MockCard>

            <MockCard title="MCS doctor link (placeholder)">
              <p className="text-sm text-muted-foreground">
                The MCS doctor link will appear here once the handoff creates it. Nothing is connected in this preview.
              </p>
              <Button className="mt-3" variant="outline" disabled>
                Join via MCS (disabled in preview)
              </Button>
            </MockCard>

            <MockCard title="Consultation history">
              <ul className="space-y-2 text-sm">
                {selected.history.map((h, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span>{h.event}</span>
                    <span className="text-muted-foreground">{h.at}</span>
                  </li>
                ))}
              </ul>
            </MockCard>
          </div>
        )}
      </div>
    </PreviewShell>
  );
}
