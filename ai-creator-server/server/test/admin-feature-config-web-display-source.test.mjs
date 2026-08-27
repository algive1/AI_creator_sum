import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const featureConfigSource = readFileSync(new URL('../../admin-web/src/pages/FeatureConfig.tsx', import.meta.url), 'utf8');

test('admin feature config exposes web-specific model display controls', () => {
  for (const prop of ['webVisible', 'webDisplayName', 'webSortOrder']) {
    assert.match(featureConfigSource, new RegExp(`${prop}\\?:`));
    assert.match(featureConfigSource, new RegExp(`${prop}:\\s*tier\\.${prop}`));
    assert.match(featureConfigSource, new RegExp(`${prop}:\\s*values\\.${prop}`));
    assert.match(featureConfigSource, new RegExp(`name="${prop}"`));
  }

  assert.match(featureConfigSource, /网页端展示/);
  assert.match(featureConfigSource, /网页显示名称/);
  assert.match(featureConfigSource, /网页端排序/);
});

