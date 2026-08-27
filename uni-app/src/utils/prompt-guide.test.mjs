import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPromptGuide,
  hasPromptGuideDialog,
} from './prompt-guide.ts';

test('uses per-mode placeholder from public prompt guide config', () => {
  const guide = getPromptGuide({
    promptGuides: {
      enabled: true,
      items: {
        'ai_image.text2img': {
          enabled: true,
          placeholder: '后台文生图占位',
          title: '文生图提示词',
          contentHtml: '<p>写清楚主体</p>',
        },
      },
    },
  }, 'ai_image.text2img', '默认占位');

  assert.equal(guide.placeholder, '后台文生图占位');
  assert.equal(guide.title, '文生图提示词');
  assert.equal(hasPromptGuideDialog(guide), true);
});

test('falls back to default placeholder when guide is disabled or missing', () => {
  const disabled = getPromptGuide({
    promptGuides: {
      enabled: true,
      items: {
        'ai_image.edit': {
          enabled: false,
          placeholder: '不应展示',
          contentHtml: '<p>关闭</p>',
        },
      },
    },
  }, 'ai_image.edit', '默认图片编辑占位');

  const missing = getPromptGuide({}, 'comic.story', '默认漫剧占位');

  assert.equal(disabled.placeholder, '默认图片编辑占位');
  assert.equal(hasPromptGuideDialog(disabled), false);
  assert.equal(missing.placeholder, '默认漫剧占位');
  assert.equal(hasPromptGuideDialog(missing), false);
});
