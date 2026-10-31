import test from 'node:test';
import assert from 'node:assert/strict';
import { getOAuthRedirectUri } from '../src/lib/auth-redirect.mjs';

test('uses the native callback URI on Android', () => {
  assert.equal(
    getOAuthRedirectUri({ native: true, origin: 'https://partnericaretele.lovable.app' }),
    'com.thaikanya.icaretele://auth/callback',
  );
});

test('keeps the web callback URI in the browser', () => {
  assert.equal(
    getOAuthRedirectUri({ native: false, origin: 'https://partnericaretele.lovable.app' }),
    'https://partnericaretele.lovable.app',
  );
});
