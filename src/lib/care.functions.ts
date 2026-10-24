import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type { CareView, CarePortal } from "./care.types";

/** Narrow boundary for additive migrations, until Supabase generates updated types. */
type CareRpc = {
  rpc(
    name:
      | "care_read"
      | "care_command"
      | "care_reward_command"
      | "care_support_command"
      | "care_patient_portal"
      | "care_reconciliation"
      | "care_history",
    args?: Record<string, Json>,
  ): PromiseLike<{ data: Json; error: { message: string } | null }>;
};
async function rpc(
  client: unknown,
  name: Parameters<CareRpc["rpc"]>[0],
  args?: Record<string, Json>,
) {
  const { data, error } = await (client as CareRpc).rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
export const readCare = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        org: z.string().uuid().nullable().optional(),
        page: z.number().int().min(0).max(10000).default(0),
        query: z.string().max(100).default(""),
        filter: z.enum(["ALL", "ACTIVE", "EXPIRING", "EXPIRED"]).default("ALL"),
      })
      .parse(i ?? {}),
  )
  .handler(
    async ({ data, context }) =>
      (await rpc(context.supabase, "care_read", {
        _org: data.org ?? null,
        _page: data.page,
        _query: data.query,
        _filter: data.filter,
      })) as unknown as CareView,
  );
const mutation = z.object({
  op: z.string().regex(/^[A-Z_]{3,40}$/),
  args: z.record(z.string().max(60), z.json()),
  key: z.string().min(8).max(200),
});
export const mutateCare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => mutation.parse(i))
  .handler(async ({ data, context }) => {
    if (JSON.stringify(data.args).length > 16000) throw new Error("Request too large");
    return rpc(context.supabase, "care_command", {
      _op: data.op,
      _args: data.args as Json,
      _key: data.key,
    });
  });
export const mutateReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    mutation.extend({ op: z.enum(["EARN", "RESERVE", "FULFIL", "RELEASE", "REVERSE"]) }).parse(i),
  )
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "care_reward_command", {
      _op: data.op,
      _args: data.args as Json,
      _key: data.key,
    }),
  );
export const supportCare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    mutation
      .extend({
        op: z.enum(["CONSENT", "ASSIGN", "APPROVE_PAYABLE", "REGISTER_DOCUMENT", "GRANT_DOCUMENT"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "care_support_command", {
      _op: data.op,
      _args: data.args as Json,
      _key: data.key,
    }),
  );
export const readCarePortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }) =>
      (await rpc(context.supabase, "care_patient_portal")) as unknown as CarePortal,
  );
export const readCareHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        patientId: z.string().uuid(),
        page: z.number().int().min(0).max(10000),
        query: z.string().max(100),
      })
      .parse(i),
  )
  .handler(
    async ({ data, context }) =>
      (await rpc(context.supabase, "care_history", {
        _patient: data.patientId,
        _page: data.page,
        _query: data.query,
      })) as unknown as {
        id: string;
        reference: string;
        status: string;
        scheduled_at: string | null;
        completed_at: string | null;
        created_at: string;
      }[],
  );
export const readReconciliation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ org: z.string().uuid().nullable().optional(), export: z.boolean().optional() })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) =>
    rpc(context.supabase, "care_reconciliation", {
      _org: data.org ?? null,
      _export: data.export ?? false,
    }),
  );
export const careDocumentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), key: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const access = (await rpc(context.supabase, "care_support_command", {
      _op: "DOCUMENT_ACCESS",
      _args: { id: data.id },
      _key: data.key,
    })) as { path: string };
    const { data: link, error } = await context.supabase.storage
      .from("care-documents")
      .createSignedUrl(access.path, 60);
    if (error) throw new Error(error.message);
    return { url: link.signedUrl, expiresIn: 60 };
  });
