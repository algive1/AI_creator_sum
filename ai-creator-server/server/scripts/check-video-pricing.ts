import { resolveTierPricing } from '../src/services/tier-pricing.service';

function assertEqual(name: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function main(): void {
  const fixed = resolveTierPricing({
    basePointsCost: 12,
    pricingMode: 'fixed',
    discountPercent: 80,
  });
  assertEqual('fixed base', fixed.basePointsCost, 12);
  assertEqual('fixed discounted', fixed.pointsCost, 10);

  const matrix = resolveTierPricing({
    basePointsCost: 10,
    pricingMode: 'matrix',
    discountPercent: 80,
    pricingRules: {
      defaultParams: { duration: '5s', quality: '720P' },
      rules: [
        { conditions: { duration: '5s', quality: '720P' }, pointsCost: 20 },
        { conditions: { duration: '10s', quality: '1080P' }, pointsCost: 60 },
      ],
    },
    params: { duration: '10s', quality: '1080p' },
  });
  assertEqual('matrix base', matrix.basePointsCost, 60);
  assertEqual('matrix discounted', matrix.pointsCost, 48);
  assertEqual('matrix normalized resolution', matrix.priceParams.resolution, '1080p');

  const defaultParam = resolveTierPricing({
    basePointsCost: 10,
    pricingMode: 'matrix',
    pricingRules: {
      defaultParams: { duration: '8s', quality: '720P' },
      rules: [
        { conditions: { duration: '8s', quality: '720p' }, pointsCost: 36 },
      ],
    },
    params: { duration: undefined, quality: undefined },
  });
  assertEqual('default params survive undefined overrides', defaultParam.basePointsCost, 36);

  const perSecond = resolveTierPricing({
    basePointsCost: 10,
    pricingMode: 'per_second_matrix',
    pricingRules: {
      defaultParams: { duration: '5s', quality: '720P' },
      defaultUnitPoints: 6,
      rules: [
        { conditions: { quality: '1080P', audioMode: 'audio' }, unitPoints: 12 },
      ],
    },
    params: { duration: '8', quality: '1080p', audioMode: true },
  });
  assertEqual('per-second unit base', perSecond.unitBasePointsCost, 12);
  assertEqual('per-second total', perSecond.basePointsCost, 96);

  const token = resolveTierPricing({
    basePointsCost: 10,
    pricingMode: 'token_preauth',
    pricingRules: { preauthPoints: 80 },
  });
  assertEqual('token preauth', token.pointsCost, 80);

  console.log('check:video-pricing passed');
}

try {
  main();
} catch (err: any) {
  console.error('check:video-pricing failed:', err?.message || err);
  process.exitCode = 1;
}
