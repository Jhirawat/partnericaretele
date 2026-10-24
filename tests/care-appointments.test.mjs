// Phase 07: appointment state machine — real roles, real functions.
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
      [sub ?? "", role === "anon" ? "anon" : "authenticated", aal],
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

const ORG_A = uuid(101);
const U_ADMIN = uuid(4), U_MGR_A = uuid(2), U_STRANGER = uuid(1);
const PAT_E = uuid(201); // entitled patient
const PAT_N = uuid(205); // no membership
const DOC_A = uuid(401), DOC_SUSP = uuid(402);
const SVC = uuid(601), SV = uuid(651);
const ts = (days, hour, min) => {
  const d = new Date(Date.now() + days * 86400000);
  d.setUTCHours(hour, min, 0, 0);
  return d.toISOString();
};
const KEY = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

await db.exec(`
INSERT INTO public.partners(id,partner_code,legal_name,display_name) VALUES ('${ORG_A}','ORG-A','Org A','Org A');
INSERT INTO public.user_roles(user_id,role,partner_id,status) VALUES
 ('${U_ADMIN}','SUPER_ADMIN',NULL,'ACTIVE'),('${U_MGR_A}','PARTNER_MANAGER','${ORG_A}','ACTIVE');
INSERT INTO public.doctors(id,full_name,license_number,status) VALUES
 ('${DOC_A}','Doc A','LIC-1','ACTIVE'),('${DOC_SUSP}','Doc S','LIC-2','SUSPENDED');
INSERT INTO public.patients(id,partner_id,first_name,last_name) VALUES
 ('${PAT_E}','${ORG_A}','Pat','E'),('${PAT_N}','${ORG_A}','Pat','N');
INSERT INTO public.services(id,partner_id,code,name,category) VALUES ('${SVC}','${ORG_A}','GEN','General','MEDICAL');
INSERT INTO public.care_service_versions(id,partner_id,service_id,version,name,price_minor,status) VALUES
 ('${SV}','${ORG_A}','${SVC}',1,'General v1',50000,'APPROVED');
INSERT INTO public.membership_plans(id,code,name,price) VALUES ('${uuid(901)}','ANNUAL','Annual Care',6000);
INSERT INTO public.care_plan_versions(id,plan_code,version,name,price_minor,quota,service_coverage,status,unlimited) VALUES
 ('${uuid(701)}','ANNUAL',1,'Annual v1',600000,NULL,'["${SVC}"]','APPROVED',true);
INSERT INTO public.memberships(id,patient_id,plan_id,status,starts_at,expires_at,payment_status) VALUES
 ('${uuid(801)}','${PAT_E}','${uuid(901)}','ACTIVE',now()-interval '1 month',now()+interval '11 months','PAID');
INSERT INTO public.care_membership_periods(membership_id,plan_version_id,period_start,period_end,source) VALUES
 ('${uuid(801)}','${uuid(701)}',now()-interval '1 month',now()+interval '11 months','MANUAL');
`);

const book = (user, patient, start, end, key, paymentId = null) =>
  asRole("authenticated", user, () =>
    q(`SELECT public.care_appointment_command('BOOK', jsonb_build_object(
        'patient_id','${patient}','service_version_id','${SV}',
        'starts_at','${start}','ends_at','${end}'${paymentId ? `,'payment_id','${paymentId}'` : ""}
      ), '${key}') AS r`), "aal2", true);

test("BOOK with entitled membership succeeds (REQUESTED, UNPAID)", async () => {
  const r = await book(U_MGR_A, PAT_E, ts(30,10,0), ts(30,10,30), KEY(1001));
  assert.equal(r.rows[0].r.state, "REQUESTED");
  const row = await q(`SELECT state, payment_state FROM public.care_appointments WHERE id='${r.rows[0].r.id}'`);
  assert.equal(row.rows[0].state, "REQUESTED");
  assert.equal(row.rows[0].payment_state, "UNPAID");
});

test("BOOK without entitlement and without payment is blocked (ENTITLEMENT_REQUIRED)", async () => {
  await assert.rejects(
    book(U_MGR_A, PAT_N, ts(31,10,0), ts(31,10,30), KEY(1002)),
    /ENTITLEMENT_REQUIRED/);
});

test("BOOK with an unverified payment is rejected", async () => {
  await assert.rejects(
    book(U_MGR_A, PAT_N, ts(32,10,0), ts(32,10,30), KEY(1003), uuid(999)),
    /PAYMENT_NOT_VERIFIED/);
});

