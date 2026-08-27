import test from 'node:test';
import assert from 'node:assert/strict';

import { AION_OBS_TOOL_KEY, buildToolDisplayItems } from './tool-display-order.ts';

test('places OBS calculator immediately after phone frame tool', () => {
  const items = buildToolDisplayItems([
    { key: 'grid_cut' },
    { key: 'phone_frame' },
    { key: 'resize' },
  ]);

  assert.deepEqual(items.map((item) => item.key), [
    'grid_cut',
    'phone_frame',
    AION_OBS_TOOL_KEY,
    'resize',
  ]);
});

test('places OBS calculator at the end when phone frame is hidden', () => {
  const items = buildToolDisplayItems([
    { key: 'grid_cut' },
    { key: 'resize' },
  ]);

  assert.deepEqual(items.map((item) => item.key), [
    'grid_cut',
    'resize',
    AION_OBS_TOOL_KEY,
  ]);
});

test('keeps OBS calculator visible when there are no backend tools', () => {
  const items = buildToolDisplayItems([]);

  assert.deepEqual(items.map((item) => item.key), [AION_OBS_TOOL_KEY]);
});
