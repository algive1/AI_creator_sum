import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(here, '..');
const promptComposerSource = readFileSync(join(sourceRoot, 'components/legacy/LegacyPromptComposer.vue'), 'utf8');
const actionModalSource = readFileSync(join(sourceRoot, 'components/common/AppActionModal.vue'), 'utf8');
const imageSource = readFileSync(join(here, 'ai-image/index.vue'), 'utf8');
const videoSource = readFileSync(join(here, 'ai-video/index.vue'), 'utf8');
const comicSource = readFileSync(join(here, 'comic/index.vue'), 'utf8');

test('prompt composer shows a linear help button before expand editing', () => {
  assert.match(promptComposerSource, /showHelpButton/);
  assert.match(promptComposerSource, /helpButtonText/);
  assert.match(promptComposerSource, /icon_prompt_help_line\.svg/);
  assert.match(promptComposerSource, /\$emit\('help'\)/);
  assert.match(promptComposerSource, /prompt-help-btn/);
  assert.ok(existsSync(join(sourceRoot, 'static/icons/icon_prompt_help_line.svg')));
});

test('image generation page uses per-mode prompt guide config', () => {
  assert.match(imageSource, /promptGuideKey/);
  assert.match(imageSource, /ai_image\.text2img/);
  assert.match(imageSource, /ai_image\.img2img/);
  assert.match(imageSource, /ai_image\.edit/);
  assert.match(imageSource, /promptPlaceholder/);
  assert.match(imageSource, /showPromptGuide/);
  assert.match(imageSource, /openPromptGuide/);
  assert.match(imageSource, /@help="openPromptGuide"/);
});

test('video generation page uses per-mode prompt guide config', () => {
  assert.match(videoSource, /promptGuideKey/);
  assert.match(videoSource, /ai_video\.text2video/);
  assert.match(videoSource, /ai_video\.img2video/);
  assert.match(videoSource, /ai_video\.reference/);
  assert.match(videoSource, /ai_video\.first_last_frame/);
  assert.match(videoSource, /ai_video\.edit/);
  assert.match(videoSource, /openPromptGuide/);
  assert.match(videoSource, /@help="openPromptGuide"/);
});

test('comic page uses per-mode prompt guide config', () => {
  assert.match(comicSource, /comic\.story/);
  assert.match(comicSource, /promptPlaceholder/);
  assert.match(comicSource, /showPromptGuide/);
  assert.match(comicSource, /openPromptGuide/);
  assert.match(comicSource, /@help="openPromptGuide"/);
});

test('prompt guide dialogs hide the decorative title icon', () => {
  assert.match(actionModalSource, /hideVisual/);
  assert.match(actionModalSource, /showModalVisual/);
  assert.match(actionModalSource, /v-if="showModalVisual"/);
  assert.match(imageSource, /hideVisual:\s*true/);
  assert.match(videoSource, /hideVisual:\s*true/);
  assert.match(comicSource, /hideVisual:\s*true/);
});
