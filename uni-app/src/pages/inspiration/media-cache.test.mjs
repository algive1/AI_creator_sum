import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = fs.readFileSync(path.resolve('src/pages/inspiration/index.vue'), 'utf8');

test('inspiration page keeps media nodes warm when navigating back', () => {
  assert.match(source, /INSPIRATION_REVALIDATE_MS\s*=\s*5\s*\*\s*60_000/);
  assert.match(source, /const hasWarmContent = works\.value\.length > 0 \|\| topTemplates\.value\.length > 0/);
  assert.match(source, /if \(isFresh\) \{[\s\S]*?consumePendingFavorite\(\);[\s\S]*?return;/);
});

test('explicit random refresh still bypasses navigation cache', () => {
  assert.match(source, /Promise\.all\(\[loadTopTemplates\(true\), loadWorks\(\{ reset: true, random: true \}\)\]\)/);
});
