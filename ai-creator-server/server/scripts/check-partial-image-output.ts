import assert from 'node:assert/strict';
import { planImageOutputSettlement } from '../src/services/image-output-settlement.service';

const oneOfTwo = planImageOutputSettlement({
  urls: ['https://cdn.example.com/generated-1.png'],
  expectedImageCount: 2,
  frozenPointsCost: 8,
  unitPointsCost: 4,
});

assert.deepEqual(oneOfTwo.outputUrls, ['https://cdn.example.com/generated-1.png']);
assert.equal(oneOfTwo.actualImageCount, 1);
assert.equal(oneOfTwo.pointsCost, 4);
assert.equal(oneOfTwo.partial, true);
assert.equal(oneOfTwo.shouldFail, false);

const zeroOfTwo = planImageOutputSettlement({
  urls: [],
  expectedImageCount: 2,
  frozenPointsCost: 8,
  unitPointsCost: 4,
});

assert.equal(zeroOfTwo.shouldFail, true);
assert.equal(zeroOfTwo.pointsCost, 0);

console.log('[partial-image-output] PASS');
