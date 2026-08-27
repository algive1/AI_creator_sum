import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const serverIndex = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const envProductionExample = readFileSync(new URL('../.env.production.example', import.meta.url), 'utf8');
const releaseScript = readFileSync(new URL('../../scripts/build-release.sh', import.meta.url), 'utf8');

test('server selects user-web dist for configured public web hosts only', () => {
  assert.match(serverIndex, /WEB_APP_HOSTS/);
  assert.match(serverIndex, /user-web\/dist/);
  assert.match(serverIndex, /admin-web\/dist/);
  assert.match(serverIndex, /selectFrontendDist|resolveFrontendDist|isUserWebHost/);
  assert.match(serverIndex, /ooa8\.com/);
  assert.match(serverIndex, /req\.path\.startsWith\(['"`]\/api\/['"`]\)/);
});

test('environment examples document ooa8.com user web host config', () => {
  assert.match(envExample, /WEB_APP_HOSTS=ooa8\.com,www\.ooa8\.com/);
  assert.match(envProductionExample, /WEB_APP_HOSTS=ooa8\.com,www\.ooa8\.com/);
});

test('release build compiles and packages user-web alongside admin-web', () => {
  assert.match(releaseScript, /STAGING_DIR\/user-web/);
  assert.match(releaseScript, /cd "\$STAGING_DIR\/user-web"[\s\S]*npm ci[\s\S]*npm run build/);
  assert.match(releaseScript, /copy_file "\$PROJECT_ROOT\/user-web\/package\.json"/);
  assert.match(releaseScript, /copy_dir "\$PROJECT_ROOT\/user-web\/src"/);
  assert.doesNotMatch(releaseScript, /copy_dir "\$PROJECT_ROOT\/user-web\/dist"/);
});
