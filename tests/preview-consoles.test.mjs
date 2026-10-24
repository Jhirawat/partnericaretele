import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("preview shells carry the synthetic notice and never call backend functions", () => {
  const routes = ["admin", "superadmin", "doctor", "partner", "mcs"].map((r) =>
    read(`src/routes/preview/${r}.tsx`),
  );
  const shell = read("src/components/PreviewShell.tsx");
  const fixtures = read("src/lib/console-mock.ts");

  assert.match(fixtures, /Synthetic preview — no real data or writes/);
  assert.match(shell, /SYNTHETIC_NOTICE/);

  for (const route of routes) {
    assert.match(route, /PreviewShell/, "route must render inside the synthetic PreviewShell");
    assert.doesNotMatch(route, /createServerFn|useServerFn|supabase|\.functions/, "preview routes must not call backend functions");
    assert.match(route, /noindex/, "preview routes must be noindex");
  }
});

test("MCS queue defines the full handoff status lifecycle", () => {
  const mcs = read("src/routes/preview/mcs.tsx");
  for (const status of [
    "ready_to_create",
    "entering_mcs",
    "case_created",
    "links_ready",
    "patient_link_sent",
    "waiting_connection",
    "connected",
    "certificate_pending",
    "certificate_uploaded",
    "closed",
  ]) {
    assert.ok(mcs.includes(`"${status}"`), `missing status ${status}`);
  }
});

test("partner preview forbids doctor creation and keeps customers non-login", () => {
  const partner = read("src/routes/preview/partner.tsx");
  assert.match(partner, /cannot create or approve Doctors/);
  assert.match(partner, /Non-login customer record/);
  assert.match(partner, /Four-condition screening/);
});

test("doctor preview shows only the minimum consultation fields", () => {
  const doctor = read("src/routes/preview/doctor.tsx");
  for (const field of ["Chief complaint", "Medication / allergy note", "Screening summary", "Consent", "Appointment status"]) {
    assert.ok(doctor.includes(field), `missing field ${field}`);
  }
});

test("superadmin aggregate cards contain no patient health detail", () => {
  const superadmin = read("src/routes/preview/superadmin.tsx");
  assert.doesNotMatch(superadmin, /patientName|chiefComplaint|diagnosis/i);
});
