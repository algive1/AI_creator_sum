import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..', '..');

function read(...parts: string[]): string {
  return fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');
}

function assertIncludesAll(source: string, values: string[], message: string): void {
  for (const value of values) {
    assert(source.includes(value), `${message}: missing ${value}`);
  }
}

const featureConfig = read('ai-creator-server/admin-web/src/pages/FeatureConfig.tsx');
const providerModels = read('ai-creator-server/admin-web/src/pages/ProviderModels.tsx');
const adminTiers = read('ai-creator-server/server/src/routes/admin-tiers.ts');
const aiFeature = read('ai-creator-server/server/src/services/ai-feature.service.ts');
const openaiCompatible = read('ai-creator-server/server/src/services/adapters/openai-compatible.adapter.ts');
const hongniaoAdapter = read('ai-creator-server/server/src/services/adapters/hongniao.adapter.ts');
const providerKeySync = read('ai-creator-server/server/src/services/provider-key-sync.service.ts');
const hongniaoMigration = read('ai-creator-server/server/src/migrations/20260615_002_seed_hongniao_video_provider.sql');
const deepseekMigration = read('ai-creator-server/server/src/migrations/20260617_002_seed_deepseek_prompt_optimize.sql');
const videoPage = read('uni-app/src/pages/ai-video/index.vue');

assert(adminTiers.includes('syncTierCapabilitiesFromPrimaryModel'), 'binding save should sync tier capabilities from primary model config');
assert(adminTiers.includes('/model-tiers/repair-capabilities'), 'admin tiers should expose a one-time repair endpoint');

assert(!featureConfig.includes('生成 JSON'), 'pricing matrix should not require a generate JSON button');
assert(!featureConfig.includes('applyPricingBuilder'), 'pricing matrix should save rules directly without an applyPricingBuilder helper');
assert(!featureConfig.includes('name="pricingRules"'), 'pricing rules JSON textarea should be removed from the main tier form');
assert(!featureConfig.includes('label="入口标识"'), 'entry key should not be shown in the main tier form');
assert(!featureConfig.includes('name="badge"'), 'front badge field should be removed');
assert(!featureConfig.includes('name="iconFileId"'), 'front icon field should be removed');
assert(!featureConfig.includes('name="displayColor"'), 'display color field should be removed');
assert(featureConfig.includes('buildPricingRulesFromBuilder(values)'), 'save should build pricing rules from matrix fields');
assert(featureConfig.includes('getModelPricingOptions'), 'feature config should derive pricing duration/quality options from selected model config');
assert(featureConfig.includes('applyModelPricingDefaults'), 'selecting a primary model should prefill blank pricing matrix rows from model config');
assert(featureConfig.includes('pricingDurationSelectOptions'), 'pricing matrix duration field should render selectable model durations');
assert(featureConfig.includes('pricingQualitySelectOptions'), 'pricing matrix quality field should render selectable model qualities/resolutions');
assert(featureConfig.includes('onChange={(value) => applyModelPricingDefaults(Number(value))}'), 'primary model selector should refresh pricing options when changed');
assert(featureConfig.includes("prev.primaryModelId !== cur.primaryModelId"), 'pricing matrix should rerender when the selected primary model changes');
assert(featureConfig.includes('pricingModelOptionsKey'), 'pricing defaults should track the selected model option set before deciding whether to rebuild rows');

assertIncludesAll(providerModels, ['deepseek', 'DeepSeek', 'https://api.deepseek.com', 'deepseek-v4-flash', 'text_chat'], 'admin provider page should include DeepSeek preset and text capability');
assertIncludesAll(providerModels, ['确认同步并硬删除过期模型', '先归档快照，再硬删除 live model', 'okButtonProps: { disabled: preview.removalBlocked }'], 'admin provider sync UI should describe and guard hard deletion');
assert(!providerModels.includes('确认同步并软停用'), 'admin provider sync UI must not describe upstream removal as soft disable');
assertIncludesAll(providerKeySync, ["providerKey: 'deepseek'", 'DEEPSEEK_API_KEY'], 'DeepSeek API key should sync from environment without plaintext in repo');
assertIncludesAll(deepseekMigration, ['provider_key, provider_type', 'deepseek', 'https://api.deepseek.com', 'deepseek-v4-flash', 'prompt_optimize', 'ai.prompt_optimize.model_id'], 'DeepSeek migration should seed provider, model, and binding');

assert(aiFeature.includes("prompt_optimize: ['text_chat', 'text_generation', 'prompt_optimize']"), 'prompt optimize should accept text_generation capability');
assert(aiFeature.includes('model.config'), 'text feature calls should load model config/default params');
assert(openaiCompatible.includes("taskType.startsWith('text')") || openaiCompatible.includes("params.taskType.includes('text')"), 'OpenAI-compatible adapter should support text model tests');

assert(hongniaoAdapter.includes("copyDefined(body, 'resolution'"), 'Hongniao video request should pass resolution');
assertIncludesAll(hongniaoMigration, [
  'zh-grok-video-1.0',
  'zh-grok-video-1.5',
  'sdquan-2',
  'xb-sora2',
  'sora-2-z',
  'veo-omni-flash',
  'P-weo3.1',
  'veo_3_1-xs',
  'me-kuaile1.0',
  'quanneng-j',
  'quanneng2.0',
  'tier_model_bindings',
  'tier_capabilities',
], 'Hongniao migration should seed 11 video models and public tiers');

assert(!videoPage.includes('item.tag'), 'mini program video tier display should not depend on front badge/tag');
assert(!videoPage.includes('iconUrl'), 'mini program video tier display should not depend on front icon');

console.log('provider model rollout checks passed');