test("CONFIRM assigns an ACTIVE doctor; suspended doctor rejected; double-booking blocked", async () => {
  const r = await book(U_MGR_A, PAT_E, ts(60,10,0), ts(60,10,30), KEY(1004));
  const id = r.rows[0].r.id;
  await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_appointment_command('CONFIRM', jsonb_build_object('id','${id}','doctor_id','${DOC_A}'), '${KEY(1005)}')`), "aal2", true);
  const row = await q(`SELECT state, doctor_id FROM public.care_appointments WHERE id='${id}'`);
  assert.equal(row.rows[0].state, "CONFIRMED");
  assert.equal(row.rows[0].doctor_id, DOC_A);
  // Same doctor, overlapping window → exclusion constraint
  const r2 = await book(U_MGR_A, PAT_E, ts(60,10,15), ts(60,10,45), KEY(1006));
  await assert.rejects(
    asRole("authenticated", U_MGR_A, () =>
      q(`SELECT public.care_appointment_command('CONFIRM', jsonb_build_object('id','${r2.rows[0].r.id}','doctor_id','${DOC_A}'), '${KEY(1007)}')`)),
    /care_appointments_no_overlap|conflicting key/);
  // Suspended doctor rejected
  await assert.rejects(
    asRole("authenticated", U_MGR_A, () =>
      q(`SELECT public.care_appointment_command('CONFIRM', jsonb_build_object('id','${r2.rows[0].r.id}','doctor_id','${DOC_SUSP}'), '${KEY(1008)}')`)),
    /DOCTOR_NOT_ACTIVE/);
});

test("illegal transitions and terminal immutability enforced", async () => {
  const r = await book(U_MGR_A, PAT_E, ts(90,10,0), ts(90,10,30), KEY(1009));
  const id = r.rows[0].r.id;
  // REQUESTED → COMPLETED is illegal
  await assert.rejects(
    asRole("authenticated", U_MGR_A, () =>
      q(`SELECT public.care_appointment_command('COMPLETE', jsonb_build_object('id','${id}'), '${KEY(1010)}')`)),
    /APPOINTMENT_ILLEGAL_TRANSITION/);
  // REQUESTED → CANCELLED ok; then no further transition
  await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_appointment_command('CANCEL', jsonb_build_object('id','${id}','reason','patient request'), '${KEY(1011)}')`), "aal2", true);
  await assert.rejects(
    asRole("authenticated", U_MGR_A, () =>
      q(`SELECT public.care_appointment_command('CONFIRM', jsonb_build_object('id','${id}'), '${KEY(1012)}')`)),
    /APPOINTMENT_TERMINAL/);
  const row = await q(`SELECT state, cancellation_reason FROM public.care_appointments WHERE id='${id}'`);
  assert.equal(row.rows[0].state, "CANCELLED");
  assert.equal(row.rows[0].cancellation_reason, "patient request");
});

test("full path REQUESTED→CONFIRMED→COMPLETED; delete blocked; audit entries written", async () => {
  const r = await book(U_MGR_A, PAT_E, ts(120,10,0), ts(120,10,30), KEY(1013));
  const id = r.rows[0].r.id;
  await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_appointment_command('CONFIRM', jsonb_build_object('id','${id}'), '${KEY(1014)}')`), "aal2", true);
  await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_appointment_command('COMPLETE', jsonb_build_object('id','${id}'), '${KEY(1015)}')`), "aal2", true);
  const row = await q(`SELECT state FROM public.care_appointments WHERE id='${id}'`);
  assert.equal(row.rows[0].state, "COMPLETED");
  await assert.rejects(q(`DELETE FROM public.care_appointments WHERE id='${id}'`), /APPOINTMENT_IMMUTABLE/);
  const audit = await q(`SELECT count(*) AS n FROM public.audit_log WHERE entity_type='care_appointments' AND entity_id='${id}'`);
  assert.ok(Number(audit.rows[0].n) >= 3);
});

test("stranger cannot BOOK; cross-org service version rejected; bad key rejected", async () => {
  await assert.rejects(
    book(U_STRANGER, PAT_E, ts(150,10,0), ts(150,10,30), KEY(1016)),
    /FORBIDDEN/);
  await assert.rejects(
    asRole("authenticated", U_MGR_A, () =>
      q(`SELECT public.care_appointment_command('BOOK', jsonb_build_object(
          'patient_id','${PAT_E}','service_version_id','${uuid(999)}',
          'starts_at','+ts(150,10,0)+','ends_at','+ts(150,10,30)+'), '${KEY(1017)}')`)),
    /SERVICE_VERSION_NOT_BOOKABLE/);
  await assert.rejects(
    asRole("authenticated", U_MGR_A, () =>
      q(`SELECT public.care_appointment_command('BOOK', jsonb_build_object(
          'patient_id','${PAT_E}','service_version_id','${SV}',
          'starts_at','+ts(150,10,0)+','ends_at','+ts(150,10,30)+'), 'not-a-uuid')`)),
    /IDEMPOTENCY_KEY_REQUIRED/);
});

test("read scope: owning-org manager sees appointments; stranger sees none; anon denied", async () => {
  const ok = await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT id FROM public.care_appointments WHERE partner_id='${ORG_A}'`));
  assert.ok(ok.rows.length >= 1);
  const no = await asRole("authenticated", U_STRANGER, () =>
    q(`SELECT id FROM public.care_appointments WHERE partner_id='${ORG_A}'`));
  assert.equal(no.rows.length, 0);
  const anonRows = await asRole("anon", null, () =>
    q(`SELECT id FROM public.care_appointments WHERE partner_id='${ORG_A}'`)).catch(() => null);
  assert.ok(anonRows === null || anonRows.rows.length === 0);
});
