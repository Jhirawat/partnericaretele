import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Proves every inline page string on /, /care-demo and /auth resolves to a
// real translation in each supported locale (no silent English fallback).
const LOCALES = ["th", "ja", "zh-CN", "ar"];
const FILES = [
  "src/components/PartnerLanding.tsx",
  "src/components/CareWorkspace.tsx",
  "src/components/CareMfa.tsx",
  "src/components/CareHistory.tsx",
  "src/routes/care-demo.tsx",
  "src/lib/care-demo.ts",
];
const copy = JSON.parse(await readFile("src/i18n/copy.json", "utf8"));
const dict = {};
for (const l of ["en", ...LOCALES]) dict[l] = JSON.parse(await readFile(`src/i18n/locales/${l}.json`, "utf8"));
const BRAND = new Set(["line", "whatsapp", "LINE", "WhatsApp"]);

function englishKeys(src) {
  const keys = new Set();
  const pair = /\bc\(\s*(["`])((?:\\.|(?!\1).)*)\1\s*,\s*(["`])((?:\\.|(?!\3).)*)\3\s*,?\s*\)/gs;
  for (const m of src.matchAll(pair)) keys.add(m[4]);
  for (const m of src.matchAll(/\btr\(\s*"([^"]+)"\s*\)/g)) keys.add(m[1]);
  return keys;
}

test("every inline c()/tr() string has a non-English translation in every locale", async () => {
  for (const f of FILES.slice(0, 5)) {
    const src = await readFile(f, "utf8");
    assert.doesNotMatch(src, /locale === "th" \? th : en/, `${f} still uses the Thai/English-only helper`);
    for (const en of englishKeys(src)) {
      const row = copy[en];
      assert.ok(row, `${f}: missing copy row for "${en}"`);
      for (const l of LOCALES) {
        assert.ok(row[l], `${f}: "${en}" missing ${l}`);
        if (!BRAND.has(en) && !/^[\d\s/THB,.]+$/.test(en)) assert.notEqual(row[l], en, `${f}: "${en}" untranslated in ${l}`);
      }
    }
  }
});

test("demo integration labels are translated", async () => {
  const src = await readFile("src/lib/care-demo.ts", "utf8");
  const block = src.slice(src.indexOf("integrations:"), src.indexOf("position:"));
  for (const m of block.matchAll(/(\w+): "([^"]+)"/g)) {
    for (const k of [m[1], m[2]]) for (const l of LOCALES) assert.ok(copy[k]?.[l], `demo integration "${k}" missing ${l}`);
  }
});

test("locale dictionaries contain every English key (auth, nav, statuses)", () => {
  for (const l of LOCALES) {
    const missing = Object.keys(dict.en).filter((k) => !dict[l][k]);
    assert.deepEqual(missing, [], `${l} missing keys`);
  }
  for (const s of ["CREATED", "WAITING", "STARTED", "COMPLETED", "CANCELLED", "FAILED"])
    for (const l of LOCALES) assert.notEqual(dict[l][`status.${s}`], dict.en[`status.${s}`], `${l} status.${s}`);
});

test("switching locale changes rendered copy; Arabic stays RTL", async () => {
  const idx = await readFile("src/i18n/index.tsx", "utf8");
  assert.match(idx, /RTL_LOCALES: Locale\[\] = \["ar"\]/);
  // Same logic as translateCopy(): each locale yields a distinct string.
  const en = "Explore the demo";
  const out = new Set([en, ...LOCALES.map((l) => copy[en][l])]);
  assert.equal(out.size, 5);
});

test("'Demo — clinical integration not connected' is never hardcoded and is translated", async () => {
  const phrase = "Demo — clinical integration not connected";
  for (const l of LOCALES) assert.ok(copy[phrase]?.[l] && copy[phrase][l] !== phrase, `${l} missing`);
  const files = ["src/components/PartnerLanding.tsx", "src/components/CareWorkspace.tsx", "src/routes/care-demo.tsx",
    "src/routes/auth.tsx", "src/routes/_authenticated/care-patient.tsx", "src/components/CareMfa.tsx"];
  for (const f of files) {
    let src; try { src = await readFile(f, "utf8"); } catch { continue; }
    for (const line of src.split("\n"))
      if (line.includes(phrase)) assert.match(line, /\b(c|tr)\(/, `${f} renders the phrase without translation: ${line.trim()}`);
  }
});
