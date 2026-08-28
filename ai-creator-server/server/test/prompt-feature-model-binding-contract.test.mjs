/* global URL */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const aiFeatureSource = readFileSync(new URL('../src/services/ai-feature.service.ts', import.meta.url), 'utf8');
const toolsSource = readFileSync(new URL('../src/services/tools.service.ts', import.meta.url), 'utf8');
const tasksRouteSource = readFileSync(new URL('../src/routes/tasks.ts', import.meta.url), 'utf8');
const toolsRouteSource = readFileSync(new URL('../src/routes/tools.ts', import.meta.url), 'utf8');
const systemPromptSource = readFileSync(new URL('../src/services/system-prompt.service.ts', import.meta.url), 'utf8');
const adminContentSource = readFileSync(new URL('../src/routes/admin-content.ts', import.meta.url), 'utf8');
const contentManagementSource = readFileSync(new URL('../../admin-web/src/pages/ContentManagement.tsx', import.meta.url), 'utf8');

test('text prompt optimization resolves feature tier bindings before legacy model id', () => {
  assert.match(aiFeatureSource, /resolveBoundTextFeatureModel\(featureKey, selection\)/);
  assert.match(aiFeatureSource, /resolveLegacyTextFeatureModel\(featureKey, config\.modelId\)/);
  assert.match(aiFeatureSource, /t\.tier_key = \?/);
  assert.match(aiFeatureSource, /model_features f/);
});

test('prompt optimization and reverse prompt routes accept tier selection', () => {
  assert.match(tasksRouteSource, /tierKey, tier_key, tierId, tier_id/);
  assert.match(tasksRouteSource, /tierKey: String\(tierKey/);
  assert.match(toolsRouteSource, /req\.body\?\.tierKey/);
  assert.match(toolsRouteSource, /tierKey: String\(req\.body\?\.tierKey/);
  assert.match(toolsSource, /resolveToolModel\('tool_prompt_reverse', requestedSelection\)/);
  assert.doesNotMatch(toolsSource, /buildPromptReverseText/);
});

test('system prompts are restricted to prompt optimization at runtime and in admin surfaces', () => {
  assert.match(systemPromptSource, /PROMPT_OPTIMIZE_SYSTEM_PROMPT_FEATURE = 'prompt_optimize'/);
  assert.match(systemPromptSource, /if \(!isPromptOptimizeSystemPromptTarget\(targetFeature\)\) return ''/);
  assert.match(aiFeatureSource, /const configuredPrompt = await resolveSystemPromptByFeature\('prompt_optimize'\)/);
  assert.doesNotMatch(aiFeatureSource, /resolveSystemPromptByFeature\(featureKey\)/);
  assert.match(adminContentSource, /WHERE target_feature = \?/);
  assert.match(adminContentSource, /系统提示词仅支持提示词优化功能/);
  assert.match(contentManagementSource, /const PROMPT_OPTIMIZE_TARGET_FEATURE = 'prompt_optimize'/);
  assert.doesNotMatch(contentManagementSource, /const features = \[/);
  assert.match(contentManagementSource, /系统提示词只注入“提示词优化”功能/);
});
