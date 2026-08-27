import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve('src/routes/files.ts'), 'utf8');

test('user direct upload notify records client measured duration', () => {
  assert.match(source, /durationMs\?: number/);
  assert.match(source, /durationMs:\s*normalizePositiveInt\(req\.body\.durationMs\)/);
  assert.match(source, /normalizePositiveInt\(params\.durationMs\)/);
  assert.doesNotMatch(source, /uploadMode,\s*fileSize,\s*mimeType,\s*0,\s*req\.ip/);
});

