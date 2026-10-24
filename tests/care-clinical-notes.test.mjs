// Phase 13 (0045): appointment clinical notes — real roles, real functions.
// The assigned, active, licensed doctor drafts while the appointment is
// CONFIRMED; FINALIZE locks the note forever. Reads are scoped to the patient,
// care team, organisation staff and platform staff.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, uuid } from "./care-db.mjs";

const db = await createTestDb();

async function asRole(role, sub, fn, aal = "aal2", commit = false) {
  await db.query("BEGIN");
  try {
    await db.query(`SET LOCAL ROLE ${role}`);
    await db.query(
      `SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true),set_config('request.jwt.claim.aal',$3,true)`,
      [sub ?? "", role === "anon" ? "anon" : role === "service_role" ? "service_role" : "authenticated", aal],
    );
    const r = await fn();
    await db.query(commit ? "COMMIT" : "ROLLBACK");
    return r;
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  }
}
const q = (sql, params = []) => db.query(sql, params);

const ORG = uuid(101);
const U_ADMIN = uuid(4), U_STAFF = uuid(5), U_PATIENT = uuid(6), U_STRANGER = uuid(1), U_DOCTOR = uuid(7), U_DOC2 = uuid(8);
const DOC = uuid(301), DOC2 = uuid(302);
const PAT = uuid(201);
const KEY = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ts = (days, hour = 10) => {
  const d = new Date(Date.now() + days * 86400000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

await db.exec(`
INSERT INTO public.partners(id,partner_code,legal_name,display_name) VALUES
 ('${ORG}','ORG-A','Org A','Org A');
INSERT INTO public.user_roles(user_id,role,partner_id,status) VALUES
 ('${U_ADMIN}','SUPER_ADMIN',NULL,'ACTIVE'),
 ('${U_STAFF}','PARTNER_STAFF','${ORG}','ACTIVE');
INSERT INTO public.patients(id,partner_id,first_name,last_name,auth_user_id) VALUES
 ('${PAT}','${ORG}','Pat','A','${U_PATIENT}');
INSERT INTO public.doctors(id,auth_user_id,full_name,license_number,status) VALUES
 ('${DOC}','${U_DOCTOR}','Doc A','LIC-1','ACTIVE'),
 ('${DOC2}','${U_DOC2}','Doc B','LIC-2','ACTIVE');
INSERT INTO public.services(id,partner_id,code,name,category) VALUES
 ('${uuid(601)}','${ORG}','GEN','General','MEDICAL');
INSERT INTO public.care_service_versions(id,partner_id,service_id,version,name,price_minor,status) VALUES
 ('${uuid(651)}','${ORG}','${uuid(601)}',1,'General v1',50000,'APPROVED');
`);

let seq = 9000;
async function makeAppointment(state = "CONFIRMED", doctor = DOC) {
  const n = seq;
  const id = uuid(seq++);
  // Unique window per appointment (no-overlap exclusion on doctor+patient).
  const day = 2 + (n % 25), hour = 8 + (n % 10);
  await q(
    `INSERT INTO public.care_appointments
       (id, partner_id, patient_id, service_version_id, starts_at, ends_at, state, doctor_id, idempotency_key, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, ORG, PAT, uuid(651), ts(day, hour), ts(day, hour + 1), state, doctor, KEY(seq++), U_STAFF],
  );
  return id;
}
const cmd = (op, args, key) =>
  q(`SELECT public.care_clinical_command($1,$2::jsonb,$3) AS r`, [op, JSON.stringify(args), key]);

test("assigned doctor STARTs a note; appointment moves to IN_PROGRESS", async () => {
  const appt = await makeAppointment();
  const r = await asRole("authenticated", U_DOCTOR, () => cmd("START", { appointment_id: appt }, KEY(seq++)), "aal2", true);
  assert.equal(r.rows[0].r.status, "DRAFT");
  const a = await q(`SELECT clinical_state FROM public.care_appointments WHERE id='${appt}'`);
  assert.equal(a.rows[0].clinical_state, "IN_PROGRESS");
});

test("SAVE updates draft fields; FINALIZE locks the note and completes clinical_state", async () => {
  const appt = await makeAppointment();
  const fin = await asRole("authenticated", U_DOCTOR, async () => {
    await cmd("START", { appointment_id: appt }, KEY(seq++));
    await cmd("SAVE", { appointment_id: appt, subjective: "tired", assessment: "viral", plan: "rest" }, KEY(seq++));
    return (await cmd("FINALIZE", { appointment_id: appt }, KEY(seq++))).rows[0].r;
  }, "aal2", true);
  assert.equal(fin.status, "FINAL");
  const a2 = await q(`SELECT clinical_state FROM public.care_appointments WHERE id='${appt}'`);
  assert.equal(a2.rows[0].clinical_state, "COMPLETED");
  // Final note is immutable: update and delete both refused.
  await assert.rejects(
    q(`UPDATE public.care_clinical_notes SET plan='x' WHERE appointment_id='${appt}'`),
    /CLINICAL_NOTE_FINAL/,
  );
  await assert.rejects(
    q(`DELETE FROM public.care_clinical_notes WHERE appointment_id='${appt}'`),
    /CLINICAL_NOTE_IMMUTABLE/,
  );
});

test("FINALIZE captures unsaved field edits instead of discarding them", async () => {
  const appt = await makeAppointment();
  await asRole("authenticated", U_DOCTOR, async () => {
    await cmd("START", { appointment_id: appt }, KEY(seq++));
    await cmd("SAVE", { appointment_id: appt, assessment: "old assessment", plan: "old plan" }, KEY(seq++));
    // Doctor edits on screen and clicks Finalize without Save first.
    await cmd("FINALIZE", { appointment_id: appt, assessment: "new assessment", plan: "new plan" }, KEY(seq++));
  }, "aal2", true);
  const n = await q(`SELECT status, assessment, plan FROM public.care_clinical_notes WHERE appointment_id='${appt}'`);
  assert.equal(n.rows[0].status, "FINAL");
  assert.equal(n.rows[0].assessment, "new assessment");
  assert.equal(n.rows[0].plan, "new plan");
});

test("FINALIZE without assessment and plan is refused", async () => {
  const appt = await makeAppointment();
  await assert.rejects(
    asRole("authenticated", U_DOCTOR, async () => {
      await cmd("START", { appointment_id: appt }, KEY(seq++));
      await cmd("FINALIZE", { appointment_id: appt }, KEY(seq++));
    }),
    /NOTE_INCOMPLETE/,
  );
});

test("non-assigned doctor, stranger, staff and anon cannot START", async () => {
  const appt = await makeAppointment();
  await assert.rejects(
    asRole("authenticated", U_DOC2, () => cmd("START", { appointment_id: appt }, KEY(seq++))),
    /ASSIGNED_DOCTOR_REQUIRED/,
  );
  await assert.rejects(
    asRole("authenticated", U_STRANGER, () => cmd("START", { appointment_id: appt }, KEY(seq++))),
    /ASSIGNED_DOCTOR_REQUIRED/,
  );
  await assert.rejects(
    asRole("authenticated", U_STAFF, () => cmd("START", { appointment_id: appt }, KEY(seq++))),
    /ASSIGNED_DOCTOR_REQUIRED/,
  );
  await assert.rejects(
    asRole("anon", null, () => cmd("START", { appointment_id: appt }, KEY(seq++))),
    /AUTHENTICATION_REQUIRED|permission denied/,
  );
});

test("START on a non-confirmed appointment is refused", async () => {
  const appt = await makeAppointment("REQUESTED");
  await assert.rejects(
    asRole("authenticated", U_DOCTOR, () => cmd("START", { appointment_id: appt }, KEY(seq++))),
    /APPOINTMENT_NOT_CONFIRMED/,
  );
});

test("read scoping: patient, assigned doctor and org staff read; stranger and anon denied", async () => {
  const appt = await makeAppointment();
  await asRole("authenticated", U_DOCTOR, async () => {
    await cmd("START", { appointment_id: appt }, KEY(seq++));
    await cmd("SAVE", { appointment_id: appt, assessment: "ok", plan: "rest" }, KEY(seq++));
  }, "aal2", true);
  const read = `SELECT public.care_clinical_read('${appt}') AS r`;
  for (const u of [U_PATIENT, U_DOCTOR, U_STAFF, U_ADMIN]) {
    const r = await asRole("authenticated", u, () => q(read));
    assert.equal(r.rows[0].r.assessment, "ok", `reader ${u}`);
  }
  await assert.rejects(asRole("authenticated", U_STRANGER, () => q(read)), /FORBIDDEN/);
  await assert.rejects(asRole("authenticated", U_DOC2, () => q(read)), /FORBIDDEN/);
  await assert.rejects(asRole("anon", null, () => q(read)), /AUTHENTICATION_REQUIRED|permission denied/);
});

test("every action writes an audit entry", async () => {
  const appt = await makeAppointment();
  await asRole("authenticated", U_DOCTOR, () => cmd("START", { appointment_id: appt }, KEY(seq++)), "aal2", true);
  const a = await q(
    `SELECT action FROM public.audit_log WHERE entity_id IN (
       SELECT id::text FROM public.care_clinical_notes WHERE appointment_id='${appt}')`,
  );
  assert.deepEqual(a.rows.map((r) => r.action), ["CLINICAL_NOTE_START"]);
});
