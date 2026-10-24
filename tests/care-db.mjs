import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFile, readdir } from "node:fs/promises";
import postgres from 'postgres';
export async function createTestDb() {
  const isolatedUrl=process.env.REQUEST_TEST_DATABASE_URL;
  if(isolatedUrl && (new URL(isolatedUrl).hostname!=='127.0.0.1' || new URL(isolatedUrl).pathname!=='/request_isolated')) throw new Error('ISOLATED_LOCAL_DATABASE_ONLY');
  const sql=isolatedUrl?postgres(isolatedUrl,{max:1,onnotice:()=>{},types:{json:{to:3802,from:[114,3802],serialize:v=>typeof v==='string'?v:JSON.stringify(v),parse:JSON.parse}}}):null;
  const db = sql ? {
    exec:async text=>{await sql.unsafe(text);},
    query:async(text,params=[])=>({rows:await sql.unsafe(text,params)}),
    close:()=>sql.end(),
  } : new PGlite({ extensions: { btree_gist } });
  if(sql)await db.exec('CREATE EXTENSION IF NOT EXISTS btree_gist');
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE SCHEMA storage;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role',true),''),'authenticated') $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('sub',auth.uid(),'aal',COALESCE(NULLIF(current_setting('request.jwt.claim.aal',true),''),'aal1'),'email','synthetic@example.invalid') $$;
 GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;
 GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated,anon,service_role;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean DEFAULT false);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,owner uuid,metadata jsonb);
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA storage TO authenticated;
 GRANT SELECT,INSERT ON storage.objects TO authenticated;`);
  const dir = new URL("../drizzle/migrations/", import.meta.url);
  // 0030/0031 partner_onboarding are the Cloud-applied copies of db/0049; db/0049 is loaded below as the canonical test source.
  for (const file of (await readdir(dir)).filter((x) => x.endsWith(".sql") && Number(x.slice(0, 4)) <= 29).sort()) {
    try {
      await db.exec(await readFile(new URL(file, dir), "utf8"));
    } catch (e) {
      await db.close();
      throw new Error(`Migration ${file}: ${e.message}`, { cause: e });
    }
  }
  await db.exec(await readFile(new URL("../db/0030_care_live_environment.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0031_care_sandbox_no_settlement.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0032_phase03_disable_anonymous_admin_bootstrap.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0033_care_relationships.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0034_care_service_versions.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0035_care_entitlements.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0036_care_appointments.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0037_care_personal_prepaid.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0038_care_personal_hardening.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0039_balance_null_guard.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0040_prepaid_purchase.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0041_care_patient_booking.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0042_prepaid_auto_grant.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0043_care_video.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0044_booking_prepaid_hold.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0045_care_clinical_notes.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0046_care_followups.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0047_care_appointment_documents.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0048_care_credit_lifecycle_audit.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0044_booking_prepaid_hold.sql", import.meta.url), "utf8"));
  await db.exec(`INSERT INTO storage.buckets(id,name,public) VALUES ('partner-applications','partner-applications',false);`);
  await db.exec(await readFile(new URL("../db/0049_partner_onboarding.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0050_doctor_recruitment.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0051_partner_customer_intake.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0052_partner_intake_evidence_guards.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0053_consultation_request_lifecycle.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../db/0054_manual_mcs_handoff.sql", import.meta.url), "utf8"));
  return db;
}
export async function actor(db, id, aal = "aal2", role = "authenticated") {
  await db.query(
    `SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal',$2,false),set_config('request.jwt.claim.role',$3,false)`,
    [id ?? "", aal, role],
  );
}
export async function command(db, op, args, key = crypto.randomUUID()) {
  return (
    await db.query(`SELECT public.care_command($1,$2::jsonb,$3) AS result`, [
      op,
      JSON.stringify(args),
      key,
    ])
  ).rows[0].result;
}
export const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
if (process.argv[1]?.endsWith("care-db.mjs")) {
  const db = await createTestDb();
  console.log("All migrations validated on isolated PostgreSQL (PGlite)");
  await db.close();
}
