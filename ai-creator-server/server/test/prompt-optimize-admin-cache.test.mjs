import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adminRouteSource = readFileSync(new URL('../src/routes/admin.ts', import.meta.url), 'utf8');

test('admin AI settings save clears text feature model cache', () => {
  assert.match(adminRouteSource, /clearTextFeatureModelCache/);
  assert.match(adminRouteSource, /req\.params\.group === 'ai'/);
  assert.match(adminRouteSource, /clearTextFeatureModelCache\(\)/);
});
