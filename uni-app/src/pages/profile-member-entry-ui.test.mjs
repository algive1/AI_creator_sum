import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, 'profile/index.vue'), 'utf8');

test('profile member entry card is not nested inside the logged-in-only hero area', () => {
  const line = source
    .split(/\r?\n/)
    .find((item) => item.includes('v-if="showProfileMemberEntry" class="member-banner"'));

  assert.ok(line, 'expected profile member entry card to exist');
  assert.ok(line.startsWith('      <view'), 'member entry card should be a page-content child');
  assert.equal(line.startsWith('        <view'), false, 'member entry card should not be nested inside the logged-in block');
});
