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

test('comic generated shots become stale when production inputs change', () => {
  assert.match(comicSource, /generationFingerprint/);
  assert.match(comicSource, /shotFingerprint/);
  assert.match(comicSource, /invalidateStaleShotAssets/);
  assert.match(comicSource, /shot\.taskId = undefined/);
  assert.match(comicSource, /shot\.outputUrl = ''/);
  assert.match(comicSource, /watch\(\[selectedStyle, selectedRatio, characterLibrary, sceneLibrary, storyboardShots\]/);
});

test('comic batch submission isolates per-shot failures', () => {
  assert.match(comicSource, /generateShot\(index: number, options:/);
  assert.match(comicSource, /generateShot\(index, \{ silent: true \}\)/);
  assert.match(comicSource, /submitted \+= 1/);
  assert.match(comicSource, /failed \+= 1/);
  assert.match(comicSource, /失败镜头已保留，可单独重试/);
  assert.match(comicSource, /throw err/);
});

test('comic assembly requires every ordered shot to have usable media', () => {
  assert.match(comicSource, /assemblyShots/);
  assert.match(comicSource, /shot\.status === 'done' && Boolean\(shot\.outputUrl\)/);
  assert.match(comicSource, /assemblyMissingCount/);
  assert.match(comicSource, /assemblyReady/);
  assert.match(comicSource, /严格按当前分镜顺序合成/);
  assert.match(comicSource, /暂不能合成/);
});

test('comic reference assets use the real image-to-video contract', () => {
  assert.match(comicSource, /FEATURE_KEYS\.imageToVideo/);
  assert.match(comicSource, /subType: 'image_to_video'/);
  assert.match(comicSource, /videoMode: 'image_to_video'/);
  assert.match(comicSource, /inputAssets: videoContract\.inputAssets/);
  assert.match(comicSource, /referenceMode: videoContract\.referenceMode/);
  assert.doesNotMatch(comicSource, /referenceFileIds:\s*shotReferenceFileIds/);
});

test('comic only enables identity reference images for compatible image-to-video tiers', () => {
  assert.match(comicSource, /\['reference_images', 'first_frame'\]/);
  assert.match(comicSource, /imageToVideoTierKeys\.value\.has/);
  assert.doesNotMatch(comicSource, /\['reference_images', 'first_frame', 'first_last'\]/);
});

test('comic actively polls generating shot tasks and rejects stale completions', () => {
  assert.match(comicSource, /taskPoller\.add/);
  assert.match(comicSource, /taskPoller\.pollNow/);
  assert.match(comicSource, /stopShotTaskPolling/);
  assert.match(comicSource, /onHide\(\(\) =>/);
  assert.match(comicSource, /onUnload\(\(\) =>/);
  assert.match(comicSource, /shot\.generationFingerprint !== shotFingerprint\(shot\)/);
  assert.match(comicSource, /shot\.status = 'draft'/);
});
