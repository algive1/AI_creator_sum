import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../../scripts/build-release.sh', import.meta.url), 'utf8');
const runBuildChecks = script.match(/run_build_checks\(\) \{([\s\S]*?)\n\}/)?.[1] || '';

test('release build creates admin-web dist from the staged source tree', () => {
  assert.match(
    runBuildChecks,
    /cd "\$STAGING_DIR\/admin-web"[\s\S]*npm ci[\s\S]*npm run build/,
    'admin-web npm install and build should run inside staging',
  );
  assert.doesNotMatch(
    runBuildChecks,
    /cd "\$PROJECT_ROOT\/admin-web"[\s\S]*npm ci/,
    'release build must not mutate source admin-web/node_modules',
  );
  assert.doesNotMatch(
    runBuildChecks,
    /copy_dir "\$PROJECT_ROOT\/admin-web\/dist"/,
    'release package should use the staged admin-web dist',
  );
});

test('release build creates user-web dist from the staged source tree', () => {
  assert.match(
    runBuildChecks,
    /cd "\$STAGING_DIR\/user-web"[\s\S]*npm ci[\s\S]*npm run build/,
    'user-web npm install and build should run inside staging',
  );
  assert.doesNotMatch(
    runBuildChecks,
    /cd "\$PROJECT_ROOT\/user-web"[\s\S]*npm ci/,
    'release build must not mutate source user-web/node_modules',
  );
  assert.doesNotMatch(
    script,
    /copy_dir "\$PROJECT_ROOT\/user-web\/dist"/,
    'release package should use the staged user-web dist',
  );
});
