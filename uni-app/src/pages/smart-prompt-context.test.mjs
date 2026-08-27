import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const imageSource = readFileSync(new URL('./ai-image/index.vue', import.meta.url), 'utf8');
const videoSource = readFileSync(new URL('./ai-video/index.vue', import.meta.url), 'utf8');

test('image smart prompt completion sends mode and selected generation context', () => {
  assert.match(imageSource, /context:\s*\{/);
  assert.match(imageSource, /feature:\s*'image'/);
  assert.match(imageSource, /mode:\s*imageType\.value/);
  assert.match(imageSource, /sizeMode:\s*selectedSizeMode\.value/);
  assert.match(imageSource, /hasReferenceImage:\s*uploadedAssetCount\.value > 0/);
  assert.match(imageSource, /tierName:\s*selectedModelName\.value/);
});

test('video smart prompt completion sends mode, media, and motion context', () => {
  assert.match(videoSource, /context:\s*\{/);
  assert.match(videoSource, /feature:\s*'video'/);
  assert.match(videoSource, /mode:\s*videoMode\.value/);
  assert.match(videoSource, /referenceMode:\s*referenceUploadMode\.value/);
  assert.match(videoSource, /audioMode:\s*selectedAudioMode\.value/);
  assert.match(videoSource, /inputAssets:\s*buildInputAssets\(currentState\.value\)/);
  assert.match(videoSource, /tierName:\s*selectedModelName\.value/);
});
