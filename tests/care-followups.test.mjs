import test from "node:test";
import assert from "node:assert/strict";
import { createTestDb, uuid } from "./care-db.mjs";

// Real-role tests for Phase 14 follow-up plans (0046).
const U_PATIENT = uuid(101), U_DOCTOR = uuid(102), U_DOCTOR2 = uuid(103);
const U_STAFF = uuid(104), U_STRANGER = uuid(105), U_ADMIN = uuid(106);
const PARTNER = uuid(201), PATIENT = uuid(301), DOCTOR = uuid(302), DOCTOR2 = uuid(303);
const SV = uuid(401);
let db, seq = 0;
const KEY = (n) => `f0f0f0f0-0000-4000-8000-${String(n).padStart(12, "0")}`;

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
  q(`SELECT public.care_followup_command($1,$2::jsonb,$3) AS r`, [op, JSON.stringify(args), key]);

async function seedCompletedAppointment() {
  const n = seq++;
  const appt = uuid(5000 + n);
  const day = 2 + (n % 25), hour = 8 + (n % 10);
  await q(
    `INSERT INTO public.care_appointments
       (id, partner_id, patient_id, doctor_id, service_version_id, starts_at, ends_at, state, clinical_state, created_by, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,
       ('2027-01-'||lpad($6::text,2,'0')||' '||lpad($7::text,2,'0')||':00+00')::timestamptz,
       ('2027-01-'||lpad($6::text,2,'0')||' '||lpad($7::text,2,'0')||':30+00')::timestamptz,
       'COMPLETED','COMPLETED',$8, 'b0b0b0b0-0000-4000-8000-'||lpad($9::text,12,'0'))`,
    [appt, PARTNER, PATIENT, DOCTOR, SV, day, hour, U_DOCTOR, n],
  );
  return appt;
}

test.before(async () => {
  db = await createTestDb();
  await db.exec(await (await import("node:fs/promises")).readFile("db/0046_care_followups.sql", "utf8"));
  await q(`INSERT INTO auth.users (id, email) VALUES
    ($1,'p@x'),($2,'d@x'),($3,'d2@x'),($4,'s@x'),($5,'x@x'),($6,'a@x')`,
    [U_PATIENT, U_DOCTOR, U_DOCTOR2, U_STAFF, U_STRANGER, U_ADMIN]);
  await q(`INSERT INTO public.partners (id, partner_code, legal_name, display_name) VALUES ($1,'C1','Clinic','Clinic')`, [PARTNER]);
  await q(`INSERT INTO public.patients (id, partner_id, external_patient_id, first_name, last_name, auth_user_id)
           VALUES ($1,$2,'EXT-1','Pat','Ient',$3)`, [PATIENT, PARTNER, U_PATIENT]);
  await q(`INSERT INTO public.doctors (id, auth_user_id, full_name, license_number, status)
           VALUES ($1,$2,'Dr One','L1','ACTIVE'),($3,$4,'Dr Two','L2','ACTIVE')`,
    [DOCTOR, U_DOCTOR, DOCTOR2, U_DOCTOR2]);
  await q(`INSERT INTO public.user_roles (user_id, role, partner_id) VALUES
    ($1,'DOCTOR',$2),($3,'DOCTOR',$2),($4,'PARTNER_STAFF',$2),($5,'SUPER_ADMIN',NULL)`,
    [U_DOCTOR, PARTNER, U_DOCTOR2, U_STAFF, U_ADMIN]);
  await q(`INSERT INTO public.services (id, partner_id, code, name, category)
           VALUES ($1,$2,'GEN','Consult','MEDICAL')`, [uuid(400), PARTNER]);
  await q(`INSERT INTO public.care_service_versions
             (id, service_id, partner_id, version, name, price_minor, status)
           VALUES ($1,$2,$3,1,'Consult v1',100000,'APPROVED')`,
    [SV, uuid(400), PARTNER]);
});
test.after(() => db.close());

test("assigned doctor schedules a follow-up on a completed appointment", async () => {
  const appt = await seedCompletedAppointment();
  const r = await asRole("authenticated", U_DOCTOR, () =>
    cmd("SCHEDULE", { appointment_id: appt, due_at: "2027-02-01T09:00:00Z", instructions: "recheck" }, KEY(seq++)), "aal2", true);
  assert.equal(r.rows[0].r.status, "SCHEDULED");
  const f = await q(`SELECT status, instructions FROM public.care_followups WHERE appointment_id=$1`, [appt]);
  assert.equal(f.rows[0].status, "SCHEDULED");
  assert.equal(f.rows[0].instructions, "recheck");
});

