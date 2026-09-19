import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourcePath = resolve(import.meta.dirname, '../src/services/user.service.ts');
const source = readFileSync(sourcePath, 'utf8');

test('authentication payload includes a masked phone and phone-bound state', () => {
  assert.match(source, /function maskPhone\(phone: unknown\): string \| null/);
  assert.match(source, /phone: maskPhone\(user\.phone\),\s*\n\s*phoneBound: Boolean\(user\.phone\)/);
});

test('both normal and duplicate WeChat logins return phone-bound state', () => {
  const wechatLoginSource = source.slice(
    source.indexOf('export async function findOrCreateUserByOpenid'),
    source.indexOf('async function ensureUserInviteCodeTxWithNewConnection'),
  );
  const stateOccurrences = wechatLoginSource.match(/phoneBound: Boolean\(user\.phone\)/g) || [];
  assert.equal(stateOccurrences.length, 2);
});

test('phone authorization prompt state is a persisted user preference with a safe default', () => {
  assert.match(source, /phoneAuthorizationPrompted: false/);
  assert.match(source, /const mergedPreferences = \{ \.\.\.parsePreferences\(profile\?\.preferences\), \.\.\.data\.preferences \}/);
});
