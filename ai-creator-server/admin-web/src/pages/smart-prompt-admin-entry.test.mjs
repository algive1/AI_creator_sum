import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settingsSource = readFileSync(new URL('./settings/index.tsx', import.meta.url), 'utf8');
const contentSource = readFileSync(new URL('./ContentManagement.tsx', import.meta.url), 'utf8');

test('settings page links AI text settings to the prompt optimize system prompt editor', () => {
  assert.match(settingsSource, /openPromptOptimizePrompt/);
  assert.match(settingsSource, /\/content\?tab=prompt&targetFeature=prompt_optimize/);
  assert.match(settingsSource, /编辑智能补全提示词/);
});

test('content management can focus prompt optimize system prompts from query params', () => {
  assert.match(contentSource, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(contentSource, /targetFeatureFilter/);
  assert.match(contentSource, /const visiblePrompts = targetFeatureFilter/);
  assert.match(contentSource, /item\.targetFeature === targetFeatureFilter/);
  assert.match(contentSource, /dataSource=\{visiblePrompts\}/);
  assert.match(contentSource, /targetFeature:\s*targetFeatureFilter \|\| undefined/);
});
