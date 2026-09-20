import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const comicSource = readFileSync(new URL('./comic/index.vue', import.meta.url), 'utf8');
const comicApiSource = readFileSync(new URL('../api/comic.ts', import.meta.url), 'utf8');
const videoSource = readFileSync(new URL('./ai-video/index.vue', import.meta.url), 'utf8');

test('comic page follows selected model capabilities and guards submission with login', () => {
  assert.match(comicSource, /v-for="item in comicRatios"/);
  assert.match(comicSource, /v-for="item in comicDurations"/);
  assert.match(comicSource, /normalizeComicCapabilities/);
  assert.match(comicSource, /ensureLoggedIn/);
  assert.match(comicSource, /genre: selectedGenre\.value/);
  assert.match(comicSource, /character: character\.value/);
});

test('comic API preserves comic semantics in the provider prompt and task params', () => {
  assert.match(comicApiSource, /漫剧创作要求/);
  assert.match(comicApiSource, /sceneType: 'comic'/);
  assert.match(comicApiSource, /genre: params\.genre/);
  assert.match(comicApiSource, /character: params\.character/);
});

test('image-to-video mini-program submission uses inputAssets as the single image source', () => {
  assert.match(videoSource, /uploadKeys: subType === 'image_to_video' \? \[\] : buildLegacyImageUploadKeys\(state\)/);
});

test('comic studio uses a staged script-storyboard-production workflow', () => {
  assert.match(comicSource, /pipelineStep/);
  assert.match(comicSource, /generateComicScript/);
  assert.match(comicSource, /generateComicStoryboard/);
  assert.match(comicSource, /storyboardShots/);
  assert.match(comicSource, /COMIC_DRAFT_CACHE_KEY/);
  assert.match(comicSource, /writePersistentCache/);
  assert.match(comicApiSource, /\/tasks\/script/);
  assert.match(comicApiSource, /\/tasks\/storyboard/);
});

test('comic storyboard is editable as persistent shot assets', () => {
  assert.match(comicSource, /type ComicShot/);
  assert.match(comicSource, /shotSize/);
  assert.match(comicSource, /camera/);
  assert.match(comicSource, /shotStatusLabel/);
  assert.match(comicSource, /duplicateShot/);
  assert.match(comicSource, /moveShot/);
  assert.match(comicSource, /addShot/);
  assert.match(comicSource, /角色：/);
  assert.match(comicSource, /运镜：/);
});

test('comic shots can be generated and regenerated independently', () => {
  assert.match(comicSource, /async function generateShot/);
  assert.match(comicSource, /buildShotPrompt/);
  assert.match(comicSource, /sceneType: 'comic_shot'/);
  assert.match(comicSource, /shotId: shot\.id/);
  assert.match(comicSource, /shotIndex: index/);
  assert.match(comicSource, /shot\.taskId = id/);
  assert.match(comicSource, /openShotResult/);
  assert.match(comicSource, /shotDuration/);
});

test('comic studio restores shot task status and outputs in batch', () => {
  assert.match(comicSource, /getTasksByIds/);
  assert.match(comicSource, /async function syncShotTasks/);
  assert.match(comicSource, /taskOutputList/);
  assert.match(comicSource, /taskThumbnailOf/);
  assert.match(comicSource, /isTaskCompleted/);
  assert.match(comicSource, /isTaskFailed/);
  assert.match(comicSource, /syncShotTasks\(\)/);
});

test('comic character reference follows declared video capabilities', () => {
  assert.match(comicSource, /supportsCharacterReference/);
  assert.match(comicSource, /maxReferenceImages/);
  assert.match(comicSource, /referenceUploadMode/);
  assert.match(comicSource, /uploadAsset/);
  assert.match(comicSource, /referenceFileIds/);
  assert.match(comicSource, /characterReferenceFileId/);
  assert.match(comicSource, /未声明参考图能力/);
});

test('comic studio supports reusable multi-character assets', () => {
  assert.match(comicSource, /type ComicCharacter/);
  assert.match(comicSource, /characterLibrary/);
  assert.match(comicSource, /addCharacterAsset/);
  assert.match(comicSource, /chooseRoleReference/);
  assert.match(comicSource, /shotCharacters/);
  assert.match(comicSource, /shotCharacterBible/);
  assert.match(comicSource, /shotReferenceFileIds/);
  assert.match(comicSource, /角色身份锁定/);
});

test('comic studio reuses scene assets and guards batch generation cost', () => {
  assert.match(comicSource, /type ComicScene/);
  assert.match(comicSource, /sceneLibrary/);
  assert.match(comicSource, /matchedScene/);
  assert.match(comicSource, /场景身份锁定/);
  assert.match(comicSource, /shotReferenceAssets/);
  assert.match(comicSource, /pendingShotCount/);
  assert.match(comicSource, /batchEstimatedPoints/);
  assert.match(comicSource, /generatePendingShots/);
  assert.match(comicSource, /预计最多消耗/);
  assert.match(comicSource, /已完成和生成中的镜头不会重复提交/);
});
