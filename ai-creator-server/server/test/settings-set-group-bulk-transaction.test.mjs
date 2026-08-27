import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('src/services/settings.service.ts'), 'utf8');

test('SettingsService.setGroup writes a group in one transaction instead of calling set per key', () => {
  const match = source.match(/static async setGroup[\s\S]*?\n  }\n\n  static clearCache/);
  assert.ok(match, 'setGroup implementation should exist');
  assert.match(match[0], /const conn = await getConnection\(\)/);
  assert.match(match[0], /await conn\.beginTransaction\(\)/);
  assert.match(match[0], /await conn\.commit\(\)/);
  assert.doesNotMatch(match[0], /await this\.set\(/);
});

