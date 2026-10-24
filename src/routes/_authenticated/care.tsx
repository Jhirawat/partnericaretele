import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CareWorkspace } from "@/components/CareWorkspace";
import { CareEmbeddedCheckout } from "@/components/CareEmbeddedCheckout";
import {
  readCare,
  mutateCare,
  mutateReward,
  supportCare,
  readReconciliation,
} from "@/lib/care.functions";
export const Route = createFileRoute("/_authenticated/care")({staticData:{sitemap:false},
  head: () => ({ meta: [{name:'robots',content:'noindex, nofollow'},{ title: "Partner workspace — iCareTele" }, { name: "description", content: "Authorized Partner queues, Annual Care and credit lifecycle management." }, { property: "og:title", content: "Partner workspace — iCareTele" }, { property: "og:description", content: "Authorized Partner care operations and coverage." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: CarePage,
});
function CarePage() {
  const read = useServerFn(readCare);
  const mutate = useServerFn(mutateCare);
  const rewards = useServerFn(mutateReward);
  const support = useServerFn(supportCare);
  const report = useServerFn(readReconciliation);
  const cache = useQueryClient();
  const [payId, setPayId] = useState<string | null>(null);
  const [params, setParams] = useState<{
    org: string | null;
    page: number;
    query: string;
    filter: "ALL" | "ACTIVE" | "EXPIRING" | "EXPIRED";
  }>({ org: null, page: 0, query: "", filter: "ALL" });
  const q = useQuery({ queryKey: ["care", params], queryFn: () => read({ data: params }) });
  const update = async (fn: () => Promise<unknown>) => {
    const result = await fn();
    await cache.invalidateQueries({ queryKey: ["care"] });
    return result;
  };
  if (q.isPending) return <p role="status">Loading iCareTele…</p>;
  if (q.error)
    return (
      <div className="surface p-6" role="alert">
        <h1 className="text-xl font-semibold">Workspace requires reviewed migrations</h1>
        <p className="mt-3 text-sm">{q.error.message}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          No balance was changed. Apply the additive migrations to a staging backend first;
          production migration requires review.
        </p>
      </div>
    );
  return (
    <>
    {payId && <CareEmbeddedCheckout paymentId={payId} onClose={() => { setPayId(null); void cache.invalidateQueries({ queryKey: ["care"] }); }} />}
    <CareWorkspace
      view={q.data}
      checkout={setPayId}
      command={(op, args) => update(() => mutate({ data: { op, args, key: crypto.randomUUID() } }))}
      reward={(op, args) =>
        update(() =>
          rewards({
            data: {
              op: op as "EARN" | "RESERVE" | "FULFIL" | "RELEASE" | "REVERSE",
              args,
              key: crypto.randomUUID(),
            },
          }),
        )
      }
      support={(op, args) =>
        update(() =>
          support({
            data: {
              op: op as
                "CONSENT" | "ASSIGN" | "APPROVE_PAYABLE" | "REGISTER_DOCUMENT" | "GRANT_DOCUMENT",
              args,
              key: crypto.randomUUID(),
            },
          }),
        )
      }
      read={(org, page, query, filter) =>
        setParams({ org, page, query, filter: filter as typeof params.filter })
      }
      reconcile={(exportData) =>
        report({ data: { org: q.data.organisationId, export: exportData ?? false } })
      }
    />
    </>
  );
}
