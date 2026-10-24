// Phase 09 (0041): patient self-service video-session booking — real roles,
// real functions. The database derives patient, organisation and entitlement
// from the verified session; the client can only pick a service and a window.
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

const ORG_A = uuid(101), ORG_B = uuid(102);
const U_ADMIN = uuid(4), U_PATIENT = uuid(6), U_STRANGER = uuid(1);
const PAT = uuid(201), PAT_B = uuid(203);
const SVC = uuid(601);
const SV = uuid(651), SV_DRAFT = uuid(653), SV_B = uuid(654);
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
 ('${ORG_A}','ORG-A','Org A','Org A'),('${ORG_B}','ORG-B','Org B','Org B');
INSERT INTO public.user_roles(user_id,role,partner_id,status) VALUES
 ('${U_ADMIN}','SUPER_ADMIN',NULL,'ACTIVE');
INSERT INTO public.patients(id,partner_id,first_name,last_name,auth_user_id) VALUES
 ('${PAT}','${ORG_A}','Pat','A','${U_PATIENT}'),('${PAT_B}','${ORG_B}','Pat','B',NULL);
INSERT INTO public.services(id,partner_id,code,name,category) VALUES
 ('${SVC}','${ORG_A}','GEN','General','MEDICAL');
INSERT INTO public.care_service_versions(id,partner_id,service_id,version,name,price_minor,status) VALUES
 ('${SV}','${ORG_A}','${SVC}',1,'General v1',50000,'APPROVED'),
 ('${SV_DRAFT}','${ORG_A}','${SVC}',2,'General draft',60000,'DRAFT'),
 ('${SV_B}','${ORG_B}','${SVC}',1,'Other org v1',50000,'APPROVED');
INSERT INTO public.care_terms(id,version,settings,active,approved_at,approved_by) VALUES
 ('${TERMS}','v1','{}',true,now(),'${U_ADMIN}');
INSERT INTO public.care_plan_versions(id,plan_code,version,name,price_minor,quota,service_coverage,status,unlimited) VALUES
 ('${PV}','PACK5',1,'Pack of 5',200000,5,'["${SVC}"]','APPROVED',false);
