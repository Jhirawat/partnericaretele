// Incident and Escalation Console: pure helpers. An append-only planning and evidence surface
// for a future incident. It never deploys, publishes, sends notifications or calls external
// services, never reads production data, and exposes no kill-switch. A status change counts
// only after a different signed-in reviewer confirms the latest version.
import { z } from "zod";
import { unsafeText } from "./release-evidence";
import { unsafeContent } from "./content-review";
import { redact } from "./seo-crawl";
import { READINESS_NOTICE } from "./verification-campaign";
import { STOP_CONDITIONS } from "./launch-control";

// Ten incident classes; each maps to the exact Launch-Day checklist groups, Owner Action Queue
// items, integration safety category and verification checks it affects. Closed vocabulary only.
export const CLASSES = [
  { key: "data_integrity", label: "Data integrity", launch: ["protection_evidence", "backups"], ownerActions: ["protection_evidence", "backup_evidence"], integration: "storage", checks: ["audit-append-only", "protection-evidence"] },
  { key: "auth_access", label: "Auth and access", launch: ["auth_guards", "access_controls"], ownerActions: ["superadmin_account", "preview_access"], integration: "other_provider", checks: ["redirect-signed-out", "matrix-live"] },
  { key: "payment_credits", label: "Payment and credits", launch: ["credits"], ownerActions: ["superadmin_account"], integration: "payment", checks: ["credit-invariants", "reconciliation"] },
  { key: "privacy_retention", label: "Privacy and retention", launch: ["privacy_retention"], ownerActions: ["second_reviewer"], integration: "storage", checks: ["privacy-retention"] },
  { key: "availability", label: "Availability", launch: ["public_routes", "monitoring"], ownerActions: ["preview_access"], integration: "other_provider", checks: ["seo-public"] },
  { key: "notification_outbox", label: "Notifications and outbox", launch: ["notifications_outbox"], ownerActions: [], integration: "email", checks: ["outbox-disabled"] },
  { key: "sla_breach", label: "SLA controls", launch: ["sla_controls"], ownerActions: [], integration: "other_provider", checks: ["sla-clock"] },
  { key: "integration_safety", label: "Integration safety", launch: ["no_external_calls"], ownerActions: [], integration: "webhooks", checks: ["no-external"] },
  { key: "content_claims", label: "Content and claims", launch: ["content_claims"], ownerActions: ["clinic_facts", "claims_review"], integration: "analytics_tracking", checks: ["content-review"] },
  { key: "rollback_execution", label: "Rollback execution", launch: ["rollback_readiness"], ownerActions: ["superadmin_account", "preview_access"], integration: "storage", checks: ["rollback-drill"] },
] as const;
export type ClassKey = (typeof CLASSES)[number]["key"];
export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const TRIGGERS = ["monitoring_signal", "user_report", "reviewer_concern", "drill_finding", "external_notice", "other"] as const;
export const SCOPES = ["dns_domain_seo", "public_routes", "auth_guards", "content_claims", "access_controls", "protection_evidence", "backups", "privacy_retention", "credits", "notifications_outbox", "sla_controls", "monitoring", "rollback_readiness", "no_external_calls"] as const;
export const ENVIRONMENTS = ["preview", "production_candidate"] as const;
export const STATUSES = ["open", "contained", "rollback_recommended", "resolved", "closed"] as const;
export const STOP_CONDITION_KEYS = ["none", "data_integrity", "auth_regression", "payment_discrepancy", "privacy_breach", "availability_loss", "reviewer_concern"] as const;
export const REQUIRED_ACTIONS = ["Record containment evidence for independent review", "Record independent confirmation of status change", "Resolve reviewer concern", "Recommend rollback per release runbook"] as const;
export const ROLES = ["SUPER_ADMIN", "OPERATIONS_ADMIN"] as const;
export const NO_CONTROL_NOTICE = "This console never deploys, never publishes, never sends notifications, never calls external services and exposes no kill-switch. All incident actions are manual and follow the release runbook." as const;

