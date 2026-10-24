const destinations = ["/dashboard", "/care", "/care-patient", "/portal", "/doctor", "/partners", "/locations", "/partner-onboarding", "/partner-review", "/partner-workspace"] as const;
export function safeAuthDestination(value: unknown): (typeof destinations)[number] | undefined {
  return destinations.find(path => path === value);
}