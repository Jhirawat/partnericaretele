import { test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, uuid } from "./care-db.mjs";

// Phase 03 regression: public signup must NEVER grant platform admin —
// not for the first signup, not after the last admin is removed, and never
// through forged metadata. The existing owner admin is preserved.

async function signup(db, n, email, meta = {}) {
  const id = uuid(n);
  await db.query("INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES ($1::uuid,$2,$3)", [
    id,
    email,
    JSON.stringify(meta),
  ]);
  return id;
}

async function roleCount(db, userId, role = null) {
  const r = await db.query(
    `SELECT count(*)::int AS n FROM public.user_roles WHERE user_id=$1 ${role ? "AND role=$2" : ""}`,
    role ? [userId, role] : [userId],
  );
  return r.rows[0].n;
}

test("very first signup receives no role at all", async () => {
  const db = await createTestDb();
  const u = await signup(db, 8001, "first@example.invalid");
  assert.equal(await roleCount(db, u), 0, "first signup must not become admin");
  await db.close();
});

test("after last admin is removed, the next signup still gets no admin", async () => {
  const db = await createTestDb();
  const owner = await signup(db, 8002, "owner@example.invalid");
  await db.query(
    "INSERT INTO public.user_roles(user_id, role, status) VALUES ($1,'SUPER_ADMIN','ACTIVE')",
    [owner],
  );
  // Last admin removed.
  await db.query("UPDATE public.user_roles SET status='REMOVED' WHERE user_id=$1", [owner]);
  await db.query("DELETE FROM public.user_roles WHERE user_id=$1", [owner]);
  const visitor = await signup(db, 8003, "visitor@example.invalid");
  assert.equal(await roleCount(db, visitor, "SUPER_ADMIN"), 0, "no self-appointment after last admin removed");
  assert.equal(await roleCount(db, visitor), 0);
  await db.close();
});

test("forged signup metadata cannot create any role", async () => {
  const db = await createTestDb();
  const u = await signup(db, 8004, "forged@example.invalid", {
    full_name: "Forged",
    role: "SUPER_ADMIN",
    roles: ["SUPER_ADMIN"],
    partner_id: uuid(1),
    is_admin: true,
  });
  assert.equal(await roleCount(db, u), 0);
  await db.close();
});

test("bootstrap trigger is absent and the function is a fail-closed no-op", async () => {
  const db = await createTestDb();
  const trig = await db.query(
    "SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='profiles_bootstrap_super_admin'",
  );
  assert.equal(trig.rows[0].n, 0, "bootstrap trigger dropped");
  // Direct invocation (defense in depth) must also grant nothing.
  const u = await signup(db, 8005, "direct@example.invalid");
  await db.query("SELECT public.bootstrap_first_super_admin()").catch(() => {
    /* trigger function may reject direct CALL context; either way no role */
  });
  assert.equal(await roleCount(db, u, "SUPER_ADMIN"), 0);
  await db.close();
});

test("trigger functions and patient claim are not executable by anon", async () => {
  const db = await createTestDb();
  const grants = (
    await db.query(
      `SELECT p.proname, p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname IN ('handle_new_user','bootstrap_first_super_admin','claim_patient_record')`,
    )
  ).rows;
  for (const g of grants) {
    assert.ok(!/anon=X/.test(g.proacl ?? ""), `${g.proname} must not be executable by anon`);
    if (g.proname !== "claim_patient_record") {
      assert.ok(!/authenticated=X/.test(g.proacl ?? ""), `${g.proname} must not be executable by authenticated`);
    }
  }
  await db.close();
});