const role = z.enum(ROLES);
const reviewSchema = z.object({ outcome: z.enum(["confirmed", "concern"]), independent: z.boolean(), mine: z.boolean(), created_at: z.iso.datetime({ offset: true }), correlation_id: z.uuid() }).strict();
const classEnum = z.enum(CLASSES.map((c) => c.key) as [ClassKey, ...ClassKey[]]);
export const itemSchema = z.object({ id: z.uuid(), lineage: z.uuid(), version: z.number().int().positive(), incident_class: classEnum, severity: z.enum(SEVERITIES), trigger_category: z.enum(TRIGGERS), affected_scope: z.enum(SCOPES), environment: z.enum(ENVIRONMENTS), status: z.enum(STATUSES), owner_role: role, reviewer_role: role, evidence_ref: z.string().min(3).max(120), required_action: z.enum(REQUIRED_ACTIONS), stop_condition: z.enum(STOP_CONDITION_KEYS), blocker_reason: z.string().min(3).max(200).nullable(), review_date: z.iso.date().nullable(), correlation_id: z.uuid(), created_at: z.iso.datetime({ offset: true }), mine: z.boolean(), latest: z.boolean(), reviews: z.array(reviewSchema) }).strict();
export const itemsSchema = z.array(itemSchema);
export type Item = z.infer<typeof itemSchema>;
export type IGroup = "passed" | "pending" | "blocked" | "unverified";
// Closed vocabulary plus redacted labels, not free text: raw logs, URLs, emails, phone numbers,
// usernames, secrets, tokens, credentials, patient data, certificate contents, private
// documents and long number runs cannot be persisted.
// Incident metadata must also refuse patient data and medical-record wording beyond the
// shared register guard.
const PHI = /\bpatient\b|\bmedical\s+record|diagnos|prescription|clinical\s+note/i;
export const unsafeIncidentText = (t: string) => unsafeContent(t) || PHI.test(t);
const safeLabel = (max: number) => z.string().trim().min(3).max(max).refine((t) => !unsafeIncidentText(t), "REDACTED_CONTENT_REQUIRED");
export const recordSchema = z.object({ lineage: z.uuid().nullable(), incident_class: classEnum, severity: z.enum(SEVERITIES), trigger: z.enum(TRIGGERS), scope: z.enum(SCOPES), environment: z.enum(ENVIRONMENTS), status: z.enum(STATUSES), owner: role, reviewer: role, ref: safeLabel(120), action: z.enum(REQUIRED_ACTIONS), stop: z.enum(STOP_CONDITION_KEYS), blocker: safeLabel(200).nullable(), date: z.iso.date().nullable() }).strict();
export const confirmInputSchema = z.object({ id: z.uuid(), outcome: z.enum(["confirmed", "concern"]) }).strict();

/** Escalation gate: a high or critical incident with any active stop condition must follow the
 *  rollback gate; everything else stays at containment. Pure mapping, no side effects. */
export function escalationGate(severity: (typeof SEVERITIES)[number], stop: (typeof STOP_CONDITION_KEYS)[number]): "rollback_gate" | "containment" {
  return (severity === "high" || severity === "critical") && stop !== "none" ? "rollback_gate" : "containment";
}

/** Derived state of one incident record; never auto-promotes and never counts a superseded
 *  version. Only resolved/closed counts as passed, and only with an independent confirmation. */
export function itemGroup(e: Item): { group: IGroup; reason: string } {
  if (!e.latest) return { group: "unverified", reason: "Superseded by a newer version" };
  if (e.reviews.some((r) => r.outcome === "concern")) return { group: "blocked", reason: "A reviewer recorded a concern" };
  if (!e.review_date) return { group: "unverified", reason: "Manual gap: review date missing" };
  if (!e.reviews.some((r) => r.outcome === "confirmed" && r.independent)) return { group: "pending", reason: "Awaiting confirmation by a different reviewer" };
  if (e.status === "resolved" || e.status === "closed") return { group: "passed", reason: `Independently confirmed ${e.status}` };
  return { group: "pending", reason: `Status ${e.status}: not resolved or closed; containment evidence confirmed but the incident remains open` };
}

/** Per incident class: passed only when every latest item of that class is resolved/closed and
 *  independently confirmed; a class with no records is unverified, not passed. */
export function classStatus(key: ClassKey, items: Item[] | null, signedIn: boolean): { status: IGroup; reason: string } {
  if (!signedIn || items === null) return { status: "blocked", reason: "Signed-out: incident records are not read; nothing is assumed" };
  const own = items.filter((e) => e.latest && e.incident_class === key).map(itemGroup);
  if (!own.length) return { status: "unverified", reason: "Manual gap: no incident evidence recorded" };
  if (own.some((g) => g.group === "blocked")) return { status: "blocked", reason: "Concern, or an unresolved escalation" };
  if (own.every((g) => g.group === "passed")) return { status: "passed", reason: `${own.length} incident records independently confirmed resolved or closed` };
  return { status: own.some((g) => g.group === "pending") ? "pending" : "unverified", reason: `${own.filter((g) => g.group === "passed").length} of ${own.length} independently confirmed resolved or closed` };
}

