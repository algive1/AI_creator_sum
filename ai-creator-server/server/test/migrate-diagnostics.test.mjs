import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../scripts/migrate.ts', import.meta.url), 'utf8');

test('migration runner reports the failing SQL statement index and preview', () => {
  assert.match(source, /formatSqlExecutionError/);
  assert.match(source, /statementIndex/);
  assert.match(source, /SQL #\$\{statementIndex \+ 1\}/);
  assert.match(source, /sqlState|errno|code/);
});
