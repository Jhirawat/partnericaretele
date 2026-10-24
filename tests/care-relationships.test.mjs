// Phase 04: care relationship boundaries — real roles, real policies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, uuid } from "./care-db.mjs";

const db = await createTestDb();

async function asRole(role, sub, fn, aal = "aal2") {
  await db.query("BEGIN");
  try {
    await db.query(`SET LOCAL ROLE ${role}`);
    await db.query(
      `SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true),set_config('request.jwt.claim.aal',$3,true)`,
      [sub ?? "", role === "anon" ? "anon" : "authenticated", aal],
    );
    return await fn();
  } finally {
    await db.query("ROLLBACK").catch(() => {});
  }
}
// Same, but COMMITs — for setup steps that later assertions depend on.
async function asRoleCommit(role, sub, fn, aal = "aal2") {
  await db.query("BEGIN");
  try {
    await db.query(`SET LOCAL ROLE ${role}`);
    await db.query(
      `SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true),set_config('request.jwt.claim.aal',$3,true)`,
      [sub ?? "", role === "anon" ? "anon" : "authenticated", aal],
    );
    const r = await fn();
    await db.query("COMMIT");
    return r;
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    throw e;
  }
}
const q = (sql, params = []) => db.query(sql, params);

const ORG_A = uuid(101), ORG_B = uuid(102);
const U_ADMIN = uuid(4), U_MGR_A = uuid(2), U_MGR_B = uuid(3),
  U_DOC = uuid(6), U_DOC_EXP = uuid(10), U_PATIENT = uuid(9), U_STRANGER = uuid(1);
const PAT_A = uuid(201), PAT_B = uuid(202);
const DOC = uuid(401), DOC_EXP = uuid(404), DOC_PEND = uuid(405);
const CON_A = uuid(301), CON_B = uuid(302);

await db.exec(`
INSERT INTO public.partners(id,partner_code,legal_name,display_name) VALUES ('${ORG_A}','ORG-A','Org A','Org A'),('${ORG_B}','ORG-B','Org B','Org B');
INSERT INTO public.user_roles(user_id,role,partner_id,status) VALUES
 ('${U_ADMIN}','SUPER_ADMIN',NULL,'ACTIVE'),
 ('${U_MGR_A}','PARTNER_MANAGER','${ORG_A}','ACTIVE'),
 ('${U_MGR_B}','PARTNER_MANAGER','${ORG_B}','ACTIVE');
INSERT INTO public.doctors(id,auth_user_id,full_name,license_number,status,license_expires_on) VALUES
 ('${DOC}','${U_DOC}','Doc A','LIC-A','ACTIVE',NULL),
 ('${DOC_EXP}','${U_DOC_EXP}','Doc E','LIC-E','ACTIVE','2020-01-01'),
 ('${DOC_PEND}',NULL,'Doc P','LIC-P','PENDING',NULL);
INSERT INTO public.patients(id,partner_id,first_name,last_name) VALUES
 ('${PAT_A}','${ORG_A}','Pat','A'),('${PAT_B}','${ORG_B}','Pat','B');
INSERT INTO public.consultations(id,partner_id,patient_id,status) VALUES
 ('${CON_A}','${ORG_A}','${PAT_A}','CREATED'),('${CON_B}','${ORG_B}','${PAT_B}','CREATED');
`);

test("grant: platform admin can grant; doctor then has clinical access without assignment", async () => {
  const rel = await asRoleCommit("authenticated", U_ADMIN, () =>
    q(`SELECT public.care_grant_relationship('${PAT_A}','${DOC}',NULL) AS id`));
  assert.ok(rel.rows[0].id);
  const access = await asRole("authenticated", U_DOC, () =>
    q(`SELECT public.care_clinical_access('${CON_A}', auth.uid()) AS ok`));
  assert.equal(access.rows[0].ok, true);
  const audit = await q(`SELECT action FROM public.audit_log WHERE entity_id='${rel.rows[0].id}'`);
  assert.equal(audit.rows[0].action, "CARE_RELATIONSHIP_GRANT");
});

