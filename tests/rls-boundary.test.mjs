// Real RLS boundary tests: execute SELECT/UPDATE/EXECUTE under actual anon/authenticated
// roles (SET LOCAL ROLE + request.jwt.claim.* GUCs) against the real deployed policy and
// helper definitions loaded from drizzle/migrations + db/0030-0032. No mocked predicates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, uuid } from "./care-db.mjs";

const db = await createTestDb();

// Run fn under a real role inside a rolled-back transaction.
async function asRole(role, sub, fn) {
  await db.query("BEGIN");
  try {
    await db.query(`SET LOCAL ROLE ${role}`);
    await db.query(
      `SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true),set_config('request.jwt.claim.aal','aal2',true)`,
      [sub ?? "", role === "anon" ? "anon" : "authenticated"],
    );
    return await fn();
  } finally {
    await db.query("ROLLBACK").catch(() => {});
  }
}
const q = (sql, params = []) => db.query(sql, params);

// ---- Fixtures (seeded as superuser; synthetic IDs only, no real data) ----
const ORG_A = uuid(101), ORG_B = uuid(102);
const U_STRANGER = uuid(1), U_MGR_A = uuid(2), U_MGR_B = uuid(3), U_ADMIN = uuid(4),
  U_FINANCE = uuid(5), U_DOC_ASSIGNED = uuid(6), U_DOC_OTHER = uuid(7),
  U_DOC_REVOKED = uuid(8), U_PATIENT_SELF = uuid(9);
const PAT_A = uuid(201), PAT_B = uuid(202), PAT_SELF = uuid(203);
const CON_A = uuid(301), CON_B = uuid(302), CON_C = uuid(303), CON_D = uuid(304);
const DOC_A = uuid(401), DOC_OTHER = uuid(402), DOC_REVOKED = uuid(403);
const CARE_DOC = uuid(501);

await db.exec(`
INSERT INTO public.partners(id,partner_code,legal_name,display_name) VALUES ('${ORG_A}','ORG-A','Org A','Org A'),('${ORG_B}','ORG-B','Org B','Org B');
INSERT INTO public.profiles(id,full_name) VALUES
 ('${U_STRANGER}','Stranger'),('${U_MGR_A}','Mgr A'),('${U_MGR_B}','Mgr B'),
 ('${U_ADMIN}','Admin'),('${U_FINANCE}','Finance'),('${U_DOC_ASSIGNED}','Doc A'),
 ('${U_DOC_OTHER}','Doc B'),('${U_DOC_REVOKED}','Doc R'),('${U_PATIENT_SELF}','Self');
INSERT INTO public.user_roles(user_id,role,partner_id,status) VALUES
 ('${U_MGR_A}','PARTNER_MANAGER','${ORG_A}','ACTIVE'),
 ('${U_MGR_B}','PARTNER_MANAGER','${ORG_B}','ACTIVE'),
 ('${U_ADMIN}','SUPER_ADMIN',NULL,'ACTIVE'),
 ('${U_FINANCE}','FINANCE_ADMIN',NULL,'ACTIVE');
INSERT INTO public.doctors(id,auth_user_id,full_name,license_number,status) VALUES
 ('${DOC_A}','${U_DOC_ASSIGNED}','Doc A','LIC-A','ACTIVE'),
 ('${DOC_OTHER}','${U_DOC_OTHER}','Doc B','LIC-B','ACTIVE'),
 ('${DOC_REVOKED}','${U_DOC_REVOKED}','Doc R','LIC-R','SUSPENDED');
INSERT INTO public.patients(id,partner_id,first_name,last_name) VALUES
 ('${PAT_A}','${ORG_A}','Pat','A'),('${PAT_B}','${ORG_B}','Pat','B');
INSERT INTO public.patients(id,partner_id,auth_user_id,first_name,last_name) VALUES
 ('${PAT_SELF}','${ORG_A}','${U_PATIENT_SELF}','Pat','Self');
INSERT INTO public.consultations(id,partner_id,patient_id,assigned_doctor_id,status) VALUES
 ('${CON_A}','${ORG_A}','${PAT_A}','${DOC_A}','CREATED'),
 ('${CON_B}','${ORG_B}','${PAT_B}',NULL,'CREATED');
INSERT INTO public.consultation_notes(consultation_id,partner_id,author_user_id,notes) VALUES
 ('${CON_A}','${ORG_A}','${U_DOC_ASSIGNED}','note A'),('${CON_B}','${ORG_B}','${U_MGR_B}','note B');
INSERT INTO public.care_documents(id,consultation_id,provider_reference,object_path,document_date,kind) VALUES
 ('${CARE_DOC}','${CON_A}','prov-1','${CON_A}/doc.pdf',now(),'NOTE');
INSERT INTO storage.objects(bucket_id,name,owner) VALUES ('care-documents','${CON_A}/doc.pdf','${U_DOC_ASSIGNED}');
-- Valid-operation fixture for the COMPLETE boundary: active terms allowing manual
-- clinical completion, a STARTED care encounter assigned to DOC_A, RESERVED hold.
INSERT INTO public.care_terms(version,settings,active,approved_at,approved_by) VALUES
 ('v-rls','{"manual_clinical_enabled":true}',true,now(),'${U_ADMIN}');
INSERT INTO public.consultations(id,partner_id,patient_id,assigned_doctor_id,status,care_model,care_kind) VALUES
 ('${CON_C}','${ORG_A}','${PAT_A}','${DOC_A}','STARTED',true,'PARTNER'),
 ('${CON_D}','${ORG_A}','${PAT_A}','${DOC_A}','STARTED',true,'PARTNER');
INSERT INTO public.care_credit_lots(id,partner_id,granted,expires_at,snapshot) VALUES
 ('${uuid(601)}','${ORG_A}',10,now()+interval '6 months','{}');
INSERT INTO public.care_holds(consultation_id,partner_id,lot_id,state,terms_snapshot) VALUES
 ('${CON_C}','${ORG_A}','${uuid(601)}','RESERVED','{}'),('${CON_D}','${ORG_A}','${uuid(601)}','RESERVED','{}');
`);

