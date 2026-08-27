import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const resultSource = readFileSync(new URL('./result/index.vue', import.meta.url), 'utf8');

test('result creation info includes output resolution and file size', () => {
  assert.match(resultSource, /outputResolutionLabel/);
  assert.match(resultSource, /outputFileSizeLabel/);
  assert.match(resultSource, /\{\{\s*outputResolutionLabel\s*\}\}/);
  assert.match(resultSource, /\{\{\s*outputFileSizeLabel\s*\}\}/);
  assert.match(resultSource, /resolutionLabelOf/);
  assert.match(resultSource, /fileSizeLabelOf/);
});

test('result video fullscreen hides page overlays while native player is active', () => {
  assert.match(resultSource, /@fullscreenchange="handleVideoFullscreenChange"/);
  assert.match(resultSource, /const isVideoFullscreen = ref\(false\)/);
  assert.match(resultSource, /function handleVideoFullscreenChange/);
  assert.match(resultSource, /v-if="displayOutputs\.length > 1 && !isVideoFullscreen"/);
  assert.match(resultSource, /v-if="!isVideoFullscreen"/);
});

test('single result video is not nested in swiper before fullscreen playback', () => {
  assert.match(resultSource, /v-if="displayOutputs\.length === 1"/);
  assert.match(resultSource, /v-else-if="displayOutputs\.length > 1"/);
  assert.match(resultSource, /const singleDisplayOutput = computed/);
  assert.match(resultSource, /isOutputVideo\(singleDisplayOutput\)/);
  assert.match(resultSource, /@loadedmetadata="onResultVideoLoadedMetadata\(singleDisplayOutput, \$event\)"/);
});
