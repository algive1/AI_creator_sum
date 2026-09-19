import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const imageSource = readFileSync(new URL('./ai-image/index.vue', import.meta.url), 'utf8');
const videoSource = readFileSync(new URL('./ai-video/index.vue', import.meta.url), 'utf8');

test('generation pages request templates only for the active feature and cache per feature', () => {
  for (const [source, feature] of [[imageSource, 'imageFeatureForType'], [videoSource, 'videoFeatureForMode']]) {
    assert.match(source, new RegExp(`const feature = ${feature}\\(\\)`));
    assert.match(source, /TemplateCache\.get\(feature\)/);
    assert.match(source, /targetFeature: feature/);
    assert.match(source, /TemplatePromises\.get\(feature\)/);
    assert.match(source, /watch\([^\n]+Mode|watch\(imageType/);
    assert.doesNotMatch(source, /Promise\.all\([^\n]*TEMPLATE_FEATURES/);
  }
});
