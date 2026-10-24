// Phase 06: subscription entitlement boundaries — real roles, real functions.
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
const PAT = uuid(201);
const SVC_COVERED = uuid(601), SVC_OTHER = uuid(602);
const PV_MANUAL = uuid(701), PV_AUTO = uuid(702);
const M1 = uuid(801), M2 = uuid(802), M3 = uuid(803), M4 = uuid(804);

await db.exec(`
INSERT INTO public.partners(id,partner_code,legal_name,display_name) VALUES ('${ORG_A}','ORG-A','Org A','Org A');
INSERT INTO public.user_roles(user_id,role,partner_id,status) VALUES
 ('${U_ADMIN}','SUPER_ADMIN',NULL,'ACTIVE'),('${U_MGR_A}','PARTNER_MANAGER','${ORG_A}','ACTIVE');
INSERT INTO public.patients(id,partner_id,first_name,last_name) VALUES ('${PAT}','${ORG_A}','Pat','A');
INSERT INTO public.services(id,partner_id,code,name,category) VALUES
 ('${SVC_COVERED}','${ORG_A}','GEN','General consult','MEDICAL'),
 ('${SVC_OTHER}','${ORG_A}','OTH','Other service','MEDICAL');
INSERT INTO public.membership_plans(id,code,name,price) VALUES
 ('${uuid(901)}','ANNUAL','Annual Care',6000),('${uuid(902)}','AUTO','Auto Care',6000);
INSERT INTO public.care_plan_versions(id,plan_code,version,name,price_minor,quota,service_coverage,auto_renew,status,unlimited) VALUES
 ('${PV_MANUAL}','ANNUAL',1,'Annual Care v1',600000,2,'["${SVC_COVERED}"]',false,'APPROVED',false),
 ('${PV_AUTO}','AUTO',1,'Auto Care v1',600000,NULL,'[]',true,'APPROVED',true);
-- M1: ACTIVE with a paid current manual period (entitled)
INSERT INTO public.memberships(id,patient_id,plan_id,status,starts_at,expires_at,payment_status) VALUES
 ('${M1}','${PAT}','${uuid(901)}','ACTIVE',now()-interval '1 month',now()+interval '11 months','PAID');
INSERT INTO public.care_membership_periods(membership_id,plan_version_id,period_start,period_end,source) VALUES
 ('${M1}','${PV_MANUAL}',now()-interval '1 month',now()+interval '11 months','MANUAL');
-- M2: ACTIVE but no paid period (unpaid)
INSERT INTO public.memberships(id,patient_id,plan_id,status,starts_at,expires_at,payment_status) VALUES
 ('${M2}','${PAT}','${uuid(901)}','ACTIVE',now()-interval '1 month',now()+interval '11 months','UNPAID');
-- M3: expired membership
INSERT INTO public.memberships(id,patient_id,plan_id,status,starts_at,expires_at,payment_status) VALUES
 ('${M3}','${PAT}','${uuid(901)}','ACTIVE',now()-interval '13 months',now()-interval '1 month','PAID');
INSERT INTO public.care_membership_periods(membership_id,plan_version_id,period_start,period_end,source) VALUES
 ('${M3}','${PV_MANUAL}',now()-interval '13 months',now()-interval '1 month','MANUAL');
-- M4: ACTIVE, paid period in the past (pastdue — period ended, not renewed)
INSERT INTO public.memberships(id,patient_id,plan_id,status,starts_at,expires_at,payment_status) VALUES
 ('${M4}','${PAT}','${uuid(901)}','ACTIVE',now()-interval '13 months',now()+interval '1 month','PAID');
INSERT INTO public.care_membership_periods(membership_id,plan_version_id,period_start,period_end,source) VALUES
 ('${M4}','${PV_MANUAL}',now()-interval '13 months',now()-interval '1 month','MANUAL');
`);

// care_entitlement picks the latest ACTIVE membership by expiry; to isolate each
// scenario we point it at distinct patients. Re-create per-scenario patients.
const PAT_UNPAID = uuid(202), PAT_EXPIRED = uuid(203), PAT_PASTDUE = uuid(204);
await db.exec(`
INSERT INTO public.patients(id,partner_id,first_name,last_name) VALUES
 ('${PAT_UNPAID}','${ORG_A}','Pat','U'),('${PAT_EXPIRED}','${ORG_A}','Pat','E'),('${PAT_PASTDUE}','${ORG_A}','Pat','P');
UPDATE public.memberships SET patient_id='${PAT_UNPAID}' WHERE id='${M2}';
UPDATE public.memberships SET patient_id='${PAT_EXPIRED}' WHERE id='${M3}';
UPDATE public.memberships SET patient_id='${PAT_PASTDUE}' WHERE id='${M4}';
`);

