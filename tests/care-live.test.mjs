import test from "node:test";
import assert from "node:assert/strict";
import { decideCareEnvironment, isPublishedHost, careEventAllowedOnHost } from "../src/lib/care-env.server.ts";
import { uuid } from "./care-db.mjs";

const full = { CARE_STRIPE_LIVE_ENABLED: "true", STRIPE_LIVE_API_KEY: "x", PAYMENTS_LIVE_WEBHOOK_SECRET: "y" };
test("live gates: switch default OFF, preview always sandbox, keys required", () => {
  // Production fails closed: never sandbox on the published site.
  for (const h of ["icaretele.co", "partnericaretele.lovable.app"]) {
    assert.ok("setupRequired" in decideCareEnvironment(h, {}), h);
    assert.ok("setupRequired" in decideCareEnvironment(h, { STRIPE_LIVE_API_KEY: "x", PAYMENTS_LIVE_WEBHOOK_SECRET: "y" }), h);
  }
  for (const h of ["localhost:8080", "id-preview--abc.lovable.app", "project--abc-dev.lovable.app", "abc.lovableproject.com", undefined])
    assert.deepEqual(decideCareEnvironment(h, full), { environment: "sandbox" }, String(h));
  assert.ok("setupRequired" in decideCareEnvironment("icaretele.co", { CARE_STRIPE_LIVE_ENABLED: "true" }));
  assert.deepEqual(decideCareEnvironment("icaretele.co", full), { environment: "live" });
  assert.ok("setupRequired" in decideCareEnvironment("icaretele.co", { ...full, CARE_STRIPE_LIVE_ENABLED: "1" }));
  assert.equal(careEventAllowedOnHost("sandbox", "icaretele.co"), false);
  assert.equal(careEventAllowedOnHost("sandbox", "project--abc-dev.lovable.app"), true);
  assert.equal(careEventAllowedOnHost("live", "id-preview--abc.lovable.app"), false);
  assert.equal(careEventAllowedOnHost("live", "icaretele.co"), true);
  assert.ok(isPublishedHost("partnericaretele.lovable.app"));
  assert.equal(process.env.CARE_REVIEW_ALLOW_LEGACY_CHECKOUT ?? "", "");
});
