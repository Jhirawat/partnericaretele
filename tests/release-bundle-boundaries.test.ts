import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
const route=readFileSync('src/routes/release-evidence-bundle.tsx','utf8'),fn=readFileSync('src/lib/release-bundle.functions.ts','utf8'),sql=readFileSync('db/0093_final_release_artifact_ledger.sql','utf8');
test('private surface is noindex and register access stops before signed-out RPC',()=>{expect(route).toContain("content:'noindex, nofollow'");expect(route.indexOf('if(!session.session)')).toBeLessThan(route.indexOf('await read()'));expect(fn.match(/middleware\(\[requireSupabaseAuth\]\)/g)?.length).toBe(3);});
test('bundle has no external service or release execution path',()=>{expect(fn+route+sql).not.toMatch(/\bfetch\s*\(|https?:\/\/|care_command|notification_dispatch|payments_command|deploy\s*\(|publish\s*\(/);expect(sql).toContain('PERFORM care_require_strong()');expect(sql).toContain('STALE_VERSION');expect(sql).toContain('SECOND_REVIEWER_REQUIRED');});
