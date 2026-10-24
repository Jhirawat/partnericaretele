import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { PreviewShell, MockCard, MockBadge } from "@/components/PreviewShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { mockCustomers, type MockCustomer } from "@/lib/console-mock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/preview/partner")({staticData:{sitemap:false},
  head: () => ({
    meta: [
      { title: "Partner Workspace preview — iCareTele" },
      { name: "description", content: "Synthetic partner customers, screening, and consultation requests. No real data or writes." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PartnerWorkspace,
});

const CONDITIONS = [
  { key: "condition1" as const, label: "Condition 1 — identity and consent confirmed" },
  { key: "condition2" as const, label: "Condition 2 — screening questionnaire completed" },
  { key: "condition3" as const, label: "Condition 3 — no exclusion criteria reported" },
  { key: "condition4" as const, label: "Condition 4 — partner staff verification done" },
];

function PartnerWorkspace() {
  const [selectedId, setSelectedId] = useState(mockCustomers[0]?.id);
  const [screening, setScreening] = useState({ condition1: false, condition2: false, condition3: false, condition4: false });
  const [screeningResult, setScreeningResult] = useState<"PASS" | "FAIL" | null>(null);
  const selected = mockCustomers.find((c) => c.id === selectedId);

  function runScreening() {
    const pass = Object.values(screening).every(Boolean);
    setScreeningResult(pass ? "PASS" : "FAIL");
  }

  return (
    <PreviewShell title="Partner Workspace" subtitle="Customers and consultation requests — synthetic; customers are non-login records">
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <MockCard title="Customers">
          <ul className="space-y-2">
            {mockCustomers.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => { setSelectedId(c.id); setScreeningResult(null); }}
                  className={cn(
                    "w-full rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                    c.id === selectedId && "bg-accent",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.name}, {c.age}</span>
                    <MockBadge value={c.requestStatus} />
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">Screening: {c.screening.result}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Partners cannot create or approve Doctors — that stays with scoped admins.
          </p>
        </MockCard>

        {selected && (
          <div className="space-y-4">
            <CustomerDetail customer={selected} />

            <MockCard title="Four-condition screening">
              <div className="space-y-3">
                {CONDITIONS.map((c) => (
                  <div key={c.key} className="flex items-center gap-3">
                    <Checkbox
                      id={c.key}
                      checked={screening[c.key]}
                      onCheckedChange={(v) => setScreening((s) => ({ ...s, [c.key]: v === true }))}
                    />
                    <Label htmlFor={c.key} className="text-sm font-normal">{c.label}</Label>
                  </div>
                ))}
                <div className="flex items-center gap-3 pt-2">
                  <Button variant="outline" onClick={runScreening}>Evaluate screening (mock)</Button>
                  {screeningResult && (
                    <span className={cn("text-sm font-semibold", screeningResult === "PASS" ? "text-success" : "text-destructive")}>
                      Result: {screeningResult}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Evaluation is local to this preview and is not saved anywhere.</p>
              </div>
            </MockCard>

            <MockCard title="Consultation request preview">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Customer</dt><dd className="font-medium">{selected.name}, {selected.age}</dd></div>
                <div><dt className="text-muted-foreground">Screening</dt><dd className="font-medium">{selected.screening.result}</dd></div>
                <div><dt className="text-muted-foreground">Request status</dt><dd><MockBadge value={selected.requestStatus} /></dd></div>
                <div><dt className="text-muted-foreground">Certificate status</dt><dd><MockBadge value={selected.certificateStatus} /></dd></div>
              </dl>
              <Button className="mt-3" variant="outline" disabled>Submit request (disabled in preview)</Button>
            </MockCard>

            <MockCard title="Patient-link delivery">
              {selected.patientLink ? (
                <p className="break-all font-mono text-xs">{selected.patientLink}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No patient link yet — it appears after the MCS handoff creates one.</p>
              )}
              <Button className="mt-3" variant="outline" disabled>Send link (disabled in preview)</Button>
            </MockCard>
          </div>
        )}
      </div>
    </PreviewShell>
  );
}

function CustomerDetail({ customer }: { customer: MockCustomer }) {
  return (
    <MockCard title={`Customer detail — ${customer.id}`}>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Name</dt><dd className="font-medium">{customer.name}</dd></div>
        <div><dt className="text-muted-foreground">Age</dt><dd className="font-medium">{customer.age}</dd></div>
        <div><dt className="text-muted-foreground">Account type</dt><dd className="font-medium">Non-login customer record</dd></div>
        <div><dt className="text-muted-foreground">Screening result</dt><dd className="font-medium">{customer.screening.result}</dd></div>
      </dl>
    </MockCard>
  );
}
