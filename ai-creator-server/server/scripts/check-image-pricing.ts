import { resolveTierPricing } from '../src/services/tier-pricing.service';

function assertEqual(name: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function main(): void {
  const fourK = resolveTierPricing({
    basePointsCost: 8,
    pricingMode: 'matrix',
    discountPercent: 80,
    pricingRules: {
      defaultParams: { quality: '1K' },
      defaultPointsCost: 8,
      rules: [
        { conditions: { quality: '1K' }, pointsCost: 8 },
        { conditions: { quality: '2K' }, pointsCost: 16 },
        { conditions: { quality: '4K' }, pointsCost: 48 },
      ],
    },
    params: { resolutionPreset: '4K' },
  });

  assertEqual('resolutionPreset overrides default quality', fourK.basePointsCost, 48);
  assertEqual('resolutionPreset discount', fourK.pointsCost, 38);
  assertEqual('resolutionPreset normalized as quality', fourK.priceParams.quality, '4k');
  assertEqual('resolutionPreset normalized as resolution', fourK.priceParams.resolution, '4k');

  const auto = resolveTierPricing({
    basePointsCost: 8,
    pricingMode: 'matrix',
    pricingRules: {
      defaultParams: { quality: '1K' },
      defaultPointsCost: 8,
      rules: [
        { conditions: { quality: '1K' }, pointsCost: 8 },
        { conditions: { quality: '4K' }, pointsCost: 48 },
      ],
    },
    params: { resolutionPreset: 'auto' },
  });

  assertEqual('auto resolution keeps default quality price', auto.basePointsCost, 8);

  console.log('check:image-pricing passed');
}

try {
  main();
} catch (err: any) {
  console.error('check:image-pricing failed:', err?.message || err);
  process.exitCode = 1;
}
