/**
 * Structured case summary generation via the Lovable AI Gateway.
 * Server-only: LOVABLE_API_KEY must never reach the browser.
 *
 * Note: PartnerCare is not the clinical system of record. This summary is an
 * operational aid for staff, never a clinical record or clinical decision.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";
export const CASE_SUMMARY_MODEL = "openai/gpt-6-astra";

export type CaseSummary = {
  chiefComplaint: string;
  history: string;
  assessment: string;
  recommendedActions: string[];
  followUp: string;
  riskFlags: string[];
};

const summarySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    chiefComplaint: { type: "string" },
    history: { type: "string" },
    assessment: { type: "string" },
    recommendedActions: { type: "array", items: { type: "string" } },
    followUp: { type: "string" },
    riskFlags: { type: "array", items: { type: "string" } },
  },
  required: ["chiefComplaint", "history", "assessment", "recommendedActions", "followUp", "riskFlags"],
} as const;

const SYSTEM_PROMPT = [
  "You summarise operational consultation notes for telemedicine coordination staff.",
  "Be concise and factual. Never invent clinical findings, diagnoses, medication or identifiers",
  "that are not present in the notes. If a section is not covered by the notes, say 'Not recorded'.",
  "riskFlags lists only explicit escalation or safety concerns present in the notes; otherwise return an empty array.",
].join(" ");

function gatewayError(status: number, body: string): Error {
  if (status === 402) return new Error("AI credits are exhausted for this workspace.");
  if (status === 429) return new Error("AI service is busy. Please try again shortly.");
  if (status === 401 || status === 403) return new Error("AI service access is not available.");
  return new Error(`AI summary failed (${status}): ${body.slice(0, 200)}`);
}

export async function generateCaseSummary(notes: string, runId?: string): Promise<CaseSummary> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
      ...(runId ? { "X-Lovable-AIG-Run-ID": runId } : {}),
    },
    body: JSON.stringify({
      model: CASE_SUMMARY_MODEL,
      instructions: SYSTEM_PROMPT,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: `Consultation notes:\n\n${notes}` }],
        },
      ],
      stream: true,
      reasoning: { effort: "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      text: {
        format: {
          type: "json_schema",
          name: "case_summary",
          strict: true,
          schema: summarySchema,
        },
      },
    }),
  });

  if (!res.ok || !res.body) {
    throw gatewayError(res.status, await res.text().catch(() => ""));
  }

  // Read SSE and accumulate the structured output text.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: { output_text?: string };
        };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          text += event.delta;
        } else if (event.type === "response.completed" && event.response?.output_text) {
          if (!text) text = event.response.output_text;
        }
      } catch {
        // ignore keep-alive / non-JSON frames
      }
    }
  }

  if (!text.trim()) throw new Error("The AI returned an empty summary. Please try again.");

  let parsed: CaseSummary;
  try {
    parsed = JSON.parse(text) as CaseSummary;
  } catch {
    throw new Error("The AI returned an unreadable summary. Please try again.");
  }

  return {
    chiefComplaint: parsed.chiefComplaint ?? "",
    history: parsed.history ?? "",
    assessment: parsed.assessment ?? "",
    recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions : [],
    followUp: parsed.followUp ?? "",
    riskFlags: Array.isArray(parsed.riskFlags) ? parsed.riskFlags : [],
  };
}
