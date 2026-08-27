import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/services/storage/storage-config-loader.ts', import.meta.url), 'utf8');
const adminRoutes = readFileSync(new URL('../src/routes/admin.ts', import.meta.url), 'utf8');

test('storage config preload uses a cache and explicit invalidation', () => {
  assert.match(source, /STORAGE_CONFIG_PRELOAD_CACHE_TTL_MS/);
  assert.match(source, /invalidateStorageConfigCache/);
  assert.match(source, /preloadStorageConfigs\([^)]*force/);
});

test('storage config preload does not reset the adapter on every cached call', () => {
  assert.match(source, /shouldResetAdapter/);
  assert.doesNotMatch(source, /StorageService\.resetAdapter\(\);\s*console\.log\('\[StorageConfig\] Preloaded storage\.\*/);
});

test('admin settings save forces storage config refresh after writes', () => {
  const forceRefreshCalls = adminRoutes.match(/preloadStorageConfigs\(\{\s*force:\s*true\s*\}\)/g) || [];
  assert.equal(forceRefreshCalls.length, 2);
});
