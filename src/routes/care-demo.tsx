import {pageHead} from "@/lib/seo";
import { Breadcrumbs, RelatedLinks } from "@/components/PublicContent";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CareWorkspace } from "@/components/CareWorkspace";
import { BrandIdentity } from "@/components/BrandIdentity";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { createCareDemo } from "@/lib/care-demo";
import { useCopy } from "@/i18n";
import type { Json } from "@/integrations/supabase/types";
export const Route = createFileRoute("/care-demo")({
  staticData: { sitemap: true },
  head: () => pageHead({ path: "/care-demo", index: true, thTitle: "เดโมจำลองแบบโต้ตอบ", title: "Interactive synthetic demo", thDescription: "ทดลองคิวงานและขั้นตอนการดูแลด้วยข้อมูลจำลอง ไม่มีการชำระเงินหรือบริการทางคลินิกจริง", description: "Explore synthetic queues and care workflows without real payments or clinical services.", breadcrumb: [{ name: "iCareTele", path: "/" }, { name: "Demo", path: "/care-demo" }] }),
  component: Demo,
});
function Demo() {
  const { tr } = useCopy();
  const [v, setV] = useState(createCareDemo);
  const [params, setParams] = useState({ query: "", filter: "ALL" });
  const demoAction = async (op: string, args: Record<string, Json>) => {
    if (["ACTIVATE_TERMS", "SAVE_TERMS", "VERIFY_PAYMENT", "REFUND"].includes(op))
      throw new Error(tr("Review demo: financial activation and real settlement are disabled."));
    if (op === "INTAKE")
      setV((s) => ({
        ...s,
        queue: [
          {
            id: crypto.randomUUID(),
            consultation_id: `DEMO-${s.queue.length + 32}`,
            patient_id: String(args["patientId"]),
            status: "CREATED",
            care_kind: String(args["kind"]),
            care_location_id: args["locationId"] as string | null,
            scheduled_at: null,
            assigned_doctor_id: null,
            created_at: new Date().toISOString(),
          },
          ...s.queue,
        ],
      }));
    if (op === "CANCEL")
      setV((s) => ({
        ...s,
        queue: s.queue.map((q) => (q.id === args["id"] ? { ...q, status: "CANCELLED" } : q)),
      }));
    return { demo: true, operation: op, persisted: false };
  };
  const filtered = {
    ...v,
    patients: v.patients.filter(
      (p) =>
        (p.first_name + " " + p.last_name).toLowerCase().includes(params.query.toLowerCase()) &&
        (params.filter === "ALL" ||
          p.annual?.some((a) => {
            const days = (Date.parse(a.expires_at) - Date.now()) / 86400000;
            return params.filter === "EXPIRING"
              ? days > 0 && days <= 30
              : params.filter === "EXPIRED"
                ? days <= 0
                : days > 0;
          })),
    ),
  };
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-6">
        <Link to="/">
          <BrandIdentity />
        </Link>
        <div className="flex gap-3">
          <LanguageSwitcher className="w-28" />
          <Button
            variant="outline"
            onClick={() => {
              setV(createCareDemo());
              setParams({ query: "", filter: "ALL" });
            }}
          >
            {tr("Reset demo")}
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 pb-12">
        <Breadcrumbs path="/care-demo" />
        <CareWorkspace
          demo
          view={filtered}
          command={demoAction}
          reward={demoAction}
          support={demoAction}
          read={(_org, _page, query, filter) => setParams({ query, filter })}
          reconcile={async () => ({
            demo: true,
            cashReceivedMinor: 0,
            partnerCollectedMinor: 0,
            delivered: 6,
            estimatedClinicianCostMinor: 180000,
            approvedClinicianPayableMinor: 0,
            accounting: "Illustrative only; no production transactions",
          })}
        />
        <RelatedLinks path="/care-demo" />
      </main>
    </div>
  );
}
