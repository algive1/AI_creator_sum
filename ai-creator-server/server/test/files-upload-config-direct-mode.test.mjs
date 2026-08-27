import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const routePath = path.resolve('src/routes/files.ts');
const source = fs.readFileSync(routePath, 'utf8');

test('user upload config enables direct client mode for non-local storage with explicit fallback', () => {
  assert.match(source, /provider === 'local'\s*\?\s*'server_relay'\s*:\s*'direct_client'/);
  assert.match(source, /directUploadProviders:\s*\[[\s\S]*'qiniu_kodo'[\s\S]*'tencent_cos'[\s\S]*\]/);
  assert.match(source, /fallbackUploadUrl:\s*'\/api\/v1\/files\/upload'/);
});
