import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

// Phase 01 content policy: public/patient/partner-facing UI copy must not
// reference cannabis subject matter or former PT28/PT33 government-form
// workflows. Historical clinical/audit/financial records in the database are
// untouched; this guards application copy only.
const PROHIBITED = [/cannabis/i, /marijuana/i, /กัญชา/, /PT\.?28/i, /PT\.?33/i];

// Files whose rendered copy reaches public, patient or partner audiences.
const COPY_FILES = [
  "src/components/PartnerLanding.tsx",
  "src/components/CareWorkspace.tsx",
  "src/routes/index.tsx",
  "src/routes/auth.tsx",
  "src/routes/care-demo.tsx",
  "src/routes/_authenticated/care.tsx",
  "src/routes/_authenticated/care-patient.tsx",
  "src/routes/_authenticated/portal.tsx",
  "src/routes/_authenticated/shop.tsx",
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(tsx|ts|json)$/.test(entry.name)) yield p;
  }
}

test("named public/patient/partner copy files contain no prohibited terms", async () => {
  for (const file of COPY_FILES) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    for (const pattern of PROHIBITED) {
      assert.ok(!pattern.test(text), `${file} matches prohibited pattern ${pattern}`);
    }
  }
});

test("no i18n locale string contains prohibited terms", async () => {
  const dir = new URL("../src/i18n/locales/", import.meta.url);
  for await (const file of walk(dir.pathname)) {
    const text = await readFile(file, "utf8");
    for (const pattern of PROHIBITED) {
      assert.ok(!pattern.test(text), `${file} matches prohibited pattern ${pattern}`);
    }
  }
});