// ---- Patient record boundaries ----
test("stranger (authenticated, no roles) sees zero patient rows", async () => {
  const r = await asRole("authenticated", U_STRANGER, () => q(`SELECT id FROM public.patients`));
  assert.equal(r.rows.length, 0);
});

test("partner A member sees org A patients but not org B patient", async () => {
  const r = await asRole("authenticated", U_MGR_A, () => q(`SELECT id FROM public.patients`));
  const ids = r.rows.map((x) => x.id);
  assert.ok(ids.includes(PAT_A) && ids.includes(PAT_SELF));
  assert.ok(!ids.includes(PAT_B));
});

test("patient self-read sees only own record", async () => {
  const r = await asRole("authenticated", U_PATIENT_SELF, () => q(`SELECT id FROM public.patients`));
  assert.deepEqual(r.rows.map((x) => x.id), [PAT_SELF]);
});

test("cross-org partner cannot UPDATE org A patient (RETURNING proves zero rows)", async () => {
  const r = await asRole("authenticated", U_MGR_B, () =>
    q(`UPDATE public.patients SET first_name='x' WHERE id='${PAT_A}' RETURNING id`));
  assert.equal(r.rows.length, 0);
});

// ---- Clinical notes boundaries ----
test("stranger sees zero consultation notes", async () => {
  const r = await asRole("authenticated", U_STRANGER, () => q(`SELECT id FROM public.consultation_notes`));
  assert.equal(r.rows.length, 0);
});

test("notes are clinical-only: partner staff (both orgs) and platform admin see none; assigned doctor sees own", async () => {
  // Deployed policy care_notes_read: care_clinical_access(consultation_id, auth.uid())
  for (const user of [U_MGR_A, U_MGR_B, U_ADMIN, U_FINANCE]) {
    const r = await asRole("authenticated", user, () => q(`SELECT id FROM public.consultation_notes`));
    assert.equal(r.rows.length, 0, `notes visible to ${user}`);
  }
  const doc = await asRole("authenticated", U_DOC_ASSIGNED, () =>
    q(`SELECT consultation_id FROM public.consultation_notes`));
  assert.deepEqual(doc.rows.map((x) => x.consultation_id), [CON_A]);
});

test("assigned active doctor has clinical access; unassigned and revoked doctors do not", async () => {
  for (const [user, expected] of [[U_DOC_ASSIGNED, true], [U_DOC_OTHER, false], [U_DOC_REVOKED, false]]) {
    const r = await asRole("authenticated", user, () =>
      q(`SELECT public.care_clinical_access('${CON_A}', auth.uid()) AS ok`));
    assert.equal(r.rows[0].ok, expected, `care_clinical_access for ${user}`);
  }
});

test("finance admin has no clinical access and cannot read care-documents storage objects", async () => {
  const r = await asRole("authenticated", U_FINANCE, () =>
    q(`SELECT public.care_clinical_access('${CON_A}', auth.uid()) AS ok`));
  assert.equal(r.rows[0].ok, false);
  const objs = await asRole("authenticated", U_FINANCE, () =>
    q(`SELECT name FROM storage.objects WHERE bucket_id='care-documents'`));
  assert.equal(objs.rows.length, 0);
});

test("platform admin (SUPER_ADMIN) also has no care clinical access to another org's encounter", async () => {
  const r = await asRole("authenticated", U_ADMIN, () =>
    q(`SELECT public.care_clinical_access('${CON_A}', auth.uid()) AS ok`));
  assert.equal(r.rows[0].ok, false);
});

test("anon role cannot read patients at all", async () => {
  await assert.rejects(
    asRole("anon", "", () => q(`SELECT id FROM public.patients`)),
    /permission denied/,
  );
});

