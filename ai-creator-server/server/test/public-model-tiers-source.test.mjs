import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modelTierListService = readFileSync(new URL('../src/services/model-tier-list.service.ts', import.meta.url), 'utf8');
const publicConfigRoute = readFileSync(new URL('../src/routes/public-config.ts', import.meta.url), 'utf8');
const adminTiersRoute = readFileSync(new URL('../src/routes/admin-tiers.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../src/db/schema.sql', import.meta.url), 'utf8');

test('public model tier list exposes bound real model names for user-facing model selection', () => {
  assert.match(modelTierListService, /m\.display_name/);
  assert.match(modelTierListService, /modelName:\s*model\?\.display_name/);
  assert.match(modelTierListService, /apiModelName:\s*model\?\.api_model_name/);
  assert.match(modelTierListService, /upstreamModelCode:\s*model\?\.upstream_model_code/);
});

test('public model tier list supports web-only visibility and display names', () => {
  assert.match(modelTierListService, /clientType\??:/);
  assert.match(modelTierListService, /web_visible/);
  assert.match(modelTierListService, /web_display_name/);
  assert.match(modelTierListService, /web_sort_order/);
  assert.match(modelTierListService, /clientType\s*===\s*['"]web['"]/);
  assert.match(modelTierListService, /webDisplayName:/);
  assert.match(modelTierListService, /webVisible:/);
  assert.match(modelTierListService, /webSortOrder:/);
});

test('public model tiers route passes web client type into tier listing', () => {
  assert.match(publicConfigRoute, /clientType/);
  assert.match(publicConfigRoute, /getModelTierList\(feature,\s*req\.user\?\.userId,\s*\{\s*clientType/);
});

test('admin model tier API and schema expose web display controls', () => {
  for (const field of ['web_visible', 'web_display_name', 'web_sort_order']) {
    assert.match(schema, new RegExp(field));
    assert.match(adminTiersRoute, new RegExp(field));
  }
  for (const prop of ['webVisible', 'webDisplayName', 'webSortOrder']) {
    assert.match(adminTiersRoute, new RegExp(prop));
  }
});
