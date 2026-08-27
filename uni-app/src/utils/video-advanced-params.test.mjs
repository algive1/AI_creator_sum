import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSupportedAdvancedVideoParams,
  hasVisibleVideoAdvancedParams,
  normalizeVideoAdvancedParams,
} from './video-advanced-params.ts';

test('normalizes only advanced params the app can render', () => {
  assert.deepEqual(
    normalizeVideoAdvancedParams(['duration', 'seed', 'audio_url', 'fps', 'audioFileId']),
    ['seed', 'fps', 'audioUrl'],
  );
});

test('detects when a model tier should show the advanced panel', () => {
  assert.equal(hasVisibleVideoAdvancedParams([]), false);
  assert.equal(hasVisibleVideoAdvancedParams(['audio_url']), true);
});

test('only submits filled advanced params allowed by current model tier', () => {
  const params = buildSupportedAdvancedVideoParams(['audio_url'], {
    seed: '12345',
    fps: '24',
    audioUrl: 'https://cdn.example.com/bgm.mp3',
  });

  assert.deepEqual(params, {
    audioUrl: 'https://cdn.example.com/bgm.mp3',
  });
});
