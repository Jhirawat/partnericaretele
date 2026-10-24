// Phase 07 (hardened, 0038): personal prepaid COUNT/VALUE ledger — real roles,
// real functions. Financial commands are service_role-only with an explicit
// verified actor; authenticated clients only get the scoped balance DTO.
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
const U_ADMIN = uuid(4), U_MGR_A = uuid(2), U_STRANGER = uuid(1), U_PATIENT = uuid(6), U_DOC = uuid(7);
const PAT = uuid(201), PAT_OTHER = uuid(202);
const DOC_A = uuid(401), DOC_B = uuid(403);
const SVC = uuid(601), SVC2 = uuid(602);
const SV = uuid(651), SV2 = uuid(652);
const PV_COUNT = uuid(701), PV_VALUE = uuid(702), PV_SANDBOX = uuid(703), PV_COUNT_B = uuid(704);
const PAY_COUNT = uuid(901), PAY_VALUE = uuid(902), PAY_SANDBOX = uuid(903), PAY_WRONG = uuid(904);
const PAY_NULLENV = uuid(907), PAY_UNBOUND = uuid(908), PAY_SAMEPRICE = uuid(909), PAY_PENDING = uuid(910);
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
 ('${U_ADMIN}','SUPER_ADMIN',NULL,'ACTIVE'),('${U_MGR_A}','PARTNER_MANAGER','${ORG_A}','ACTIVE');
INSERT INTO public.doctors(id,auth_user_id,full_name,license_number,status) VALUES
 ('${DOC_A}','${U_DOC}','Doc A','LIC-1','ACTIVE'),('${DOC_B}',NULL,'Doc B','LIC-3','ACTIVE');
INSERT INTO public.patients(id,partner_id,first_name,last_name,auth_user_id) VALUES
 ('${PAT}','${ORG_A}','Pat','A','${U_PATIENT}'),('${PAT_OTHER}','${ORG_A}','Pat','Other',NULL);
INSERT INTO public.services(id,partner_id,code,name,category) VALUES
 ('${SVC}','${ORG_A}','GEN','General','MEDICAL'),('${SVC2}','${ORG_A}','OTH','Other','MEDICAL');
INSERT INTO public.care_service_versions(id,partner_id,service_id,version,name,price_minor,status) VALUES
 ('${SV}','${ORG_A}','${SVC}',1,'General v1',50000,'APPROVED'),
 ('${SV2}','${ORG_A}','${SVC2}',1,'Other v1',70000,'APPROVED');
INSERT INTO public.care_terms(id,version,settings,active,approved_at,approved_by) VALUES
 ('${TERMS}','v1','{}',true,now(),'${U_ADMIN}');
INSERT INTO public.care_plan_versions(id,plan_code,version,name,price_minor,quota,service_coverage,status,unlimited) VALUES
 ('${PV_COUNT}','PACK5',1,'Pack of 5',200000,5,'["${SVC}"]','APPROVED',false),
 ('${PV_VALUE}','VALUE50',1,'Value 500',50000,NULL,'["${SVC}"]','APPROVED',false),
 ('${PV_SANDBOX}','SBX',1,'Sandbox pack',100000,2,'["${SVC}"]','APPROVED',false),
 ('${PV_COUNT_B}','PACK5B',1,'Pack of 5 B',200000,5,'["${SVC}"]','APPROVED',false);
