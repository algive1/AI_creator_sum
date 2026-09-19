import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

function read(file) { return fs.readFileSync(path.resolve(file), 'utf8'); }

test('image and video model pages restore persistent capabilities before network', () => {
  for (const file of ['src/pages/ai-image/index.vue', 'src/pages/ai-video/index.vue']) {
    const source = read(file);
    assert.match(source, /MODEL_PERSISTENT_CACHE_TTL_MS = 24 \* 60 \* 60_000/);
    assert.match(source, /readPersistentCache<Record<string, unknown>\[\]>/);
    assert.match(source, /writePersistentCache\(/);
  }
});

test('home does not force public config refresh on every onShow', () => {
  const source = read('src/pages/home/index.vue');
  assert.match(source, /loadPublicConfig\(\{ force \}\)/);
  assert.doesNotMatch(source, /loadPublicConfig\(\{ force: true \}\)/);
});

test('random inspiration requests remain uncached', () => {
  const source = read('src/api/template.ts');
  assert.match(source, /params\?\.random \? undefined : 5 \* 60_000/);
});
