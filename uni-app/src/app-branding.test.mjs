import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const BRAND_NAME = 'AI艺术生成工坊';
const OLD_BRAND_RE = /AI\s?创作工坊|AIGC生成艺术工坊|AI创作助手客服咨询/g;

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('mini program visible app name defaults use the unified brand name', () => {
  const files = [
    './manifest.json',
    './pages.json',
    './stores/config.ts',
    './utils/share.ts',
    './pages/home/index.vue',
    './pages/inspiration/index.vue',
    './pages/invite/index.vue',
    './pages/login/index.vue',
    './pages/points/index.vue',
    './pages/profile/index.vue',
    './pages/tools/run/index.vue',
  ];

  for (const file of files) {
    const source = read(file);
    assert.match(source, new RegExp(BRAND_NAME), `${file} should include the unified brand name`);
    assert.doesNotMatch(source, OLD_BRAND_RE, `${file} should not include the old brand name`);
  }
});

test('server public defaults use the unified brand name', () => {
  const files = [
    '../../ai-creator-server/server/src/routes/public-config.ts',
    '../../ai-creator-server/server/src/routes/install.ts',
    '../../ai-creator-server/server/src/services/install.service.ts',
  ];

  for (const file of files) {
    const source = read(file);
    assert.match(source, new RegExp(BRAND_NAME), `${file} should include the unified brand name`);
    assert.doesNotMatch(source, OLD_BRAND_RE, `${file} should not include the old brand name`);
  }
});

test('brand migration updates existing persisted app name settings', () => {
  const migration = new URL('../../ai-creator-server/server/src/migrations/20260827_001_unify_app_brand_name.sql', import.meta.url);
  assert.ok(existsSync(migration), 'brand migration should exist');
  const source = readFileSync(migration, 'utf8');
  assert.match(source, /UPDATE system_configs/);
  assert.match(source, /site\.name/);
  assert.match(source, /site\.admin_title/);
  assert.match(source, /customer_service\.send_message_title/);
  assert.match(source, new RegExp(BRAND_NAME));
  assert.match(source, OLD_BRAND_RE, 'migration should explicitly target the legacy values');
});
