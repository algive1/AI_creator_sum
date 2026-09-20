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
