import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const pagePath = path.resolve('src/pages/ai-video/index.vue');
const source = fs.readFileSync(pagePath, 'utf8');

test('video edit uses capability-driven dynamic media upload', () => {
  assert.match(
    source,
    /videoMode\.value === '视频编辑' && maxVideoUrls\.value > 0/,
    'video edit should enter the dynamic media uploader whenever the model declares video input',
  );
  assert.match(
    source,
    /visibleMediaUploadCards = computed<MediaUploadCard\[\]>\(\(\) => mediaUploadCards\.value\)/,
    'dynamic uploader must keep all media types declared by capabilities',
  );
  assert.doesNotMatch(
    source,
    /mediaUploadCards\.value\.filter\(\(card\) => card\.mediaType === 'video'\)/,
    'video edit must not silently discard declared image/audio inputs',
  );
});
