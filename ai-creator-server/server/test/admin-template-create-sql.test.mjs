import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/routes/admin-templates.ts', import.meta.url), 'utf8');
const contentTemplatesSource = readFileSync(new URL('../src/routes/content-templates.ts', import.meta.url), 'utf8');

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
    if (ch === '\'' || ch === '"') {
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
  return result;
}

function extractTemplateInsert(text, label = 'template') {
  const match = text.match(/INSERT INTO templates\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)`/);
  assert.ok(match, `${label} INSERT should exist`);
  return {
    columns: splitTopLevelList(match[1]),
    values: splitTopLevelList(match[2]),
  };
}

function extractCreateParameterArray() {
  const payloadStart = source.indexOf('payload.title');
  assert.ok(payloadStart > -1, 'admin template create parameter array should start with payload.title');
  const arrayStart = source.lastIndexOf('[', payloadStart);
  assert.ok(arrayStart > -1, 'admin template create parameter array should exist');
  let depth = 0;
  let quote = '';
  for (let i = arrayStart; i < source.length; i += 1) {
    const ch = source[i];
    const prev = source[i - 1];
    if (quote) {
      if (ch === quote && prev !== '\\') quote = '';
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '[') depth += 1;
    if (ch === ']') depth -= 1;
    if (depth === 0) return source.slice(arrayStart + 1, i);
  }
  assert.fail('admin template create parameter array should close');
}

test('admin template create insert has one value expression for every column', () => {
  const { columns, values } = extractTemplateInsert(source, 'admin template create');
  assert.equal(values.length, columns.length);
});

test('admin template create parameter array matches SQL placeholders', () => {
  const { values } = extractTemplateInsert(source, 'admin template create');
  const placeholderCount = values.filter(item => item === '?').length;
  const parameters = splitTopLevelList(extractCreateParameterArray());
  const parameterCount = parameters.length;
  assert.ok(parameters.some(item => item.includes('payload.statusPatch.reviewStatus')));
  assert.equal(parameterCount, placeholderCount);
});

test('user public template submit insert has one value expression for every column', () => {
  const { columns, values } = extractTemplateInsert(contentTemplatesSource, 'user public template submit');
  assert.equal(values.length, columns.length);
});
