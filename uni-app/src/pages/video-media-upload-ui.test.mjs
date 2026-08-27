import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const videoSource = readFileSync(new URL('./ai-video/index.vue', import.meta.url), 'utf8');
const imageSource = readFileSync(new URL('./ai-image/index.vue', import.meta.url), 'utf8');
const stripSource = readFileSync(new URL('../components/legacy/LegacyAssetStrip.vue', import.meta.url), 'utf8');

test('generation tier names are capped to five visible characters', () => {
  assert.match(videoSource, /shortTierName/);
  assert.match(imageSource, /shortTierName/);
  assert.match(videoSource, /slice\(0,\s*5\)/);
  assert.match(imageSource, /slice\(0,\s*5\)/);
});

test('video page has dedicated model-driven media upload cards and inputAssets payload', () => {
  assert.match(videoSource, /mediaUploadCards/);
  assert.match(videoSource, /inputMediaTypes/);
  assert.match(videoSource, /mediaType:\s*'audio'/);
  assert.match(videoSource, /pasteMediaUrl/);
  assert.match(videoSource, /inputAssets/);
});

test('reference image uploads use mixed slots so video or audio assets do not consume image capacity', () => {
  assert.match(videoSource, /function chooseAndSetReferenceImage/);
  assert.match(videoSource, /if \(mediaType === 'image'\) \{\s*chooseAndSetReferenceImage\(replaceIndex\);/);
  assert.match(videoSource, /setMediaAsset\(asset, replaceIndex\)/);
});

test('reference video upload cards reuse first-frame and first-last visual systems', () => {
  assert.match(videoSource, /mediaUploadLayoutClass/);
  assert.match(videoSource, /single: mediaUploadCards\.value\.length === 1/);
  assert.match(videoSource, /class="video-source-area media-upload-source-area"/);
  assert.match(videoSource, /class="frame-upload-grid media-upload-grid"/);
  assert.match(videoSource, /class="frame-upload-slot media-upload-frame-slot"/);
  assert.match(videoSource, /\.media-upload-grid\.cols-3/);
});

test('asset strip keeps at least four preview slots and supports disabled gray slots', () => {
  assert.match(stripSource, /const MIN_VISIBLE_SLOTS = 4/);
  assert.match(stripSource, /visibleSlotCount/);
  assert.match(stripSource, /disabled: index >= props\.max/);
  assert.match(stripSource, /asset-empty-slot/);
  assert.match(stripSource, /disabled/);
  assert.match(stripSource, /mediaType\?: 'image' \| 'video' \| 'audio'/);
  assert.match(stripSource, /asset\.mediaType === 'audio'/);
});
