// Final public-release QA report. Pure + same-origin only. A check can only be "passed" when an automated
// crawl result in this run proves it; human, signed-in and unmeasured checks never auto-pass.
import { CONTENT_GOVERNANCE, redact, type Finding } from "./seo-crawl";
import { JOURNEY } from "./public-journey";
import { INDEXABLE_PATHS } from "./seo";

export type QaStatus = "passed" | "pending" | "blocked" | "unverified";
export type QaArea = "SEO" | "Accessibility" | "CTA journey" | "Error safety" | "Privacy wording" | "Content governance" | "Signed-in";
export interface QaCheck { id: string; area: QaArea; route: string; status: QaStatus; evidence: string; owner: string; nextAction: string; timestamp: string; correlationId: string }

export const QA_ROUTES = [...INDEXABLE_PATHS, "/__qa-404-probe"] as const;
export const PRIVATE_QA_ROUTES = ["/auth", "/preview", "/release-handoff", "/seo-readiness", "/launch-qa", "/dashboard", "/release-readiness", "/superadmin-console"] as const;

const NO_ACCOUNT = "Blocked: no authorized test account exists";
type Base = Omit<QaCheck, "timestamp" | "correlationId">;

/** Static checks that need a person or a signed-in session. Never passed by code. */
export function manualChecks(): Base[] {
  return [
    ...CONTENT_GOVERNANCE.map((g): Base => ({ id: `gov:${g.key}`, area: g.key === "privacy_wording" ? "Privacy wording" : "Content governance", route: "public", status: "pending", evidence: g.blockedReason, owner: g.owner, nextAction: `Reviewer confirms: ${g.en}` })),
    { id: "a11y:keyboard", area: "Accessibility", route: "public", status: "unverified", evidence: "Automated tab-order sampling only", owner: "Engineering", nextAction: "Reviewer tabs through every public page" },
    { id: "a11y:contrast", area: "Accessibility", route: "public", status: "unverified", evidence: "Design tokens reviewed; no measured contrast scan", owner: "Engineering", nextAction: "Run a contrast check with a reviewer tool" },
    ...JOURNEY.filter((j) => j.blockedReason).map((j): Base => ({ id: `cta:${j.route}:${j.cta.en}`, area: "CTA journey", route: j.route, status: "blocked", evidence: j.blockedReason!, owner: j.owner, nextAction: "Owner supplies approved wording" })),
    ...["dashboard", "partner-onboarding", "release-readiness"].map((r): Base => ({ id: `signed-in:/${r}`, area: "Signed-in", route: `/${r}`, status: "blocked", evidence: NO_ACCOUNT, owner: "Clinic owner", nextAction: "Provide a test account, then re-run signed in" })),
  ];
}

/** Convert crawl findings: a passing automated finding → passed; a failing one stays pending (needs a fix). */
export function fromCrawl(f: Finding[]): Base[] {
  return f.map((x) => ({ id: `crawl:${x.route}:${x.check}`, area: x.check === "mobile viewport" || x.check === "headings" ? "Accessibility" : "SEO", route: x.route, status: x.ok ? "passed" : "pending", evidence: x.evidence, owner: x.owner, nextAction: x.nextAction }));
}

/** 404 probe and error-state safety from fetched HTML. */
export function errorStateChecks(html404: string, status404: number): Base[] {
  const body = html404.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ");
  const leak = /stack|at \w+ \(|postgres|supabase|relation "|[\w.+-]+@[\w-]+\.\w|eyJ[\w-]{10,}|__qa-token/i.test(body);
  return [
    { id: "error:404-copy", area: "Error safety", route: "/__qa-404-probe", status: /Page not found/.test(body) ? "passed" : "pending", evidence: `HTTP ${status404}; safe copy ${/Page not found/.test(body) ? "shown" : "missing"}`, owner: "Engineering", nextAction: "Show the public not-found page" },
    { id: "error:no-leak", area: "Error safety", route: "/__qa-404-probe", status: leak ? "pending" : "passed", evidence: leak ? "Sensitive pattern in page text" : "No stack, database, email or token text", owner: "Engineering", nextAction: "Remove sensitive text from error states" },
    { id: "error:boundary", area: "Error safety", route: "public", status: "unverified", evidence: "Runtime error page not triggered in this run", owner: "Engineering", nextAction: "Reviewer confirms with a forced error in preview" },
  ];
}

export function stamp(checks: Base[], now = new Date()): QaCheck[] {
  const t = now.toISOString(); const run = t.replace(/\D/g, "").slice(0, 14);
  return checks.map((c, i) => ({ ...c, evidence: redact(c.evidence), nextAction: redact(c.nextAction), timestamp: t, correlationId: `qa-${run}-${String(i + 1).padStart(3, "0")}` }));
}
export function group(checks: QaCheck[]) {
  const g: Record<QaStatus, QaCheck[]> = { passed: [], pending: [], blocked: [], unverified: [] };
  for (const c of checks) g[c.status].push(c);
  return { ...g, releaseReady: false as const };
}

export const REVIEWER_TEMPLATE = `# Launch QA reviewer handoff — iCareTele
Readiness is NOT claimed by this document. Fill each line by hand; leave blank if unknown.

| Item | Reviewer role | Result (pass/fail/blocked) | Evidence label (no emails, links or ID numbers) | Date |
|---|---|---|---|---|
| Clinic facts match real documents | Clinic owner | | | |
| Contact details are real and approved | Clinic owner | | | |
| Thai/English wording consistent | Content | | | |
| Price and terms wording (proposed, sales inactive) | Clinic owner | | | |
| No medical outcome, review or certification claims | Content | | | |
| Keyboard focus visible on every public control | Engineering | | | |
| Text and button contrast meets WCAG AA | Engineering | | | |
| Signed-in checks with a test account | Superadmin | | | |
`;
