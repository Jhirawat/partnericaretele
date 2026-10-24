// Synthetic fixtures for the UI-only Master Workflow preview shells.
// No real data, no writes, no database access. Everything here is invented sample content.

export const SYNTHETIC_NOTICE = "Synthetic preview — no real data or writes";

export type MockPartner = {
  id: string;
  name: string;
  branch: string;
  status: "UNDER_REVIEW" | "NEED_MORE_DOCUMENTS" | "APPROVED" | "ACTIVE" | "SUSPENDED";
  licenseExpiry: string;
  missingDocuments: number;
};

export type MockDoctor = {
  id: string;
  name: string;
  status: "PENDING_REVIEW" | "APPROVED" | "ASSIGNED";
  partner: string;
  utilizationPct: number;
};

export type MockConsultation = {
  caseId: string;
  patientName: string;
  patientAge: number;
  partner: string;
  branch: string;
  reason: string;
  chiefComplaint: string;
  durationMinutes: number;
  medicationAllergyNote: string;
  screeningSummary: string;
  consent: boolean;
  appointmentStatus: "CREATED" | "STARTED" | "COMPLETED" | "CANCELLED";
  history: { at: string; event: string }[];
};

export type McsStatus =
  | "ready_to_create"
  | "entering_mcs"
  | "case_created"
  | "links_ready"
  | "patient_link_sent"
  | "waiting_connection"
  | "connected"
  | "certificate_pending"
  | "certificate_uploaded"
  | "closed";

export type MockMcsCase = {
  caseId: string;
  mcsCaseId: string;
  patientName: string;
  doctorName: string;
  partner: string;
  status: McsStatus;
  patientLink: string;
  doctorLink: string;
  packetPreview: string[];
  audit: { at: string; event: string }[];
};

export type MockCustomer = {
  id: string;
  name: string;
  age: number;
  screening: {
    condition1: boolean;
    condition2: boolean;
    condition3: boolean;
    condition4: boolean;
    result: "PASS" | "FAIL" | "PENDING";
  };
  requestStatus: "DRAFT" | "SUBMITTED" | "IN_CONSULTATION" | "CERTIFICATE_PENDING" | "CLOSED";
  certificateStatus: "NONE" | "PENDING" | "UPLOADED";
  patientLink: string | null;
};

export const mockPartners: MockPartner[] = [
  { id: "P-001", name: "Sukhumvit Wellness Clinic", branch: "Bangkok — Sukhumvit", status: "UNDER_REVIEW", licenseExpiry: "2027-02-14", missingDocuments: 0 },
  { id: "P-002", name: "Chiang Mai Health House", branch: "Chiang Mai — Old City", status: "NEED_MORE_DOCUMENTS", licenseExpiry: "2026-11-30", missingDocuments: 2 },
  { id: "P-003", name: "Phuket Care Studio", branch: "Phuket — Patong", status: "ACTIVE", licenseExpiry: "2026-12-05", missingDocuments: 0 },
  { id: "P-004", name: "Khon Kaen Family Clinic", branch: "Khon Kaen — Central", status: "APPROVED", licenseExpiry: "2027-06-01", missingDocuments: 1 },
];

export const mockDoctors: MockDoctor[] = [
  { id: "D-001", name: "Dr. Ananya S.", status: "PENDING_REVIEW", partner: "Sukhumvit Wellness Clinic", utilizationPct: 0 },
  { id: "D-002", name: "Dr. Kittipong W.", status: "ASSIGNED", partner: "Phuket Care Studio", utilizationPct: 72 },
  { id: "D-003", name: "Dr. Malee T.", status: "APPROVED", partner: "Chiang Mai Health House", utilizationPct: 41 },
];

export const mockConsultations: MockConsultation[] = [
  {
    caseId: "CASE-1042",
    patientName: "Niran P.",
    patientAge: 34,
    partner: "Phuket Care Studio",
    branch: "Phuket — Patong",
    reason: "Follow-up assessment",
    chiefComplaint: "Recurring sleep difficulty",
    durationMinutes: 20,
    medicationAllergyNote: "No known drug allergies",
    screeningSummary: "Four-condition screening passed",
    consent: true,
    appointmentStatus: "STARTED",
    history: [
      { at: "2026-10-16 09:00", event: "Case created" },
      { at: "2026-10-16 09:05", event: "Patient link sent" },
      { at: "2026-10-16 09:12", event: "Connected" },
    ],
  },
  {
    caseId: "CASE-1043",
    patientName: "Suda K.",
    patientAge: 51,
    partner: "Phuket Care Studio",
    branch: "Phuket — Patong",
    reason: "Initial assessment",
    chiefComplaint: "Chronic shoulder pain",
    durationMinutes: 30,
    medicationAllergyNote: "Allergic to penicillin",
    screeningSummary: "Four-condition screening passed",
    consent: true,
    appointmentStatus: "CREATED",
    history: [{ at: "2026-10-17 08:30", event: "Case created" }],
  },
  {
    caseId: "CASE-1039",
    patientName: "Arthit M.",
    patientAge: 28,
    partner: "Chiang Mai Health House",
    branch: "Chiang Mai — Old City",
    reason: "Care plan review",
    chiefComplaint: "Stress-related headaches",
    durationMinutes: 15,
    medicationAllergyNote: "None reported",
    screeningSummary: "Four-condition screening passed",
    consent: true,
    appointmentStatus: "COMPLETED",
    history: [
      { at: "2026-10-15 14:00", event: "Case created" },
      { at: "2026-10-15 14:20", event: "Connected" },
      { at: "2026-10-15 14:38", event: "Completed" },
      { at: "2026-10-15 15:00", event: "Certificate uploaded" },
    ],
  },
];