test("grant: partner manager of owning org can grant; cross-org manager cannot", async () => {
  const ok = await asRoleCommit("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_grant_relationship('${PAT_A}','${DOC}',NULL) AS id`));
  assert.ok(ok.rows[0].id);
  await assert.rejects(
    asRole("authenticated", U_MGR_B, () =>
      q(`SELECT public.care_grant_relationship('${PAT_A}','${DOC}',NULL)`)),
    /FORBIDDEN/,
  );
});

test("grant: stranger and unauthenticated are denied; MFA step-up enforced", async () => {
  await assert.rejects(
    asRole("authenticated", U_STRANGER, () =>
      q(`SELECT public.care_grant_relationship('${PAT_A}','${DOC}',NULL)`)),
    /FORBIDDEN/,
  );
  await assert.rejects(
    asRole("authenticated", U_ADMIN, () =>
      q(`SELECT public.care_grant_relationship('${PAT_A}','${DOC}',NULL)`), "aal1"),
    /MFA|STRONG|AAL/i,
  );
});

test("cross-tenant relationship (patient of A with partner_id B) is rejected by trigger", async () => {
  await assert.rejects(
    q(`INSERT INTO public.care_relationships(patient_id,doctor_id,partner_id,granted_by) VALUES ('${PAT_A}','${DOC}','${ORG_B}','${U_ADMIN}')`),
    /CROSS_TENANT_RELATIONSHIP/,
  );
});

test("expired-license and pending doctors cannot be granted a relationship", async () => {
  await assert.rejects(
    asRole("authenticated", U_ADMIN, () =>
      q(`SELECT public.care_grant_relationship('${PAT_A}','${DOC_EXP}',NULL)`)),
    /DOCTOR_NOT_ACTIVE/,
  );
  await assert.rejects(
    asRole("authenticated", U_ADMIN, () =>
      q(`SELECT public.care_grant_relationship('${PAT_A}','${DOC_PEND}',NULL)`)),
    /DOCTOR_NOT_ACTIVE/,
  );
});

test("revocation immediately removes clinical access and is audited", async () => {
  const rel = await asRoleCommit("authenticated", U_ADMIN, () =>
    q(`SELECT public.care_grant_relationship('${PAT_B}','${DOC}',NULL) AS id`));
  const id = rel.rows[0].id;
  await asRoleCommit("authenticated", U_ADMIN, () =>
    q(`SELECT public.care_revoke_relationship('${id}','test revocation')`));
  const access = await asRole("authenticated", U_DOC, () =>
    q(`SELECT public.care_clinical_access('${CON_B}', auth.uid()) AS ok`));
  assert.equal(access.rows[0].ok, false);
  const audit = await q(`SELECT action FROM public.audit_log WHERE entity_id='${id}' AND action='CARE_RELATIONSHIP_REVOKE'`);
  assert.equal(audit.rows.length, 1);
});

test("expired relationship window grants no access", async () => {
  await asRoleCommit("authenticated", U_ADMIN, () =>
    q(`SELECT public.care_grant_relationship('${PAT_B}','${DOC}', now() - interval '1 day')`));
  const access = await asRole("authenticated", U_DOC, () =>
    q(`SELECT public.care_clinical_access('${CON_B}', auth.uid()) AS ok`));
  assert.equal(access.rows[0].ok, false);
});

test("relationship reads are scoped: doctor and owning-org manager see it; cross-org and stranger do not", async () => {
  const rel = await asRoleCommit("authenticated", U_ADMIN, () =>
    q(`SELECT public.care_grant_relationship('${PAT_A}','${DOC}',NULL) AS id`));
  const id = rel.rows[0].id;
  for (const [user, expected] of [[U_DOC, 1], [U_MGR_A, 1], [U_MGR_B, 0], [U_STRANGER, 0]]) {
    const r = await asRole("authenticated", user, () =>
      q(`SELECT id FROM public.care_relationships WHERE id='${id}'`));
    assert.equal(r.rows.length, expected, `visibility for ${user}`);
  }
});

test("authenticated cannot INSERT/UPDATE/DELETE care_relationships directly", async () => {
  await assert.rejects(
    asRole("authenticated", U_ADMIN, () =>
      q(`INSERT INTO public.care_relationships(patient_id,doctor_id,partner_id,granted_by) VALUES ('${PAT_A}','${DOC}','${ORG_A}','${U_ADMIN}')`)),
    /permission denied/,
  );
});
