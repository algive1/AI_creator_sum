import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const taskServiceSource = readFileSync(new URL('../src/services/task.service.ts', import.meta.url), 'utf8');

test('video edit task flow keeps all model-allowed source videos', () => {
  assert.doesNotMatch(taskServiceSource, /视频编辑只能上传一个源视频/);
  assert.match(taskServiceSource, /params\.videoUrls = videoUrls/);
  assert.match(taskServiceSource, /countVideoReferences\(params, videoAssetRefs\)/);
});

test('image task flow delegates every uploaded reference count to tier capability validation', () => {
  assert.match(taskServiceSource, /referenceImageCount:\s*\['img2img', 'edit'\]\.includes\(input\.subType\)/);
  assert.match(taskServiceSource, /countImageReferences\(input\.uploadKeys, input\.referenceKeys\) \|\| undefined/);
  assert.doesNotMatch(taskServiceSource, /图片编辑只能上传一张待编辑图/);
});
