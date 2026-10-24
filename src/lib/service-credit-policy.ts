/** Proposed terms. The database owns the activated, versioned purchase snapshot. */
export const SERVICE_CREDIT_POLICY = Object.freeze({
  version: "care-2026-proposed",
  active: false,
  unitPriceThb: 400,
  minimumTopUp: 25,
  starterQuantity: 50,
  creditsPerService: 1,
  topUps: [25, 50, 100] as const,
  expiryMonths: 24,
  retailMinor: 60000,
  annualMinor: 600000,
  annualAssessments: 12,
  annualMonths: 12,
  currency: "thb" as const,
});
export function quoteServiceCredits(quantity: number) {
  if (!SERVICE_CREDIT_POLICY.topUps.some((q) => q === quantity))
    throw new Error("Select an approved pack");
  return {
    quantity,
    amountThb: quantity * 400,
    amountMinor: quantity * 40000,
    currency: "thb" as const,
    policyVersion: SERVICE_CREDIT_POLICY.version,
  };
}
export function serviceCapacity(available: number) {
  if (!Number.isSafeInteger(available) || available < 0) throw new Error("Invalid balance");
  return { services: available, remainder: 0 };
}
export function formatSatang(value: number, locale = "th-TH") {
  if (!Number.isSafeInteger(value)) throw new Error("Money must be integer satang");
  return new Intl.NumberFormat(locale, { style: "currency", currency: "THB" }).format(value / 100);
}
export function bangkokDate(value: string, locale = "th-TH") {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(
    new Date(value),
  );
}
