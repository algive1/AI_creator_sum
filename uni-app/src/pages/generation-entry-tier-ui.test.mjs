import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const imageSource = readFileSync(new URL('./ai-image/index.vue', import.meta.url), 'utf8');
const videoSource = readFileSync(new URL('./ai-video/index.vue', import.meta.url), 'utf8');

const generationPages = [
  { name: 'image generation page', source: imageSource },
  { name: 'video generation page', source: videoSource },
];

test('generation pages label selectable tiers as entry tiers and explain capability changes', () => {
  for (const { name, source } of generationPages) {
    assert.match(source, /<text class="param-block-title">入口档位<\/text>/, `${name} should use the entry tier title`);
    assert.match(source, /class="entry-tier-note"/, `${name} should render the entry tier note`);
    assert.match(
      source,
      /切换入口档位后，比例参数和参考图数量会随当前档位变化/,
      `${name} should explain that ratios and reference image counts change by tier`,
    );
    assert.doesNotMatch(source, />模型档位</, `${name} should not show the old tier title`);
  }
});

test('generation pages keep uploaded asset counts within the selected entry tier limit', () => {
  for (const { name, source } of generationPages) {
    assert.match(
      source,
      /const displayedUploadedAssetCount = computed\(\(\) => Math\.min\(uploadedAssetCount\.value, maxUploads\.value\)\)/,
      `${name} should cap the displayed upload count at the active tier limit`,
    );
    assert.match(source, /function trimCurrentAssetsToMaxUploads\(\)/, `${name} should trim assets when the tier limit shrinks`);
    assert.match(source, /state\.assets\.splice\(maxUploads\.value\)/, `${name} should remove hidden over-limit assets`);
    assert.match(source, /state\.uploadKeys\.splice\(maxUploads\.value\)/, `${name} should remove over-limit upload keys`);
    assert.match(
      source,
      /watch\(\(\) => maxUploads\.value,[\s\S]*trimCurrentAssetsToMaxUploads\(\)/,
      `${name} should react when entry tier capabilities change the upload limit`,
    );
  }
});
