import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateAionObsEquipment,
  calculateAionObsRelics,
  formatAionRelicLevelName,
} from './aion-obs-calculator.ts';

test('calculates level 30 guardian squad leader accessories with ring and earring pairs', () => {
  const result = calculateAionObsEquipment('guardian_squad_leader_30', {
    necklace: true,
    earring: 2,
    ring: 2,
    waist: true,
  });

  assert.equal(result.ap, 352000);
  assert.deepEqual(result.medals, []);
});

test('calculates level 50 elite guardian tribunus armor AP and gold medals', () => {
  const result = calculateAionObsEquipment('elite_guardian_tribunus_50', {
    body: true,
    legs: true,
    shoulders: true,
    hands: true,
    feet: true,
  });

  assert.equal(result.ap, 1998100);
  assert.deepEqual(result.medals, [{ type: 'gold', count: 202 }]);
});

test('labels relic grade before relic name and calculates abyss bonus AP', () => {
  assert.equal(formatAionRelicLevelName('crown', 'highest'), '最上级古代王冠');

  const result = calculateAionObsRelics({
    crown: { highest: 1 },
    cup: { high: 2 },
    seal: { middle: 3 },
    statue: { low: 4 },
  });

  assert.equal(result.baseAp, 16000);
  assert.equal(result.abyssAp, 21600);
  assert.equal(result.extraAp, 5600);
});
