import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settingsSource = readFileSync(new URL('./settings/index.tsx', import.meta.url), 'utf8');
const contentSource = readFileSync(new URL('./ContentManagement.tsx', import.meta.url), 'utf8');

test('settings page links AI text settings to the prompt optimize system prompt editor', () => {
  assert.match(settingsSource, /openPromptOptimizePrompt/);
  assert.match(settingsSource, /\/content\?tab=prompt&targetFeature=prompt_optimize/);
  assert.match(settingsSource, /\/ai-models\/features\?feature=prompt_optimize/);
  assert.match(settingsSource, /配置提示词优化模型/);
  assert.match(settingsSource, /编辑提示词优化系统提示词/);
});

test('content management can focus prompt optimize system prompts from query params', () => {
  assert.match(contentSource, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(contentSource, /const PROMPT_OPTIMIZE_TARGET_FEATURE = 'prompt_optimize'/);
  assert.match(contentSource, /targetFeature: PROMPT_OPTIMIZE_TARGET_FEATURE/);
  assert.match(contentSource, /dataSource=\{prompts\}/);
  assert.doesNotMatch(contentSource, /const features = \[/);
  assert.doesNotMatch(contentSource, /targetFeatureFilter/);
  assert.match(contentSource, /新增优化规则/);
  assert.match(contentSource, /系统提示词只注入“提示词优化”功能/);
  assert.match(contentSource, /系统内置补全规则仍会自动保留/);
});