`);

const book = (sub, sv, key, days = 5, commit = true) =>
  asRole("authenticated", sub, () =>
    q(`SELECT public.care_patient_book('${sv}', '${ts(days)}', '${ts(days, 10, 30)}', '${key}') AS r`),
    "aal2", commit);

test("care_my_catalog returns only the caller's own organisation catalog", async () => {
  const own = await asRole("authenticated", U_PATIENT, () =>
    q(`SELECT public.care_my_catalog() AS c`));
  const catalog = own.rows[0].c;
  assert.ok(Array.isArray(catalog));
  assert.ok(catalog.some((v) => v.id === SV));
  assert.ok(!catalog.some((v) => v.id === SV_DRAFT)); // drafts never exposed
  assert.ok(!catalog.some((v) => v.id === SV_B)); // other tenant never exposed
  // Stranger with no linked patient gets an empty catalog, not an error leak
  const none = await asRole("authenticated", U_STRANGER, () =>
    q(`SELECT public.care_my_catalog() AS c`));
  assert.deepEqual(none.rows[0].c, []);
});

test("patient with entitlement books own appointment; row is REQUESTED and scoped to own org", async () => {
  // Fund the patient: live verified payment + GRANT of a COUNT lot
  const pay = uuid(901);
  await q(`INSERT INTO public.care_payments(id,partner_id,patient_id,terms_id,kind,channel,collector,amount_minor,currency,status,provider_environment,snapshot,created_by)
    VALUES ('${pay}','${ORG_A}','${PAT}','${TERMS}','DIRECT','DIRECT','TEST',200000,'THB','PAID','live','{"plan_version_id":"${PV}"}','${U_ADMIN}')`);
  await asRole("service_role", null, () =>
    q(`SELECT public.care_personal_command('GRANT', jsonb_build_object('payment_id','${pay}'), '${KEY(4001)}', '${U_ADMIN}')`),
    "service_role", true);

  const r = await book(U_PATIENT, SV, KEY(4002));
  const id = r.rows[0].r.id;
  assert.equal(r.rows[0].r.state, "REQUESTED");
  const row = await asRole("authenticated", U_PATIENT, () =>
    q(`SELECT partner_id, patient_id, payment_state, video_state, created_by FROM public.care_appointments WHERE id='${id}'`));
  assert.equal(row.rows[0].partner_id, ORG_A);
  assert.equal(row.rows[0].patient_id, PAT);
  assert.equal(row.rows[0].payment_state, "RESERVED"); // Phase 12: prepaid lot reserved at booking
  assert.equal(row.rows[0].video_state, "NONE"); // video stays off until staff opens a room
  assert.equal(row.rows[0].created_by, U_PATIENT);
  const audit = await q(`SELECT action FROM public.audit_log WHERE entity_id='${id}'`);
  assert.equal(audit.rows[0].action, "APPOINTMENT_PATIENT_BOOK");
  // Clean up the reservation so the entitlement test below starts fresh
  await asRole("authenticated", U_ADMIN, () =>
    q(`SELECT public.care_appointment_command('CANCEL', jsonb_build_object('id','${id}'), '${KEY(4099)}')`),
    "aal2", true);
});

test("patient without entitlement is refused (ENTITLEMENT_REQUIRED)", async () => {
  // Exhaust every lot so no entitlement remains
  await q(`UPDATE public.care_personal_lots SET used_count=granted_count, used_minor=granted_minor`);
  await assert.rejects(book(U_PATIENT, SV, KEY(4003)), /ENTITLEMENT_REQUIRED|NO_ELIGIBLE_LOT/);
  await q(`UPDATE public.care_personal_lots SET used_count=0, used_minor=0`);
});

test("stranger without a linked patient record cannot book", async () => {
  await assert.rejects(book(U_STRANGER, SV, KEY(4004)), /PATIENT_NOT_LINKED/);
});

test("anonymous caller cannot book or read the catalog", async () => {
  await assert.rejects(
    asRole("anon", null, () =>
      q(`SELECT public.care_patient_book('${SV}', '${ts(5)}', '${ts(5, 10, 30)}', '${KEY(4005)}')`)),
    /AUTHENTICATION_REQUIRED|permission denied/);
  await assert.rejects(
    asRole("anon", null, () => q(`SELECT public.care_my_catalog()`)),
    /AUTHENTICATION_REQUIRED|permission denied/);
});

test("draft, cross-tenant and unknown service versions are rejected", async () => {
  await assert.rejects(book(U_PATIENT, SV_DRAFT, KEY(4006)), /SERVICE_VERSION_NOT_BOOKABLE/);
  await assert.rejects(book(U_PATIENT, SV_B, KEY(4007)), /CROSS_TENANT_BOOKING/);
  await assert.rejects(book(U_PATIENT, uuid(999), KEY(4008)), /SERVICE_VERSION_NOT_BOOKABLE/);
});

test("past and inverted windows are rejected; idempotency key is enforced", async () => {
  await assert.rejects(
    asRole("authenticated", U_PATIENT, () =>
      q(`SELECT public.care_patient_book('${SV}', now()-interval '1 hour', now()+interval '30 minutes', '${KEY(4009)}')`)),
    /INVALID_WINDOW/);
  await assert.rejects(
    asRole("authenticated", U_PATIENT, () =>
      q(`SELECT public.care_patient_book('${SV}', '${ts(6, 11)}', '${ts(6, 10)}', '${KEY(4010)}')`)),
    /INVALID_WINDOW/);
  await assert.rejects(
    asRole("authenticated", U_PATIENT, () =>
      q(`SELECT public.care_patient_book('${SV}', '${ts(6)}', '${ts(6, 10, 30)}', 'not-a-uuid')`)),
    /IDEMPOTENCY_KEY_REQUIRED/);
  // Reusing a key from a successful booking conflicts at the unique constraint
  const first = await book(U_PATIENT, SV, KEY(4011), 7);
  assert.ok(first.rows[0].r.id);
  await assert.rejects(book(U_PATIENT, SV, KEY(4011), 8), /duplicate key|care_appointments_idempotency_key_key/);
});
