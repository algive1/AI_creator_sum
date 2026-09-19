import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./phone-authorization.ts', import.meta.url), 'utf8');
const authStoreSource = readFileSync(new URL('../stores/auth.ts', import.meta.url), 'utf8');

test('phone authorization prompt state is persisted locally and best-effort synced to the account', () => {
  assert.match(source, /phoneAuthorizationPrompted/);
  assert.match(source, /await authStore\.markPhoneAuthorizationPrompted\(\)/);
  assert.match(source, /updateMe\(/);
  assert.match(source, /silent: true/);
  assert.match(authStoreSource, /async markPhoneAuthorizationPrompted\(\)/);
  assert.match(authStoreSource, /phoneAuthorizationPrompted: true/);
});