INSERT INTO public.care_payments(id,partner_id,patient_id,terms_id,kind,channel,collector,amount_minor,currency,status,provider_environment,snapshot,created_by) VALUES
 ('${PAY_COUNT}','${ORG_A}','${PAT}','${TERMS}','DIRECT','DIRECT','TEST',200000,'THB','PAID','live','{"plan_version_id":"${PV_COUNT}"}','${U_ADMIN}'),
 ('${PAY_VALUE}','${ORG_A}','${PAT}','${TERMS}','DIRECT','DIRECT','TEST',50000,'THB','PAID','live','{"plan_version_id":"${PV_VALUE}"}','${U_ADMIN}'),
 ('${PAY_SANDBOX}','${ORG_A}','${PAT}','${TERMS}','DIRECT','DIRECT','TEST',100000,'THB','PAID','sandbox','{"plan_version_id":"${PV_SANDBOX}"}','${U_ADMIN}'),
 ('${PAY_WRONG}','${ORG_A}','${PAT}','${TERMS}','DIRECT','DIRECT','TEST',99999,'THB','PAID','live','{"plan_version_id":"${PV_COUNT}"}','${U_ADMIN}'),
 ('${PAY_NULLENV}','${ORG_A}','${PAT}','${TERMS}','DIRECT','DIRECT','TEST',200000,'THB','PAID',NULL,'{"plan_version_id":"${PV_COUNT}"}','${U_ADMIN}'),
 ('${PAY_UNBOUND}','${ORG_A}','${PAT}','${TERMS}','DIRECT','DIRECT','TEST',200000,'THB','PAID','live','{}','${U_ADMIN}'),
 ('${PAY_SAMEPRICE}','${ORG_A}','${PAT}','${TERMS}','DIRECT','DIRECT','TEST',200000,'THB','PAID','live','{"plan_version_id":"${PV_COUNT_B}"}','${U_ADMIN}'),
 ('${PAY_PENDING}','${ORG_A}','${PAT}','${TERMS}','DIRECT','DIRECT','TEST',200000,'THB','PENDING','live','{"plan_version_id":"${PV_COUNT}"}','${U_ADMIN}');
INSERT INTO public.membership_plans(id,code,name,price) VALUES ('${uuid(951)}','ANNUAL','Annual Care',6000);
INSERT INTO public.care_plan_versions(id,plan_code,version,name,price_minor,quota,service_coverage,status,unlimited) VALUES
 ('${uuid(952)}','ANNUAL',1,'Annual v1',600000,NULL,'["${SVC}","${SVC2}"]','APPROVED',true);
INSERT INTO public.memberships(id,patient_id,plan_id,status,starts_at,expires_at,payment_status) VALUES
 ('${uuid(953)}','${PAT}','${uuid(951)}','ACTIVE',now()-interval '1 month',now()+interval '11 months','PAID');
INSERT INTO public.care_membership_periods(membership_id,plan_version_id,period_start,period_end,source) VALUES
 ('${uuid(953)}','${uuid(952)}',now()-interval '1 month',now()+interval '11 months','MANUAL');
