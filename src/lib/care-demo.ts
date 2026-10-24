import type { CareView } from "./care.types";
export const DEMO_ORG = "00000000-0000-4000-8000-000000000001";
export function createCareDemo(): CareView {
  const now = new Date();
  const future = (days: number) => new Date(now.getTime() + days * 86400000).toISOString();
  return {
    organisationId: DEMO_ORG,
    organisations: [{ id: DEMO_ORG, name: "Thaikanya Partner • Demo", model: "LOTS_V1" }],
    isFinance: true,
    isAdmin: true,
    isOwner: true,
    terms: {
      id: "00000000-0000-4000-8000-000000000002",
      version: "DEMO_ONLY",
      active: false,
      settings: {
        packs: { 25: 1000000, 50: 2000000, 100: 4000000 },
        annual_minor: 600000,
        retail_minor: 60000,
        rewards_enabled: false,
        manual_clinical_enabled: false,
      },
    },
    integrations: {
      clinical: "Demo — clinical integration not connected",
      payments: "Manual transfer — no real payments in demo",
      store: "Manual approval and fulfilment — store not connected",
      email: "Disconnected",
      line: "Disconnected",
      whatsapp: "Disconnected",
      sms: "Disconnected",
    },
    position: {
      available: 42,
      reserved: 2,
      used: 6,
      expired: 0,
      expiring: 10,
      monthUsed: 6,
      recent30DaysUsed: 6,
      annualRemaining: 29,
      rewards: 0,
    },
    branches: [
      { id: "00000000-0000-4000-8000-000000000003", name: "Chiang Mai • Demo" },
      { id: "00000000-0000-4000-8000-000000000004", name: "Bangkok • Demo" },
    ],
    staff: [
      { userId: "00000000-0000-4000-8000-000000000009", role: "PARTNER_OWNER", status: "ACTIVE" },
    ],
    patients: [
      ["มะลิ", "ตัวอย่าง", 20, 2],
      ["Arun", "Sample", 85, 3],
      ["Nida", "Example", -5, 2],
    ].map(([first, last, days, used], i) => ({
      id: `00000000-0000-4000-8000-${String(i + 10).padStart(12, "0")}`,
      first_name: String(first),
      last_name: String(last),
      service_reminder_consent: i !== 2,
      marketing_consent: false,
      annual: [
        {
          id: `00000000-0000-4000-8000-${String(i + 20).padStart(12, "0")}`,
          starts_at: future(-100),
          expires_at: future(Number(days)),
          used: Number(used),
          reserved: 0,
          status: "ACTIVE",
          channel: "PARTNER",
          sponsor: DEMO_ORG,
        },
      ],
    })),
    queue: [
      {
        id: "00000000-0000-4000-8000-000000000031",
        consultation_id: "DEMO-031",
        patient_id: "00000000-0000-4000-8000-000000000010",
        status: "CREATED",
        care_kind: "ANNUAL",
        care_location_id: null,
        scheduled_at: future(1),
        assigned_doctor_id: null,
        created_at: now.toISOString(),
      },
    ],
    payments: [],
    redemptions: [],
  };
}