/** Whole console: never claims readiness and never exposes a deploy, publish, kill-switch or
 *  notification control. */
export function consoleStatus(items: Item[] | null, signedIn: boolean) {
  const per = CLASSES.map((c) => ({ ...c, ...classStatus(c.key, items, signedIn) }));
  const count = (s: IGroup) => per.filter((c) => c.status === s).length;
  const latest = (items ?? []).filter((e) => e.latest);
  const state = (s: (typeof STATUSES)[number]) => latest.filter((e) => e.status === s).length;
  return { per, total: CLASSES.length, passed: count("passed"), pending: count("pending"), blocked: count("blocked"), unverified: count("unverified"), open: per.filter((c) => c.status !== "passed"), openIncidents: state("open"), contained: state("contained"), rollbackRecommended: state("rollback_recommended"), resolved: state("resolved"), closed: state("closed"), ready: false as const };
}

/** Redacted incident handoff/export. Throws REDACTION_FAILED if any unsafe text survives. */
export function incidentExport(items: Item[] | null, signedIn: boolean, now = new Date()): string {
  const w = consoleStatus(items, signedIn);
  const cell = (x: unknown) => redact(String(x)).replace(/\|/g, "/");
  const line = (c: (typeof w.per)[number]) => "| " + [c.label, c.status, c.reason, c.launch.join(", ") || "none", c.ownerActions.join(", ") || "none", c.integration, c.checks.join(", ") || "none"].map(cell).join(" | ") + " |";
  const rows = (items ?? []).map((e) => "| " + [e.incident_class, e.severity, e.trigger_category, e.affected_scope, e.environment, `v${e.version}`, e.status, e.owner_role, e.reviewer_role, itemGroup(e).reason, e.stop_condition, e.required_action, e.blocker_reason ?? "none"].map(cell).concat([cell(e.evidence_ref), e.review_date ?? "missing", e.created_at, e.correlation_id]).join(" | ") + " |");
  const out = ["# Incident and Escalation Console handoff — iCareTele", `Generated ${now.toISOString()}. ${READINESS_NOTICE}`, "This console never deploys, never publishes, never sends notifications and never calls external services; every incident action is manual.", NO_CONTROL_NOTICE, `Incident classes: passed ${w.passed} · pending ${w.pending} · blocked ${w.blocked} · unverified ${w.unverified} (total ${w.total})`, `Latest recorded states: open ${w.openIncidents} · contained ${w.contained} · rollback-recommended ${w.rollbackRecommended} · resolved ${w.resolved} · closed ${w.closed}`, "", "## Escalation checklist — explicit stop and rollback gates", "Stop the activity and follow the release runbook rollback decision tree if ANY condition is met:", ...STOP_CONDITIONS.map((s) => `- ${s}`), "A high or critical severity incident with any active stop condition goes through the rollback gate; all actions stay manual.", "", "| Incident class | Status | Reason | Launch-day checklist | Owner actions | Integration safety category | Verification checks |", "|---|---|---|---|---|---|---|", ...w.per.map(line), "", "| Class | Severity | Trigger | Affected scope | Environment | Version | Status | Owner role | Reviewer role | Derived state | Stop condition | Required action | Blocker | Evidence label | Review date | Timestamp | Correlation |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|", ...rows].join("\n");
  if (unsafeText(out.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, ""))) throw new Error("REDACTION_FAILED");
  return out;
}

/** Read-only synthetic incident simulator: fictional fixtures only. It demonstrates stop
 *  conditions, containment, rollback recommendation and closure without reading production data
 *  and without any outbound request; it cannot resolve or approve anything real. */
export const SIMULATED_SIM = { simulated: true as const, label: "SIMULATED — fictional incidents on made-up fixtures; nothing is read from production, no outbound request is made and this example cannot resolve or approve anything", steps: [
  { step: "SIMULATED stop condition declared: fictional data-integrity signal on a made-up fixture", outboundCalls: 0 },
  { step: "SIMULATED containment recorded: fictional owner action only, no production data touched", outboundCalls: 0 },
  { step: "SIMULATED rollback gate: fictional high severity plus active stop condition maps to rollback-recommended per the release runbook", outboundCalls: 0 },
  { step: "SIMULATED closure: fictional incident marked closed by a fictional different reviewer", outboundCalls: 0 },
] as const, conclusion: "SIMULATED result: stop condition, containment, rollback recommendation and closure are demonstrated by declaration on fictional fixtures; this example never counts as evidence and cannot resolve or approve anything." };
