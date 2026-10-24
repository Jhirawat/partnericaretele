import type { Json } from "@/integrations/supabase/types";
export type Annual = {
  id: string;
  starts_at: string;
  expires_at: string;
  used: number;
  reserved: number;
  status: string;
  channel: string;
  sponsor: string | null;
};
export type CarePatient = {
  id: string;
  first_name: string;
  last_name: string;
  service_reminder_consent: boolean;
  marketing_consent: boolean;
  annual: Annual[] | null;
};
export type CareQueue = {
  id: string;
  consultation_id: string;
  patient_id: string;
  status: string;
  care_kind: string;
  care_location_id: string | null;
  scheduled_at: string | null;
  assigned_doctor_id: string | null;
  created_at: string;
};
export type CarePayment = {
  id: string;
  kind: string;
  channel: string;
  collector: string;
  provider: string;
  amount_minor: number;
  credits: number | null;
  status: string;
  external_reference: string | null;
  created_at: string;
};
export interface CareView {
  organisations: { id: string; name: string; model: string }[];
  organisationId: string | null;
  isFinance: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  terms: { id: string; version: string; active: boolean; settings: Record<string, Json> } | null;
  integrations: Record<string, string>;
  position: {
    available: number;
    reserved: number;
    used: number;
    expired: number;
    expiring: number;
    monthUsed: number;
    recent30DaysUsed: number;
    annualRemaining: number;
    rewards: number | null;
  };
  branches: { id: string; name: string }[];
  staff: { userId: string; role: string; status: string }[];
  patients: CarePatient[];
  queue: CareQueue[];
  payments: CarePayment[];
  redemptions: {
    id: string;
    points: number;
    product_code: string;
    state: string;
    created_at: string;
  }[];
}
export interface CarePortal {
  patients: {
    id: string;
    partnerId: string | null;
    name: string;
    serviceConsent: boolean;
    marketingConsent: boolean;
  }[];
  packages: {
    id: string;
    patientId: string;
    startsAt: string;
    expiresAt: string;
    used: number;
    reserved: number;
    remaining: number;
    status: string;
    channel: string;
    medicinesIncluded: false;
    autoRenew: false;
  }[];
  encounters: {
    id: string;
    reference: string;
    status: string;
    scheduledAt: string | null;
    completedAt: string | null;
  }[];
  documents: { id: string; date: string; kind: string }[];
  reminders: { dueAt: string; purpose: string; status: string }[];
}