test("SCHEDULE on a non-completed appointment is refused", async () => {
  const n = seq++;
  const appt = uuid(6000 + n);
  await q(
    `INSERT INTO public.care_appointments
       (id, partner_id, patient_id, doctor_id, service_version_id, starts_at, ends_at, state, created_by, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,'2027-03-01 09:00+00'::timestamptz,'2027-03-01 09:30+00'::timestamptz,'CONFIRMED',$6, 'a0a0a0a0-0000-4000-8000-000000000099')`,
    [appt, PARTNER, PATIENT, DOCTOR, SV, U_DOCTOR],
  );
  await assert.rejects(
    asRole("authenticated", U_DOCTOR, () =>
      cmd("SCHEDULE", { appointment_id: appt, due_at: "2027-03-02T09:00:00Z", instructions: "x" }, KEY(seq++))),
    /APPOINTMENT_NOT_COMPLETED/,
  );
});

test("non-assigned doctor, staff, patient and anon cannot SCHEDULE", async () => {
  const appt = await seedCompletedAppointment();
  const args = { appointment_id: appt, due_at: "2027-02-01T09:00:00Z", instructions: "x" };
  for (const u of [U_DOCTOR2, U_STAFF, U_PATIENT, U_STRANGER]) {
    await assert.rejects(asRole("authenticated", u, () => cmd("SCHEDULE", args, KEY(seq++))), /ASSIGNED_DOCTOR_REQUIRED/);
  }
  await assert.rejects(asRole("anon", null, () => cmd("SCHEDULE", args, KEY(seq++))), /AUTHENTICATION_REQUIRED|permission denied/);
});

test("SCHEDULE requires future due date and instructions", async () => {
  const appt = await seedCompletedAppointment();
  await assert.rejects(
    asRole("authenticated", U_DOCTOR, () =>
      cmd("SCHEDULE", { appointment_id: appt, due_at: "2020-01-01T00:00:00Z", instructions: "x" }, KEY(seq++))),
    /DUE_AT_IN_PAST/,
  );
  await assert.rejects(
    asRole("authenticated", U_DOCTOR, () =>
      cmd("SCHEDULE", { appointment_id: appt, due_at: "2027-02-01T09:00:00Z", instructions: "" }, KEY(seq++))),
    /INSTRUCTIONS_REQUIRED/,
  );
});

test("DONE marks the follow-up done; terminal state blocks further changes", async () => {
  const appt = await seedCompletedAppointment();
  const id = await asRole("authenticated", U_DOCTOR, async () => {
    const r = await cmd("SCHEDULE", { appointment_id: appt, due_at: "2027-02-01T09:00:00Z", instructions: "recheck" }, KEY(seq++));
    return r.rows[0].r.id;
  }, "aal2", true);
  const done = await asRole("authenticated", U_DOCTOR, () => cmd("DONE", { id }, KEY(seq++)), "aal2", true);
  assert.equal(done.rows[0].r.status, "DONE");
  await assert.rejects(
    asRole("authenticated", U_DOCTOR, () => cmd("CANCEL", { id }, KEY(seq++))),
    /FOLLOWUP_TERMINAL/,
  );
});

test("org staff can CANCEL; stranger cannot; read scoping holds", async () => {
  const appt = await seedCompletedAppointment();
  const id = await asRole("authenticated", U_DOCTOR, async () =>
    (await cmd("SCHEDULE", { appointment_id: appt, due_at: "2027-02-01T09:00:00Z", instructions: "x" }, KEY(seq++))).rows[0].r.id,
  "aal2", true);
  await assert.rejects(asRole("authenticated", U_STRANGER, () => cmd("CANCEL", { id }, KEY(seq++))), /FORBIDDEN/);
  const c = await asRole("authenticated", U_STAFF, () => cmd("CANCEL", { id }, KEY(seq++)), "aal2", true);
  assert.equal(c.rows[0].r.status, "CANCELLED");
  // read scoping: patient + doctor + staff see it, stranger does not
  const sel = `SELECT id FROM public.care_followups WHERE id='${id}'`;
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
    const r = await cmd("SCHEDULE", { appointment_id: appt, due_at: "2027-02-01T09:00:00Z", instructions: "x" }, KEY(seq++));
    await cmd("DONE", { id: r.rows[0].r.id }, KEY(seq++));
    return r.rows[0].r.id;
  }, "aal2", true);
  const a = await q(`SELECT action FROM public.audit_log WHERE entity_id=$1 ORDER BY created_at`, [id]);
  assert.deepEqual(a.rows.map((r) => r.action), ["FOLLOWUP_SCHEDULE", "FOLLOWUP_DONE"]);
});
