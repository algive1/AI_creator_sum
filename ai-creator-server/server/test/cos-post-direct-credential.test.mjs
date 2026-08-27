import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/services/storage/cos.adapter.ts', import.meta.url), 'utf8');

test('COS direct credential exposes POST form fields for browser and mini-program uploadFile', () => {
  assert.match(source, /provider:\s*"tencent_cos"/);
  assert.match(source, /uploadUrl:\s*`https:\/\/\$\{cfg\.bucket\}\.cos\.\$\{cfg\.region\}\.myqcloud\.com`/);
  assert.match(source, /q-sign-algorithm/);
  assert.match(source, /q-ak/);
  assert.match(source, /q-key-time/);
  assert.match(source, /q-signature/);
  assert.match(source, /policy/);
  assert.doesNotMatch(source, /credential:\s*\{[\s\S]*tmpSecretId[\s\S]*tmpSecretKey[\s\S]*sessionToken[\s\S]*\}/);
});
