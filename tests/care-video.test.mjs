// Phase 11 (0043): private video rooms — real roles, real functions.
// Only the assigned doctor, the organisation's staff, or platform staff may
// open/end rooms; the patient and strangers are denied. Room coordinates can
// only change through the trusted command (direct UPDATE is blocked).
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
const U_ADMIN = uuid(4), U_DOCTOR = uuid(7), U_PATIENT = uuid(6), U_STRANGER = uuid(1);
const PAT = uuid(201), DOC = uuid(301), SVC = uuid(601), SV = uuid(651);
const APPT = uuid(801), APPT_REQ = uuid(802);
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
 ('${U_ADMIN}','SUPER_ADMIN',NULL,'ACTIVE');
INSERT INTO public.patients(id,partner_id,first_name,last_name,auth_user_id) VALUES
 ('${PAT}','${ORG}','Pat','A','${U_PATIENT}');
INSERT INTO public.doctors(id,full_name,license_number,status,auth_user_id) VALUES
 ('${DOC}','Dr A','LIC-1','ACTIVE','${U_DOCTOR}');
INSERT INTO public.services(id,partner_id,code,name,category) VALUES
 ('${SVC}','${ORG}','GEN','General','MEDICAL');
INSERT INTO public.care_service_versions(id,partner_id,service_id,version,name,duration_minutes,price_minor,currency,status) VALUES
 ('${SV}','${ORG}','${SVC}',1,'General v1',30,150000,'THB','APPROVED');
INSERT INTO public.care_appointments(id,partner_id,patient_id,doctor_id,service_version_id,starts_at,ends_at,state,idempotency_key,created_by) VALUES
 ('${APPT}','${ORG}','${PAT}','${DOC}','${SV}','${ts(1)}','${ts(1, 11)}','CONFIRMED','${KEY(1)}','${U_ADMIN}'),
 ('${APPT_REQ}','${ORG}','${PAT}','${DOC}','${SV}','${ts(2)}','${ts(2, 11)}','REQUESTED','${KEY(2)}','${U_ADMIN}');
`);

const video = (role, sub, op, id, extra = {}) =>
  asRole(
    role,
    sub,
    () => q(`SELECT public.care_video_command($1,$2,$3) AS r`, [op, { id, ...extra }, KEY(Math.floor(Math.random() * 1e9))]),
    "aal2",
    true,
  );

const state = (id) => q(`SELECT video_state, video_room_url FROM public.care_appointments WHERE id=$1`, [id]);

test("assigned doctor opens a room on a confirmed appointment", async () => {
  const r = await video("authenticated", U_DOCTOR, "OPEN", APPT, {
    room_name: "care-x",
    room_url: "https://meet.daily.co/care-x",
  });
  assert.equal(r.rows[0].r.video_state, "READY");
  const s = await state(APPT);
  assert.equal(s.rows[0].video_room_url, "https://meet.daily.co/care-x");
});

test("patient cannot open a room", async () => {
  await assert.rejects(
    video("authenticated", U_PATIENT, "OPEN", APPT, { room_name: "x", room_url: "https://x" }),
    /FORBIDDEN/,
  );
});

test("stranger and anon are denied", async () => {
  await assert.rejects(
    video("authenticated", U_STRANGER, "OPEN", APPT, { room_name: "x", room_url: "https://x" }),
    /FORBIDDEN/,
  );
  await assert.rejects(
    video("anon", null, "OPEN", APPT, { room_name: "x", room_url: "https://x" }),
    /AUTH_REQUIRED|permission denied/,
  );
});

test("cannot open a room before the appointment is confirmed", async () => {
  await assert.rejects(
    video("authenticated", U_DOCTOR, "OPEN", APPT_REQ, { room_name: "x", room_url: "https://x" }),
    /APPOINTMENT_NOT_CONFIRMED/,
  );
});

test("opening twice is rejected", async () => {
  await assert.rejects(
    video("authenticated", U_DOCTOR, "OPEN", APPT, { room_name: "y", room_url: "https://y" }),
    /VIDEO_ALREADY_OPEN/,
  );
});

test("direct UPDATE of video fields is blocked by the guard", async () => {
  await assert.rejects(
    asRole("authenticated", U_ADMIN, () =>
      q(`UPDATE public.care_appointments SET video_state='READY', video_room_url='https://evil' WHERE id=$1`, [APPT])),
    /VIDEO_COMMAND_REQUIRED|permission denied/,
  );
  const s = await state(APPT);
  assert.equal(s.rows[0].video_state, "READY");
  assert.equal(s.rows[0].video_room_url, "https://meet.daily.co/care-x");
});

test("end clears the join link and keeps the state machine honest", async () => {
  const r = await video("authenticated", U_DOCTOR, "END", APPT);
  assert.equal(r.rows[0].r.video_state, "ENDED");
  const s = await state(APPT);
  assert.equal(s.rows[0].video_room_url, null);
  await assert.rejects(video("authenticated", U_DOCTOR, "END", APPT), /VIDEO_NOT_READY/);
});

test("every video action writes an audit entry", async () => {
  const a = await q(
    `SELECT action FROM public.audit_log WHERE entity_id=$1 AND action LIKE 'APPOINTMENT_VIDEO_%' ORDER BY created_at`,
    [APPT],
  );
  assert.deepEqual(a.rows.map((r) => r.action), ["APPOINTMENT_VIDEO_OPEN", "APPOINTMENT_VIDEO_END"]);
});
