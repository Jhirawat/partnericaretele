import test from "node:test";
import assert from "node:assert/strict";
import { createTestDb, actor, command, uuid } from "./care-db.mjs";

// Partner credit lifecycle invariants: intake -> accept (reserve) ->
// complete (consume once) / cancel / failure (release). Synthetic data only.
const ADMIN = uuid(900), OWNER = uuid(901), FINANCE = uuid(902), DOCTOR = uuid(903);
const ORG = uuid(910), P = uuid(920), PD = uuid(921), D = uuid(930);

test("partner credit lifecycle invariants", async (t) => {
  const db = await createTestDb();
  t.after(() => db.close());
  await db.exec(`INSERT INTO auth.users(id,email) VALUES ${[ADMIN, OWNER, FINANCE, DOCTOR].map((u, i) => `('${u}','lc${i}@example.invalid')`).join(",")};
 INSERT INTO partners(id,partner_code,legal_name,display_name,status) VALUES('${ORG}','LC','Synthetic LC','Synthetic LC','ACTIVE');
 INSERT INTO user_roles(user_id,role,partner_id) VALUES('${ADMIN}','SUPER_ADMIN',null),('${OWNER}','PARTNER_OWNER','${ORG}'),('${FINANCE}','FINANCE_ADMIN',null),('${DOCTOR}','DOCTOR',null);
 INSERT INTO patients(id,partner_id,first_name,last_name,email) VALUES('${P}','${ORG}','Lc','One','lc1@example.invalid'),('${PD}','${ORG}','Lc','Direct','lc2@example.invalid');
 INSERT INTO doctors(id,auth_user_id,full_name,license_number,status) VALUES('${D}','${DOCTOR}','Synthetic clinician','TEST_ONLY','ACTIVE');
 INSERT INTO patient_consents(patient_id,recorded_by) VALUES('${P}','${OWNER}'),('${PD}','${OWNER}');`);
  const login = async (u, aal = "aal2") => {
    await db.exec("RESET ROLE");
    await actor(db, u, aal);
    await db.exec("SET ROLE authenticated");
  };
  const inspect = async (sql, params = []) => {
    await db.exec("RESET ROLE");
    return (await db.query(sql, params)).rows;
  };
  const balance = async () => (await inspect("SELECT credit_balance FROM partners WHERE id=$1", [ORG]))[0].credit_balance;
  const txns = async (id) =>
    (await inspect("SELECT type::text FROM credit_transactions WHERE consultation_id=$1 ORDER BY created_at", [id])).map((r) => r.type);
  const audits = async (id) =>
    await inspect("SELECT action, actor_user_id, metadata FROM audit_log WHERE entity_type='care_coverage' AND entity_id=$1 ORDER BY created_at, action", [id]);
  const intake = async (args) => {
    await login(OWNER);
    return (await command(db, "INTAKE", { partnerId: ORG, patientId: P, kind: "PARTNER", ...args })).id;
  };
  const assign = async (id) => {
    await login(ADMIN);
    await db.query("SELECT care_support_command($1,$2::jsonb,$3)", ["ASSIGN", JSON.stringify({ id, doctorId: D }), crypto.randomUUID()]);
  };

  // Synthetic approved terms + 3 opening credit units.
  await login(ADMIN);
  const row = (await inspect("SELECT settings FROM care_terms LIMIT 1"))[0];
  await login(ADMIN);
  const terms = (await command(db, "SAVE_TERMS", { version: "LC_SYNTHETIC", settings: {
    ...row.settings, terms_approved: true, tax_approved: true, refund_approved: true, no_show_approved: true,
    hold_expiry_approved: true, cancel_approved: true, technical_failure_approved: true,
    tax_snapshot: { classification: "SYNTHETIC_ONLY" }, terms_reference: "TEST_ONLY", refund_policy: "FULL_UNUSED_ONLY",
    manual_clinical_enabled: true, standard_hours: { start: 0, end: 24, days: [1, 2, 3, 4, 5, 6, 7] }, standard_hours_approved: true,
  } })).id;
  await command(db, "ACTIVATE_TERMS", { id: terms, reference: "LC_REVIEW" });
  await command(db, "RECONCILE_ORG", { partnerId: ORG, expectedLegacyBalance: 0, approvedOpeningUnits: 3,
    openingExpiresAt: new Date(Date.now() + 86400000 * 100).toISOString(), reference: "LC_OPEN", reason: "Synthetic opening" });
  assert.equal(await balance(), 3);

  await t.test("intake never reserves or deducts", async () => {
    const id = await intake({});
    assert.equal(await balance(), 3);
    assert.deepEqual(await txns(id), []);
    assert.equal((await inspect("SELECT count(*)::int n FROM care_holds WHERE consultation_id=$1", [id]))[0].n, 0);
    await login(OWNER);
    await command(db, "CANCEL", { id, reason: "Synthetic cleanup" });
    assert.equal(await balance(), 3);
  });

  await t.test("intake rejects unknown kinds and coverage without its source", async () => {
    await assert.rejects(intake({ kind: "FREE" }), /INVALID_COVERAGE/);
    await assert.rejects(intake({ kind: "ANNUAL" }), /ANNUAL_MEMBERSHIP_REQUIRED/);
    await assert.rejects(intake({ kind: "DIRECT", patientId: PD }), /DIRECT_PAYMENT_REQUIRED/);
    await assert.rejects(intake({ kind: "PARTNER", membershipId: uuid(1) }), /WRONG_ENCOUNTER_KIND/);
  });

  let done;
  await t.test("accept reserves exactly one; retries and new keys stay idempotent", async () => {
    done = await intake({});
    await login(OWNER);
    await command(db, "ACCEPT", { id: done }, "lc-accept-key-1");
    await command(db, "ACCEPT", { id: done }, "lc-accept-key-1");
    await command(db, "ACCEPT", { id: done }, "lc-accept-key-2");
    await Promise.allSettled([command(db, "ACCEPT", { id: done }), command(db, "ACCEPT", { id: done })]);
    assert.equal(await balance(), 2);
    assert.deepEqual(await txns(done), ["RESERVE"]);
  });

  await t.test("completion consumes the reservation exactly once", async () => {
    await assign(done);
    await login(DOCTOR);
    await command(db, "START", { id: done, reference: "LC_START" });
    await command(db, "COMPLETE", { id: done, reference: "LC_DONE" }, "lc-complete-1");
    await command(db, "COMPLETE", { id: done, reference: "LC_DONE" }, "lc-complete-1");
    await command(db, "COMPLETE", { id: done, reference: "LC_DONE" }, "lc-complete-2");
    assert.equal(await balance(), 2);
    assert.deepEqual(await txns(done), ["RESERVE", "CONSUME"]);
    assert.equal((await inspect("SELECT state FROM care_holds WHERE consultation_id=$1", [done]))[0].state, "CONSUMED");
    await login(OWNER);
    await assert.rejects(command(db, "CANCEL", { id: done, reason: "too late" }), /CANNOT_CANCEL_AFTER_START/);
    assert.deepEqual(await txns(done), ["RESERVE", "CONSUME"]);
  });

  await t.test("cancellation and technical failure release without consuming", async () => {
    const c = await intake({});
    await login(OWNER);
    await command(db, "ACCEPT", { id: c });
    assert.equal(await balance(), 1);
    await command(db, "CANCEL", { id: c, reason: "Partner rejected" });
    await command(db, "CANCEL", { id: c, reason: "Partner rejected" });
    assert.equal(await balance(), 2);
    assert.deepEqual(await txns(c), ["RESERVE", "RELEASE"]);

    const f = await intake({});
    await login(OWNER);
    await command(db, "ACCEPT", { id: f });
    await assign(f);
    await login(DOCTOR);
    await command(db, "START", { id: f, reference: "LC_START_F" });
    await command(db, "TECHNICAL_FAILURE", { id: f, reference: "LC_FAIL", reason: "Video dropped" });
    assert.equal(await balance(), 2);
    assert.deepEqual(await txns(f), ["RESERVE", "RELEASE"]);
    await assert.rejects(command(db, "COMPLETE", { id: f, reference: "LC_X" }), /INVALID_COMPLETION_STATE/);
  });

  await t.test("balance cannot go negative; last unit goes to exactly one request", async () => {
    const a = await intake({}), b = await intake({}), c = await intake({});
    await login(OWNER);
    const r = await Promise.allSettled([a, b, c].map((id) => command(db, "ACCEPT", { id })));
    assert.equal(r.filter((x) => x.status === "fulfilled").length, 2);
    assert.match(String(r.find((x) => x.status === "rejected").reason), /INSUFFICIENT_CREDITS/);
    assert.equal(await balance(), 0);
    for (const id of [a, b, c]) {
      await login(OWNER);
      await command(db, "CANCEL", { id, reason: "Synthetic cleanup" });
    }
    assert.equal(await balance(), 2);
  });

  await t.test("DIRECT payment never touches partner credits or entitlements", async () => {
    await login(FINANCE);
    const pay = (await command(db, "CREATE_PAYMENT", { partnerId: ORG, patientId: PD, kind: "DIRECT", channel: "DIRECT" })).id;
    await command(db, "VERIFY_PAYMENT", { id: pay, reference: "LC_DIRECT_BANK", evidence: "LC_DIRECT_VERIFIED" });
    const id = await intake({ kind: "DIRECT", patientId: PD, paymentId: pay });
    await login(OWNER);
    await command(db, "ACCEPT", { id });
    await assign(id);
    await login(DOCTOR);
    await command(db, "START", { id, reference: "LC_D_START" });
    await command(db, "COMPLETE", { id, reference: "LC_D_DONE" });
    assert.equal(await balance(), 2);
    assert.deepEqual(await txns(id), []);
    assert.equal((await inspect("SELECT count(*)::int n FROM care_annual_usage WHERE consultation_id=$1", [id]))[0].n, 0);
    const au = await audits(id);
    assert.deepEqual(au.map((x) => x.metadata.coverage), ["DIRECT", "DIRECT"]);
    assert.ok(au.every((x) => x.metadata.credit_units === 0));
  });

  await t.test("every reserve/consume/release is audited with balances, reason, reference and actor", async () => {
    const a = await audits(done);
    assert.deepEqual(a.map((x) => x.action), ["COVERAGE_RESERVE", "COVERAGE_CONSUME"]);
    const [res, con] = a;
    assert.equal(res.actor_user_id, OWNER);
    assert.equal(con.actor_user_id, DOCTOR);
    for (const x of a) {
      assert.equal(x.metadata.coverage, "PARTNER");
      assert.equal(x.metadata.credit_units, 1);
      assert.ok(x.metadata.reason, "reason");
      assert.ok(x.metadata.idempotency_key, "key");
      assert.equal(typeof x.metadata.balance_before, "number");
      assert.equal(typeof x.metadata.balance_after, "number");
    }
    assert.equal(res.metadata.balance_after, res.metadata.balance_before - 1);
    assert.equal(con.metadata.balance_after, con.metadata.balance_before); // reserved unit becomes used
    assert.equal(con.metadata.reference, "LC_DONE");
    const rel = (await inspect("SELECT metadata FROM audit_log WHERE action='COVERAGE_RELEASE' AND entity_type='care_coverage' ORDER BY created_at LIMIT 1"))[0].metadata;
    assert.equal(rel.balance_after, rel.balance_before + 1);
    assert.equal(rel.reason, "Partner rejected");
    // Clients cannot forge or erase the trail.
    await login(OWNER);
    await assert.rejects(db.query("INSERT INTO audit_log(action,entity_type,entity_id) VALUES('COVERAGE_RESERVE','care_coverage','x')"), /permission denied|row-level security/);
  });
});
