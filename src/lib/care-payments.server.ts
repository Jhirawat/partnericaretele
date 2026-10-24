import type Stripe from "stripe";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createStripeClient } from "./stripe.server";
import { careEventAllowedOnHost } from "./care-env.server";
/** Called only after Stripe's raw-body signature verifier succeeds. */
export async function applyCareStripeEvent(event: Stripe.Event, env: "sandbox" | "live", host?: string | null): Promise<boolean> {
  // Test-mode events never settle on the public production site, and live events only there.
  if (!careEventAllowedOnHost(env, host)) throw new Error("PAYMENT_RUNTIME_MISMATCH");
  // The signing endpoint's environment must agree with Stripe's livemode flag.
  if (event.livemode !== (env === "live")) throw new Error("PAYMENT_ENVIRONMENT_MISMATCH");
  let object = event.data.object as unknown as Record<string, unknown>;
  if (event.type === "charge.dispute.created") {
    const chargeRef = object["charge"];
    const chargeId =
      typeof chargeRef === "string" ? chargeRef : (chargeRef as { id?: string } | null)?.id;
    if (!chargeId) throw new Error("Verified dispute has no charge reference");
    // Disputes do not inherit checkout metadata. Resolve the actual signed
    // charge through the configured Stripe account; never trust client metadata.
    const charge = await createStripeClient(env).charges.retrieve(
      chargeId,
    );
    object = charge as unknown as Record<string, unknown>;
  }
  const meta = object["metadata"] as Record<string, string> | undefined;
  if (meta?.["kind"] !== "care_payment_v1") return false;
  const paymentId = meta["paymentId"];
  if (!paymentId || !/^[0-9a-f-]{36}$/i.test(paymentId))
    throw new Error("Invalid care payment identity");
  const partnerId = meta["partnerId"] || null;
  if (partnerId && !/^[0-9a-f-]{36}$/i.test(partnerId)) throw new Error("Invalid care organisation");
  if (meta["environment"] && meta["environment"] !== env) throw new Error("PAYMENT_ENVIRONMENT_MISMATCH");
  let type = "PENDING";
  if (
    ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(
      event.type,
    ) &&
    object["payment_status"] === "paid"
  )
    type = "PAID";
  if (event.type === "charge.refunded") type = "REFUNDED";
  if (event.type === "charge.dispute.created") type = "DISPUTED";
  const amount = Number(object["amount_total"] ?? object["amount"]);
  if (!Number.isSafeInteger(amount) || amount < 1)
    throw new Error("Invalid verified payment amount");
  const url = process.env["SUPABASE_URL"],
    key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Care payment webhook backend not configured");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await admin.rpc("care_provider_payment_event_v2" as never, {
    _event_id: event.id,
    _type: type,
    _payment_id: paymentId,
    _reference: String(object["id"]),
    _amount_minor: amount,
    _currency: String(object["currency"]).toUpperCase(),
    _livemode: event.livemode,
    _hash: createHash("sha256").update(JSON.stringify(event)).digest("hex"),
    _partner_id: partnerId,
    _environment: env,
  } as never);
  if (error) throw new Error(error.message);
  return true;
}
