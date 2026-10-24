import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { verifyWebhook } from "../src/lib/stripe.server.ts";
import {
  getMcsConfig,
  createMcsConsultation,
  getMcsConsultation,
} from "../src/lib/mcs/adapter.server.ts";
const secret = "whsec_synthetic_only";
process.env.PAYMENTS_SANDBOX_WEBHOOK_SECRET = secret;
const event = {
  id: "evt_synthetic",
  type: "checkout.session.completed",
  livemode: false,
  data: { object: { id: "cs_synthetic", payment_status: "paid" } },
};
async function request(body = JSON.stringify(event), timestamp = Math.floor(Date.now() / 1000)) {
  const header = await Stripe.webhooks.generateTestHeaderStringAsync({
    payload: body,
    secret,
    timestamp,
  });
  return new Request("https://example.invalid/webhook", {
    method: "POST",
    headers: { "stripe-signature": header },
    body,
  });
}
test("authentic raw-body Stripe signature accepted", async () =>
  assert.equal((await verifyWebhook(await request(), "sandbox")).id, event.id));
test("forged/tampered payload rejected", async () => {
  const req = await request();
  const signature = req.headers.get("stripe-signature");
  await assert.rejects(
    verifyWebhook(
      new Request(req.url, {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: JSON.stringify({ ...event, id: "evt_forged" }),
      }),
      "sandbox",
    ),
    /signature|payload/i,
  );
});
test("old and future timestamps rejected", async () => {
  await assert.rejects(
    verifyWebhook(await request(undefined, Math.floor(Date.now() / 1000) - 600), "sandbox"),
    /replay window/,
  );
  await assert.rejects(
    verifyWebhook(await request(undefined, Math.floor(Date.now() / 1000) + 600), "sandbox"),
    /replay window/,
  );
});
test("invalid timestamp and live/test mismatch rejected", async () => {
  await assert.rejects(
    verifyWebhook(
      new Request("https://example.invalid", {
        method: "POST",
        headers: { "stripe-signature": "t=NaN,v1=bad" },
        body: "{}",
      }),
      "sandbox",
    ),
    /replay window/,
  );
  await assert.rejects(
    verifyWebhook(await request(JSON.stringify({ ...event, livemode: true })), "sandbox"),
    /environment mismatch/,
  );
});
test("MCS remains explicitly synthetic even when arbitrary credentials exist", async () => {
  process.env.MCS_ENABLED = "true";
  process.env.MCS_API_BASE_URL = "https://example.invalid";
  process.env.MCS_API_KEY = "synthetic-only";
  assert.equal(getMcsConfig().mode, "MOCK");
  const c = await createMcsConsultation({
    partnerCode: "TEST",
    patientExternalId: "TEST",
    patientInfo: { first_name: "Synthetic", last_name: "Only" },
    idempotencyKey: "test-only-uuid",
  });
  assert.equal(c.mode, "MOCK");
  assert.equal(c.roomUrl, null);
  assert.match(c.consultationId, /^MOCK/);
  assert.equal(await getMcsConsultation(c.consultationId), null);
});
