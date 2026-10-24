/**
 * MCS Cloud Doctor / Miracle Clinic System adapter.
 *
 * MCS remains the clinical system of record. Nothing in PartnerCare may
 * fabricate an HN, a consultation identifier or a room URL — every clinical
 * identifier must come from MCS.
 *
 * When MCS credentials are absent the adapter runs in MOCK mode so the whole
 * consultation lifecycle can be exercised end to end without inventing
 * production behaviour. Mock identifiers are clearly prefixed.
 */

export type McsMode = "LIVE" | "MOCK";

export interface McsConfig {
  mode: McsMode;
  baseUrl: string | null;
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  replayWindowSeconds: number;
}

export function getMcsConfig(): McsConfig {
  const baseUrl = process.env["MCS_API_BASE_URL"] ?? null;
  const hasApiKey = Boolean(process.env["MCS_API_KEY"]);
  // No verified provider contract was supplied. Credentials alone never enable a live adapter.
  const enabled = false;
  return {
    mode: enabled ? "LIVE" : "MOCK",
    baseUrl,
    hasApiKey,
    hasWebhookSecret: Boolean(process.env["MCS_WEBHOOK_SECRET"]),
    replayWindowSeconds: Number(process.env["MCS_REPLAY_WINDOW_SECONDS"] ?? 300),
  };
}

export interface CreateConsultationRequest {
  partnerCode: string;
  patientExternalId: string;
  patientInfo: { first_name: string; last_name: string; phone?: string | null };
  scheduledAt?: string | null;
  idempotencyKey: string;
}

export interface McsConsultation {
  consultationId: string;
  patientId: string;
  hn: string | null;
  status: "WAITING" | "STARTED" | "COMPLETED" | "CANCELLED" | "FAILED";
  roomUrl: string | null;
  createdAt: string;
  mode: McsMode;
}

export async function createMcsConsultation(
  input: CreateConsultationRequest,
): Promise<McsConsultation> {
  const config = getMcsConfig();

  if (config.mode === "MOCK") {
    // Sandbox behaviour: no clinical identifiers are invented for production use.
    const suffix = input.idempotencyKey.replace(/-/g, "").slice(0, 8).toUpperCase();
    return {
      consultationId: `MOCK-CON-${suffix}`,
      patientId: input.patientExternalId,
      hn: null,
      status: "WAITING",
      roomUrl: null,
      createdAt: new Date().toISOString(),
      mode: "MOCK",
    };
  }

  throw new Error("MCS_CONTRACT_ADAPTER_REQUIRED");
}

export async function getMcsConsultation(
  _mcsConsultationId: string,
): Promise<McsConsultation | null> {
  // Clinical contract, endpoints and event schema must be verified before a live implementation.
  return null;
}

export function buildDeepLink(roomUrl: string | null): string | null {
  // Never fabricate a room link — only MCS may issue one.
  return roomUrl && /^https:\/\//.test(roomUrl) ? roomUrl : null;
}

/** HMAC-SHA256 over `${timestamp}.${rawBody}`, constant-time compared. */
export async function verifyWebhook(params: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (getMcsConfig().mode !== "LIVE")
    return { ok: false, reason: "clinical contract not connected" };
  const secret = process.env["MCS_WEBHOOK_SECRET"];
  if (!secret) return { ok: false, reason: "webhook secret not configured" };
  if (!params.signature || !params.timestamp)
    return { ok: false, reason: "missing signature headers" };

  const window = getMcsConfig().replayWindowSeconds;
  const ts = Number(params.timestamp);
  const tsMs = Number.isFinite(ts) ? (ts > 1e12 ? ts : ts * 1000) : Date.parse(params.timestamp);
  if (!Number.isFinite(tsMs)) return { ok: false, reason: "invalid timestamp" };
  if (Math.abs(Date.now() - tsMs) > window * 1000)
    return { ok: false, reason: "timestamp outside replay window" };

  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expected = createHmac("sha256", secret)
    .update(`${params.timestamp}.${params.rawBody}`)
    .digest("hex");
  const provided = params.signature.replace(/^sha256=/, "");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return { ok: false, reason: "signature mismatch" };
  return { ok: true };
}

export interface NormalisedEvent {
  eventType: string;
  occurredAt: string;
  mcsConsultationId: string;
  patientExternalId: string | null;
  hn: string | null;
  doctorId: string | null;
  status: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancellationReason: string | null;
}

export function normalizeMCSPayload(payload: Record<string, unknown>): NormalisedEvent | null {
  const data = (payload["data"] ?? {}) as Record<string, unknown>;
  const eventType = String(payload["event"] ?? "");
  const mcsConsultationId = String(data["consultation_id"] ?? "");
  if (!eventType || !mcsConsultationId) return null;

  return {
    eventType,
    occurredAt: String(payload["timestamp"] ?? new Date().toISOString()),
    mcsConsultationId,
    patientExternalId: (data["patient_id"] as string | null) ?? null,
    hn: (data["hn"] as string | null) ?? null,
    doctorId: (data["doctor_id"] as string | null) ?? null,
    status: (data["status"] as string | null) ?? null,
    startedAt: (data["started_at"] as string | null) ?? null,
    completedAt: (data["completed_at"] as string | null) ?? null,
    cancellationReason: (data["cancellation_reason"] as string | null) ?? null,
  };
}
