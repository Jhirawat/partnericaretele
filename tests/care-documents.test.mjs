import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createTestDb, uuid } from "./care-db.mjs";

// Real-role tests for Phase 15 appointment documents (0047).
const U_PATIENT = uuid(101), U_DOCTOR = uuid(102), U_DOCTOR2 = uuid(103);
const U_STAFF = uuid(104), U_STRANGER = uuid(105);
const PARTNER = uuid(201), PATIENT = uuid(301), DOCTOR = uuid(302), DOCTOR2 = uuid(303);
const SV = uuid(401);
let db, seq = 0;
const KEY = (n) => `d0d0d0d0-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function asRole(role, sub, fn, aal = "aal2", commit = false) {
  await db.query("BEGIN");
  try {
    await db.query(`SET LOCAL ROLE ${role}`);
    await db.query(
      `SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.aal',$2,true),set_config('request.jwt.claim.role',$3,true)`,
      [sub ?? "", aal, role],
    );
    const r = await fn();
    await db.query(commit ? "COMMIT" : "ROLLBACK");
    return r;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  }
}
const q = (sql, p) => db.query(sql, p);
const cmd = (op, args, key) =>
  q(`SELECT public.care_document_command($1,$2::jsonb,$3) AS r`, [op, JSON.stringify(args), key]);

async function seedCompletedAppointment() {
  const n = seq++;
  const appt = uuid(7000 + n);
  const day = 2 + (n % 25), hour = 8 + (n % 10);
  await q(
    `INSERT INTO public.care_appointments
       (id, partner_id, patient_id, doctor_id, service_version_id, starts_at, ends_at, state, clinical_state, created_by, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,
       ('2027-01-'||lpad($6::text,2,'0')||' '||lpad($7::text,2,'0')||':00+00')::timestamptz,
       ('2027-01-'||lpad($6::text,2,'0')||' '||lpad($7::text,2,'0')||':30+00')::timestamptz,
       'COMPLETED','COMPLETED',$8, 'c0c0c0c0-0000-4000-8000-'||lpad($9::text,12,'0'))`,
    [appt, PARTNER, PATIENT, DOCTOR, SV, day, hour, U_DOCTOR, n],
  );
  return appt;
}

test.before(async () => {
  db = await createTestDb();
  await db.exec(await readFile("db/0047_care_appointment_documents.sql", "utf8"));
  await q(`INSERT INTO auth.users (id, email) VALUES ($1,'p@x'),($2,'d@x'),($3,'d2@x'),($4,'s@x'),($5,'x@x')`,
    [U_PATIENT, U_DOCTOR, U_DOCTOR2, U_STAFF, U_STRANGER]);
  await q(`INSERT INTO public.partners (id, partner_code, legal_name, display_name) VALUES ($1,'C1','Clinic','Clinic')`, [PARTNER]);
  await q(`INSERT INTO public.patients (id, partner_id, external_patient_id, first_name, last_name, auth_user_id)
           VALUES ($1,$2,'EXT-1','Pat','Ient',$3)`, [PATIENT, PARTNER, U_PATIENT]);
  await q(`INSERT INTO public.doctors (id, auth_user_id, full_name, license_number, status)
           VALUES ($1,$2,'Dr One','L1','ACTIVE'),($3,$4,'Dr Two','L2','ACTIVE')`,
    [DOCTOR, U_DOCTOR, DOCTOR2, U_DOCTOR2]);
  await q(`INSERT INTO public.user_roles (user_id, role, partner_id) VALUES
    ($1,'DOCTOR',$2),($3,'DOCTOR',$2),($4,'PARTNER_STAFF',$2)`,
    [U_DOCTOR, PARTNER, U_DOCTOR2, U_STAFF]);
  await q(`INSERT INTO public.services (id, partner_id, code, name, category) VALUES ($1,$2,'GEN','Consult','MEDICAL')`, [uuid(400), PARTNER]);
  await q(`INSERT INTO public.care_service_versions (id, service_id, partner_id, version, name, price_minor, status)
           VALUES ($1,$2,$3,1,'Consult v1',100000,'APPROVED')`, [SV, uuid(400), PARTNER]);
});
test.after(() => db.close());

test("assigned doctor drafts and issues a visit summary; document_state follows", async () => {
  const appt = await seedCompletedAppointment();
  const r = await asRole("authenticated", U_DOCTOR, async () => {
    await cmd("DRAFT", { appointment_id: appt, title: "Visit summary", body: "draft body" }, KEY(seq++));
    await cmd("SAVE", { appointment_id: appt, body: "final body" }, KEY(seq++));
    return (await cmd("ISSUE", { appointment_id: appt }, KEY(seq++))).rows[0].r;
  }, "aal2", true);
  assert.equal(r.status, "ISSUED");
  const d = await q(`SELECT status, body FROM public.care_appointment_documents WHERE appointment_id=$1`, [appt]);
  assert.equal(d.rows[0].status, "ISSUED");
  assert.equal(d.rows[0].body, "final body");
  const a = await q(`SELECT document_state FROM public.care_appointments WHERE id=$1`, [appt]);
  assert.equal(a.rows[0].document_state, "FINAL");
});

