import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  homeEntryDisabledMessage,
  isHomeEntryGenerationAvailable,
  isHomeEntryMaintenanceMode,
} from './home-entry.ts';

const currentDir = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(currentDir, '..');

test('comic maintenance mode blocks the home entry with configured message', () => {
  const config = {
    homeEntrySwitches: {
      comic: {
        enabled: false,
        message: '漫剧功能开发进度90%，请耐心等待',
      },
    },
  };

  assert.equal(isHomeEntryMaintenanceMode(config, 'comic'), true);
  assert.equal(isHomeEntryGenerationAvailable(config, 'comic'), false);
  assert.equal(homeEntryDisabledMessage(config, 'comic'), '漫剧功能开发进度90%，请耐心等待');
});

test('home page does not bypass maintenance mode for the comic entry', () => {
  const homeSource = readFileSync(resolve(srcDir, 'pages/home/index.vue'), 'utf8');

  assert.match(homeSource, /isHomeEntryMaintenanceMode\(configStore\.publicConfig,\s*key\)/);
  assert.doesNotMatch(homeSource, /key\s*!==\s*['"]comic['"]\s*&&\s*isHomeEntryMaintenanceMode/);
});

test('home entry defaults to available when config is missing', () => {
  assert.equal(isHomeEntryMaintenanceMode({}, 'comic'), false);
  assert.equal(isHomeEntryGenerationAvailable({}, 'comic'), true);
  assert.equal(homeEntryDisabledMessage({}, 'comic'), '生漫剧功能维护中，请稍后再试');
});