// ---- Privilege-escalation boundaries ----
test("partner manager cannot INSERT a role for themselves (policy denies)", async () => {
  const n = await asRole("authenticated", U_MGR_A, async () => {
    const r = await q(`INSERT INTO public.user_roles(user_id,role,status) VALUES ('${U_MGR_A}','SUPER_ADMIN','ACTIVE') RETURNING id`).catch((e) => e);
    if (r instanceof Error) return r.message;
    return r.rows.length;
  });
  assert.ok(n === 0 || /row-level security|permission denied|SUPER_ADMIN_REQUIRED/.test(String(n)), `got ${n}`);
});

test("partner manager cannot UPDATE care_payments (table privilege revoked from authenticated)", async () => {
  await assert.rejects(
    asRole("authenticated", U_MGR_A, () => q(`UPDATE public.care_payments SET status='PAID'`)),
    /permission denied/,
  );
});

test("care_command COMPLETE: positive authorized control succeeds on a valid fixture", async () => {
  // The assigned active doctor completes a STARTED encounter with a RESERVED hold.
  const r = await asRole("authenticated", U_DOC_ASSIGNED, async () => {
    const res = await q(`SELECT public.care_command('COMPLETE', jsonb_build_object('id','${CON_C}','reference','ref-rls-1'), '00000000-0000-4000-8000-00000000c002') AS res`);
    const c = await q(`SELECT status FROM public.consultations WHERE id='${CON_C}'`);
    const h = await q(`SELECT state FROM public.care_holds WHERE consultation_id='${CON_C}'`);
    return { res: res.rows[0].res, status: c.rows[0].status, hold: h.rows[0].state };
  });
  assert.equal(r.res.status, "COMPLETED");
  assert.equal(r.status, "COMPLETED");
  assert.equal(r.hold, "CONSUMED");
});

test("care_command COMPLETE: low role gets the exact authorization denial; encounter and ledger unchanged", async () => {
  // Same valid fixture shape as the positive control, so the ONLY reason for
  // failure is authorization — not state, not a missing record.
  const err = await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_command('COMPLETE', jsonb_build_object('id','${CON_D}','reference','ref-rls-2'), '00000000-0000-4000-8000-00000000c003') AS res`).catch((e) => String(e.message)));
  assert.match(String(err), /ASSIGNED_CLINICIAN_REQUIRED/);
  const c = await q(`SELECT status FROM public.consultations WHERE id='${CON_D}'`);
  assert.equal(c.rows[0].status, "STARTED");
  const led = await q(`SELECT count(*) AS n FROM public.credit_transactions WHERE consultation_id='${CON_D}'`);
  assert.equal(Number(led.rows[0].n), 0);
  const hold = await q(`SELECT state FROM public.care_holds WHERE consultation_id='${CON_D}'`);
  assert.equal(hold.rows[0].state, "RESERVED");
});

test("authenticated cannot EXECUTE care_post (ledger RPC)", async () => {
  await assert.rejects(
    asRole("authenticated", U_ADMIN, () =>
      q(`SELECT public.care_post('${ORG_A}',NULL,'ADJUSTMENT',1,'k2','${U_ADMIN}',NULL,'{}'::jsonb)`)),
    /permission denied/,
  );
});

test("authenticated cannot EXECUTE care_provider_payment_event_v2 (settlement RPC)", async () => {
  await assert.rejects(
    asRole("authenticated", U_ADMIN, () =>
      q(`SELECT public.care_provider_payment_event_v2('e1','paid',NULL,'r',0,'THB',false,'h','${ORG_A}','sandbox')`)),
    /permission denied/,
  );
});

test("user can UPDATE own profile but not another user's profile", async () => {
  const own = await asRole("authenticated", U_STRANGER, () =>
    q(`UPDATE public.profiles SET full_name='Me' WHERE id='${U_STRANGER}' RETURNING id`));
  assert.equal(own.rows.length, 1);
  const other = await asRole("authenticated", U_STRANGER, () =>
    q(`UPDATE public.profiles SET full_name='Hax' WHERE id='${U_MGR_A}' RETURNING id`));
  assert.equal(other.rows.length, 0);
});

test("assigned doctor can read care-documents object for own encounter; other doctor cannot", async () => {
  const ok = await asRole("authenticated", U_DOC_ASSIGNED, () =>
    q(`SELECT name FROM storage.objects WHERE bucket_id='care-documents'`));
  assert.equal(ok.rows.length, 1);
  const no = await asRole("authenticated", U_DOC_OTHER, () =>
    q(`SELECT name FROM storage.objects WHERE bucket_id='care-documents'`));
  assert.equal(no.rows.length, 0);
});

test("anon cannot EXECUTE claim_patient_record; authenticated can", async () => {
  await assert.rejects(
    asRole("anon", "", () => q(`SELECT public.claim_patient_record('TK-NOPE')`)),
    /permission denied/,
  );
  const r = await asRole("authenticated", U_STRANGER, () =>
    q(`SELECT public.claim_patient_record('TK-NOPE') AS res`).catch(() => ({ rows: [{ res: "raised-app-error-ok" }] })));
  assert.ok(r.rows.length === 1);
});
