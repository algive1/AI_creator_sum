import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/routes/files.ts', import.meta.url), 'utf8');

function splitTopLevelList(text) {
  const result = [];
  let current = '';
  let quote = '';
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const prev = text[i - 1];
    if (quote) {
      current += ch;
      if (ch === quote && prev !== '\\') quote = '';
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) result.push(current.trim());
  return result.filter(Boolean);
}

function findMatchingParen(text, openIndex) {
  let depth = 0;
  let quote = '';
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    const prev = text[i - 1];
    if (quote) {
      if (ch === quote && prev !== '\\') quote = '';
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractFileExportInsert() {
  const insertIndex = source.indexOf('INSERT INTO files', source.indexOf('exportFileWithSanitize'));
  assert.ok(insertIndex > -1, 'file export INSERT should exist');
  const templateStart = source.lastIndexOf('`', insertIndex);
  const templateEnd = source.indexOf('`', insertIndex + 1);
  assert.ok(templateStart > -1 && templateEnd > templateStart, 'file export INSERT should be in one template string');
  const sql = source.slice(templateStart + 1, templateEnd);
  const columnOpen = sql.indexOf('(');
  const columnClose = findMatchingParen(sql, columnOpen);
  assert.ok(columnOpen > -1 && columnClose > columnOpen, 'file export INSERT should list columns');
  const valuesMatch = /VALUES\s*\(/i.exec(sql.slice(columnClose + 1));
  assert.ok(valuesMatch, 'file export INSERT should include VALUES');
  const valuesOpen = columnClose + 1 + valuesMatch.index + valuesMatch[0].lastIndexOf('(');
  const valuesClose = findMatchingParen(sql, valuesOpen);
  assert.ok(valuesClose > valuesOpen, 'file export INSERT values should close');
  return {
    columns: splitTopLevelList(sql.slice(columnOpen + 1, columnClose)),
    values: splitTopLevelList(sql.slice(valuesOpen + 1, valuesClose)),
  };
}

test('file export insert has values matching its columns', () => {
  const { columns, values } = extractFileExportInsert();
  assert.equal(values.length, columns.length);
});
