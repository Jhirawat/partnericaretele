import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb } from "./care-db.mjs";

// Phase 03: policy/role matrix verification against the applied schema.
// PGlite runs as superuser (RLS bypassed at row level), so this verifies the
// actual policy definitions and function grants that enforce the matrix;
// the same catalog was confirmed on the live Cloud database.

const MATRIX = [
  // [table, cmd, policy substring expected in qual/with_check, description]
  ["consultation_notes", "SELECT", "care_clinical_access", "clinical notes read only via audited clinical-access helper"],
  ["consultation_notes", "INSERT", "care_clinical_access", "clinical notes write via clinical-access helper"],
  ["consultations", "SELECT", "care_encounter_scope", "encounters read via encounter-scope helper"],
  ["care_payments", "SELECT", "care_finance_scope", "payments read via finance-scope helper"],
  ["care_documents", "SELECT", "care_document_access", "documents read via document-access helper"],
  ["patients", "SELECT", "auth_user_id = auth.uid()", "patient records readable by the linked patient, partner tenant or platform staff"],
  ["user_roles", "INSERT", "can_write_platform", "role assignment platform-admin only"],
  ["user_roles", "DELETE", "SUPER_ADMIN", "role removal super-admin only"],
  ["profiles", "UPDATE", "id = auth.uid()", "profile self-update only"],
];

test("policy matrix: every sensitive table enforces its scoped helper", async () => {
  const db = await createTestDb();
  const policies = (
    await db.query(
      "SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname='public'",
    )
  ).rows;
  for (const [table, cmd, needle, description] of MATRIX) {
    const matches = policies.filter(
      (p) =>
        p.tablename === table &&
        (p.cmd === cmd || p.cmd === "ALL") &&
        ((p.qual ?? "").includes(needle) || (p.with_check ?? "").includes(needle)),
    );
    assert.ok(matches.length > 0, `${table} ${cmd}: ${description} — no matching policy`);
  }
  await db.close();
});

test("every public table has RLS enabled", async () => {
  const db = await createTestDb();
  const rows = (
    await db.query(
      `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind='r' AND c.relname NOT LIKE 'drizzle%'`,
    )
  ).rows;
  const insecure = rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
  assert.deepEqual(insecure, [], `tables without RLS: ${insecure.join(", ")}`);
  await db.close();
});

test("privileged settlement/ledger RPCs are not executable by authenticated or anon", async () => {
  const db = await createTestDb();
  const privileged = [
    "care_settle",
    "care_post",
    "care_prepare_checkout_server",
    "care_bind_checkout",
    "care_provider_payment_event",
    "care_provider_payment_event_v2",
    "care_legacy_credit_transaction",
  ];
  const rows = (
    await db.query(
      `SELECT p.proname, p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname = ANY($1)`,
      [privileged],
    )
  ).rows;
  assert.equal(rows.length, privileged.length, "all privileged functions found");
  for (const r of rows) {
    assert.ok(!/authenticated=X/.test(r.proacl ?? ""), `${r.proname} executable by authenticated`);
    assert.ok(!/anon=X/.test(r.proacl ?? ""), `${r.proname} executable by anon`);
  }
  await db.close();
});

test("actor-taking privileged functions run with fixed search_path and security definer", async () => {
  const db = await createTestDb();
  const fns = ["care_command", "care_settle", "care_post", "apply_credit_transaction", "claim_patient_record"];
  const rows = (
    await db.query(
      `SELECT p.proname, p.prosecdef, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname = ANY($1)`,
      [fns],
    )
  ).rows;
  for (const r of rows) {
    assert.equal(r.prosecdef, true, `${r.proname} must be SECURITY DEFINER`);
    assert.ok(
      (r.proconfig ?? []).some((c) => c.startsWith("search_path=")),
      `${r.proname} must pin search_path`,
    );
  }
  await db.close();
});