test("ISSUE captures unsaved title/body edits before locking", async () => {
  const appt = await seedCompletedAppointment();
  const r = await asRole("authenticated", U_DOCTOR, async () => {
    await cmd("DRAFT", { appointment_id: appt, title: "old title", body: "old body" }, KEY(seq++));
    // Doctor edits fields on screen and clicks Issue without Save first.
    return (await cmd("ISSUE", { appointment_id: appt, title: "new title", body: "new body" }, KEY(seq++))).rows[0].r;
  }, "aal2", true);
  assert.equal(r.status, "ISSUED");
  const d = await q(`SELECT title, body FROM public.care_appointment_documents WHERE appointment_id=$1`, [appt]);
  assert.equal(d.rows[0].title, "new title");
  assert.equal(d.rows[0].body, "new body");
});

test("issued documents are immutable", async () => {
  const appt = await seedCompletedAppointment();
  await asRole("authenticated", U_DOCTOR, async () => {
    await cmd("DRAFT", { appointment_id: appt, title: "t", body: "b" }, KEY(seq++));
    await cmd("ISSUE", { appointment_id: appt }, KEY(seq++));
  }, "aal2", true);
  await assert.rejects(
    asRole("authenticated", U_DOCTOR, () => cmd("SAVE", { appointment_id: appt, body: "changed" }, KEY(seq++))),
    /DOCUMENT_IMMUTABLE/,
  );
});

test("DRAFT requires completed clinical state, title and body", async () => {
  const n = seq++;
  const appt = uuid(8000 + n);
  await q(
    `INSERT INTO public.care_appointments
       (id, partner_id, patient_id, doctor_id, service_version_id, starts_at, ends_at, state, created_by, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,'2027-03-05 09:00+00'::timestamptz,'2027-03-05 09:30+00'::timestamptz,'CONFIRMED',$6,$7)`,
    [appt, PARTNER, PATIENT, DOCTOR, SV, U_DOCTOR, KEY(seq++)],
  );
  await assert.rejects(
    asRole("authenticated", U_DOCTOR, () => cmd("DRAFT", { appointment_id: appt, title: "t", body: "b" }, KEY(seq++))),
    /CLINICAL_NOT_COMPLETED/,
  );
  const appt2 = await seedCompletedAppointment();
  await assert.rejects(
    asRole("authenticated", U_DOCTOR, () => cmd("DRAFT", { appointment_id: appt2, title: "", body: "b" }, KEY(seq++))),
    /DOCUMENT_INCOMPLETE/,
  );
});

test("non-assigned doctor, staff, patient, stranger and anon cannot write", async () => {
  const appt = await seedCompletedAppointment();
  const args = { appointment_id: appt, title: "t", body: "b" };
  for (const u of [U_DOCTOR2, U_STAFF, U_PATIENT, U_STRANGER]) {
    await assert.rejects(asRole("authenticated", u, () => cmd("DRAFT", args, KEY(seq++))), /ASSIGNED_DOCTOR_REQUIRED/);
  }
  await assert.rejects(asRole("anon", null, () => cmd("DRAFT", args, KEY(seq++))), /AUTHENTICATION_REQUIRED|permission denied/);
});

test("read scoping: patient, doctor and staff read; stranger does not", async () => {
  const appt = await seedCompletedAppointment();
  const id = await asRole("authenticated", U_DOCTOR, async () =>
    (await cmd("DRAFT", { appointment_id: appt, title: "t", body: "b" }, KEY(seq++))).rows[0].r.id,
  "aal2", true);
  const sel = `SELECT id FROM public.care_appointment_documents WHERE id='${id}'`;
  for (const u of [U_PATIENT, U_DOCTOR, U_STAFF]) {
    const r = await asRole("authenticated", u, () => q(sel));
    assert.equal(r.rows.length, 1, u);
  }
  const s = await asRole("authenticated", U_STRANGER, () => q(sel));
  assert.equal(s.rows.length, 0);
});

test("every action writes an audit entry", async () => {
  const appt = await seedCompletedAppointment();
  const id = await asRole("authenticated", U_DOCTOR, async () => {
    const r = await cmd("DRAFT", { appointment_id: appt, title: "t", body: "b" }, KEY(seq++));
    await cmd("ISSUE", { appointment_id: appt }, KEY(seq++));
    return r.rows[0].r.id;
  }, "aal2", true);
  const a = await q(`SELECT action FROM public.audit_log WHERE entity_id=$1 ORDER BY created_at`, [id]);
  assert.deepEqual(a.rows.map((r) => r.action), ["DOCUMENT_DRAFT", "DOCUMENT_ISSUE"]);
});
