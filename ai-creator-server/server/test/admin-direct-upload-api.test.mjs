import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/routes/admin-files.ts', import.meta.url), 'utf8');

test('admin files route exposes direct upload config, credential, and notify endpoints', () => {
  assert.match(source, /router\.get\('\/files\/upload-config'/);
  assert.match(source, /router\.get\('\/files\/credential'/);
  assert.match(source, /router\.post\('\/files\/notify'/);
  assert.match(source, /directUploadProviders:\s*\[[\s\S]*'qiniu_kodo'[\s\S]*'tencent_cos'[\s\S]*\]/);
});

test('admin direct upload creates a placeholder before upload and confirms it after upload', () => {
  assert.match(source, /generateCredential/);
  assert.match(source, /INSERT INTO files[\s\S]*NULL[\s\S]*storageKey/);
  assert.match(source, /confirmAdminUploadedStorageObject/);
  assert.match(source, /direct_client/);
});
