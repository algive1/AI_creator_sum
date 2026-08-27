import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../admin-web/src/pages/Users.tsx', import.meta.url), 'utf8');

test('admin users list shows bound phone numbers in plain text', () => {
  assert.doesNotMatch(source, /function\s+maskPhone\b/);
  assert.doesNotMatch(source, /maskPhone\(/);
  assert.match(source, /dataIndex:\s*'phone'[\s\S]*render:\s*\(v:\s*string\)\s*=>\s*v\s*\|\|\s*'-'/);
});

test('admin user detail shows the bound phone number', () => {
  assert.match(source, /Descriptions\.Item\s+label="手机号"[\s\S]*detailUser\.phone\s*\|\|\s*'-'/);
});