`);

// Server-only command: executed as service_role with an explicit verified actor.
const cmd = (actor, op, args, key, commit = true) =>
  asRole("service_role", actor, () =>
    q(`SELECT public.care_personal_command('${op}', '${JSON.stringify(args)}'::jsonb, '${key}', '${actor}') AS r`), "aal2", commit);

async function bookAppt(key, svcVersion = SV, doctor = null, days = 40) {
  const r = await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_appointment_command('BOOK', jsonb_build_object(
        'patient_id','${PAT}','service_version_id','${svcVersion}',
        'starts_at','${ts(days)}','ends_at','${ts(days, 10, 30)}'${doctor ? `,'doctor_id','${doctor}'` : ""}
      ), '${key}') AS r`), "aal2", true);
  return r.rows[0].r.id;
}
const apptCmd = (op, id, key, doctor = null) =>
  asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_appointment_command('${op}', jsonb_build_object('id','${id}'${doctor ? `,'doctor_id','${doctor}'` : ""}), '${key}')`), "aal2", true);

test("GRANT binds the snapshot package version + verified LIVE payment (COUNT lot)", async () => {
  const r = await cmd(U_ADMIN, "GRANT", { payment_id: PAY_COUNT }, KEY(2001));
  const lot = await q(`SELECT * FROM public.care_personal_lots WHERE id='${r.rows[0].r.id}'`);
  assert.equal(lot.rows[0].kind, "COUNT");
  assert.equal(lot.rows[0].granted_count, 5);
  assert.equal(lot.rows[0].granted_minor, 0);
  assert.equal(lot.rows[0].payment_id, PAY_COUNT);
  assert.equal(lot.rows[0].plan_version_id, PV_COUNT);
  assert.equal(lot.rows[0].environment, "live");
  const led = await q(`SELECT * FROM public.care_personal_ledger WHERE lot_id='${r.rows[0].r.id}' AND type='GRANT'`);
  assert.equal(led.rows.length, 1);
  assert.equal(led.rows[0].balance_count_after, 5);
  assert.ok(led.rows[0].metadata.input_hash);
});

test("GRANT idempotency: same payment or same key+input replays; same key+different input conflicts", async () => {
  const r1 = await cmd(U_ADMIN, "GRANT", { payment_id: PAY_COUNT }, KEY(2002));
  assert.equal(r1.rows[0].r.replayed, true);
  const r2 = await cmd(U_ADMIN, "GRANT", { payment_id: PAY_COUNT }, KEY(2001));
  assert.equal(r2.rows[0].r.replayed, true);
  await assert.rejects(
    cmd(U_ADMIN, "GRANT", { payment_id: PAY_VALUE }, KEY(2001)),
    /IDEMPOTENCY_CONFLICT/);
  const lots = await q(`SELECT count(*) AS n FROM public.care_personal_lots WHERE payment_id='${PAY_COUNT}'`);
  assert.equal(Number(lots.rows[0].n), 1);
});

test("GRANT rejects sandbox, NULL environment, unverified, unbound and mismatched payments", async () => {
  await assert.rejects(cmd(U_ADMIN, "GRANT", { payment_id: PAY_SANDBOX }, KEY(2003)), /ENVIRONMENT_NOT_LIVE/);
  await assert.rejects(cmd(U_ADMIN, "GRANT", { payment_id: PAY_NULLENV }, KEY(2004)), /ENVIRONMENT_NOT_LIVE/);
  await assert.rejects(cmd(U_ADMIN, "GRANT", { payment_id: PAY_PENDING }, KEY(2005)), /PAYMENT_NOT_VERIFIED/);
  await assert.rejects(cmd(U_ADMIN, "GRANT", { payment_id: PAY_UNBOUND }, KEY(2006)), /PAYMENT_PLAN_UNBOUND/);
  await assert.rejects(cmd(U_ADMIN, "GRANT", { payment_id: PAY_WRONG }, KEY(2007)), /PAYMENT_PLAN_MISMATCH/);
  // Wrong same-price package: caller argument disagrees with the snapshot binding
  await assert.rejects(
    cmd(U_ADMIN, "GRANT", { payment_id: PAY_SAMEPRICE, plan_version_id: PV_COUNT }, KEY(2008)),
    /PLAN_BINDING_MISMATCH/);
  // Price match alone is insufficient: snapshot binding is what counts
  const ok = await cmd(U_ADMIN, "GRANT", { payment_id: PAY_SAMEPRICE }, KEY(2009));
  const lot = await q(`SELECT plan_version_id FROM public.care_personal_lots WHERE id='${ok.rows[0].r.id}'`);
  assert.equal(lot.rows[0].plan_version_id, PV_COUNT_B);
  await assert.rejects(cmd(U_MGR_A, "GRANT", { payment_id: PAY_VALUE }, KEY(2010)), /FORBIDDEN/);
});

test("COUNT: reserve then capture by the assigned doctor consumes exactly one assessment", async () => {
  const appt = await bookAppt(KEY(2100), SV, DOC_A);
  await apptCmd("CONFIRM", appt, KEY(2101), DOC_A);
  const res = await cmd(U_MGR_A, "RESERVE", { appointment_id: appt }, KEY(2102));
  assert.equal(res.rows[0].r.type, "RESERVE");
  // Capture before completion is refused even for the doctor
  await assert.rejects(cmd(U_DOC, "CAPTURE", { appointment_id: appt }, KEY(2103)), /APPOINTMENT_NOT_COMPLETED/);
  await apptCmd("COMPLETE", appt, KEY(2104));
  // Ops / patient cannot capture — only the assigned licensed doctor
  await assert.rejects(cmd(U_MGR_A, "CAPTURE", { appointment_id: appt }, KEY(2105)), /ASSIGNED_DOCTOR_REQUIRED/);
  await assert.rejects(cmd(U_PATIENT, "CAPTURE", { appointment_id: appt }, KEY(2106)), /ASSIGNED_DOCTOR_REQUIRED/);
  await assert.rejects(cmd(U_ADMIN, "CAPTURE", { appointment_id: appt }, KEY(2107)), /ASSIGNED_DOCTOR_REQUIRED/);
  const cap = await cmd(U_DOC, "CAPTURE", { appointment_id: appt }, KEY(2108));
  assert.equal(cap.rows[0].r.type, "CAPTURE");
  const lot = await q(`SELECT used_count FROM public.care_personal_lots WHERE payment_id='${PAY_COUNT}'`);
  assert.equal(lot.rows[0].used_count, 1);
  // A different key cannot recapture the consumed hold
  await assert.rejects(cmd(U_DOC, "CAPTURE", { appointment_id: appt }, KEY(2109)), /NO_ACTIVE_HOLD/);
});

test("VALUE: grant binds full immutable service price; capture takes the whole amount, never partial", async () => {
  const g = await cmd(U_ADMIN, "GRANT", { payment_id: PAY_VALUE }, KEY(2200));
  const lot = await q(`SELECT * FROM public.care_personal_lots WHERE id='${g.rows[0].r.id}'`);
  assert.equal(lot.rows[0].kind, "VALUE");
  assert.equal(lot.rows[0].granted_minor, 50000);
  await q(`UPDATE public.care_personal_lots SET expires_at=now()-interval '1 day' WHERE id<>'${g.rows[0].r.id}'`);
  const appt = await bookAppt(KEY(2201), SV, DOC_A);
  await cmd(U_MGR_A, "RESERVE", { appointment_id: appt }, KEY(2202));
  await apptCmd("CONFIRM", appt, KEY(2203), DOC_A);
  await apptCmd("COMPLETE", appt, KEY(2204));
  await cmd(U_DOC, "CAPTURE", { appointment_id: appt }, KEY(2205));
  const after = await q(`SELECT used_minor FROM public.care_personal_lots WHERE id='${g.rows[0].r.id}'`);
  assert.equal(after.rows[0].used_minor, 50000);
  const appt2 = await bookAppt(KEY(2206), SV, DOC_A);
  await assert.rejects(cmd(U_MGR_A, "RESERVE", { appointment_id: appt2 }, KEY(2207)), /NO_ELIGIBLE_LOT|INSUFFICIENT_BALANCE/);
  await q(`UPDATE public.care_personal_lots SET expires_at=now()+interval '6 months'`);
});

test("coverage-aware FEFO: an exhausted earliest COUNT lot does not block a funded later lot", async () => {
  // Exhaust the earliest (PAY_COUNT) lot; the PV_COUNT_B lot remains funded.
  await q(`UPDATE public.care_personal_lots SET used_count=granted_count WHERE payment_id='${PAY_COUNT}'`);
  const appt = await bookAppt(KEY(2250), SV, DOC_A);
  const res = await cmd(U_MGR_A, "RESERVE", { appointment_id: appt }, KEY(2251));
  const funded = await q(`SELECT payment_id FROM public.care_personal_lots WHERE id='${res.rows[0].r.lot_id}'`);
  assert.equal(funded.rows[0].payment_id, PAY_SAMEPRICE);
  await apptCmd("CANCEL", appt, KEY(2252));
  await cmd(U_MGR_A, "RELEASE", { appointment_id: appt }, KEY(2253));
  await q(`UPDATE public.care_personal_lots SET used_count=1 WHERE payment_id='${PAY_COUNT}'`);
});

test("RELEASE is policy-driven: denied during active care, allowed after cancellation", async () => {
  const appt = await bookAppt(KEY(2300), SV, DOC_A);
  await cmd(U_MGR_A, "RESERVE", { appointment_id: appt }, KEY(2301));
  // Active care: release denied for everyone, including ops
  await assert.rejects(cmd(U_MGR_A, "RELEASE", { appointment_id: appt }, KEY(2302)), /RELEASE_NOT_ALLOWED/);
  await assert.rejects(cmd(U_PATIENT, "RELEASE", { appointment_id: appt }, KEY(2303)), /FORBIDDEN|RELEASE_NOT_ALLOWED/);
  await apptCmd("CANCEL", appt, KEY(2304));
  const rel = await cmd(U_MGR_A, "RELEASE", { appointment_id: appt }, KEY(2305));
  assert.equal(rel.rows[0].r.type, "RELEASE");
  const avail = await q(`SELECT * FROM public.care_personal_lot_available(
      (SELECT id FROM public.care_personal_lots WHERE payment_id='${PAY_COUNT}')) a`);
  assert.equal(avail.rows[0].count_available, 4); // 5 granted - 1 captured
  const chk = await q(`SELECT bool_and(used_count<=granted_count AND used_minor<=granted_minor) AS ok
    FROM public.care_personal_lots`);
  assert.equal(chk.rows[0].ok, true);
});

test("expired lots and lots expiring before the appointment start are never eligible", async () => {
  await q(`UPDATE public.care_personal_lots SET expires_at=now()-interval '1 day'`);
  const appt = await bookAppt(KEY(2400), SV, DOC_A);
  await assert.rejects(cmd(U_MGR_A, "RESERVE", { appointment_id: appt }, KEY(2401)), /NO_ELIGIBLE_LOT/);
  // Lot valid NOW but expired at the appointment start (40 days out)
  await q(`UPDATE public.care_personal_lots SET expires_at=now()+interval '5 days'`);
  await assert.rejects(cmd(U_MGR_A, "RESERVE", { appointment_id: appt }, KEY(2402)), /NO_ELIGIBLE_LOT/);
  await q(`UPDATE public.care_personal_lots SET expires_at=now()+interval '6 months'`);
});

test("service restriction from the trusted snapshot: bound lot not eligible for another service", async () => {
  await q(`INSERT INTO public.care_payments(id,partner_id,patient_id,terms_id,kind,channel,collector,amount_minor,currency,status,provider_environment,snapshot,created_by)
    VALUES ('${uuid(906)}','${ORG_A}','${PAT}','${TERMS}','DIRECT','DIRECT','TEST',200000,'THB','PAID','live','{"plan_version_id":"${PV_COUNT}","service_id":"${SVC}"}','${U_ADMIN}')`);
  await cmd(U_ADMIN, "GRANT", { payment_id: uuid(906) }, KEY(2502));
  const bound = await q(`SELECT service_id FROM public.care_personal_lots WHERE payment_id='${uuid(906)}'`);
  assert.equal(bound.rows[0].service_id, SVC);
  await q(`UPDATE public.care_personal_lots SET expires_at=now()-interval '1 day' WHERE payment_id<>'${uuid(906)}'`);
  const appt = await bookAppt(KEY(2500), SV2, DOC_A);
  await assert.rejects(cmd(U_MGR_A, "RESERVE", { appointment_id: appt }, KEY(2501)), /NO_ELIGIBLE_LOT/);
  await q(`UPDATE public.care_personal_lots SET expires_at=now()+interval '6 months'`);
  // Tenant + currency restrictions on the eligibility function itself (service role)
  const elig = await asRole("service_role", U_ADMIN, () =>
    q(`SELECT public.care_personal_eligible('${PAT}','${SVC}',NULL,'${ORG_B}','THB',50000) AS id`));
  assert.equal(elig.rows.length, 0);
  const eligCur = await asRole("service_role", U_ADMIN, () =>
    q(`SELECT public.care_personal_eligible('${PAT}','${SVC}',NULL,'${ORG_A}','USD',50000) AS id`));
  assert.equal(eligCur.rows.length, 0);
});

test("doctor restriction from the trusted snapshot: bound lot not eligible for another doctor", async () => {
  await q(`INSERT INTO public.care_payments(id,partner_id,patient_id,terms_id,kind,channel,collector,amount_minor,currency,status,provider_environment,snapshot,created_by)
    VALUES ('${uuid(905)}','${ORG_A}','${PAT}','${TERMS}','DIRECT','DIRECT','TEST',200000,'THB','PAID','live','{"plan_version_id":"${PV_COUNT}","doctor_id":"${DOC_A}"}','${U_ADMIN}')`);
  await cmd(U_ADMIN, "GRANT", { payment_id: uuid(905) }, KEY(2600));
  await q(`UPDATE public.care_personal_lots SET expires_at=now()-interval '1 day' WHERE payment_id<>'${uuid(905)}'`);
  const appt = await bookAppt(KEY(2601), SV, DOC_B);
  await assert.rejects(cmd(U_MGR_A, "RESERVE", { appointment_id: appt }, KEY(2602)), /NO_ELIGIBLE_LOT/);
  await q(`UPDATE public.care_personal_lots SET expires_at=now()+interval '6 months'`);
});

test("foreign patient cannot reserve against another patient's appointment scope", async () => {
  const appt = await bookAppt(KEY(2650), SV, DOC_A);
  // Stranger has no scope over the appointment at all
  await assert.rejects(cmd(U_STRANGER, "RESERVE", { appointment_id: appt }, KEY(2651)), /FORBIDDEN/);
  await apptCmd("CANCEL", appt, KEY(2652));
});

test("ledger is append-only: UPDATE and DELETE are blocked", async () => {
  await assert.rejects(
    q(`UPDATE public.care_personal_ledger SET quantity=999 RETURNING id`),
    /LEDGER_IMMUTABLE/);
  await assert.rejects(
    q(`DELETE FROM public.care_personal_ledger RETURNING id`),
    /LEDGER_IMMUTABLE/);
});

test("privilege lockdown: anon and authenticated cannot EXECUTE financial functions", async () => {
  await assert.rejects(
    asRole("anon", null, () =>
      q(`SELECT public.care_personal_command('GRANT','{}'::jsonb,'${KEY(2701)}','${U_ADMIN}')`)),
    /permission denied/);
  await assert.rejects(
    asRole("authenticated", U_ADMIN, () =>
      q(`SELECT public.care_personal_command('GRANT','{}'::jsonb,'${KEY(2702)}','${U_ADMIN}')`)),
    /permission denied/);
  await assert.rejects(
    asRole("authenticated", U_ADMIN, () =>
      q(`SELECT public.care_personal_eligible('${PAT}','${SVC}',NULL,'${ORG_A}','THB',50000)`)),
    /permission denied/);
  await assert.rejects(
    asRole("authenticated", U_ADMIN, () =>
      q(`SELECT * FROM public.care_personal_lot_available('${uuid(901)}')`)),
    /permission denied/);
  // The retired 3-arg command is denied even to service_role
  await assert.rejects(
    asRole("service_role", U_ADMIN, () =>
      q(`SELECT public.care_personal_command('GRANT','{}'::jsonb,'${KEY(2703)}')`)),
    /permission denied|SERVER_ONLY_USE_ACTOR_COMMAND/);
});

test("scoped balance DTO: patient reads own balance; stranger is denied", async () => {
  const own = await asRole("authenticated", U_PATIENT, () =>
    q(`SELECT public.care_personal_balance('${PAT}') AS b`));
  assert.ok(Array.isArray(own.rows[0].b));
  assert.ok(own.rows[0].b.length >= 1);
  await assert.rejects(
    asRole("authenticated", U_STRANGER, () => q(`SELECT public.care_personal_balance('${PAT}')`)),
    /FORBIDDEN/);
});

// 0039 null-safe guard: an UNCLAIMED patient (auth_user_id NULL) must never be
// readable by a stranger — NULL = auth.uid() is NULL, so the OR chain would be
// NULL, not false, and `IF NOT NULL` would skip the denial without the guard.
test("0039: stranger denied balance of UNCLAIMED patient (auth_user_id NULL)", async () => {
  // Positive control: the unclaimed patient exists in org A
  const chk = await q(`SELECT auth_user_id FROM public.patients WHERE id='${PAT_OTHER}'`);
  assert.equal(chk.rows[0].auth_user_id, null);
  // Stranger in the same org-less scope: denied, not silently allowed
  await assert.rejects(
    asRole("authenticated", U_STRANGER, () => q(`SELECT public.care_personal_balance('${PAT_OTHER}')`)),
    /FORBIDDEN/);
  // Anonymous caller: denied (auth.uid() IS NULL branch)
  await assert.rejects(
    asRole("anon", null, () => q(`SELECT public.care_personal_balance('${PAT_OTHER}')`)),
    /FORBIDDEN|permission denied/);
  // Nonexistent patient: NOT_FOUND, never a silent empty balance
  await assert.rejects(
    asRole("authenticated", U_PATIENT, () => q(`SELECT public.care_personal_balance('${uuid(999)}')`)),
    /NOT_FOUND/);
});

test("0039: owned patient positive control still reads own balance after guard", async () => {
  const own = await asRole("authenticated", U_PATIENT, () =>
    q(`SELECT public.care_personal_balance('${PAT}') AS b`));
  assert.ok(Array.isArray(own.rows[0].b));
  // Partner staff of the patient's org retain legitimate read access
  const staff = await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_personal_balance('${PAT}') AS b`));
  assert.ok(Array.isArray(staff.rows[0].b));
});