export const mockMcsCases: MockMcsCase[] = [
  {
    caseId: "CASE-1042",
    mcsCaseId: "MCS-88410",
    patientName: "Niran P.",
    doctorName: "Dr. Kittipong W.",
    partner: "Phuket Care Studio",
    status: "connected",
    patientLink: "https://mcs.example.invalid/join/p/SYNTHETIC-P-1042",
    doctorLink: "https://mcs.example.invalid/join/d/SYNTHETIC-D-1042",
    packetPreview: ["Case ID: CASE-1042", "Screening: passed", "Consent: recorded", "Reason: Follow-up assessment"],
    audit: [
      { at: "2026-10-16 09:00", event: "ready_to_create" },
      { at: "2026-10-16 09:02", event: "case_created" },
      { at: "2026-10-16 09:04", event: "links_ready" },
      { at: "2026-10-16 09:05", event: "patient_link_sent" },
      { at: "2026-10-16 09:12", event: "connected" },
    ],
  },
  {
    caseId: "CASE-1043",
    mcsCaseId: "MCS-88411",
    patientName: "Suda K.",
    doctorName: "Dr. Kittipong W.",
    partner: "Phuket Care Studio",
    status: "ready_to_create",
    patientLink: "—",
    doctorLink: "—",
    packetPreview: ["Case ID: CASE-1043", "Screening: passed", "Consent: recorded", "Reason: Initial assessment"],
    audit: [{ at: "2026-10-17 08:30", event: "ready_to_create" }],
  },
  {
    caseId: "CASE-1039",
    mcsCaseId: "MCS-88397",
    patientName: "Arthit M.",
    doctorName: "Dr. Malee T.",
    partner: "Chiang Mai Health House",
    status: "certificate_uploaded",
    patientLink: "https://mcs.example.invalid/join/p/SYNTHETIC-P-1039",
    doctorLink: "https://mcs.example.invalid/join/d/SYNTHETIC-D-1039",
    packetPreview: ["Case ID: CASE-1039", "Screening: passed", "Consent: recorded", "Reason: Care plan review"],
    audit: [
      { at: "2026-10-15 14:00", event: "ready_to_create" },
      { at: "2026-10-15 14:05", event: "case_created" },
      { at: "2026-10-15 14:10", event: "links_ready" },
      { at: "2026-10-15 14:20", event: "connected" },
      { at: "2026-10-15 14:38", event: "certificate_pending" },
      { at: "2026-10-15 15:00", event: "certificate_uploaded" },
    ],
  },
];

export const mockCustomers: MockCustomer[] = [
  {
    id: "C-201",
    name: "Niran P.",
    age: 34,
    screening: { condition1: true, condition2: true, condition3: true, condition4: true, result: "PASS" },
    requestStatus: "IN_CONSULTATION",
    certificateStatus: "NONE",
    patientLink: "https://mcs.example.invalid/join/p/SYNTHETIC-P-1042",
  },
  {
    id: "C-202",
    name: "Suda K.",
    age: 51,
    screening: { condition1: true, condition2: true, condition3: false, condition4: true, result: "FAIL" },
    requestStatus: "DRAFT",
    certificateStatus: "NONE",
    patientLink: null,
  },
  {
    id: "C-203",
    name: "Arthit M.",
    age: 28,
    screening: { condition1: true, condition2: true, condition3: true, condition4: true, result: "PASS" },
    requestStatus: "CLOSED",
    certificateStatus: "UPLOADED",
    patientLink: null,
  },
];

export const mockAdminQueues = {
  partnerReviews: mockPartners.filter((p) => p.status === "UNDER_REVIEW" || p.status === "NEED_MORE_DOCUMENTS"),
  missingDocuments: mockPartners.filter((p) => p.missingDocuments > 0),
  licenseExpiry: mockPartners.filter((p) => p.licenseExpiry <= "2027-01-01"),
  doctorRecruitment: mockDoctors.filter((d) => d.status === "PENDING_REVIEW"),
  mcsHandoff: mockMcsCases.filter((c) => c.status !== "closed"),
  certificatePending: mockMcsCases.filter((c) => c.status === "certificate_pending"),
  creditAnomalies: [
    { id: "CR-1", partner: "Phuket Care Studio", detail: "Reserved balance unchanged for 14 days", severity: "LOW" },
  ],
  overdueSla: [
    { id: "SLA-1", item: "Partner review P-002", ageDays: 6 },
    { id: "SLA-2", item: "Doctor review D-001", ageDays: 3 },
  ],
};

export const mockSuperadmin = {
  organizations: [
    { name: "Sukhumvit Wellness Clinic", partnerStatus: "UNDER_REVIEW", licenseExpiry: "2027-02-14", doctorUtilizationPct: 0, funnel: { requested: 12, screened: 10, consulted: 7, certified: 5 }, mcsBacklog: 2, creditSummary: "Balanced", slaBreaches: 0 },
    { name: "Chiang Mai Health House", partnerStatus: "NEED_MORE_DOCUMENTS", licenseExpiry: "2026-11-30", doctorUtilizationPct: 41, funnel: { requested: 8, screened: 6, consulted: 4, certified: 3 }, mcsBacklog: 1, creditSummary: "1 reconciliation open", slaBreaches: 1 },
    { name: "Phuket Care Studio", partnerStatus: "ACTIVE", licenseExpiry: "2026-12-05", doctorUtilizationPct: 72, funnel: { requested: 21, screened: 19, consulted: 15, certified: 12 }, mcsBacklog: 0, creditSummary: "Balanced", slaBreaches: 0 },
  ],
  systemHealth: [
    { label: "Audit pipeline", status: "OK" },
    { label: "MCS connector", status: "NOT CONNECTED (preview)" },
    { label: "Payment settlement", status: "DISABLED (preview)" },
  ],
};
