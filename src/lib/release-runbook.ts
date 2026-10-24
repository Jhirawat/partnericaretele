import { unsafeText } from "./release-evidence";
import { HARD_BLOCKERS } from "./publish-gate";

/** Release runbook and simulation-only rollback drill. Nothing here touches production data or calls a provider. */
export const PUBLISH_NOTICE = "Publishing is a separate manual owner action. This page cannot publish, roll back, restore or change data.";
export const READINESS_NOTICE = "Production readiness is NOT claimed while any hard blocker is open.";

export type Owner = { role: string; backup: string };
export const RUNBOOK: { id: string; title: string; owner: Owner; steps: string[] }[] = [
  { id: "pre", title: "Pre-release checks", owner: { role: "Global Superadmin", backup: "Operations admin" }, steps: ["Publish gate shows every hard blocker closed by real records", "Release checklist sign-offs effective, sensitive items second-approved", "Backup taken and restore evidence recorded by a person", "Migration ledger and table protection checked on the live database"] },
  { id: "day", title: "Publish-day checks", owner: { role: "Global Superadmin", backup: "Operations admin" }, steps: ["Announce the window and enable the maintenance banner if users are affected", "Owner publishes manually from the Lovable editor", "Record the published version label as evidence"] },
  { id: "post", title: "Post-release smoke checks", owner: { role: "Operations admin", backup: "Global Superadmin" }, steps: ["Public pages open: home, partner application, demo, not-found", "Signed-out visitors are sent to sign-in from private pages", "Run the read-only smoke checks on Release readiness", "Outside delivery, payments and MCS remain off"] },
  { id: "incident", title: "Incident severity and escalation", owner: { role: "Operations admin", backup: "Global Superadmin" }, steps: ["SEV1 privacy, credit or clinical safety risk: banner on, escalate to Superadmin immediately", "SEV2 core workflow broken: escalate within one hour", "SEV3 cosmetic or single page: fix in the next release", "Never paste personal data, keys or links into incident notes"] },
  { id: "banner", title: "Maintenance banner procedure", owner: { role: "Operations admin", backup: "Global Superadmin" }, steps: ["Turn on from Release readiness with a short reason", "Message must contain no emails, links, keys or long numbers", "Turn off after post-release smoke checks pass"] },
  { id: "rollback", title: "Rollback decision tree", owner: { role: "Global Superadmin", backup: "Operations admin" }, steps: ["Data at risk? Banner on, stop writes by role, do not restore over live data without a person", "Frontend only? Owner restores the previous version from version history", "Database change? Ship a new additive fix; never reset, squash or rewrite migrations", "Credits or certificates affected? Use reviewed compensating entries only"] },
  { id: "restore", title: "Restore-verification checklist", owner: { role: "Global Superadmin", backup: "Operations admin" }, steps: ["Restore into a separate environment, never over production", "Compare row counts and ledger totals against the backup label", "Confirm table protection is still on after restore", "Record redacted evidence and the next action"] },
];

/** Synthetic state only: a frozen fake snapshot, never a production record. */
export type SyntheticState = { synthetic: true; version: string; credits: number; certificates: number; auditRows: number; migrations: number; banner: boolean };
export const SYNTHETIC_BASE: Readonly<SyntheticState> = Object.freeze({ synthetic: true, version: "v-current", credits: 10, certificates: 3, auditRows: 42, migrations: 72, banner: false });

export const SCENARIOS = {
  frontend_regression: { label: "Frontend regression after publish", expected: "Previous version restored; data counts unchanged" },
  failed_migration: { label: "Database change fails to apply", expected: "No rollback of history; additive fix required; counts unchanged" },
  credit_anomaly: { label: "Credit balance anomaly", expected: "Banner on; compensating review only; balances unchanged by drill" },
  certificate_exposure: { label: "Suspected certificate exposure", expected: "Banner on; escalate SEV1; certificates untouched" },
  restore_verification: { label: "Restore verification", expected: "Restore to separate copy; counts match backup" },
} as const;
export type Scenario = keyof typeof SCENARIOS;
export const DRILL_STATUSES = ["passed", "failed", "blocked"] as const;
export type DrillStatus = (typeof DRILL_STATUSES)[number];

export function simulateDrill(scenario: Scenario, state: Readonly<SyntheticState> = SYNTHETIC_BASE) {
  if (!state || state.synthetic !== true) throw new Error("SYNTHETIC_ONLY");
  const s: SyntheticState = { ...state };
  if (scenario === "frontend_regression") s.version = "v-previous";
  if (scenario === "credit_anomaly" || scenario === "certificate_exposure") s.banner = true;
  const unchanged = s.credits === state.credits && s.certificates === state.certificates && s.auditRows === state.auditRows && s.migrations === state.migrations;
  const observed = unchanged ? `${SCENARIOS[scenario].label}: protected counts unchanged; version ${s.version}; banner ${s.banner ? "on" : "off"}` : "Protected counts changed";
  return { scenario, expected: SCENARIOS[scenario].expected, observed, status: (unchanged ? "passed" : "failed") as DrillStatus, after: s };
}

export function bannerMessageSafe(m: string) { const t = m.trim(); return t.length >= 3 && t.length <= 200 && !unsafeText(t); }

const RED = [/[\w.+-]+@[\w-]+\.[\w.]+/g, /https?:\/\/\S+|www\.\S+/gi, /-----BEGIN[\s\S]*?-----END[^-]*-----/g, /\b(eyJ[\w-]+\.[\w-]+\.[\w-]+|sk_\w+|sb_\w+)\b/g, /\+?\d[\d ()-]{7,}\d/g, /\d{6,}/g, /\b(?:raw\s+(?:logs?|copy)|usernames?|credentials?|personal\s+data|medical\s+data|certificate\s+contents?|private\s+documents?|password|passwd|secret|token|api[_ -]?key)\b[^|;\r\n]*/gi];
export function redactDrill(t: string) { return RED.reduce((a, r) => a.replace(r, "[redacted]"), t); }

export type DrillRun = { scenario: string; expected: string; observed: string; status: DrillStatus; evidence_ref: string; next_action: string; correlation_id: string; created_at: string; mine: boolean };
export function drillReport(runs: DrillRun[], hardOpen: readonly string[] = HARD_BLOCKERS) {
  const lines = ["# Release runbook drill report", "", PUBLISH_NOTICE, READINESS_NOTICE, `Hard blockers open: ${hardOpen.length}`, "", "| Scenario | Status | Expected | Observed | Evidence | Next action | Time | Correlation |", "|---|---|---|---|---|---|---|---|"];
  for (const r of runs) lines.push(`| ${r.scenario} | ${r.status} | ${r.expected} | ${r.observed} | ${r.evidence_ref} | ${r.next_action} | ${r.created_at} | ${r.correlation_id} |`);
  return redactDrill(lines.join("\n"));
}
