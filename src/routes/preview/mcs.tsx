import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { PreviewShell, MockCard, MockBadge } from "@/components/PreviewShell";
import { Button } from "@/components/ui/button";
import { mockMcsCases, type McsStatus } from "@/lib/console-mock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/preview/mcs")({staticData:{sitemap:false},
  head: () => ({
    meta: [
      { title: "Manual MCS Handoff Queue preview — iCareTele" },
      { name: "description", content: "Synthetic manual MCS handoff queue. Nothing is persisted or uploaded." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: McsQueue,
});

const STATUS_ORDER: McsStatus[] = [
  "ready_to_create",
  "entering_mcs",
  "case_created",
  "links_ready",
  "patient_link_sent",
  "waiting_connection",
  "connected",
  "certificate_pending",
  "certificate_uploaded",
  "closed",
];

function McsQueue() {
  const [selectedId, setSelectedId] = useState(mockMcsCases[0]?.caseId);
  const selected = mockMcsCases.find((c) => c.caseId === selectedId);

  return (
    <PreviewShell title="Manual MCS Handoff Queue" subtitle="Synthetic — nothing is persisted, sent, or uploaded">
      <div className="mb-6 flex flex-wrap gap-1.5">
        {STATUS_ORDER.map((s) => {
          const count = mockMcsCases.filter((c) => c.status === s).length;
          return (
            <span key={s} className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              {s.replaceAll("_", " ")} · {count}
            </span>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <MockCard title="Queue">
          <ul className="space-y-2">
            {mockMcsCases.map((c) => (
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
                    <span className="font-mono text-xs">{c.mcsCaseId}</span>
                    <MockBadge value={c.status} />
                  </span>
                  <span className="mt-1 block font-medium">{c.patientName} · {c.doctorName}</span>
                  <span className="block text-xs text-muted-foreground">{c.partner}</span>
                </button>
              </li>
            ))}
          </ul>
        </MockCard>

        {selected && (
          <div className="space-y-4">
            <MockCard title={`${selected.caseId} — ${selected.mcsCaseId}`}>
              <div className="mb-4 flex flex-wrap gap-1">
                {STATUS_ORDER.map((s) => {
                  const reached = STATUS_ORDER.indexOf(s) <= STATUS_ORDER.indexOf(selected.status);
                  return (
                    <span
                      key={s}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs",
                        reached ? "bg-info/15 font-medium text-info" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {s.replaceAll("_", " ")}
                    </span>
                  );
                })}
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Patient link</dt><dd className="break-all font-mono text-xs">{selected.patientLink}</dd></div>
                <div><dt className="text-muted-foreground">Doctor link</dt><dd className="break-all font-mono text-xs">{selected.doctorLink}</dd></div>
              </dl>
            </MockCard>

            <MockCard title="MCS handoff packet preview">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {selected.packetPreview.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </MockCard>

            <MockCard title="Certificate upload (placeholder)">
              <p className="text-sm text-muted-foreground">
                Certificate upload will be available here in a later phase. This preview does not accept or store files.
              </p>
              <Button className="mt-3" variant="outline" disabled>Upload certificate (disabled in preview)</Button>
            </MockCard>

            <MockCard title="Audit timeline">
              <ul className="space-y-2 text-sm">
                {selected.audit.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span>{a.event.replaceAll("_", " ")}</span>
                    <span className="text-muted-foreground">{a.at}</span>
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
