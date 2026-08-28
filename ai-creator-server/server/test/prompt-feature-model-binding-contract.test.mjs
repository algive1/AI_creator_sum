import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const aiFeatureSource = readFileSync(new URL('../src/services/ai-feature.service.ts', import.meta.url), 'utf8');
const toolsSource = readFileSync(new URL('../src/services/tools.service.ts', import.meta.url), 'utf8');
const tasksRouteSource = readFileSync(new URL('../src/routes/tasks.ts', import.meta.url), 'utf8');
const toolsRouteSource = readFileSync(new URL('../src/routes/tools.ts', import.meta.url), 'utf8');

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
