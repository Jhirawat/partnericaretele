// Phase 10 (0042): automatic personal prepaid lot grant on confirmed LIVE settlement.
// Real roles, real functions: care_settle flips a prepaid purchase to PAID and the
// database trigger itself creates the lot + append-only GRANT ledger entry.
// Sandbox settlements never grant; non-prepaid payments never grant; grants are
// idempotent; plan mismatches record a finance conflict instead of granting.
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
const U_ADMIN = uuid(4), U_PATIENT = uuid(6);
const PAT = uuid(201);
const SVC = uuid(601);
const PV_COUNT = uuid(701), PV_VALUE = uuid(702), PV_DRAFT = uuid(705);
const PAY_LIVE = uuid(921), PAY_SANDBOX = uuid(922), PAY_PLAIN = uuid(923), PAY_MISMATCH = uuid(924);
const TERMS = uuid(950);

await db.exec(`
INSERT INTO public.partners(id,partner_code,legal_name,display_name) VALUES
 ('${ORG}','ORG-A','Org A','Org A');
INSERT INTO public.user_roles(user_id,role,partner_id,status) VALUES
 ('${U_ADMIN}','SUPER_ADMIN',NULL,'ACTIVE');
INSERT INTO public.patients(id,partner_id,first_name,last_name,auth_user_id) VALUES
 ('${PAT}','${ORG}','Pat','A','${U_PATIENT}');
INSERT INTO public.services(id,partner_id,code,name,category) VALUES
 ('${SVC}','${ORG}','GEN','General','MEDICAL');
INSERT INTO public.care_terms(id,version,settings,active,approved_at,approved_by) VALUES
 ('${TERMS}','v1','{}',true,now(),'${U_ADMIN}');
INSERT INTO public.care_plan_versions(id,plan_code,version,name,price_minor,quota,duration_months,service_coverage,status,unlimited) VALUES
 ('${PV_COUNT}','PACK5',1,'Pack of 5',200000,5,6,'["${SVC}"]','APPROVED',false),
 ('${PV_VALUE}','VALUE50',1,'Value 500',50000,NULL,3,'["${SVC}"]','APPROVED',false),
 ('${PV_DRAFT}','DRAFT',1,'Draft pack',100000,2,6,'["${SVC}"]','DRAFT',false);
INSERT INTO public.care_payments(id,partner_id,patient_id,terms_id,kind,channel,collector,amount_minor,currency,status,provider,provider_environment,snapshot,created_by) VALUES
 ('${PAY_LIVE}','${ORG}','${PAT}','${TERMS}','DIRECT','DIRECT','TEST',200000,'THB','PENDING','STRIPE','live','{"prepaid":true,"plan_version_id":"${PV_COUNT}"}','${U_PATIENT}'),
 ('${PAY_SANDBOX}','${ORG}','${PAT}','${TERMS}','DIRECT','DIRECT','TEST',50000,'THB','PENDING','STRIPE','sandbox','{"prepaid":true,"plan_version_id":"${PV_VALUE}"}','${U_PATIENT}'),
 ('${PAY_PLAIN}','${ORG}','${PAT}','${TERMS}','DIRECT','DIRECT','TEST',50000,'THB','PENDING','STRIPE','live','{}','${U_PATIENT}'),
 ('${PAY_MISMATCH}','${ORG}','${PAT}','${TERMS}','DIRECT','DIRECT','TEST',100000,'THB','PENDING','STRIPE','live','{"prepaid":true,"plan_version_id":"${PV_DRAFT}"}','${U_PATIENT}');
`);

// care_settle is a trusted server function (no role grant); the test runner
// calls it as superuser, exactly as the finance suite does.
const settle = (id, ref) =>
  q(`SELECT public.care_settle($1,$2,$3,$4,'STRIPE') AS r`, [id, ref, "SIGNED_STRIPE_EVENT:evt_" + ref, U_ADMIN]);

const lots = (pay) =>
  asRole("service_role", null, () => q(`SELECT * FROM public.care_personal_lots WHERE payment_id=$1`, [pay]), true);

test("live prepaid settlement auto-grants a COUNT lot with ledger entry", async () => {
  const r = await settle(PAY_LIVE, "cs_live_1");
  assert.equal(r.rows[0].r.status, "PAID");
  const l = await lots(PAY_LIVE);
  assert.equal(l.rows.length, 1);
  assert.equal(l.rows[0].kind, "COUNT");
  assert.equal(l.rows[0].granted_count, 5);
  assert.equal(l.rows[0].plan_version_id, PV_COUNT);
  assert.equal(l.rows[0].patient_id, PAT);
  assert.equal(l.rows[0].environment, "live");
  const led = await asRole("service_role", null, () =>
    q(`SELECT * FROM public.care_personal_ledger WHERE lot_id=$1 AND type='GRANT'`, [l.rows[0].id]), true);
  assert.equal(led.rows.length, 1);
  assert.equal(led.rows[0].idempotency_key, `care:auto-grant:${PAY_LIVE}`);
  // Patient can read their own balance through the scoped DTO.
  const bal = await asRole("authenticated", U_PATIENT, () =>
    q(`SELECT public.care_personal_balance($1) AS b`, [PAT]));
  assert.equal(bal.rows[0].b[0].count_available, 5);
});

test("settlement replay does not double-grant", async () => {
  const r = await settle(PAY_LIVE, "cs_live_1");
  assert.equal(r.rows[0].r.status, "PAID");
  const l = await lots(PAY_LIVE);
  assert.equal(l.rows.length, 1);
});

test("sandbox settlement never grants a lot", async () => {
  await settle(PAY_SANDBOX, "cs_sbx_1");
  const l = await lots(PAY_SANDBOX);
  assert.equal(l.rows.length, 0);
  const bal = await asRole("authenticated", U_PATIENT, () =>
    q(`SELECT public.care_personal_balance($1) AS b`, [PAT]));
  assert.equal(bal.rows[0].b.every((l) => l.minor_available === 0), true);
});

test("non-prepaid live payment settles without granting", async () => {
  await settle(PAY_PLAIN, "cs_plain_1");
  const l = await lots(PAY_PLAIN);
  assert.equal(l.rows.length, 0);
});

test("plan mismatch records a finance conflict instead of granting", async () => {
  const r = await settle(PAY_MISMATCH, "cs_mm_1");
  assert.equal(r.rows[0].r.status, "PAID");
  const l = await lots(PAY_MISMATCH);
  assert.equal(l.rows.length, 0);
  const c = await asRole("service_role", null, () =>
    q(`SELECT * FROM public.integration_conflicts WHERE conflict_type='CARE_PREPAID_AUTO_GRANT_FAILED'`), true);
  assert.equal(c.rows.length, 1);
});
