import { test, expect } from 'bun:test';
import { redactDrill } from '../src/lib/release-runbook';
import { CHECKS, recordSchema, validationPacket, type Row } from '../src/lib/validation-snapshot';

const unsafe = [
  ['raw logs', 'raw logs fixture trace'],
  ['URLs', 'https://synthetic.invalid/private'],
  ['emails', 'fixture@synthetic.invalid'],
  ['phone numbers', '+66 81 234 5678'],
  ['usernames', 'username fixture_operator'],
  ['credentials', 'credentials fixture_value'],
  ['personal data', 'personal data fixture identity'],
  ['medical data', 'medical data fixture detail'],
  ['certificate contents', 'certificate contents fixture detail'],
  ['private documents', 'private documents fixture text'],
  ['raw copy', 'raw copy fixture text'],
  ['secrets', 'secret fixture_value'],
  ['tokens', 'token fixture_value'],
  ['passwords', 'password fixture_value'],
  ['long number runs', '123456789012'],
] as const;
for (const [category, value] of unsafe) {
  test(`Older report redaction removes synthetic ${category}`, () => {
    const out = redactDrill(`| safe label | ${value} | safe outcome |`);
    expect(out).not.toContain(value);
    expect(out).toContain('[redacted]');
    expect(out).toContain('safe outcome');
  });
  test(`Validation records reject synthetic ${category} in every text field`, () => {
    const input = {key:'app-tests',version:0,status:'unverified',count:331,optional_skip:'none',blocker_reason:'Independent review outstanding',evidence:'Independent validation metadata review'};
    expect(recordSchema.safeParse(input).success).toBe(true);
    for (const field of ['key','status','optional_skip','blocker_reason','evidence']) {
      expect(recordSchema.safeParse({...input,[field]:value}).success).toBe(false);
    }
  });
}
test('Validation export rejects unsafe returned metadata without disclosing it', () => {
  const rows: Row[] = CHECKS.map(check=>({key:check.key,status:'unverified',reason:'Evidence not recorded',record:null,last_reviewed:null}));
  for (const [, value] of unsafe) {
    const bad = structuredClone(rows) as unknown as {reason:string}[];
    const first = bad[0];
    if (!first) throw new Error('Expected validation fixture');
    first.reason=value;
    expect(()=>validationPacket(bad as unknown as Row[],true)).toThrow();
  }
  expect(()=>validationPacket(rows,false)).toThrow();
  expect(validationPacket(rows,true)).toContain('Production readiness is NOT claimed');
});