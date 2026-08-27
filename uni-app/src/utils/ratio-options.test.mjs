import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getVisibleRatioOptions,
  shouldCollapseRatioOptions,
} from './ratio-options.ts';

const nanoBananaRatios = [
  'auto',
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
  '1:4',
  '4:1',
  '1:8',
  '8:1',
].map((key) => ({ key, label: key }));

test('collapses long ratio lists to common ratios first', () => {
  assert.equal(shouldCollapseRatioOptions(nanoBananaRatios), true);

  const visible = getVisibleRatioOptions(nanoBananaRatios, false, '1:1');

  assert.deepEqual(visible.map((item) => item.key), [
    'auto',
    '1:1',
    '3:4',
    '4:3',
    '9:16',
    '16:9',
    '2:3',
  ]);
});

test('keeps the selected uncommon ratio visible while collapsed', () => {
  const visible = getVisibleRatioOptions(nanoBananaRatios, false, '21:9');

  assert.deepEqual(visible.map((item) => item.key), [
    'auto',
    '1:1',
    '3:4',
    '4:3',
    '9:16',
    '16:9',
    '2:3',
    '21:9',
  ]);
});

test('expanded ratio lists show every backend option in original order', () => {
  const visible = getVisibleRatioOptions(nanoBananaRatios, true, '1:1');

  assert.deepEqual(visible.map((item) => item.key), nanoBananaRatios.map((item) => item.key));
});

test('short ratio lists do not collapse', () => {
  const shortList = ['1:1', '9:16', '16:9'].map((key) => ({ key, label: key }));

  assert.equal(shouldCollapseRatioOptions(shortList), false);
  assert.deepEqual(getVisibleRatioOptions(shortList, false, '1:1'), shortList);
});
