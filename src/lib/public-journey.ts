// Redacted visitor-journey checklist. Static design records only: no visitor identity, events or behaviour data.
export type JourneySeverity = "critical" | "high" | "medium";
export interface JourneyStep { route: "/" | "/partner-apply" | "/care-demo"; cta: { th: string; en: string }; target: string; expected: string; owner: "Engineering" | "Content" | "Clinic owner"; severity: JourneySeverity; blockedReason?: string }
export const JOURNEY: JourneyStep[] = [
  { route: "/", cta: { th: "ทดลองเดโม", en: "Try the demo" }, target: "/care-demo", expected: "Synthetic demo opens; no account, payment or clinical service", owner: "Engineering", severity: "high" },
  { route: "/", cta: { th: "สมัครเป็นพาร์ทเนอร์", en: "Apply as partner" }, target: "/partner-apply", expected: "Application overview with license requirement", owner: "Content", severity: "critical" },
  { route: "/", cta: { th: "เข้าสู่ระบบ", en: "Sign in" }, target: "/auth", expected: "Sign-in page; private pages only after sign-in", owner: "Engineering", severity: "high" },
  { route: "/partner-apply", cta: { th: "สร้างบัญชี", en: "Create account" }, target: "/auth?next=/partner-onboarding&signup=true", expected: "Sign-up, then onboarding draft; approval only by scoped admin review", owner: "Engineering", severity: "critical" },
  { route: "/partner-apply", cta: { th: "เข้าสู่ระบบ", en: "Sign in" }, target: "/auth?next=/partner-onboarding", expected: "Sign-in, then existing onboarding draft", owner: "Engineering", severity: "high" },
  { route: "/care-demo", cta: { th: "สมัครเป็นพาร์ทเนอร์องค์กร", en: "Apply as a partner organization" }, target: "/partner-apply", expected: "Application overview", owner: "Content", severity: "medium" },
  { route: "/", cta: { th: "ราคา", en: "Pricing" }, target: "/", expected: "Prices shown only as proposed; sales inactive until owner approval", owner: "Clinic owner", severity: "high", blockedReason: "No approved launch prices or terms" },
];
/** Public pages a signed-out visitor may land on; everything else must redirect to /auth or be noindex. */
export const PUBLIC_ROUTES_ALLOWED = ["/", "/partner-apply", "/care-demo", "/auth", "/release-handoff", "/seo-readiness", "/launch-qa", "/publish-gate"] as const;
