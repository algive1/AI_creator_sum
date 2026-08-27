import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const contentTemplatesSource = readFileSync(new URL('../src/routes/content-templates.ts', import.meta.url), 'utf8');
const publicConfigSource = readFileSync(new URL('../src/routes/public-config.ts', import.meta.url), 'utf8');
const serverIndexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const miniTemplateApiSource = readFileSync(new URL('../../../uni-app/src/api/template.ts', import.meta.url), 'utf8');

function routeBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start > -1, `${marker} route should exist`);
  const nextRoute = source.indexOf('\nrouter.', start + marker.length);
  return source.slice(start, nextRoute > -1 ? nextRoute : undefined);
}

test('approved user shared templates remain available in mini program template list when public sharing is enabled', () => {
  const queryTemplatesBlock = sourceBlock(contentTemplatesSource, 'async function queryTemplates');
  assert.match(queryTemplatesBlock, /template\.user_public_enabled/);
  assert.match(queryTemplatesBlock, /if \(!publicUserTemplatesEnabled\)[\s\S]*t\.source = 'official'/);
});

test('approved user shared templates can appear in inspiration feed', () => {
  const block = routeBlock(contentTemplatesSource, "router.get('/inspirations'");
  const helperBlock = sourceBlock(contentTemplatesSource, 'async function queryDisplayPositionTemplates');
  assert.match(block, /queryDisplayPositionTemplates\('inspiration'/);
  assert.match(helperBlock, /template\.user_public_enabled/);
  assert.match(helperBlock, /sourceFilter/);
  assert.match(helperBlock, /position === 'inspiration' && publicUserTemplatesEnabled/);
  assert.match(helperBlock, /OR t\.source = 'user'/);
});

test('approved user shared templates can appear in top inspiration when configured', () => {
  const block = routeBlock(contentTemplatesSource, "router.get('/inspirations/top'");
  assert.match(block, /template\.user_public_enabled/);
  assert.match(block, /sourceFilter/);
  assert.match(block, /\$\{sourceFilter\}/);
  assert.doesNotMatch(block, /AND t\.source = 'official'/);
});

test('legacy public template endpoint includes user shared templates when public sharing is enabled', () => {
  const block = routeBlock(publicConfigSource, "router.get('/public/templates'");
  assert.match(block, /template\.user_public_enabled/);
  assert.match(block, /sourceFilter/);
  assert.match(block, /\$\{sourceFilter\}/);
});

test('mini program template API does not cache template list after review state changes', () => {
  assert.doesNotMatch(miniTemplateApiSource, /get<T>\('\/templates', params, \{ silent: true, cacheTtl: 60_000 \}\)/);
  assert.match(miniTemplateApiSource, /get<T>\('\/templates', params, \{ silent: true \}\)/);
});

test('template API routes are not served through stale public cache after review state changes', () => {
  assert.doesNotMatch(serverIndexSource, /app\.use\('\/api\/v1\/templates', cacheFor\(300\), templateRoutes\)/);
  assert.match(serverIndexSource, /app\.use\('\/api\/v1\/templates', templateRoutes\)/);
});

function sourceBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start > -1, `${marker} block should exist`);
  return source.slice(start);
}
