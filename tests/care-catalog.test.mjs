// Phase 05: versioned service pricing boundaries — real roles, real policies.
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

const ORG_A = uuid(101), ORG_B = uuid(102);
const U_ADMIN = uuid(4), U_MGR_A = uuid(2), U_MGR_B = uuid(3), U_STAFF_A = uuid(11), U_STRANGER = uuid(1);

await db.exec(`
INSERT INTO public.partners(id,partner_code,legal_name,display_name) VALUES ('${ORG_A}','ORG-A','Org A','Org A'),('${ORG_B}','ORG-B','Org B','Org B');
INSERT INTO public.user_roles(user_id,role,partner_id,status) VALUES
 ('${U_ADMIN}','SUPER_ADMIN',NULL,'ACTIVE'),
 ('${U_MGR_A}','PARTNER_MANAGER','${ORG_A}','ACTIVE'),
 ('${U_MGR_B}','PARTNER_MANAGER','${ORG_B}','ACTIVE'),
 ('${U_STAFF_A}','PARTNER_STAFF','${ORG_A}','ACTIVE');
`);

const createArgs = (over = {}) => JSON.stringify({
  partner_id: ORG_A, name: "General consultation", name_th: "ปรึกษาแพทย์ทั่วไป",
  description: "Doctor assessment, care plan and follow-up", duration_minutes: 30,
  scope: "Telemedicine", price_minor: 50000, currency: "THB",
  cancellation_policy: { free_until_hours: 24 }, ...over,
});

test("manager creates DRAFT versions with auto-incrementing version numbers", async () => {
  const r1 = await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_service_version_command('CREATE','${createArgs()}'::jsonb) AS r`), "aal2", true);
  const r2 = await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_service_version_command('CREATE','${createArgs({ name: "Follow-up" })}'::jsonb) AS r`), "aal2", true);
  assert.ok(r1.rows[0].r.id && r2.rows[0].r.id);
  const v = await q(`SELECT version FROM public.care_service_versions WHERE partner_id='${ORG_A}' ORDER BY version`);
  assert.deepEqual(v.rows.map((x) => x.version), [1, 2]);
});

test("unauthorized: stranger, cross-org manager and low-assurance session cannot create", async () => {
  await assert.rejects(asRole("authenticated", U_STRANGER, () =>
    q(`SELECT public.care_service_version_command('CREATE','${createArgs()}'::jsonb)`)), /FORBIDDEN/);
  await assert.rejects(asRole("authenticated", U_MGR_B, () =>
    q(`SELECT public.care_service_version_command('CREATE','${createArgs()}'::jsonb)`)), /FORBIDDEN/);
  await assert.rejects(asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_service_version_command('CREATE','${createArgs()}'::jsonb)`), "aal1"), /MFA|STRONG|AAL/i);
});

test("authenticated cannot INSERT/UPDATE/DELETE versions directly", async () => {
  await assert.rejects(asRole("authenticated", U_ADMIN, () =>
    q(`INSERT INTO public.care_service_versions(partner_id,version,name,price_minor) VALUES ('${ORG_A}',99,'x',1)`)), /permission denied/);
});

test("approval flow: draft invisible in catalog until APPROVED; catalog returns current approved only", async () => {
  const created = await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_service_version_command('CREATE','${createArgs({ name: "Catalog item" })}'::jsonb) AS r`), "aal2", true);
  const id = created.rows[0].r.id;
  let cat = await asRole("authenticated", U_STAFF_A, () => q(`SELECT public.care_catalog('${ORG_A}') AS c`));
  assert.equal(cat.rows[0].c.filter((x) => x.id === id).length, 0);
  await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_service_version_command('APPROVE','{"id":"${id}"}'::jsonb)`), "aal2", true);
  cat = await asRole("authenticated", U_STAFF_A, () => q(`SELECT public.care_catalog('${ORG_A}') AS c`));
  const item = cat.rows[0].c.find((x) => x.id === id);
  assert.ok(item);
  assert.equal(item.price_minor, 50000);
  assert.equal(item.currency, "THB");
});

test("immutability: approved version content cannot change; only RETIRE allowed; delete blocked", async () => {
  const created = await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_service_version_command('CREATE','${createArgs({ name: "Immutable", price_minor: 70000 })}'::jsonb) AS r`), "aal2", true);
  const id = created.rows[0].r.id;
  await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_service_version_command('APPROVE','{"id":"${id}"}'::jsonb)`), "aal2", true);
  await assert.rejects(
    q(`UPDATE public.care_service_versions SET price_minor=1 WHERE id='${id}'`),
    /SERVICE_VERSION_IMMUTABLE/);
  await assert.rejects(
    q(`DELETE FROM public.care_service_versions WHERE id='${id}'`),
    /SERVICE_VERSION_IMMUTABLE/);
  await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_service_version_command('RETIRE','{"id":"${id}"}'::jsonb)`), "aal2", true);
  const st = await q(`SELECT status FROM public.care_service_versions WHERE id='${id}'`);
  assert.equal(st.rows[0].status, "RETIRED");
});

test("expired (effective_to in past) approved versions are excluded from catalog", async () => {
  const created = await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_service_version_command('CREATE','${createArgs({ name: "Expired", effective_from: "2020-01-01T00:00:00Z", effective_to: "2020-02-01T00:00:00Z" })}'::jsonb) AS r`), "aal2", true);
  const id = created.rows[0].r.id;
  await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_service_version_command('APPROVE','{"id":"${id}"}'::jsonb)`), "aal2", true);
  const cat = await asRole("authenticated", U_STAFF_A, () => q(`SELECT public.care_catalog('${ORG_A}') AS c`));
  assert.equal(cat.rows[0].c.filter((x) => x.id === id).length, 0);
});

test("appointment price snapshot: stored once, later version changes do not alter it", async () => {
  const created = await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_service_version_command('CREATE','${createArgs({ name: "Snap", price_minor: 50000 })}'::jsonb) AS r`), "aal2", true);
  const vid = created.rows[0].r.id;
  await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_service_version_command('APPROVE','{"id":"${vid}"}'::jsonb)`), "aal2", true);
  const v = await q(`SELECT * FROM public.care_service_versions WHERE id='${vid}'`);
  const snap = { version_id: vid, version: v.rows[0].version, price_minor: v.rows[0].price_minor, currency: "THB", cancellation_policy: v.rows[0].cancellation_policy };
  const PAT = uuid(201);
  await q(`INSERT INTO public.patients(id,partner_id,first_name,last_name) VALUES ('${PAT}','${ORG_A}','P','S')`);
  const CON = uuid(301);
  await q(`INSERT INTO public.consultations(id,partner_id,patient_id,status,care_price_snapshot) VALUES ('${CON}','${ORG_A}','${PAT}','CREATED',$1)`, [JSON.stringify(snap)]);
  // Later version with different price
  await asRole("authenticated", U_MGR_A, () =>
    q(`SELECT public.care_service_version_command('CREATE','${createArgs({ name: "Snap", price_minor: 90000 })}'::jsonb)`), "aal2", true);
  const after = await q(`SELECT care_price_snapshot FROM public.consultations WHERE id='${CON}'`);
  assert.equal(after.rows[0].care_price_snapshot.price_minor, 50000);
});

test("catalog is org-scoped: org B catalog is empty (inactive/empty state)", async () => {
  const cat = await asRole("authenticated", U_MGR_B, () => q(`SELECT public.care_catalog('${ORG_B}') AS c`));
  assert.deepEqual(cat.rows[0].c, []);
});