test("ACTIVE + paid current period + covered service = entitled (manual source)", async () => {
  const r = await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_entitlement('${PAT}', now(), '${SVC_COVERED}') AS e`));
  assert.equal(r.rows[0].e.entitled, true);
  assert.equal(r.rows[0].e.source, "MANUAL");
  assert.equal(r.rows[0].e.auto_renew, false);
});

test("unpaid membership (no paid period) is not entitled", async () => {
  const r = await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_entitlement('${PAT_UNPAID}', now(), '${SVC_COVERED}') AS e`));
  assert.equal(r.rows[0].e.entitled, false);
  assert.equal(r.rows[0].e.reason, "NO_PAID_PERIOD");
});

test("expired membership is not entitled", async () => {
  const r = await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_entitlement('${PAT_EXPIRED}', now(), '${SVC_COVERED}') AS e`));
  assert.equal(r.rows[0].e.entitled, false);
  assert.equal(r.rows[0].e.reason, "MEMBERSHIP_EXPIRED");
});

test("pastdue (paid period ended, not renewed) is not entitled", async () => {
  const r = await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_entitlement('${PAT_PASTDUE}', now(), '${SVC_COVERED}') AS e`));
  assert.equal(r.rows[0].e.entitled, false);
  assert.equal(r.rows[0].e.reason, "NO_PAID_PERIOD");
});

test("uncovered service is not entitled even with paid period", async () => {
  const r = await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_entitlement('${PAT}', now(), '${SVC_OTHER}') AS e`));
  assert.equal(r.rows[0].e.entitled, false);
  assert.equal(r.rows[0].e.reason, "SERVICE_NOT_COVERED");
});

test("quota exhaustion: 2 consumed in period blocks the 3rd; period rollover resets the count", async () => {
  for (const n of [1, 2]) {
    const CON = uuid(300 + n);
    await q(`INSERT INTO public.consultations(id,partner_id,patient_id,status) VALUES ('${CON}','${ORG_A}','${PAT}','COMPLETED')`);
    await q(`INSERT INTO public.care_annual_usage(membership_id,consultation_id,action) VALUES ('${M1}','${CON}','CONSUME')`);
  }
  let r = await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_entitlement('${PAT}', now(), '${SVC_COVERED}') AS e`));
  assert.equal(r.rows[0].e.entitled, false);
  assert.equal(r.rows[0].e.reason, "QUOTA_EXHAUSTED");
  assert.equal(r.rows[0].e.used, 2);
  // Renewal: new paid period starting now — consumed history is NOT reset,
  // but the new period's window contains no consumption yet.
  await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_record_period('${M1}','${PV_MANUAL}', now(), now()+interval '12 months', NULL)`), "aal2", true);
  r = await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_entitlement('${PAT}', now(), '${SVC_COVERED}') AS e`));
  assert.equal(r.rows[0].e.entitled, true);
  assert.equal(r.rows[0].e.used, 0);
  const hist = await q(`SELECT count(*) AS n FROM public.care_annual_usage WHERE membership_id='${M1}' AND action='CONSUME'`);
  assert.equal(Number(hist.rows[0].n), 2);
});

test("plan versions are immutable once approved; direct writes denied", async () => {
  await assert.rejects(
    q(`UPDATE public.care_plan_versions SET price_minor=1 WHERE id='${PV_MANUAL}'`),
    /PLAN_VERSION_IMMUTABLE/);
  await assert.rejects(
    asRole("authenticated", U_ADMIN, () =>
      q(`INSERT INTO public.care_plan_versions(plan_code,version,name,price_minor) VALUES ('X',1,'x',1)`)),
    /permission denied/);
});

test("record_period requires owning-org manager or admin + MFA; stranger denied", async () => {
  await assert.rejects(
    asRole("authenticated", U_STRANGER, () =>
      q(`SELECT public.care_record_period('${M1}','${PV_MANUAL}', now(), now()+interval '1 year', NULL)`)),
    /FORBIDDEN/);
  await assert.rejects(
    asRole("authenticated", U_MGR_A, () =>
      q(`SELECT public.care_record_period('${M1}','${PV_MANUAL}', now(), now()+interval '1 year', NULL)`), "aal1"),
    /MFA|STRONG|AAL/i);
});

test("duplicate period start for the same membership is rejected (uniqueness)", async () => {
  await assert.rejects(
    q(`INSERT INTO public.care_membership_periods(membership_id,plan_version_id,period_start,period_end,source)
       SELECT membership_id, plan_version_id, period_start, period_end, 'MANUAL'
       FROM public.care_membership_periods WHERE membership_id='${M1}' LIMIT 1`),
    /duplicate key/);
});

test("periods read scope: owning-org manager sees them; stranger sees none", async () => {
  const ok = await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT id FROM public.care_membership_periods WHERE membership_id='${M1}'`));
  assert.ok(ok.rows.length >= 1);
  const no = await asRole("authenticated", U_STRANGER, () =>
    q(`SELECT id FROM public.care_membership_periods WHERE membership_id='${M1}'`));
  assert.equal(no.rows.length, 0);
});
