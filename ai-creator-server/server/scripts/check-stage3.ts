import fs from 'node:fs';
import path from 'node:path';

const serverRoot = path.resolve(__dirname, '..');

function read(rel: string) {
  return fs.readFileSync(path.join(serverRoot, rel), 'utf8');
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const settings = read('src/services/settings.service.ts');
const installMiddleware = read('src/middleware/install.ts');
const installService = read('src/services/install.service.ts');

assert(
  /static async set\(\s*key: string,\s*value: string,\s*group: string,\s*adminUserId: number/.test(settings),
  'SettingsService.set must expose the group-aware signature',
);
assert(
  /await this\.set\(key,\s*value,\s*group,\s*adminUserId,\s*\{\s*isSecret\s*\}\)/.test(settings),
  'SettingsService.setGroup must pass the current group to set',
);
assert(
  /VALUES \(\?, \?, 'string', \?, 1/.test(settings) &&
  /VALUES \(\?, \?, 'string', \?, 0/.test(settings),
  'system_configs inserts must use the runtime config_group parameter',
);
assert(
  /ON DUPLICATE KEY UPDATE[^`]*config_group = \?/.test(settings),
  'system_configs updates must keep config_group in sync with the saved group',
);
assert(
  /VALUES \(\?, \?, \?, 'update'/.test(settings),
  'config_change_logs must write the runtime config_group parameter',
);
assert(
  /if \(!value \|\| value\.trim\(\) === ''\) \{\s*await conn\.rollback\(\);\s*return;\s*\}/.test(settings),
  'empty sensitive values must keep the previous value',
);
assert(
  /export function resetInstallCache\(\)/.test(installMiddleware),
  'install middleware must export resetInstallCache',
);
assert(
  /export function setInstallCacheInstalled\(\)/.test(installMiddleware),
  'install middleware must export setInstallCacheInstalled',
);
assert(
  /setInstallCacheInstalled\(\);/.test(installService),
  'finishInstall must refresh the installed cache after writing the lock file',
);

console.log('check:stage3 passed');