test("read scope: patient sees own lots; stranger sees none", async () => {
  const own = await asRole("authenticated", U_PATIENT, () =>
    q(`SELECT id FROM public.care_personal_lots WHERE patient_id='${PAT}'`));
  assert.ok(own.rows.length >= 1);
  const no = await asRole("authenticated", U_STRANGER, () =>
    q(`SELECT id FROM public.care_personal_lots WHERE patient_id='${PAT}'`));
  assert.equal(no.rows.length, 0);
});

// 0040: patient self-service prepaid package purchase (portal UI backend).
test("0040: patient purchases an approved prepaid package; snapshot binds the plan", async () => {
  const r = await asRole("authenticated", U_PATIENT, () =>
    q(`SELECT public.care_prepaid_purchase('${PV_COUNT}') AS r`), "aal2", true);
  const p = r.rows[0].r;
  assert.equal(p.status, "PENDING");
  assert.equal(p.amount_minor, 200000);
  assert.equal(p.plan_version_id, PV_COUNT);
  const row = await asRole("authenticated", U_PATIENT, () =>
    q(`SELECT patient_id, partner_id, kind, channel, collector, amount_minor, snapshot
    FROM public.care_payments WHERE id='${p.id}'`));
  assert.equal(row.rows[0].patient_id, PAT);
  assert.equal(row.rows[0].partner_id, ORG_A);
  assert.equal(row.rows[0].kind, "DIRECT");
  assert.equal(row.rows[0].collector, "THAIKANYA");
  assert.equal(row.rows[0].snapshot.plan_version_id, PV_COUNT);
  assert.equal(row.rows[0].snapshot.prepaid, true);
});

