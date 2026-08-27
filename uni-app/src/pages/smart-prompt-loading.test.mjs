import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const composerSource = readFileSync(new URL('../components/legacy/LegacyPromptComposer.vue', import.meta.url), 'utf8');
const imageSource = readFileSync(new URL('./ai-image/index.vue', import.meta.url), 'utf8');
const videoSource = readFileSync(new URL('./ai-video/index.vue', import.meta.url), 'utf8');

test('prompt composer exposes loading state for smart fill action', () => {
  assert.match(composerSource, /smartLoading\??:\s*boolean/);
  assert.match(composerSource, /smartLoading:\s*false/);
  assert.match(composerSource, /smartLoading\s*\?\s*'[^']*'\s*:\s*smartLabel/);
  assert.match(composerSource, /smartLoading\s*\?\s*undefined\s*:\s*\$emit\('smartFill'\)/);
});

test('image and video smart completion buttons show loading and block duplicate requests', () => {
  for (const source of [imageSource, videoSource]) {
    assert.match(source, /:smart-loading="promptOptimizing"/);
    assert.match(source, /const promptOptimizing = ref\(false\)/);
    assert.match(source, /if \(promptOptimizing\.value\) return;/);
    assert.match(source, /promptOptimizing\.value = true;/);
    assert.match(source, /finally\s*\{\s*promptOptimizing\.value = false;\s*\}/);
  }
});
