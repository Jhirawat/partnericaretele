import test from 'node:test';
import assert from 'node:assert/strict';
import {safeAuthDestination} from '../src/lib/auth-destination.ts';
test('onboarding return paths are allowlisted; external, encoded and backslash redirects are denied',()=>{for(const p of ['/partner-onboarding','/partner-review','/partner-workspace'])assert.equal(safeAuthDestination(p),p);for(const p of ['//evil.invalid','/\\evil.invalid','https://evil.invalid','/%2f%2fevil.invalid','/partner-onboarding?next=https://evil.invalid','/unknown'])assert.equal(safeAuthDestination(p),undefined);});
