import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/routes/public-config.ts', import.meta.url), 'utf8');
const adminRouteSource = readFileSync(new URL('../src/routes/admin.ts', import.meta.url), 'utf8');
const wechatSettingsSource = readFileSync(new URL('../../admin-web/src/pages/WechatSettings.tsx', import.meta.url), 'utf8');

test('public app config preloads settings instead of many parallel setting lookups', () => {
  assert.match(source, /loadPublicSettingsSnapshot/);
  assert.match(source, /getToolsConfig\(0,\s*toolsSettings\)/);
  assert.doesNotMatch(source, /Promise\.all\(publicKeys\.map/);
});

test('public app config exposes review mode purchase gate fields', () => {
  assert.match(source, /miniapp\.review_mode_enabled/);
  assert.match(source, /miniapp\.purchase_enabled/);
  assert.match(source, /buildCommerceAvailability/);
  assert.match(source, /result\.purchaseEnabled = commerce\.purchaseEnabled/);
  assert.match(source, /features = \{[\s\S]*purchase: commerce\.purchaseEnabled/);
});

test('public app help config exposes editable help items with sanitized media and copy blocks', () => {
  assert.match(source, /miniapp_help\.items_json/);
  assert.match(source, /getHelpItemsConfig/);
  assert.match(source, /sanitizeHelpItem/);
  assert.match(source, /items:\s*getHelpItemsConfig\(settings,\s*contentHtml\)/);
  assert.match(source, /subtitle:\s*safeHelpText/);
  assert.match(source, /copyText/);
  assert.match(source, /mediaType/);
  assert.match(source, /mediaRatio/);
});

test('admin help settings edits multiple help items from a table and modal', () => {
  assert.match(wechatSettingsSource, /helpItemsState/);
  assert.match(wechatSettingsSource, /helpItemModalOpen/);
  assert.match(wechatSettingsSource, /helpItemColumns/);
  assert.match(wechatSettingsSource, /<Table<HelpItemForm>/);
  assert.match(wechatSettingsSource, /miniapp_help\.items_json/);
  assert.match(wechatSettingsSource, /JSON\.stringify\(normalizeHelpItemsForSave/);
  assert.match(wechatSettingsSource, /openHelpItemEditor/);
  assert.match(wechatSettingsSource, /saveHelpItemEditor/);
  assert.match(wechatSettingsSource, /deleteHelpItem/);
  assert.match(wechatSettingsSource, /mediaType/);
  assert.match(wechatSettingsSource, /mediaRatio/);
  assert.match(wechatSettingsSource, /copyText/);
  assert.doesNotMatch(wechatSettingsSource, /Form\.List name="helpItems"/);
});

test('public app config exposes per-mode prompt guide settings', () => {
  assert.match(source, /promptGuides/);
  assert.match(source, /miniapp_prompt_guides\.enabled/);
  assert.match(source, /miniapp_prompt_guides\.items_json/);
  assert.match(source, /PROMPT_GUIDE_MODE_KEYS/);
  assert.match(source, /ai_image\.text2img/);
  assert.match(source, /ai_video\.first_last_frame/);
  assert.match(source, /comic\.story/);
  assert.match(source, /sanitizePromptGuideItem/);
  assert.match(source, /placeholder:\s*safeHelpText/);
  assert.match(source, /contentHtml:\s*sanitizeHelpHtml/);
});

test('admin settings validate miniapp help items and per-mode prompt guides', () => {
  assert.match(adminRouteSource, /miniapp_help\.items_json/);
  assert.match(adminRouteSource, /miniapp_prompt_guides\.enabled/);
  assert.match(adminRouteSource, /miniapp_prompt_guides\.items_json/);
  assert.match(adminRouteSource, /validateMiniappPromptGuideSettings/);
  assert.match(adminRouteSource, /PROMPT_GUIDE_MODE_KEYS/);
  assert.match(adminRouteSource, /sanitizePromptGuideItemForSave/);
  assert.match(adminRouteSource, /contentHtml:\s*sanitizeHelpHtml/);
  assert.match(adminRouteSource, /placeholder/);
});

test('admin help page separates prompt guide settings from general help content', () => {
  assert.match(wechatSettingsSource, /promptGuideItems/);
  assert.match(wechatSettingsSource, /生成页提示词引导/);
  assert.match(wechatSettingsSource, /miniapp_prompt_guides\.items_json/);
  assert.match(wechatSettingsSource, /PROMPT_GUIDE_MODES/);
  assert.match(wechatSettingsSource, /<Tabs/);
  assert.match(wechatSettingsSource, /key:\s*'helpContent'/);
  assert.match(wechatSettingsSource, /key:\s*'promptGuides'/);
  assert.match(wechatSettingsSource, /helpId/);
  assert.match(wechatSettingsSource, /placeholder/);
  assert.match(wechatSettingsSource, /savePromptGuides/);
});
