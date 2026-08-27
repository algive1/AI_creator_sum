import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const homeSource = readFileSync(new URL('./index.vue', import.meta.url), 'utf8');

test('home inspirations do not render demo templates before API data loads', () => {
  assert.doesNotMatch(homeSource, /const inspirations = ref<InspirationItem\[\]>\(fallbackInspirations\)/);
  assert.match(homeSource, /const inspirations = ref<InspirationItem\[\]>\(\[\]\)/);
});

test('demo inspiration templates remain development-only API failure fallback', () => {
  assert.match(homeSource, /if \(!list\.length && isDevFallbackEnabled && reset\)[\s\S]*inspirations\.value = fallbackInspirations/);
  assert.match(homeSource, /if \(isDevFallbackEnabled && reset\)[\s\S]*inspirations\.value = fallbackInspirations/);
});

test('home inspiration cards use a two-column image-first overlay layout', () => {
  assert.match(homeSource, /const columns: InspirationItem\[\]\[\] = \[\[\], \[\]\]/);
  assert.match(homeSource, /class="inspiration-overlay"/);
  assert.match(homeSource, /class="inspiration-source"/);
  assert.match(homeSource, /class="inspiration-favorite"/);
  assert.match(homeSource, /@tap\.stop="toggleFavorite\(item\)"/);
  assert.doesNotMatch(homeSource, /<view class="inspiration-title">\{\{ item\.title \}\}<\/view>\s*<view class="inspiration-meta">\{\{ item\.author \}\}<\/view>/);
});

test('home inspirations wire favorite state through card and preview sheet', () => {
  assert.match(homeSource, /favoriteTemplate,\s*getHomeInspirations/);
  assert.match(homeSource, /unfavoriteTemplate/);
  assert.match(homeSource, /@favorite="togglePreviewFavorite"/);
  assert.match(homeSource, /pendingFavoriteId/);
  assert.match(homeSource, /onLoad\(\(query\) => \{[\s\S]*pendingFavoriteId\.value = String\(query\?\.favoriteId \|\| ''\)/);
  assert.match(homeSource, /function toggleFavorite\(item: InspirationItem\)/);
  assert.match(homeSource, /function applyFavoriteState\(id: string, isFavorited: boolean, count: number\)/);
  assert.match(homeSource, /favoriteCount\?: number/);
  assert.match(homeSource, /isFavorited\?: boolean/);
});

test('home inspiration card title is constrained to one line', () => {
  const titleBlock = homeSource.match(/\.inspiration-title\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.ok(titleBlock, 'inspiration title style block should exist');
  assert.match(titleBlock, /white-space:\s*nowrap/);
  assert.match(titleBlock, /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(titleBlock, /-webkit-line-clamp:\s*2/);
  assert.doesNotMatch(titleBlock, /display:\s*-webkit-box/);
});
