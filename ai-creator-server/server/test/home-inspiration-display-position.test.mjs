import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const contentTemplatesSource = readFileSync(new URL('../src/routes/content-templates.ts', import.meta.url), 'utf8');
const adminTemplatesSource = readFileSync(new URL('../src/routes/admin-templates.ts', import.meta.url), 'utf8');
const miniTemplateApiSource = readFileSync(new URL('../../../uni-app/src/api/template.ts', import.meta.url), 'utf8');
const homePageSource = readFileSync(new URL('../../../uni-app/src/pages/home/index.vue', import.meta.url), 'utf8');
const imageTemplatesSource = readFileSync(new URL('../../admin-web/src/pages/ImageTemplates.tsx', import.meta.url), 'utf8');
const videoTemplatesSource = readFileSync(new URL('../../admin-web/src/pages/VideoTemplates.tsx', import.meta.url), 'utf8');
const inspirationSquareSource = readFileSync(new URL('../../admin-web/src/pages/InspirationSquare.tsx', import.meta.url), 'utf8');

function routeBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start > -1, `${marker} route should exist`);
  const nextRoute = source.indexOf('\nrouter.', start + marker.length);
  return source.slice(start, nextRoute > -1 ? nextRoute : undefined);
}

function sourceBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start > -1, `${marker} block should exist`);
  return source.slice(start);
}

test('backend exposes a separate home inspiration endpoint with inspiration fallback', () => {
  const block = routeBlock(contentTemplatesSource, "router.get('/home-inspirations'");
  const helperBlock = sourceBlock(contentTemplatesSource, 'async function queryDisplayPositionTemplates');
  assert.match(block, /home_inspiration/);
  assert.match(block, /fallback/);
  assert.match(block, /queryDisplayPositionTemplates\('home_inspiration'/);
  assert.match(block, /queryDisplayPositionTemplates\('inspiration'/);
  assert.match(helperBlock, /templateDefaultOrderBy\(position, isRandomTemplateRequest\(req\)\)/);
});

test('admin inspiration list includes templates configured only for home inspiration', () => {
  const listBlock = routeBlock(adminTemplatesSource, "router.get('/templates'");
  assert.match(listBlock, /\$\.home_inspiration/);
  assert.match(listBlock, /\$\.inspiration/);
});

test('mini program home calls the home inspiration endpoint instead of the navigation inspiration feed', () => {
  assert.match(miniTemplateApiSource, /export function getHomeInspirations/);
  assert.match(miniTemplateApiSource, /\/templates\/home-inspirations/);
  assert.match(homePageSource, /getHomeInspirations/);
  assert.doesNotMatch(homePageSource, /getInspirations<\{/);
});

test('admin template pages expose the home inspiration display position', () => {
  for (const source of [imageTemplatesSource, videoTemplatesSource, inspirationSquareSource]) {
    assert.match(source, /home_inspiration/);
    assert.match(source, /首页灵感推荐/);
  }
});

test('inspiration square editor stores explicit display positions instead of forcing navigation inspiration', () => {
  assert.match(inspirationSquareSource, /displayConfig/);
  assert.doesNotMatch(inspirationSquareSource, /displayConfig:\s*\{\s*\.\.\.existingConfig,\s*inspiration:/);
});

test('public template payload includes display author fields for home and inspiration cards', () => {
  const helperBlock = sourceBlock(contentTemplatesSource, 'async function toPublicTemplate');
  assert.match(contentTemplatesSource, /LEFT JOIN users u ON u\.id = t\.user_id/);
  assert.match(helperBlock, /author: displayTemplateAuthor\(row\)/);
  assert.match(helperBlock, /nickname: displayTemplateAuthor\(row\)/);
  assert.match(helperBlock, /avatarUrl: row\.avatar_url/);
  assert.match(helperBlock, /authorAvatar: row\.avatar_url/);
  assert.match(contentTemplatesSource, /function displayTemplateAuthor\(row/);
  assert.match(contentTemplatesSource, /@官方灵感/);
  assert.match(contentTemplatesSource, /`@用户\$\{row\.user_id\}`/);
});
