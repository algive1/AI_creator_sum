import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./inspiration/index.vue', import.meta.url), 'utf8');

test('inspiration feed requests and appends bounded pages', () => {
  assert.match(source, /const WORK_PAGE_SIZE = 24/);
  assert.match(source, /onReachBottom\(\(\) => \{\s*loadWorks\(\);/);
  assert.match(source, /page: worksPage/);
  assert.match(source, /pageSize: WORK_PAGE_SIZE/);
  assert.match(source, /works\.value = reset \? next : mergeWorks\(works\.value, next\)/);
  assert.match(source, /worksHasMore\.value = typeof res\.hasMore/);
});
