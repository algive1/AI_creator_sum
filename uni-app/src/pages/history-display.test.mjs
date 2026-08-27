import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const historySource = readFileSync(new URL('./history/index.vue', import.meta.url), 'utf8');
const workLibrarySource = readFileSync(new URL('../utils/work-library.ts', import.meta.url), 'utf8');

function styleBlock(source, selector) {
  const start = source.indexOf(selector);
  assert.ok(start > -1, `${selector} style should exist`);
  const nextSelector = source.indexOf('\n.', start + selector.length);
  return source.slice(start, nextSelector > -1 ? nextSelector : undefined);
}

test('work library cards use restrained styling and keep list metadata concise', () => {
  assert.match(historySource, /class="library-risk"/);
  assert.match(historySource, /后台继续/);
  assert.match(workLibrarySource, /displayResolution/);
  assert.match(workLibrarySource, /displayFileSize/);
  assert.match(workLibrarySource, /resultMeta/);
  assert.doesNotMatch(historySource, /\{\{\s*item\.displayDate\s*\}\}/);
  assert.doesNotMatch(historySource, /\{\{\s*item\.resultMeta\s*\}\}/);
  assert.doesNotMatch(historySource, /\{\{\s*item\.statusHint\s*\}\}/);
  assert.match(historySource, /class="tile-type-badge"/);
  assert.match(historySource, /class="recent-type-badge"/);
  assert.match(historySource, /\{\{\s*item\.typeLabel\s*\}\}/);
  assert.doesNotMatch(styleBlock(historySource, '<view class="tile-meta">'), /item\.categoryLabel/);
  assert.doesNotMatch(styleBlock(historySource, '<button v-for="item in overview.recent"'), /class="recent-type"/);

  assert.doesNotMatch(styleBlock(historySource, '.asset-icon'), /linear-gradient/);
  assert.doesNotMatch(styleBlock(historySource, '.asset-tone-prop'), /#ef4444/);
  assert.match(styleBlock(historySource, '.work-tile'), /border:\s*1rpx solid #dce8f6/);
  assert.match(styleBlock(historySource, '.work-tile'), /height:\s*316rpx/);
  assert.match(styleBlock(historySource, '.work-tile'), /flex-direction:\s*column/);
  assert.match(styleBlock(historySource, '.tile-preview'), /flex:\s*0 0 188rpx/);
  assert.match(styleBlock(historySource, '.tile-meta'), /justify-content:\s*flex-start/);
  assert.doesNotMatch(historySource, /\.tile-preview\.tile-portrait[\s\S]*height:/);
  assert.doesNotMatch(historySource, /\.tile-preview\.tile-portrait-tall[\s\S]*height:/);
  assert.doesNotMatch(historySource, /\.tile-preview\.tile-story[\s\S]*height:/);
});
