import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/services/tools.service.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function processPhoneFrame');
const end = source.indexOf('\nfunction buildPromptReverseText', start);
const body = source.slice(start, end);

test('phone frame renders an iPhone 17 Pro Max front screen mockup', () => {
  assert.ok(start >= 0 && end > start, 'processPhoneFrame should exist');
  assert.match(body, /iPhone 17 Pro Max front frame/);
  assert.match(body, /dynamicIsland/);
  assert.match(body, /sideButton/);
  assert.doesNotMatch(body, /brand === 'huawei'/);
  assert.doesNotMatch(body, /resolvePhoneFrameStyle\(input\.params\?\.brand\)/);
});
