import test from 'node:test';
import assert from 'node:assert/strict';

import freeImageQuotaService from '../src/services/free-image-quota.service.ts';

const {
  buildFreeImageQuotaDecision,
  buildFreeQuotaInsufficientResponseData,
  formatQuotaDateKey,
  isGptImage2FreeQuotaModel,
  isFreeImageQuotaTierAllowed,
  normalizeFreeImageQuotaConfig,
  planRecoveredFreeQuotaConsumption,
  planFreeImageQuotaSettlement,
} = freeImageQuotaService;

test('allows non-member reservation only when one request fits both daily and total remaining quota', () => {
  const decision = buildFreeImageQuotaDecision({
    enabled: true,
    isMember: false,
    dailyLimit: 3,
    totalLimit: 5,
    usedToday: 1,
    reservedToday: 1,
    usedTotal: 2,
    reservedTotal: 0,
    requestedImages: 1,
  });

  assert.equal(decision.eligible, true);
  assert.equal(decision.dailyRemaining, 1);
  assert.equal(decision.totalRemaining, 3);
  assert.equal(decision.canReserve, true);
});

test('blocks free quota reservation instead of mixing points when the request exceeds remaining images', () => {
  const decision = buildFreeImageQuotaDecision({
    enabled: true,
    isMember: false,
    dailyLimit: 2,
    totalLimit: 5,
    usedToday: 1,
    reservedToday: 0,
    usedTotal: 1,
    reservedTotal: 0,
    requestedImages: 2,
  });

  assert.equal(decision.eligible, true);
  assert.equal(decision.dailyRemaining, 1);
  assert.equal(decision.totalRemaining, 4);
  assert.equal(decision.canReserve, false);
  assert.equal(decision.reason, 'insufficient');
});

test('keeps actual remaining quota values in insufficient quota response data', () => {
  const data = buildFreeQuotaInsufficientResponseData({
    requestedImages: 3,
    dailyRemaining: 1,
    totalRemaining: 2,
    pointsCost: 12,
    insufficientData: {
      dailyRemaining: 0,
      totalRemaining: 0,
      canUsePoints: true,
    },
  });

  assert.equal(data.dailyRemaining, 1);
  assert.equal(data.totalRemaining, 2);
  assert.equal(data.estimatedPointsCost, 12);
  assert.equal(data.canUsePoints, true);
});

test('only allows configured image tier keys to use free quota', () => {
  assert.equal(isFreeImageQuotaTierAllowed(['image_standard', 'image_pro'], 'image_standard'), true);
  assert.equal(isFreeImageQuotaTierAllowed(['image_standard', 'image_pro'], 'image_pro'), true);
  assert.equal(isFreeImageQuotaTierAllowed(['image_standard', 'image_pro'], 'image_top'), false);
  assert.equal(isFreeImageQuotaTierAllowed([], 'image_top'), false);
  assert.equal(isFreeImageQuotaTierAllowed('["image_standard","image_pro"]', 'image_pro'), true);
});

test('only treats GPT Image 2 related primary models as free quota eligible', () => {
  assert.equal(isGptImage2FreeQuotaModel({ apiModelName: 'gpt-image-2' }), true);
  assert.equal(isGptImage2FreeQuotaModel({ name: 'GPT Image 2 Preview' }), true);
  assert.equal(isGptImage2FreeQuotaModel({ upstreamModelCode: 'gptimage2' }), true);
  assert.equal(isGptImage2FreeQuotaModel({ name: 'stable-image-ultra', apiModelName: 'stable-image-ultra' }), false);
  assert.equal(isGptImage2FreeQuotaModel(null), false);
});

test('falls back to default free quota tier keys when config value is empty', () => {
  const config = normalizeFreeImageQuotaConfig({ allowedTierKeys: '' });
  assert.deepEqual(config.allowedTierKeys, ['image_standard', 'image_pro']);
});

test('does not use free quota for members or disabled configurations', () => {
  assert.equal(buildFreeImageQuotaDecision({
    enabled: true,
    isMember: true,
    dailyLimit: 3,
    totalLimit: 5,
    requestedImages: 1,
  }).eligible, false);

  assert.equal(buildFreeImageQuotaDecision({
    enabled: false,
    isMember: false,
    dailyLimit: 3,
    totalLimit: 5,
    requestedImages: 1,
  }).eligible, false);
});

test('settles partial success by consuming successful images and releasing the rest', () => {
  assert.deepEqual(planFreeImageQuotaSettlement({ reservedImages: 4, actualImages: 2 }), {
    consumeImages: 2,
    releaseImages: 2,
  });
});

test('recovered free quota completion consumes actual images after a previous release', () => {
  assert.deepEqual(planRecoveredFreeQuotaConsumption({
    reservedImages: 4,
    releasedImages: 4,
    consumedImages: 0,
    actualImages: 2,
  }), {
    consumeImages: 2,
    reservedImagesToClear: 0,
  });
});

test('recovered free quota completion clears remaining reservation when release was not written', () => {
  assert.deepEqual(planRecoveredFreeQuotaConsumption({
    reservedImages: 4,
    releasedImages: 0,
    consumedImages: 0,
    actualImages: 2,
  }), {
    consumeImages: 2,
    reservedImagesToClear: 4,
  });

  assert.deepEqual(planRecoveredFreeQuotaConsumption({
    reservedImages: 4,
    releasedImages: 2,
    consumedImages: 2,
    actualImages: 2,
  }), {
    consumeImages: 0,
    reservedImagesToClear: 0,
  });
});

test('formats database DATE values without UTC day shifting', () => {
  assert.equal(formatQuotaDateKey(new Date(2026, 6, 6, 0, 0, 0)), '2026-07-06');
  assert.equal(formatQuotaDateKey('2026-07-06T00:00:00.000Z'), '2026-07-06');
});
