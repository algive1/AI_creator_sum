import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const servicePath = path.join(root, 'src/services/tools.service.ts');
const service = fs.readFileSync(servicePath, 'utf8');

const resolveStart = service.indexOf('async function resolveToolConfig');
const resolveEnd = service.indexOf('\nfunction toolFeatureKey', resolveStart);
assert(resolveStart >= 0 && resolveEnd > resolveStart, 'resolveToolConfig function should exist');

const resolveToolConfig = service.slice(resolveStart, resolveEnd);

assert(
  service.includes('loadToolsSettingsSnapshot'),
  'tools config should preload the tools settings group once',
);
assert(
  /getAdminToolsConfig[\s\S]*loadToolsSettingsSnapshot/.test(service),
  'admin tools config should use the preloaded tools settings snapshot',
);
assert(
  /getToolsConfig[\s\S]*loadToolsSettingsSnapshot/.test(service),
  'public tools config should use the preloaded tools settings snapshot',
);
assert(
  !/SettingsService\.get(?:Boolean|String|get)\(/.test(resolveToolConfig),
  'resolveToolConfig must not issue per-field SettingsService reads for every tool',
);

console.log('[tools-config-query-budget] PASS');
