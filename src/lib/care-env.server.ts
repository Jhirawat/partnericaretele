export type CareEnvDecision =
  | { environment: "sandbox" | "live" }
  | { setupRequired: string };

const PREVIEW_HOST = /(^|\.)localhost(:\d+)?$|^127\.|id-preview--|-dev\.lovable\.app$|\.lovableproject\.com$/i;

/** Preview hosts are never treated as the published runtime. */
export function isPublishedHost(host: string | null | undefined): boolean {
  return !!host && !PREVIEW_HOST.test(host.split(":")[0] === "localhost" ? "localhost" : host);
}

/**
 * Trusted environment selection. Live requires: published host, the live
 * switch (default OFF), live gateway key and live webhook secret. The caller
 * then also verifies native Stripe readiness and active terms.
 */
export function decideCareEnvironment(
  host: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): CareEnvDecision {
  // Preview/test runtime: always sandbox, never live.
  if (!isPublishedHost(host)) return { environment: "sandbox" };
  // Published runtime fails closed: never falls back to sandbox.
  if (env["CARE_STRIPE_LIVE_ENABLED"] !== "true")
    return { setupRequired: "Live payments are not switched on for this site yet." };
  if (!env["STRIPE_LIVE_API_KEY"] || !env["PAYMENTS_LIVE_WEBHOOK_SECRET"])
    return { setupRequired: "Live payments need Stripe go-live to finish (live keys are not connected yet)." };
  return { environment: "live" };
}

/** Signed events are only accepted on the runtime that matches their mode. */
export function careEventAllowedOnHost(env: "sandbox" | "live", host: string | null | undefined): boolean {
  return env === "live" ? isPublishedHost(host) : !isPublishedHost(host);
}
