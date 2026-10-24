import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createStripeClient, getStripeErrorMessage } from "./stripe.server";
import { decideCareEnvironment } from "./care-env.server";

type Result =
  | { clientSecret: string; environment: "sandbox" | "live" }
  | { error: string; setupRequired?: boolean };

type Prepared = {
  id: string;
  partner_id: string | null;
  kind: string;
  amount_minor: number;
  currency: string;
  provider_environment: "sandbox" | "live";
};

/**
 * Native embedded Stripe checkout for a server-saved care_payments row.
 * Environment, amount, organisation and ownership are decided on the server
 * only; the browser sends just the payment id and its origin. The return
 * redirect never settles anything — only a signed Stripe event does.
 */
export const createCareCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ id: z.string().uuid(), origin: z.string().url().max(200) }).strip().parse(i),
  )
  .handler(async ({ data, context }): Promise<Result> => {
    const decision = decideCareEnvironment(getRequestHeader("x-forwarded-host") ?? getRequestHeader("host"));
    if ("setupRequired" in decision) return { error: decision.setupRequired, setupRequired: true };
    const environment = decision.environment;
    try {
      const stripe = createStripeClient(environment);
      if (environment === "live") {
        // Native readiness: the live account must be able to take charges.
        const account = await stripe.accounts.retrieve(undefined as never);
        if (!account.charges_enabled)
          return { error: "Stripe live account is not yet approved to take payments.", setupRequired: true };
      }
      const url = process.env["SUPABASE_URL"],
        key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
      if (!url || !key) return { error: "Payment backend not configured", setupRequired: true };
      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient(url, key, { auth: { persistSession: false } });
      const { data: order, error } = await admin.rpc(
        "care_prepare_checkout_server" as never,
        { _id: data.id, _user: context.userId, _environment: environment } as never,
      );
      const o = order as unknown as Prepared | null;
      if (error || !o) {
        const msg = error?.message ?? "CHECKOUT_NOT_AVAILABLE";
        return { error: msg, setupRequired: msg.includes("TERMS_NOT_ACTIVE") };
      }
      if (o.provider_environment !== environment) return { error: "PAYMENT_ENVIRONMENT_MISMATCH" };
      if (o.currency !== "THB" || !Number.isSafeInteger(o.amount_minor) || o.amount_minor < 1)
        return { error: "Invalid integer satang amount" };
      const origin = new URL(data.origin).origin;
      const meta = {
        kind: "care_payment_v1",
        paymentId: o.id,
        partnerId: o.partner_id ?? "",
        environment,
      };
      const name = `iCareTele ${o.kind}`;
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          ui_mode: "embedded_page",
          line_items: [
            { price_data: { currency: "thb", unit_amount: o.amount_minor, product_data: { name } }, quantity: 1 },
          ],
          metadata: meta,
          payment_intent_data: { description: name, metadata: meta },
          return_url: `${origin}/care?payment=awaiting-verification`,
        },
        { idempotencyKey: `care-embedded:${environment}:${o.id}:${o.amount_minor}` },
      );
      const bind = await admin.rpc(
        "care_bind_checkout" as never,
        { _id: o.id, _environment: environment, _checkout_id: session.id } as never,
      );
      if (bind.error) return { error: bind.error.message };
      return { clientSecret: session.client_secret ?? "", environment };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });
