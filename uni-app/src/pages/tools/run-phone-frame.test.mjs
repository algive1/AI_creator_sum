import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./run/index.vue', import.meta.url), 'utf8');

test('phone frame tool previews the front screen and has no color selector', () => {
  assert.match(source, /iPhone 17 Pro Max/);
  assert.match(source, /phone-dynamic-island/);
  assert.doesNotMatch(source, /phoneFrameColors/);
  assert.doesNotMatch(source, /phone-color-card/);
  assert.doesNotMatch(source, /phone-camera/);
  assert.doesNotMatch(source, /params\.brand/);
});
