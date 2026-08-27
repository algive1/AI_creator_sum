import test from 'node:test';
import assert from 'node:assert/strict';

import {
  estimateTierPointsCost,
  normalizeTierPricing,
} from './tier-pricing.ts';

const imageTier = {
  basePointsCost: 8,
  pointsCost: 8,
  memberDiscountPercent: 80,
  pricing: normalizeTierPricing({
    mode: 'matrix',
    defaultParams: { quality: '1K' },
    defaultPointsCost: 8,
    rules: [
      { conditions: { quality: '1K' }, pointsCost: 8 },
      { conditions: { quality: '2K' }, pointsCost: 16 },
      { conditions: { quality: '4K' }, pointsCost: 48 },
    ],
  }),
};

test('estimates image price from selected resolution preset', () => {
  const price = estimateTierPointsCost(imageTier, { resolutionPreset: '4K' });

  assert.equal(price, 38);
});

test('keeps pricing default when image resolution is auto', () => {
  const price = estimateTierPointsCost(imageTier, { resolutionPreset: 'auto' });

  assert.equal(price, 6);
});
