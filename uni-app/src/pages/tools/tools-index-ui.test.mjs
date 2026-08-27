import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'index.vue'), 'utf8');
const sourceRoot = resolve(here, '../..');

test('OBS calculator card uses the shared SVG icon style instead of text badge', () => {
  assert.doesNotMatch(source, /tool-icon-text/);
  assert.doesNotMatch(source, />AP</);
  assert.match(source, /obsToolIconUrl/);
  assert.match(source, /<image class="tool-icon-image" :src="obsToolIconUrl" mode="aspectFit" \/>/);
  assert.ok(existsSync(join(sourceRoot, 'static/icons/tools/tool-aion-obs.svg')));
});
