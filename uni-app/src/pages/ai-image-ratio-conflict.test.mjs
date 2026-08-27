import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./ai-image/index.vue', import.meta.url), 'utf8');

test('ai image submit confirms prompt ratio conflicts before creating task', () => {
  assert.match(source, /function confirmRatioConflictBeforeSubmit/);
  assert.match(source, /function detectPromptRatioConflict/);
  assert.match(source, /uni\.showModal/);

  const confirmIndex = source.indexOf('await confirmRatioConflictBeforeSubmit(finalPrompt, sizeOption.ratio)');
  const submitIndex = source.indexOf('createImageTask<Record<string, unknown>>');
  assert.ok(confirmIndex > -1, 'submit should call conflict confirmation');
  assert.ok(submitIndex > -1, 'submit should create image task');
  assert.ok(confirmIndex < submitIndex, 'conflict confirmation should happen before task creation');
});

test('template ratio is normalized and applied when using an image template', () => {
  assert.match(source, /function normalizedTemplateRatio/);
  assert.match(source, /function applyTemplateRatio/);
  assert.match(source, /ratio:\s*normalizedTemplateRatio/);

  const useTemplateIndex = source.indexOf('async function useTemplate');
  const applyIndex = source.indexOf('applyTemplateRatio(item.ratio)');
  assert.ok(useTemplateIndex > -1, 'useTemplate should exist');
  assert.ok(applyIndex > useTemplateIndex, 'template ratio should be applied while using template');
});
