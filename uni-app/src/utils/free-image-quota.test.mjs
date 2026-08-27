import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/utils/free-image-quota.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`;
const {
  buildFreeImageQuotaCostText,
  canUseFreeImageQuotaForSelection,
  getFreeImageQuotaRemainingImages,
  isGptImage2FreeQuotaModel,
  isFreeImageQuotaGenerationModeSupported,
  normalizeFreeImageQuotaStatus,
  resolveFreeQuotaReductionCount,
  shouldShowFreeImageQuotaTask,
} = await import(moduleUrl);

const quota = {
  enabled: true,
  eligible: true,
  dailyRemaining: 2,
  dailyLimit: 3,
  totalRemaining: 4,
  totalLimit: 5,
  allowedTierKeys: ['image_standard', 'image_pro'],
  showInDailyTasks: true,
};

const gptImage2Model = {
  modelName: 'GPT Image 2 Preview',
  apiModelName: 'gpt-image-2',
  upstreamModelCode: 'gpt_image_2',
  providerType: 'openai_compatible',
};

const otherImageModel = {
  modelName: 'Stable Image Ultra',
  apiModelName: 'stable-image-ultra',
  upstreamModelCode: 'stable-image-ultra',
  providerType: 'custom',
};

test('shows free generation copy when the selected image count fits current free quota', () => {
  assert.equal(canUseFreeImageQuotaForSelection(quota, 2), true);
  assert.equal(buildFreeImageQuotaCostText(quota, 2, 'consume 8 points'), '免费生成 · 今日剩余 2 张');
});

test('allows free quota for text, question, image-to-image, and image editing modes', () => {
  assert.equal(canUseFreeImageQuotaForSelection(quota, 1, 'image_standard', '文生图', gptImage2Model), true);
  assert.equal(canUseFreeImageQuotaForSelection(quota, 1, 'image_standard', '问生图', gptImage2Model), true);
  assert.equal(canUseFreeImageQuotaForSelection(quota, 1, 'image_standard', '图生图', gptImage2Model), true);
  assert.equal(canUseFreeImageQuotaForSelection(quota, 1, 'image_standard', '图片编辑', gptImage2Model), true);
  assert.equal(canUseFreeImageQuotaForSelection(quota, 1, 'image_standard', 'img2img', gptImage2Model), true);
  assert.equal(canUseFreeImageQuotaForSelection(quota, 1, 'image_standard', 'edit', gptImage2Model), true);
  assert.equal(isFreeImageQuotaGenerationModeSupported('video_create'), false);
});

test('only allows GPT Image 2 related models to use free image quota when model identity is provided', () => {
  assert.equal(isGptImage2FreeQuotaModel({ apiModelName: 'gpt-image-2' }), true);
  assert.equal(isGptImage2FreeQuotaModel({ modelName: 'GPT Image 2' }), true);
  assert.equal(isGptImage2FreeQuotaModel({ upstreamModelCode: 'gptimage2' }), true);
  assert.equal(isGptImage2FreeQuotaModel({ api_model_name: 'gpt-image-2' }), true);
  assert.equal(isGptImage2FreeQuotaModel({ modelCode: 'gpt-image-2' }), true);
  assert.equal(isGptImage2FreeQuotaModel({ freeImageQuotaModelEligible: true }), true);
  assert.equal(isGptImage2FreeQuotaModel(otherImageModel), false);
  assert.equal(canUseFreeImageQuotaForSelection(quota, 1, 'image_standard', '文生图', gptImage2Model), true);
  assert.equal(canUseFreeImageQuotaForSelection(quota, 1, 'image_standard', '文生图', otherImageModel), false);
  assert.equal(buildFreeImageQuotaCostText(quota, 1, 'consume 2 points', 'image_standard', '文生图', otherImageModel), 'consume 2 points');
});

test('falls back to points copy when quota is disabled, ineligible, or insufficient', () => {
  assert.equal(canUseFreeImageQuotaForSelection({ ...quota, eligible: false }, 1), false);
  assert.equal(buildFreeImageQuotaCostText(quota, 3, 'consume 12 points'), 'consume 12 points');
});

test('falls back to points copy for image tiers outside free quota scope', () => {
  const scopedQuota = { ...quota, allowedTierKeys: ['image_standard', 'image_pro'] };
  assert.equal(canUseFreeImageQuotaForSelection(scopedQuota, 1, 'image_standard'), true);
  assert.equal(canUseFreeImageQuotaForSelection(scopedQuota, 1, 'image_top'), false);
  assert.equal(buildFreeImageQuotaCostText(scopedQuota, 1, 'consume 20 points', 'image_top'), 'consume 20 points');
});

test('hides profile quota task when total remaining quota is exhausted', () => {
  assert.equal(shouldShowFreeImageQuotaTask({ ...quota, dailyRemaining: 1, totalRemaining: 0, remaining: 0, canUseFreeQuota: false }, false), false);
  assert.equal(getFreeImageQuotaRemainingImages({ ...quota, dailyRemaining: 3, totalRemaining: 1 }), 1);
});

test('resolves a smaller image count when user chooses to reduce to free quota', () => {
  assert.equal(resolveFreeQuotaReductionCount({ ...quota, dailyRemaining: 2, totalRemaining: 4 }, 3), 2);
  assert.equal(resolveFreeQuotaReductionCount({ ...quota, dailyRemaining: 3, totalRemaining: 0 }, 3), 0);
  assert.equal(resolveFreeQuotaReductionCount({ ...quota, dailyRemaining: 5, totalRemaining: 5 }, 3), 3);
});

test('normalizes snake_case and default allowed tiers for mini program display', () => {
  const normalized = normalizeFreeImageQuotaStatus({
    enabled: '1',
    eligible: 'true',
    can_use_free_quota: 1,
    daily_remaining: 1,
    daily_limit: 2,
    total_remaining: 3,
    total_limit: 5,
    allowed_tier_keys: '',
    show_in_daily_tasks: '1',
  });

  assert.deepEqual(normalized.allowedTierKeys, ['image_standard', 'image_pro']);
  assert.equal(getFreeImageQuotaRemainingImages(normalized), 1);
  assert.equal(canUseFreeImageQuotaForSelection(normalized, 1, 'image_standard'), true);
  assert.equal(canUseFreeImageQuotaForSelection(normalized, 1, 'image_standard', '图生图', gptImage2Model), true);
  assert.equal(buildFreeImageQuotaCostText(normalized, 1, 'consume 2 points', 'image_standard'), '免费生成 · 今日剩余 1 张');
  assert.equal(shouldShowFreeImageQuotaTask(normalized, false), true);
});

test('normalizes nested backend free image quota config fields', () => {
  const normalized = normalizeFreeImageQuotaStatus({
    freeImageQuota: {
      enabled: true,
      dailyLimit: 2,
      totalLimit: 4,
      allowedTierKeys: 'image_standard',
      showInDailyTasks: false,
    },
  });

  assert.equal(normalized.enabled, true);
  assert.equal(normalized.dailyLimit, 2);
  assert.deepEqual(normalized.allowedTierKeys, ['image_standard']);
  assert.equal(shouldShowFreeImageQuotaTask(normalized, false), false);
});

test('hides free image quota task when backend disables free image generation', () => {
  assert.equal(shouldShowFreeImageQuotaTask({ ...quota, enabled: false, showInDailyTasks: true }, false), false);
  assert.equal(shouldShowFreeImageQuotaTask({ ...quota, enabled: true, showInDailyTasks: false }, false), false);
});
