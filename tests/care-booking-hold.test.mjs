// Phase 12 (0044): prepayment at booking — real roles, real functions.
// A patient self-booking without membership cover atomically RESERVES the
// earliest eligible prepaid lot; staff COMPLETE captures it, CANCEL / NO_SHOW
// release it. Reservation keys are derived from the appointment id, so a
// retried booking can never reserve twice for one appointment.
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
const U_ADMIN = uuid(4), U_STAFF = uuid(5), U_PATIENT = uuid(6), U_STRANGER = uuid(1), U_DOCTOR = uuid(7);
const DOC = uuid(301);
const PAT = uuid(201);
const SVC = uuid(601);
const SV = uuid(651);
const PV = uuid(701);
const TERMS = uuid(950);
const KEY = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ts = (days, hour = 10, min = 0) => {
  const d = new Date(Date.now() + days * 86400000);
  d.setUTCHours(hour, min, 0, 0);
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
 ('${DOC}','${U_DOCTOR}','Doc A','LIC-1','ACTIVE');
INSERT INTO public.services(id,partner_id,code,name,category) VALUES
 ('${SVC}','${ORG}','GEN','General','MEDICAL');
INSERT INTO public.care_service_versions(id,partner_id,service_id,version,name,price_minor,status) VALUES
 ('${SV}','${ORG}','${SVC}',1,'General v1',50000,'APPROVED');
INSERT INTO public.care_terms(id,version,settings,active,approved_at,approved_by) VALUES
 ('${TERMS}','v1','{}',true,now(),'${U_ADMIN}');
INSERT INTO public.care_plan_versions(id,plan_code,version,name,price_minor,quota,service_coverage,status,unlimited) VALUES
 ('${PV}','PACK3',1,'Pack of 3',150000,3,'["${SVC}"]','APPROVED',false);
`);

// Fund the patient with a verified live payment and grant a COUNT lot of 3.
const PAY = uuid(901);
await q(`INSERT INTO public.care_payments(id,partner_id,patient_id,terms_id,kind,channel,collector,amount_minor,currency,status,provider_environment,snapshot,created_by)
  VALUES ('${PAY}','${ORG}','${PAT}','${TERMS}','DIRECT','DIRECT','TEST',150000,'THB','PAID','live','{"plan_version_id":"${PV}"}','${U_ADMIN}')`);
await asRole("service_role", null, () =>
  q(`SELECT public.care_personal_command('GRANT', jsonb_build_object('payment_id','${PAY}'), '${KEY(5001)}', '${U_ADMIN}')`),
  "service_role", true);

const book = (sub, key, days = 5, commit = true) =>
  asRole("authenticated", sub, () =>
    q(`SELECT public.care_patient_book('${SV}', '${ts(days)}', '${ts(days, 10, 30)}', '${key}') AS r`),
    "aal2", commit);
const apptCommand = (sub, op, id, key, commit = true, doctor = null) =>
  asRole("authenticated", sub, () =>
    q(`SELECT public.care_appointment_command('${op}', jsonb_build_object('id','${id}'${doctor ? `,'doctor_id','${doctor}'` : ""}), '${key}') AS r`),
    "aal2", commit);
const lotState = () =>
  q(`SELECT l.used_count, l.used_minor,
       (SELECT count(*) FROM public.care_personal_holds h WHERE h.lot_id = l.id AND h.state='RESERVED') AS reserved_holds,
       (SELECT count(*) FROM public.care_personal_holds h WHERE h.lot_id = l.id AND h.state='CONSUMED') AS consumed_holds,
       (SELECT count(*) FROM public.care_personal_holds h WHERE h.lot_id = l.id AND h.state='RELEASED') AS released_holds
     FROM public.care_personal_lots l WHERE l.patient_id='${PAT}'`);

test("booking without membership reserves the prepaid lot atomically", async () => {
  const r = await book(U_PATIENT, KEY(5002));
  const id = r.rows[0].r.id;
  assert.equal(r.rows[0].r.state, "REQUESTED");
  assert.equal(r.rows[0].r.payment_state, "RESERVED");
  const row = await q(`SELECT payment_state FROM public.care_appointments WHERE id='${id}'`);
  assert.equal(row.rows[0].payment_state, "RESERVED");
  const lot = await lotState();
  assert.equal(Number(lot.rows[0].reserved_holds), 1);
  assert.equal(Number(lot.rows[0].used_count), 0); // reserved, not yet consumed
  // Ledger has a RESERVE entry bound to this appointment
  const led = await q(`SELECT count(*) AS n FROM public.care_personal_ledger
    WHERE appointment_id='${id}' AND type='RESERVE'`);
  assert.equal(Number(led.rows[0].n), 1);
});

test("staff COMPLETE captures the hold; the lot is consumed exactly once", async () => {
  const id = (await q(`SELECT id FROM public.care_appointments WHERE payment_state='RESERVED' ORDER BY created_at LIMIT 1`)).rows[0].id;
  await apptCommand(U_STAFF, "CONFIRM", id, KEY(5003), true, DOC);
  const r = await apptCommand(U_STAFF, "COMPLETE", id, KEY(5004));
  assert.equal(r.rows[0].r.op, "COMPLETE");
  const row = await q(`SELECT state, payment_state FROM public.care_appointments WHERE id='${id}'`);
  assert.equal(row.rows[0].state, "COMPLETED");
  assert.equal(row.rows[0].payment_state, "CAPTURED");
  const lot = await lotState();
  assert.equal(Number(lot.rows[0].used_count), 1);
  assert.equal(Number(lot.rows[0].consumed_holds), 1);
  const led = await q(`SELECT count(*) AS n FROM public.care_personal_ledger
    WHERE appointment_id='${id}' AND type='CAPTURE'`);
  assert.equal(Number(led.rows[0].n), 1);
});

test("staff CANCEL releases the hold back to the patient", async () => {
  const r = await book(U_PATIENT, KEY(5005), 6);
  const id = r.rows[0].r.id;
  assert.equal(r.rows[0].r.payment_state, "RESERVED");
  await apptCommand(U_STAFF, "CANCEL", id, KEY(5006));
  const row = await q(`SELECT state, payment_state FROM public.care_appointments WHERE id='${id}'`);
  assert.equal(row.rows[0].state, "CANCELLED");
  assert.equal(row.rows[0].payment_state, "RELEASED");
  const lot = await lotState();
  assert.equal(Number(lot.rows[0].used_count), 1); // only the completed one
  assert.equal(Number(lot.rows[0].released_holds), 1);
});

test("NO_SHOW also releases the hold; conservation holds across the ledger", async () => {
  const r = await book(U_PATIENT, KEY(5007), 8);
  const id = r.rows[0].r.id;
  await apptCommand(U_STAFF, "CONFIRM", id, KEY(5008));
  await apptCommand(U_STAFF, "NO_SHOW", id, KEY(5009));
  const row = await q(`SELECT state, payment_state FROM public.care_appointments WHERE id='${id}'`);
  assert.equal(row.rows[0].state, "NO_SHOW");
  assert.equal(row.rows[0].payment_state, "RELEASED");
  // Conservation: granted(3) = used(1) + available(2); holds net to zero reserved
  const lot = await lotState();
  assert.equal(Number(lot.rows[0].used_count), 1);
  assert.equal(Number(lot.rows[0].reserved_holds), 0);
  const avail = await asRole("authenticated", U_PATIENT, () =>
    q(`SELECT public.care_personal_balance('${PAT}') AS b`));
  const sessions = (avail.rows[0].b || []).reduce((s, l) => s + Number(l.count_available), 0);
  assert.equal(sessions, 2); // granted 3, captured 1, everything else released
});

test("a retried booking with a fresh key cannot reserve twice for one appointment", async () => {
  // Simulate a client retry racing the first success: same patient, new key,
  // but the reservation key is derived from the appointment id. Even if a
  // duplicate appointment row were forced in, the second RESERVE for the same
  // appointment id replays idempotently instead of double-spending.
  const r = await book(U_PATIENT, KEY(5010), 9);
  const id = r.rows[0].r.id;
  const replay = await asRole("service_role", null, () =>
    q(`SELECT public.care_personal_command('RESERVE', jsonb_build_object('appointment_id','${id}'), public.care_derived_key('care-appt-reserve','${id}'::uuid), '${U_PATIENT}') AS r`));
  assert.equal(replay.rows[0].r.replayed, true);
  const lot = await lotState();
  assert.equal(Number(lot.rows[0].reserved_holds), 1); // still exactly one active hold
  // Clean up: release via cancel so later tests keep conservation
  await apptCommand(U_STAFF, "CANCEL", id, KEY(5011));
});

test("stranger staff from another org cannot complete or cancel the appointment", async () => {
  const r = await book(U_PATIENT, KEY(5012), 10);
  const id = r.rows[0].r.id;
  await assert.rejects(apptCommand(U_STRANGER, "CANCEL", id, KEY(5013), false), /FORBIDDEN/);
  await assert.rejects(apptCommand(U_STRANGER, "COMPLETE", id, KEY(5014), false), /FORBIDDEN/);
  const row = await q(`SELECT state, payment_state FROM public.care_appointments WHERE id='${id}'`);
  assert.equal(row.rows[0].state, "REQUESTED"); // untouched
  assert.equal(row.rows[0].payment_state, "RESERVED");
  await apptCommand(U_STAFF, "CANCEL", id, KEY(5015));
});

test("booking with no remaining prepaid balance and no membership is refused", async () => {
  // Exhaust the lot
  await q(`UPDATE public.care_personal_lots SET used_count=granted_count, used_minor=granted_minor`);
  await assert.rejects(book(U_PATIENT, KEY(5016), 11, false), /ENTITLEMENT_REQUIRED|NO_ELIGIBLE_LOT/);
  await q(`UPDATE public.care_personal_lots SET used_count=1, used_minor=0`);
});

test("membership-covered booking does not touch the prepaid lot", async () => {
  // Give the patient an active membership period covering the slot
  const MSHIP = uuid(801), PLAN = uuid(803);
  await q(`INSERT INTO public.membership_plans(id,code,name) VALUES ('${PLAN}','ANNUAL','Annual Care')`);
  await q(`INSERT INTO public.memberships(id,patient_id,plan_id,status,starts_at,expires_at) VALUES
    ('${MSHIP}','${PAT}','${PLAN}','ACTIVE',now()-interval '1 day',now()+interval '300 days')`);
  await q(`INSERT INTO public.care_membership_periods(id,membership_id,plan_version_id,period_start,period_end) VALUES
    ('${uuid(802)}','${MSHIP}','${PV}',now()-interval '1 day',now()+interval '300 days')`);
  const before = await lotState();
  const r = await book(U_PATIENT, KEY(5017), 12);
  const id = r.rows[0].r.id;
  assert.equal(r.rows[0].r.payment_state, "UNPAID"); // covered by membership
  const after = await lotState();
  assert.equal(Number(after.rows[0].reserved_holds), Number(before.rows[0].reserved_holds));
  await apptCommand(U_STAFF, "CONFIRM", id, KEY(5019));
  await apptCommand(U_STAFF, "COMPLETE", id, KEY(5018));
  const row = await q(`SELECT payment_state FROM public.care_appointments WHERE id='${id}'`);
  assert.equal(row.rows[0].payment_state, "UNPAID"); // never reserved, never captured
});