test("0040: stranger without a linked patient record cannot purchase", async () => {
  await assert.rejects(
    asRole("authenticated", U_STRANGER, () =>
      q(`SELECT public.care_prepaid_purchase('${PV_COUNT}')`)),
    /PATIENT_NOT_LINKED/);
});

test("0040: anonymous caller cannot purchase", async () => {
  await assert.rejects(
    asRole("anon", null, () => q(`SELECT public.care_prepaid_purchase('${PV_COUNT}')`)),
    /AUTHENTICATION_REQUIRED|permission denied/);
});

test("0040: draft, unlimited and unknown plans are rejected", async () => {
  await assert.rejects(
    asRole("authenticated", U_PATIENT, () =>
      q(`SELECT public.care_prepaid_purchase('${uuid(952)}')`)),
    /UNLIMITED_NOT_PREPAID/);
  await assert.rejects(
    asRole("authenticated", U_PATIENT, () =>
      q(`SELECT public.care_prepaid_purchase('${uuid(999)}')`)),
    /PLAN_NOT_APPROVED/);
});

test("0040: purchased payment can settle and grant a lot end-to-end (live only)", async () => {
  // Patient buys VALUE package
  const r = await asRole("authenticated", U_PATIENT, () =>
    q(`SELECT public.care_prepaid_purchase('${PV_VALUE}') AS r`), "aal2", true);
  const pid = r.rows[0].r.id;
  // Staff marks the environment live and settles (simulating verified webhook path)
  await q(`UPDATE public.care_payments SET provider='STRIPE', provider_environment='live',
    status='PAID', paid_at=now(), external_reference='evt_0040_${pid}' WHERE id='${pid}'`);
  // Platform staff grants the lot from the trusted snapshot binding
  const g = await asRole("service_role", null, () =>
    q(`SELECT public.care_personal_command('GRANT',
      jsonb_build_object('payment_id','${pid}'), '${KEY(3101)}', '${U_ADMIN}') AS g`), "service_role", true);
  assert.equal(g.rows[0].g.type, "GRANT");
  const bal = await asRole("authenticated", U_PATIENT, () =>
    q(`SELECT public.care_personal_balance('${PAT}') AS b`));
  const lots = bal.rows[0].b;
  assert.ok(lots.some((l) => l.lot_id === g.rows[0].g.id && l.minor_available === 50000));
});
