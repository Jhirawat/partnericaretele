import test from "node:test";
import assert from "node:assert/strict";
import { createTestDb, actor, command, uuid } from "./care-db.mjs";
const ADMIN = uuid(100),
  OWNER = uuid(101),
  FINANCE = uuid(102),
  DOCTOR = uuid(103),
  PATIENT = uuid(104),
  OTHER = uuid(105),
  ORG = uuid(1),
  ORG2 = uuid(2),
  LAST = uuid(3),
  P = uuid(10),
  P2 = uuid(11),
  PL = uuid(12),
  D = uuid(20),
  BR = uuid(30);
test("reviewed care engine, actual PostgreSQL transactions and RLS", async (t) => {
  const db = await createTestDb();
  t.after(() => db.close());
  await db.exec(`INSERT INTO auth.users(id,email) VALUES ${[ADMIN, OWNER, FINANCE, DOCTOR, PATIENT, OTHER].map((u, i) => `('${u}','synthetic${i}@example.invalid')`).join(",")};
 INSERT INTO partners(id,partner_code,legal_name,display_name,status) VALUES('${ORG}','TEST_A','Synthetic A','Synthetic A','ACTIVE'),('${ORG2}','TEST_B','Synthetic B','Synthetic B','ACTIVE'),('${LAST}','TEST_LAST','Last credit','Last credit','ACTIVE');
 INSERT INTO user_roles(user_id,role,partner_id) VALUES('${ADMIN}','SUPER_ADMIN',null),('${OWNER}','PARTNER_OWNER','${ORG}'),('${OWNER}','PARTNER_OWNER','${LAST}'),('${FINANCE}','FINANCE_ADMIN',null),('${DOCTOR}','DOCTOR',null),('${PATIENT}','PATIENT',null),('${OTHER}','PARTNER_OWNER','${ORG2}') ON CONFLICT DO NOTHING;
 INSERT INTO patients(id,partner_id,auth_user_id,first_name,last_name,email,service_reminder_consent) VALUES('${P}','${ORG}','${PATIENT}','Patient','Synthetic','synthetic@example.invalid',true),('${P2}','${ORG2}',null,'Other','Synthetic',null,false),('${PL}','${LAST}',null,'Last','Synthetic',null,false);
 INSERT INTO locations(id,partner_id,code,name) VALUES('${BR}','${ORG}','TEST','Synthetic branch');
 INSERT INTO doctors(id,auth_user_id,full_name,license_number,status) VALUES('${D}','${DOCTOR}','Synthetic clinician','TEST_ONLY','ACTIVE');
 INSERT INTO patient_consents(patient_id,recorded_by) VALUES('${P}','${PATIENT}'),('${PL}','${PATIENT}');`);
  const login = async (u, aal = "aal2") => {
    await db.exec("RESET ROLE");
    await actor(db, u, aal);
    await db.exec("SET ROLE authenticated");
  };
  const inspect = async (sql, params = []) => {
    await db.exec("RESET ROLE");
    return (await db.query(sql, params)).rows;
  };
  const balance = async (org = ORG) =>
    (await inspect("SELECT credit_balance FROM partners WHERE id=$1", [org]))[0].credit_balance;
  let terms, paid, annual, encounter;
  await t.test("proposed settings inactive; partner cannot activate", async () => {
    await login(OWNER);
    await assert.rejects(
      command(db, "CREATE_PAYMENT", {
        partnerId: ORG,
        kind: "CREDITS",
        channel: "PARTNER",
        credits: 50,
      }),
      /SALES_NOT_ACTIVATED/,
    );
    const row = (await inspect("SELECT id,settings FROM care_terms LIMIT 1"))[0];
    await login(OWNER);
    await assert.rejects(
      command(db, "ACTIVATE_TERMS", { id: row.id, reference: "TEST_ONLY" }),
      /APPROVAL_REQUIRED/,
    );
    await login(ADMIN);
    await assert.rejects(
      command(db, "ACTIVATE_TERMS", { id: row.id, reference: "TEST_ONLY" }),
      /UNAPPROVED_SETTING/,
    );
    const settings = {
      ...row.settings,
      terms_approved: true,
      tax_approved: true,
      refund_approved: true,
      no_show_approved: true,
      hold_expiry_approved: true,
      cancel_approved: true,
      technical_failure_approved: true,
      tax_snapshot: { classification: "SYNTHETIC_ONLY" },
      terms_reference: "TEST_ONLY",
      refund_policy: "FULL_UNUSED_ONLY",
      manual_clinical_enabled: true,
      standard_hours: { start: 0, end: 24, days: [1, 2, 3, 4, 5, 6, 7] },
      standard_hours_approved: true,
    };
    terms = (await command(db, "SAVE_TERMS", { version: "SYNTHETIC_APPROVED", settings })).id;
    await command(db, "ACTIVATE_TERMS", { id: terms, reference: "SYNTHETIC_REVIEW" });
    await command(db, "RECONCILE_ORG", {
      partnerId: ORG,
      expectedLegacyBalance: 0,
      approvedOpeningUnits: 0,
      reference: "TEST_OPEN",
      reason: "Synthetic reviewed zero opening",
    });
    await command(db, "RECONCILE_ORG", {
      partnerId: LAST,
      expectedLegacyBalance: 0,
      approvedOpeningUnits: 1,
      openingExpiresAt: new Date(Date.now() + 86400000 * 100).toISOString(),
      reference: "TEST_LAST",
      reason: "Synthetic reviewed one unit",
    });
  });
  await t.test("pending/forged payment grants none; finance MFA mandatory", async () => {
    await login(OWNER);
    paid = (
      await command(db, "CREATE_PAYMENT", {
        partnerId: ORG,
        kind: "CREDITS",
        channel: "PARTNER",
        credits: 50,
      })
    ).id;
    assert.equal(await balance(), 0);
    await login(OWNER);
    await assert.rejects(
      command(db, "VERIFY_PAYMENT", { id: paid, reference: "FAKE", evidence: "Screenshot" }),
      /FORBIDDEN/,
    );
    await login(FINANCE, "aal1");
    await assert.rejects(
      command(db, "VERIFY_PAYMENT", {
        id: paid,
        reference: "BANK_TEST_1",
        evidence: "BANK_VERIFIED_TEST",
      }),
      /MFA_REQUIRED/,
    );
    await login(OWNER);
    await assert.rejects(
      db.query("SELECT care_settle($1,$2,$3,$4,$5)", [paid, "FAKE", "FAKE", OWNER, "MANUAL"]),
      /permission denied/,
    );
    assert.equal(await balance(), 0);
  });
  await t.test("settled 50 grants 50; duplicates exactly once; immutable ledger", async () => {
    await login(FINANCE);
    const args = { id: paid, reference: "BANK_TEST_1", evidence: "BANK_VERIFIED_TEST" };
    await command(db, "VERIFY_PAYMENT", args, "payment-test-key-1");
    await command(db, "VERIFY_PAYMENT", args, "payment-test-key-1");
    await command(db, "VERIFY_PAYMENT", args, "payment-test-key-2");
    assert.equal(await balance(), 50);
    assert.equal(
      (
        await inspect("SELECT count(*)::int AS n FROM care_credit_lots WHERE payment_id=$1", [paid])
      )[0].n,
      1,
    );
    await login(FINANCE);
    await assert.rejects(
      db.query("UPDATE credit_transactions SET quantity=999"),
      /permission denied/,
    );
  });
  await t.test("intake free; queue reserves exactly one; cancellation restores", async () => {
    await login(OWNER);
    const id = (
      await command(db, "INTAKE", { partnerId: ORG, patientId: P, locationId: BR, kind: "PARTNER" })
    ).id;
    assert.equal(await balance(), 50);
    await login(OWNER);
    await command(db, "ACCEPT", { id });
    assert.equal(await balance(), 49);
    await login(OWNER);
    await command(db, "ACCEPT", { id });
    assert.equal(await balance(), 49);
    await login(OWNER);
    await command(db, "CANCEL", { id, reason: "Cancelled before service" });
    assert.equal(await balance(), 50);
  });
  const assigned = async (id) => {
    await login(ADMIN);
    await db.query("SELECT care_support_command($1,$2::jsonb,$3)", [
      "ASSIGN",
      JSON.stringify({ id, doctorId: D }),
      crypto.randomUUID(),
    ]);
  };
  await t.test(
    "only assigned clinician completes; assessment without prescription bills once",
    async () => {
      await login(OWNER);
      encounter = (await command(db, "INTAKE", { partnerId: ORG, patientId: P, kind: "PARTNER" }))
        .id;
      await command(db, "ACCEPT", { id: encounter });
      await assert.rejects(
        command(db, "COMPLETE", { id: encounter, reference: "MANUAL_TEST_ASSESSMENT" }),
        /ASSIGNED_CLINICIAN_REQUIRED/,
      );
      await assigned(encounter);
      await login(DOCTOR);
      await command(db, "START", { id: encounter, reference: "ACTUAL_SYNTHETIC_START" });
      await command(db, "COMPLETE", { id: encounter, reference: "NO_PRESCRIPTION_TEST" });
      await command(db, "COMPLETE", { id: encounter, reference: "NO_PRESCRIPTION_TEST" });
      assert.equal(await balance(), 49);
      assert.equal(
        (
          await inspect(
            "SELECT count(*)::int AS n FROM credit_transactions WHERE consultation_id=$1 AND type='CONSUME'",
            [encounter],
          )
        )[0].n,
        1,
      );
    },
  );
  await t.test("held or used credits cannot be refunded", async () => {
    await login(FINANCE);
    await assert.rejects(
      command(db, "REFUND", { id: paid, reference: "REFUND_TEST", reason: "Test full refund" }),
      /USED_HELD_OR_REWARD/,
    );
    assert.equal(await balance(), 49);
  });
  await t.test("simultaneous requests for last credit permit exactly one reservation", async () => {
    await login(OWNER);
    const a = (await command(db, "INTAKE", { partnerId: LAST, patientId: PL, kind: "PARTNER" })).id;
    const b = (await command(db, "INTAKE", { partnerId: LAST, patientId: PL, kind: "PARTNER" })).id;
    const results = await Promise.allSettled([
      command(db, "ACCEPT", { id: a }),
      command(db, "ACCEPT", { id: b }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await balance(LAST), 0);
  });
  await t.test(
    "partner annual activation creates twelve entitlements without deducting twelve credits",
    async () => {
      await login(OWNER);
      const id = (
        await command(db, "CREATE_PAYMENT", {
          partnerId: ORG,
          patientId: P,
          kind: "ANNUAL",
          channel: "PARTNER",
          collector: "Synthetic partner merchant",
        })
      ).id;
      await login(FINANCE);
      annual = (
        await command(db, "VERIFY_PAYMENT", {
          id,
          reference: "PARTNER_BANK_TEST",
          evidence: "VERIFIED_PARTNER_COLLECTION",
        })
      ).membership_id;
      assert.equal(await balance(), 49);
      const m = (
        await inspect(
          "SELECT care_used,care_collector,care_sponsor_id,care_channel FROM memberships WHERE id=$1",
          [annual],
        )
      )[0];
      assert.equal(m.care_used, 0);
      assert.equal(m.care_channel, "PARTNER");
      assert.equal(m.care_collector, "Synthetic partner merchant");
    },
  );
  let annualEncounter;
  await t.test("partner-sold annual reserves/consumes only the annual entitlement, never a partner credit", async () => {
    await login(OWNER);
    annualEncounter = (
      await command(db, "INTAKE", {
        partnerId: ORG,
        patientId: P,
        kind: "ANNUAL",
        membershipId: annual,
      })
    ).id;
    await command(db, "ACCEPT", { id: annualEncounter });
    assert.equal(await balance(), 49);
    const h = (
      await inspect("SELECT lot_id,membership_id FROM care_holds WHERE consultation_id=$1", [
        annualEncounter,
      ])
    )[0];
    assert.equal(h.lot_id, null);
    assert.equal(h.membership_id, annual);
    await assigned(annualEncounter);
    await login(DOCTOR);
    await command(db, "START", { id: annualEncounter, reference: "ANNUAL_TEST_START" });
    await command(db, "COMPLETE", { id: annualEncounter, reference: "ANNUAL_TEST_COMPLETE" });
    await command(db, "COMPLETE", { id: annualEncounter, reference: "ANNUAL_TEST_COMPLETE" });
    assert.equal(await balance(), 49);
    assert.equal(
      (await inspect("SELECT care_used FROM memberships WHERE id=$1", [annual]))[0].care_used,
      1,
    );
    assert.equal((await inspect("SELECT count(*)::int n FROM credit_transactions WHERE consultation_id=$1", [annualEncounter]))[0].n, 0);
  });
  await t.test(
    "unavailable annual entitlement rolls back credit; expiry blocks queue",
    async () => {
      await inspect("UPDATE memberships SET expires_at=now()-interval '1 day' WHERE id=$1", [
        annual,
      ]);
      await login(OWNER);
      const id = (
        await command(db, "INTAKE", {
          partnerId: ORG,
          patientId: P,
          kind: "ANNUAL",
          membershipId: annual,
        })
      ).id;
      await assert.rejects(command(db, "ACCEPT", { id }), /ANNUAL_UNAVAILABLE/);
      assert.equal(await balance(), 49);
      assert.equal(
        (
          await inspect("SELECT count(*)::int AS n FROM care_holds WHERE consultation_id=$1", [id])
        )[0].n,
        0,
      );
    },
  );
  await t.test("tenant APIs, exports and clinical notes isolate owners and finance", async () => {
    await inspect(
      "INSERT INTO consultation_notes(consultation_id,partner_id,notes) VALUES($1,$2,$3)",
      [encounter, ORG, "SYNTHETIC_CLINICAL_NOTE"],
    );
    await login(OTHER);
    await assert.rejects(db.query("SELECT care_read($1)", [ORG]), /FORBIDDEN/);
    await assert.rejects(db.query("SELECT care_reconciliation($1)", [ORG]), /FORBIDDEN/);
    assert.equal(
      (await db.query("SELECT * FROM care_credit_lots WHERE partner_id=$1", [ORG])).rows.length,
      0,
    );
    await login(OWNER);
    assert.equal((await db.query("SELECT * FROM consultation_notes")).rows.length, 0);
    await assert.rejects(
      db.query("UPDATE partners SET credit_balance=9000 WHERE id=$1", [ORG]),
      /SERVER_LEDGER_ONLY/,
    );
    await login(FINANCE);
    assert.equal((await db.query("SELECT * FROM consultation_notes")).rows.length, 0);
    await login(DOCTOR);
    assert.equal((await db.query("SELECT * FROM consultation_notes")).rows.length, 1);
    await login(OWNER);
    await assert.rejects(
      command(db, "INTAKE", { partnerId: ORG, patientId: P2, kind: "PARTNER" }),
      /PATIENT_SCOPE_REQUIRED|PATIENT_ORG_MISMATCH/,
    );
  });
  await t.test(
    "private documents require explicit permission; downloads audited, no charge",
    async () => {
      await login(DOCTOR);
      const d = (
        await db.query("SELECT care_support_command($1,$2::jsonb,$3) AS r", [
          "REGISTER_DOCUMENT",
          JSON.stringify({
            id: encounter,
            providerReference: "SYNTHETIC_PROVIDER_DOC",
            documentDate: new Date().toISOString(),
            kind: "TEST_DOCUMENT",
          }),
          crypto.randomUUID(),
        ])
      ).rows[0].r;
      await inspect("INSERT INTO storage.objects(bucket_id,name) VALUES('care-documents',$1)", [
        d.path,
      ]);
      await login(OTHER);
      assert.equal(
        (await db.query("SELECT * FROM storage.objects WHERE bucket_id='care-documents'")).rows
          .length,
        0,
      );
      await login(OWNER);
      assert.equal((await db.query("SELECT * FROM care_documents")).rows.length, 0);
      await login(PATIENT);
      assert.equal((await db.query("SELECT * FROM care_documents")).rows.length, 1);
      assert.equal(
        (await db.query("SELECT * FROM storage.objects WHERE bucket_id='care-documents'")).rows
          .length,
        1,
      );
      const oldBalance = await balance();
      await login(PATIENT);
      await db.query("SELECT care_support_command($1,$2::jsonb,$3)", [
        "DOCUMENT_ACCESS",
        JSON.stringify({ id: d.id }),
        crypto.randomUUID(),
      ]);
      assert.equal(await balance(), oldBalance);
    },
  );
  await t.test("consent-aware reminder queues only; no recovered revenue", async () => {
    await login(OWNER);
    await command(db, "REMINDER", {
      patientId: P,
      purpose: "SERVICE",
      dueAt: new Date().toISOString(),
    });
    await assert.rejects(
      command(db, "REMINDER", {
        patientId: P,
        purpose: "MARKETING",
        dueAt: new Date().toISOString(),
      }),
      /CONSENT_OR_EMAIL_REQUIRED/,
    );
    const r = (await db.query("SELECT care_reconciliation($1) AS result", [ORG])).rows[0].result;
    assert.equal(r.partnerCollectedMinor, 600000);
    assert.equal(r.cashReceivedMinor, 2000000);
  });
  await t.test(
    "rewards inactive, then approved manual rules; duplicate earn and last points protected",
    async () => {
      await login(FINANCE);
      await assert.rejects(
        db.query("SELECT care_reward_command($1,$2::jsonb,$3)", [
          "EARN",
          JSON.stringify({
            partnerId: ORG,
            productCode: "TEST_NONREGULATED",
            eligibleSpendMinor: 100000,
            reference: "ORDER_TEST",
            evidence: "VERIFIED_TEST",
          }),
          crypto.randomUUID(),
        ]),
        /REWARDS_NOT_APPROVED/,
      );
      const row = (await inspect("SELECT settings FROM care_terms WHERE active"))[0];
      const settings = {
        ...row.settings,
        rewards_enabled: true,
        reward_rules: {
          approved: true,
          regulated_excluded: true,
          mode: "MANUAL_NO_COUPON",
          allowlist: ["TEST_NONREGULATED"],
          earning_minor_per_point: 1000,
          point_value_minor: 100,
          cap_percent: 50,
          expiry_months: 12,
          minimum_spend_minor: 1000,
          earn_cap_points: 1000,
        },
      };
      await login(ADMIN);
      const id = (await command(db, "SAVE_TERMS", { version: "SYNTHETIC_REWARDS", settings })).id;
      await command(db, "ACTIVATE_TERMS", { id, reference: "SYNTHETIC_REWARDS_REVIEW" });
      await login(FINANCE);
      const args = {
        partnerId: ORG,
        productCode: "TEST_NONREGULATED",
        eligibleSpendMinor: 100000,
        reference: "ORDER_TEST",
        evidence: "VERIFIED_TEST",
      };
      await db.query("SELECT care_reward_command($1,$2::jsonb,$3)", [
        "EARN",
        JSON.stringify(args),
        "reward-earn-test",
      ]);
      await db.query("SELECT care_reward_command($1,$2::jsonb,$3)", [
        "EARN",
        JSON.stringify(args),
        "reward-earn-test",
      ]);
      assert.equal(
        (await inspect("SELECT count(*)::int AS n FROM care_reward_entries WHERE delta>0"))[0].n,
        1,
      );
      await login(OWNER);
      const a = {
        partnerId: ORG,
        productCode: "TEST_NONREGULATED",
        eligibleSpendMinor: 100000,
        points: 100,
      };
      const results = await Promise.allSettled([
        db.query("SELECT care_reward_command($1,$2::jsonb,$3)", [
          "RESERVE",
          JSON.stringify(a),
          "reward-reserve-test-a",
        ]),
        db.query("SELECT care_reward_command($1,$2::jsonb,$3)", [
          "RESERVE",
          JSON.stringify(a),
          "reward-reserve-test-b",
        ]),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    },
  );
  await t.test(
    "partner-sold annual is accepted even with an empty partner wallet (no credit used)",
    async () => {
      await login(OWNER);
      const payment = (
        await command(db, "CREATE_PAYMENT", {
          partnerId: LAST,
          patientId: PL,
          kind: "ANNUAL",
          channel: "PARTNER",
          collector: "Synthetic last-credit merchant",
        })
      ).id;
      await login(FINANCE);
      const packageId = (
        await command(db, "VERIFY_PAYMENT", {
          id: payment,
          reference: "TEST_LOW_ANNUAL",
          evidence: "VERIFIED_PARTNER_TEST",
        })
      ).membership_id;
      await login(OWNER);
      const id = (
        await command(db, "INTAKE", {
          partnerId: LAST,
          patientId: PL,
          kind: "ANNUAL",
          membershipId: packageId,
        })
      ).id;
      await command(db, "ACCEPT", { id });
      assert.equal(await balance(LAST), 0);
      const h = (await inspect("SELECT lot_id,membership_id,state FROM care_holds WHERE consultation_id=$1", [id]))[0];
      assert.equal(h.lot_id, null);
      assert.equal(h.membership_id, packageId);
      assert.equal(h.state, "RESERVED");
      await login(OWNER);
      await command(db, "CANCEL", { id, reason: "Synthetic release" });
      assert.equal(await balance(LAST), 0);
    },
  );
  await t.test(
    "concurrent final annual entitlement permits one reservation; covered patient cannot be charged again",
    async () => {
      await inspect(
        "UPDATE memberships SET care_used=11,expires_at=now()+interval '30 days' WHERE id=$1",
        [annual],
      );
      await login(OWNER);
      const a = (
        await command(db, "INTAKE", {
          partnerId: ORG,
          patientId: P,
          kind: "ANNUAL",
          membershipId: annual,
        })
      ).id;
      const b = (
        await command(db, "INTAKE", {
          partnerId: ORG,
          patientId: P,
          kind: "ANNUAL",
          membershipId: annual,
        })
      ).id;
      const results = await Promise.allSettled([
        command(db, "ACCEPT", { id: a }),
        command(db, "ACCEPT", { id: b }),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const charged = (
        await command(db, "INTAKE", { partnerId: ORG, patientId: P, kind: "PARTNER" })
      ).id;
      await assert.rejects(command(db, "ACCEPT", { id: charged }), /ANNUAL_COVERAGE_MUST_BE_USED/);
    },
  );
  await t.test(
    "direct annual has twelve rights, one usage, no organisation credit debit",
    async () => {
      await inspect(
        "INSERT INTO patients(id,partner_id,auth_user_id,first_name,last_name) VALUES($1,$2,$3,'Direct','Synthetic')",
        [uuid(13), ORG, PATIENT],
      );
      await inspect("INSERT INTO patient_consents(patient_id,recorded_by) VALUES($1,$2)", [
        uuid(13),
        PATIENT,
      ]);
      await login(PATIENT);
      const id = (
        await command(db, "CREATE_PAYMENT", {
          partnerId: ORG,
          patientId: uuid(13),
          kind: "ANNUAL",
          channel: "DIRECT",
        })
      ).id;
      await login(FINANCE);
      const packageId = (
        await command(db, "VERIFY_PAYMENT", {
          id,
          reference: "TEST_DIRECT_ANNUAL",
          evidence: "VERIFIED_TEST_CLINIC",
        })
      ).membership_id;
      const before = await balance();
      await login(OWNER);
      const cid = (
        await command(db, "INTAKE", {
          partnerId: ORG,
          patientId: uuid(13),
          kind: "ANNUAL",
          membershipId: packageId,
        })
      ).id;
      await command(db, "ACCEPT", { id: cid });
      await assigned(cid);
      await login(DOCTOR);
      await command(db, "START", { id: cid, reference: "DIRECT_TEST_START" });
      await command(db, "COMPLETE", { id: cid, reference: "DIRECT_TEST_COMPLETE" });
      assert.equal(await balance(), before);
      assert.equal(
        (await inspect("SELECT care_used FROM memberships WHERE id=$1", [packageId]))[0].care_used,
        1,
      );
    },
  );
  await t.test(
    "unused credit refund removes exactly unused lot; pending refund has no grant",
    async () => {
      await login(OWNER);
      const id = (
        await command(db, "CREATE_PAYMENT", {
          partnerId: ORG,
          kind: "CREDITS",
          channel: "PARTNER",
          credits: 25,
        })
      ).id;
      const before = await balance();
      await login(FINANCE);
      await assert.rejects(
        command(db, "REFUND", {
          id,
          reference: "TEST_REFUND_PENDING",
          reason: "Pending test refund",
        }),
        /PAYMENT_NOT_REFUNDABLE/,
      );
      await command(db, "VERIFY_PAYMENT", {
        id,
        reference: "TEST_UNUSED_SETTLED",
        evidence: "VERIFIED_TEST_BANK",
      });
      assert.equal(await balance(), before + 25);
      await login(FINANCE);
      await command(db, "REFUND", {
        id,
        reference: "TEST_UNUSED_REFUND",
        reason: "Approved full unused synthetic refund",
      });
      assert.equal(await balance(), before);
    },
  );
  await t.test("branch limits and cross-branch API/table scope are enforced", async () => {
    const staff = uuid(110),
      branch2 = uuid(31);
    await inspect("INSERT INTO auth.users(id,email) VALUES($1,'syntheticstaff@example.invalid')", [
      staff,
    ]);
    await inspect("INSERT INTO user_roles(user_id,role,partner_id) VALUES($1,'PARTNER_STAFF',$2)", [
      staff,
      ORG,
    ]);
    await inspect(
      "INSERT INTO locations(id,partner_id,code,name) VALUES($1,$2,'OTHER','Other synthetic branch')",
      [branch2, ORG],
    );
    await login(ADMIN);
    await command(db, "BRANCH_PERMISSION", {
      partnerId: ORG,
      userId: staff,
      locationId: BR,
      queueAllowed: true,
      monthlyLimit: 0,
    });
    await inspect(
      "INSERT INTO patients(id,partner_id,first_name,last_name) VALUES($1,$2,'Branch','Synthetic')",
      [uuid(14), ORG],
    );
    await login(OWNER);
    const own = (
      await command(db, "INTAKE", {
        partnerId: ORG,
        patientId: uuid(14),
        kind: "PARTNER",
        locationId: BR,
      })
    ).id;
    const other = (
      await command(db, "INTAKE", {
        partnerId: ORG,
        patientId: uuid(14),
        kind: "PARTNER",
        locationId: branch2,
      })
    ).id;
    await login(staff);
    await assert.rejects(command(db, "ACCEPT", { id: own }), /BRANCH_LIMIT_REACHED/);
    await assert.rejects(command(db, "ACCEPT", { id: other }), /QUEUE_PERMISSION_REQUIRED/);
    assert.equal(
      (await db.query("SELECT id FROM consultations WHERE id=$1", [other])).rows.length,
      0,
    );
    const view = (await db.query("SELECT care_read($1) AS r", [ORG])).rows[0].r;
    assert.ok(!view.queue.some((x) => x.id === other));
  });
  await t.test("private document isolation survives an older broad storage policy", async () => {
    await inspect(
      "CREATE POLICY old_broad_storage_read ON storage.objects FOR SELECT TO authenticated USING(true)",
    );
    await login(OTHER);
    assert.equal(
      (await db.query("SELECT * FROM storage.objects WHERE bucket_id='care-documents'")).rows
        .length,
      0,
    );
  });
  await t.test(
    "trusted provider event enforces money, ownership, duplicate and delayed states",
    async () => {
      await login(OWNER);
      const id = (
        await command(db, "CREATE_PAYMENT", {
          partnerId: ORG,
          kind: "CREDITS",
          channel: "PARTNER",
          credits: 25,
        })
      ).id;
      await db.query("SELECT care_prepare_checkout($1)", [id]);
      // Sandbox events are acknowledged only: wallet, ledger and memberships unchanged.
      {
        const snap = async () => [
          await balance(),
          (await inspect("SELECT count(*)::int n FROM ledger_entries"))[0].n,
          (await inspect("SELECT count(*)::int n FROM credit_transactions"))[0].n,
          (await inspect("SELECT count(*)::int n FROM memberships"))[0].n,
          (await inspect("SELECT count(*)::int n FROM care_credit_lots WHERE payment_id=$1", [id]))[0].n,
          (await inspect("SELECT status FROM care_payments WHERE id=$1", [id]))[0].status,
        ];
        const before = await snap();
        await db.exec("RESET ROLE");
        await actor(db, null, "aal1", "service_role");
        await db.exec("SET ROLE service_role");
        for (const t of ["PAID", "REFUNDED", "DISPUTED"]) {
          const r = (await db.query("SELECT care_provider_payment_event($1,$2,$3,'cs_test',1000000,'THB',false,$4) AS r", ["evt_sbx_" + t, t, id, "synthetic-hash-sbx-" + t])).rows[0].r;
          assert.equal(r.settled, false);
        }
        const v2 = (await db.query("SELECT care_provider_payment_event_v2('evt_sbx_v2','PAID',$1,'cs_test',1000000,'THB',false,'synthetic-hash-sbx-v2',$2,'sandbox') AS r", [id, ORG])).rows[0].r;
        assert.equal(v2.settled, false);
        assert.deepEqual(await snap(), before);
        assert.equal((await inspect("SELECT count(*)::int n FROM care_payment_events WHERE payment_id=$1 AND event_type LIKE 'SANDBOX_%'", [id]))[0].n, 4);
      }
      await inspect("UPDATE care_payments SET provider_environment='live' WHERE id=$1", [id]);
      await login(OWNER);
      await assert.rejects(
        db.query("SELECT care_provider_payment_event($1,$2,$3,$4,$5,$6,$7,$8)", [
          "evt_test",
          "PAID",
          id,
          "cs_test",
          1000000,
          "THB",
          false,
          "synthetic-hash-test",
        ]),
        /permission denied/,
      );
      const provider = async (event, type, amount = 1000000) => {
        await db.exec("RESET ROLE");
        await actor(db, null, "aal1", "service_role");
        await db.exec("SET ROLE service_role");
        return db.query("SELECT care_provider_payment_event($1,$2,$3,$4,$5,$6,$7,$8) AS r", [
          event,
          type,
          id,
          "cs_test",
          amount,
          "THB",
          true,
          "synthetic-hash-" + event,
        ]);
      };
      const before = await balance();
      await provider("evt_pending", "PENDING");
      assert.equal(await balance(), before);
      await assert.rejects(provider("evt_bad_amount", "PAID", 1), /PAYMENT_AMOUNT_MISMATCH/);
      await provider("evt_paid", "PAID");
      await provider("evt_paid", "PAID");
      assert.equal(await balance(), before + 25);
      await provider("evt_delayed_pending", "PENDING");
      assert.equal(await balance(), before + 25);
      await provider("evt_dispute", "DISPUTED");
      assert.equal(await balance(), before);
      await provider("evt_delayed_paid", "PAID");
      assert.equal(await balance(), before);
    },
  );
  await t.test("server-selected live environment: binding, mismatches, replay, no downgrade", async () => {
    await login(OWNER);
    const id = (await command(db, "CREATE_PAYMENT", { partnerId: ORG, kind: "CREDITS", channel: "PARTNER", credits: 25 })).id;
    await assert.rejects(db.query("SELECT care_prepare_checkout_server($1,$2,'live')", [id, OWNER]), /permission denied/);
    const svc = async () => { await db.exec("RESET ROLE"); await actor(db, null, "aal1", "service_role"); await db.exec("SET ROLE service_role"); };
    await svc();
    await assert.rejects(db.query("SELECT care_prepare_checkout_server($1,$2,'live')", [id, OTHER]), /CHECKOUT_NOT_AVAILABLE/);
    const prep = (await db.query("SELECT care_prepare_checkout_server($1,$2,'live') AS r", [id, OWNER])).rows[0].r;
    assert.equal(prep.provider_environment, "live");
    assert.equal(prep.partner_id, ORG);
    await db.query("SELECT care_bind_checkout($1,'live','cs_live_1')", [id]);
    await assert.rejects(db.query("SELECT care_bind_checkout($1,'live','cs_other')", [id]), /CHECKOUT_OWNERSHIP_MISMATCH/);
    await assert.rejects(db.query("SELECT care_prepare_checkout_server($1,$2,'sandbox')", [id, OWNER]), /PAYMENT_ENVIRONMENT_LOCKED/);
    const ev = (e, o = {}) => db.query("SELECT care_provider_payment_event_v2($1,'PAID',$2,$3,$4,'THB',$5,$6,$7,$8) AS r", [e, id, o.ref ?? "cs_live_1", o.amount ?? 1000000, o.live ?? true, "synthetic-hash-" + e, o.org ?? ORG, o.env ?? "live"]);
    const before = await balance();
    await assert.rejects(ev("evt_l1", { live: false, env: "sandbox" }), /PAYMENT_ENVIRONMENT_MISMATCH/);
    await assert.rejects(ev("evt_l2", { live: false }), /PAYMENT_ENVIRONMENT_MISMATCH/);
    await assert.rejects(ev("evt_l3", { org: ORG2 }), /PAYMENT_ORG_MISMATCH/);
    await assert.rejects(ev("evt_l4", { amount: 1 }), /PAYMENT_AMOUNT_MISMATCH/);
    await assert.rejects(ev("evt_l5", { ref: "cs_spoof" }), /CHECKOUT_OWNERSHIP_MISMATCH/);
    await ev("evt_live_paid");
    await ev("evt_live_paid");
    assert.equal(await balance(), before + 25);
    await login(OWNER);
    await assert.rejects(db.query("SELECT care_prepare_checkout($1)", [id]), /CHECKOUT_NOT_AVAILABLE|PAYMENT_ENVIRONMENT_LOCKED/);
  });
  await t.test(
    "FEFO uses earliest expiry; existing holds survive expiry and complete once",
    async () => {
      const pnew = uuid(15);
      await inspect(
        "INSERT INTO patients(id,partner_id,first_name,last_name) VALUES($1,$2,'Expiry','Synthetic')",
        [pnew, ORG],
      );
      await inspect("INSERT INTO patient_consents(patient_id,recorded_by) VALUES($1,$2)", [
        pnew,
        PATIENT,
      ]);
      await login(OWNER);
      const cid = (
        await command(db, "INTAKE", { partnerId: ORG, patientId: pnew, kind: "PARTNER" })
      ).id;
      await command(db, "ACCEPT", { id: cid });
      const hold = (
        await inspect("SELECT lot_id,state FROM care_holds WHERE consultation_id=$1", [cid])
      )[0];
      const first = (
        await inspect(
          "SELECT id FROM care_credit_lots WHERE partner_id=$1 AND used+voided<granted AND expires_at>now() AND (payment_id IS NULL OR EXISTS(SELECT 1 FROM care_payments p WHERE p.id=payment_id AND p.status='PAID')) ORDER BY expires_at,purchased_at,id LIMIT 1",
          [ORG],
        )
      )[0];
      assert.equal(hold.lot_id, first.id);
      await inspect(
        "UPDATE care_credit_lots SET expires_at=now()-interval '1 second' WHERE id=$1",
        [hold.lot_id],
      );
      assert.equal(
        (await inspect("SELECT state FROM care_holds WHERE consultation_id=$1", [cid]))[0].state,
        "RESERVED",
      );
      await assigned(cid);
      await login(DOCTOR);
      await command(db, "START", { id: cid, reference: "EXPIRY_TEST_START" });
      await command(db, "COMPLETE", { id: cid, reference: "EXPIRY_TEST_COMPLETE" });
      assert.equal(
        (await inspect("SELECT state FROM care_holds WHERE consultation_id=$1", [cid]))[0].state,
        "CONSUMED",
      );
    },
  );
  await t.test("partner cannot rewrite patient identity to gain clinical access", async () => {
    await login(OWNER);
    await assert.rejects(
      db.query("UPDATE patients SET auth_user_id=$1 WHERE id=$2", [OWNER, P]),
      /VERIFIED_IDENTITY_ADMIN_REQUIRED/,
    );
    await login(PATIENT);
    await assert.rejects(
      db.query("UPDATE patients SET partner_id=$1 WHERE id=$2", [ORG2, P]),
      /VERIFIED_IDENTITY_ADMIN_REQUIRED/,
    );
  });
  await t.test(
    "earned reward reversal respects active holds and uses immutable compensation",
    async () => {
      const earn = (await inspect("SELECT id FROM care_reward_entries WHERE delta>0 LIMIT 1"))[0];
      await login(FINANCE);
      const args = {
        partnerId: ORG,
        entryId: earn.id,
        returnedEligibleSpendMinor: 50000,
        reference: "TEST_STORE_RETURN",
        evidence: "VERIFIED_SYNTHETIC_RETURN",
        reason: "Verified partial eligible-product return",
      };
      await assert.rejects(
        db.query("SELECT care_reward_command($1,$2::jsonb,$3)", [
          "REVERSE",
          JSON.stringify(args),
          crypto.randomUUID(),
        ]),
        /REWARDS_HELD_SPENT/,
      );
      const reservation = (
        await inspect("SELECT id FROM care_reward_reservations WHERE state='RESERVED' LIMIT 1")
      )[0];
      await login(FINANCE);
      await db.query("SELECT care_reward_command($1,$2::jsonb,$3)", [
        "RELEASE",
        JSON.stringify({
          id: reservation.id,
          couponCannotBeUsed: true,
          reference: "TEST_DISCOUNT_UNUSABLE",
        }),
        crypto.randomUUID(),
      ]);
      await db.query("SELECT care_reward_command($1,$2::jsonb,$3)", [
        "REVERSE",
        JSON.stringify(args),
        "reward-reverse-test",
      ]);
      await db.query("SELECT care_reward_command($1,$2::jsonb,$3)", [
        "REVERSE",
        JSON.stringify(args),
        "reward-reverse-test",
      ]);
      assert.equal(
        (await inspect("SELECT sum(delta)::int AS n FROM care_reward_entries"))[0].n,
        50,
      );
    },
  );
  await t.test(
    "historical settlement uses original units once and rejects partner grants",
    async () => {
      const order = uuid(700);
      await inspect(
        "INSERT INTO credit_orders(id,partner_id,credits,amount) VALUES($1,$2,9,1234)",
        [order, ORG2],
      );
      await login(OTHER);
      await assert.rejects(
        db.query("SELECT care_settle_historical_order($1,$2,$3)", [
          order,
          "TEST_BANK_OLD",
          "TEST_VERIFIED",
        ]),
        /VERIFIED_FINANCE/,
      );
      await assert.rejects(
        db.query("INSERT INTO credit_orders(partner_id,credits,amount) VALUES($1,900,1)", [ORG2]),
        /USE_REVIEWED/,
      );
      await login(OTHER);
      try {
        await db.query("UPDATE credit_orders SET credits=900 WHERE id=$1", [order]);
      } catch (error) {
        assert.match(error.message, /VERIFIED_SETTLEMENT_RPC_REQUIRED/);
      }
      assert.equal(
        (await inspect("SELECT credits FROM credit_orders WHERE id=$1", [order]))[0].credits,
        9,
      );
      await login(FINANCE, "aal1");
      await assert.rejects(
        db.query("SELECT care_settle_historical_order($1,$2,$3)", [
          order,
          "TEST_BANK_OLD",
          "TEST_VERIFIED",
        ]),
        /MFA_REQUIRED/,
      );
      await login(FINANCE);
      await db.query("SELECT care_settle_historical_order($1,$2,$3)", [
        order,
        "TEST_BANK_OLD",
        "TEST_VERIFIED",
      ]);
      await db.query("SELECT care_settle_historical_order($1,$2,$3)", [
        order,
        "TEST_BANK_OLD",
        "TEST_VERIFIED",
      ]);
      assert.equal(await balance(ORG2), 9);
      assert.equal(
        (
          await inspect(
            "SELECT count(*)::int AS n FROM credit_transactions WHERE idempotency_key=$1",
            ["order:" + order],
          )
        )[0].n,
        1,
      );
    },
  );
  await t.test(
    "legacy cancellation releases once; consumption requires clinical completion",
    async () => {
      const cid = uuid(701);
      await inspect(
        "INSERT INTO consultations(id,partner_id,patient_id,status,credit_status,assigned_doctor_id) VALUES($1,$2,$3,'WAITING','NOT_REQUIRED',$4)",
        [cid, ORG2, P2, D],
      );
      await login(OTHER);
      await db.query("SELECT apply_credit_transaction($1,'RESERVE',1,$2,$3)", [
        ORG2,
        "legacy-reserve-test",
        cid,
      ]);
      assert.equal(await balance(ORG2), 8);
      await login(DOCTOR);
      await assert.rejects(
        db.query("SELECT apply_credit_transaction($1,'CONSUME',1,$2,$3)", [
          ORG2,
          "legacy-consume-test",
          cid,
        ]),
        /VERIFIED_COMPLETION/,
      );
      await login(OTHER);
      await db.query("SELECT care_cancel_existing($1,$2,$3)", [
        cid,
        "Synthetic cancellation",
        "legacy-cancel-test",
      ]);
      await db.query("SELECT care_cancel_existing($1,$2,$3)", [
        cid,
        "Synthetic cancellation",
        "legacy-cancel-test",
      ]);
      assert.equal(await balance(ORG2), 9);
      assert.equal(
        (await inspect("SELECT status,credit_status FROM consultations WHERE id=$1", [cid]))[0]
          .credit_status,
        "RELEASED",
      );
    },
  );
  await t.test(
    "disconnected status honest, no new recurring subscription, legacy unchanged",
    async () => {
      await login(OWNER);
      const v = (await db.query("SELECT care_read($1) AS r", [ORG])).rows[0].r;
      assert.match(v.integrations.clinical, /Demo/);
      assert.match(v.integrations.store, /not connected/);
      assert.equal((await inspect("SELECT count(*)::int AS n FROM subscriptions"))[0].n, 0);
      assert.equal(
        (await inspect("SELECT care_credit_model FROM partners WHERE id=$1", [ORG2]))[0]
          .care_credit_model,
        "LEGACY_PENDING",
      );
    },
  );
});
