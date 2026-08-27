import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'index.vue'), 'utf8');

function block(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `Missing CSS block for ${selector}`);
  return match[1];
}

test('mode switch buttons use one centered label without helper text', () => {
  const modeSwitch = source.match(/<view class="mode-switch">([\s\S]*?)<\/view>/);
  assert.ok(modeSwitch, 'Missing mode switch markup');

  const modeButtons = [...modeSwitch[1].matchAll(/<button class="mode-button"[\s\S]*?<\/button>/g)];
  assert.equal(modeButtons.length, 2);
  modeButtons.forEach((button) => {
    assert.equal([...button[0].matchAll(/<text>/g)].length, 1);
  });

  const modeButtonCss = block('.mode-button');
  assert.match(modeButtonCss, /display:\s*flex/);
  assert.match(modeButtonCss, /align-items:\s*center/);
  assert.match(modeButtonCss, /justify-content:\s*center/);

  const modeButtonTextCss = block('.mode-button text');
  assert.match(modeButtonTextCss, /font-size:\s*29rpx/);
});

test('tab and chip buttons have explicit centering and larger text', () => {
  const tabCss = block('.artifact-tab,\n.set-tab');
  assert.match(tabCss, /display:\s*flex/);
  assert.match(tabCss, /align-items:\s*center/);
  assert.match(tabCss, /justify-content:\s*center/);
  assert.match(tabCss, /font-size:\s*25rpx/);

  const chipTextCss = block('.part-chip text');
  assert.match(chipTextCss, /font-size:\s*26rpx/);
});

test('card titles use the shared gradient leading icon treatment', () => {
  const sectionTitleCss = block('.section-title');
  assert.match(sectionTitleCss, /display:\s*inline-flex/);
  assert.match(sectionTitleCss, /align-items:\s*center/);
  assert.match(sectionTitleCss, /gap:\s*12rpx/);

  const beforeCss = block('.section-title::before');
  assert.match(beforeCss, /linear-gradient\(180deg,\s*#ff7acb,\s*#35c2ff\)/);
  assert.match(beforeCss, /content:\s*""/);
});
