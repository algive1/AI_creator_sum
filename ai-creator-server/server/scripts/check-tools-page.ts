import fs from 'fs';
import path from 'path';

function read(relative: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8');
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function assertContains(label: string, content: string, pattern: string | RegExp): void {
  const ok = typeof pattern === 'string' ? content.includes(pattern) : pattern.test(content);
  assert(ok, `${label} missing ${String(pattern)}`);
}

const service = read('src/services/tools.service.ts');
const routes = read('src/routes/tools.ts');
const index = read('src/index.ts');
const migration = read('src/migrations/20260614_001_tools_page.sql');
const visibleMigration = read('src/migrations/20260614_002_tools_visible_keys.sql');
const pointsBillingMigration = read('src/migrations/20260614_003_tools_points_billing.sql');
const bannerAdMigration = read('src/migrations/20260614_004_tools_banner_ad.sql');
const publicConfig = read('src/routes/public-config.ts');
const constants = fs.readFileSync(path.resolve(__dirname, '../../../uni-app/src/utils/constants.ts'), 'utf8');
const pages = fs.readFileSync(path.resolve(__dirname, '../../../uni-app/src/pages.json'), 'utf8');
const tabbar = fs.readFileSync(path.resolve(__dirname, '../../../uni-app/src/components/common/AppTabBar.vue'), 'utf8');
const toolsPage = fs.readFileSync(path.resolve(__dirname, '../../../uni-app/src/pages/tools/index.vue'), 'utf8');
const toolsRunPagePath = path.resolve(__dirname, '../../../uni-app/src/pages/tools/run/index.vue');
assert(fs.existsSync(toolsRunPagePath), `missing tools run page ${toolsRunPagePath}`);
const toolsRunPage = fs.readFileSync(toolsRunPagePath, 'utf8');
const featureConfig = fs.readFileSync(path.resolve(__dirname, '../../admin-web/src/pages/FeatureConfig.tsx'), 'utf8');
const featureToggles = fs.readFileSync(path.resolve(__dirname, '../../admin-web/src/pages/FeatureToggles.tsx'), 'utf8');
const wechatSettings = fs.readFileSync(path.resolve(__dirname, '../../admin-web/src/pages/WechatSettings.tsx'), 'utf8');
const wechatToolsSettings = fs.readFileSync(path.resolve(__dirname, '../../admin-web/src/pages/WechatToolsSettings.tsx'), 'utf8');
const layout = fs.readFileSync(path.resolve(__dirname, '../../admin-web/src/components/Layout.tsx'), 'utf8');
const adminToolsRoutePath = path.resolve(__dirname, '../src/routes/admin-tools.ts');
assert(fs.existsSync(adminToolsRoutePath), `missing admin tools route ${adminToolsRoutePath}`);
const adminToolsRoute = fs.readFileSync(adminToolsRoutePath, 'utf8');
const apiDoc = fs.readFileSync(path.resolve(__dirname, '../../docs/API.md'), 'utf8');
const miniApiDoc = fs.readFileSync(path.resolve(__dirname, '../../docs/MINI_PROGRAM_API.md'), 'utf8');
const developmentDoc = fs.readFileSync(path.resolve(__dirname, '../../docs/DEVELOPMENT.md'), 'utf8');
const toolIconDir = path.resolve(__dirname, '../../../uni-app/src/static/icons/tools');

for (const key of [
  'prompt_reverse',
  'grid_cut',
  'image_compress',
  'watermark',
  'compare',
  'cutout',
  'resize',
  'phone_frame',
]) {
  assertContains(`tool definition ${key}`, service, key);
  assertContains(`migration setting ${key}`, migration, `tools.${key}.enabled`);
}

assertContains('usage logs table', migration, 'CREATE TABLE IF NOT EXISTS tool_usage_logs');
assertContains('ad unlock table', migration, 'CREATE TABLE IF NOT EXISTS tool_ad_unlocks');
assertContains('visible tools migration key', visibleMigration, 'tools.visible_keys');
assertContains('visible tools migration default prompt_reverse', visibleMigration, 'prompt_reverse');
assertContains('tools points billing migration enabled key', pointsBillingMigration, 'points_enabled');
assertContains('tools points billing migration cost key', pointsBillingMigration, 'points_cost');
assertContains('tools banner ad migration key', bannerAdMigration, 'tools.banner_ad_unit_id');
assertContains('prompt reverse model feature migration', migration, 'tool_prompt_reverse');
assertContains('cutout model feature migration', migration, 'tool_cutout');
assertContains('prompt reverse model feature UI', featureConfig, 'tool_prompt_reverse');
assertContains('cutout model feature UI', featureConfig, 'tool_cutout');
assertContains('feature config scope prop', featureConfig, 'scope?:');
assertContains('feature config tools scope', featureConfig, 'toolFeatureKeys');
assert(!/title:\s*['"`]工具箱['"`]/.test(featureToggles), 'FeatureToggles should not keep the tools group');
assertContains('feature toggles migration hint', featureToggles, '/wechat/tools');
assertContains('wechat tools settings page', wechatToolsSettings, '工具页配置');
assertContains('wechat tools settings admin api', wechatToolsSettings, '/tools/config');
assertContains('wechat tools banner ad input', wechatToolsSettings, 'bannerAdUnitId');
assertContains('wechat tools settings embedded FeatureConfig', wechatToolsSettings, 'scope="tools"');
assertContains('wechat tools menu item', layout, '/wechat/tools');
assertContains('wechat tools route item', layout, '<Route path="/wechat/tools"');
assertContains('admin tools config route get', adminToolsRoute, "router.get('/config'");
assertContains('admin tools config route put', adminToolsRoute, "router.put('/config'");
assertContains('admin tools route mounted', index, "app.use('/api/v1/admin/tools'");
assertContains('admin tabbar tools option', wechatSettings, "/pages/tools/index");
assertContains('admin tabbar default five items', wechatSettings, "首页");
assertContains('admin tabbar visible limit copy', wechatSettings, '前 5 个启用项');
assertContains('public config legacy history text normalization', publicConfig, "item.text === '资产'");
assertContains('tools route process endpoint', routes, "router.post('/process'");
assertContains('tools route config endpoint', routes, "router.get('/config'");
assertContains('tools route mounted', index, "app.use('/api/v1/tools'");
assertContains('tools service visible keys reader', service, 'getVisibleToolKeys');
assertContains('tools service admin config reader', service, 'getAdminToolsConfig');
assertContains('tools service admin config updater', service, 'updateAdminToolsConfig');
assertContains('tools service removed tool guard', service, 'assertToolVisible');
assertContains('tools service points billing flag', service, 'pointsEnabled');
assertContains('tools service points billing cost', service, 'pointsCost');
assertContains('tools service banner ad setting', service, 'tools.banner_ad_unit_id');
assertContains('tools service phone frame front frame', service, 'iPhone 17 Pro Max front frame');
assertContains('tools service phone frame dynamic island', service, 'dynamicIsland');
assertContains('tools service phone frame output file', service, 'iphone-17-pro-max-front-frame.png');
assert(!service.includes('resolvePhoneFrameStyle'), 'tools service should not keep phone frame color resolver');
assertContains('tools service points charge source', service, 'tool_usage');
assertContains('tools service points refund', service, 'refundToolPoints');
assertContains('public app tools config', publicConfig, 'toolsConfig');
assertContains('mini program tools route constant', constants, "tools: '/pages/tools/index'");
assertContains('mini program tool run route constant', constants, "toolRun: '/pages/tools/run/index'");
assertContains('mini program tools page', pages, 'pages/tools/index');
assertContains('mini program tool run page', pages, 'pages/tools/run/index');
assertContains('tabbar tools icon', tabbar, 'tab-tools.svg');
assertContains('tabbar legacy history text normalization', tabbar, "['资产', '记录'].includes(text)");
assertContains('tools page back topbar', toolsPage, 'title="工具" back');
assertContains('tools page empty state', toolsPage, 'empty-panel');
assertContains('tools page svg icon renderer', toolsPage, 'toolIconUrl(item.tool.icon)');
assertContains('tools page opens run page', toolsPage, 'openDisplayItem(item)');
assertContains('tools run page back topbar', toolsRunPage, 'AppTopbar');
assertContains('tools run page empty state', toolsRunPage, 'empty-panel');
assertContains('tools run page points cost label', toolsRunPage, 'pointsCost');
assertContains('tools run page route query', toolsRunPage, 'onLoad');
assertContains('tools run page upload card style', toolsRunPage, 'video-source-card');
assertContains('tools run page upload line icon', toolsRunPage, 'upload-line-icon');
assertContains('tools run page unified compare upload card', toolsRunPage, 'compare-upload-card');
assertContains('tools run page compare concise labels', toolsRunPage, '图一');
assertContains('tools run page skips duplicated title', toolsRunPage, 'shouldShowRunHead');
assertContains('tools run page hides empty params', toolsRunPage, 'hasParams');
assertContains('tools run page banner ad guarded by id', toolsRunPage, 'bannerAdUnitId');
assertContains('tools run page banner ad component', toolsRunPage, '<ad');
assertContains('tools run page phone case editor', toolsRunPage, 'phone-frame-editor');
assertContains('tools run page iphone 17 pro max front copy', toolsRunPage, 'iPhone 17 Pro Max 正面屏幕');
assertContains('tools run page phone dynamic island', toolsRunPage, 'phone-dynamic-island');
assert(!toolsRunPage.includes('phoneFrameColors'), 'tools run page should not keep phone frame color swatches');
assertContains('tools run page shared action button', toolsRunPage, 'GenerationActions');
assert(!toolsRunPage.includes('process-button'), 'tools run page should not use legacy process-button');
assertContains('tools run page prompt text card', toolsRunPage, 'prompt-result-card');
assertContains('tools run page copy prompt action', toolsRunPage, 'copyPrompt');
assertContains('tools run page resize presets', toolsRunPage, 'resizePresets');
assertContains('tools run page resize aspect lock', toolsRunPage, 'lockResizeRatio');
assertContains('api docs tools process endpoint', apiDoc, '/tools/process');
assertContains('api docs admin tools config endpoint', apiDoc, '/admin/tools/config');
assertContains('api docs admin tools points fields', apiDoc, 'pointsEnabled');
assertContains('api docs tools banner ad field', apiDoc, 'bannerAdUnitId');
assertContains('api docs phone frame front screen', apiDoc, 'iPhone 17 Pro Max 正面屏幕');
assertContains('mini api docs tools config endpoint', miniApiDoc, '/tools/config');
assertContains('mini api docs visible keys config', miniApiDoc, 'tools.visible_keys');
assertContains('mini api docs tool points cost', miniApiDoc, 'pointsCost');
assertContains('mini api docs tools banner ad unit', miniApiDoc, 'bannerAdUnitId');
assertContains('mini api docs phone frame front screen', miniApiDoc, 'iPhone 17 Pro Max 正面屏幕');
assertContains('development docs tools config location', developmentDoc, '微信配置 → 工具页配置');
assertContains('development docs tools points billing', developmentDoc, '工具积分收费');

for (const icon of ['quote', 'grid', 'compress', 'stamp', 'compare', 'cutout', 'resize', 'phone', 'lock', 'unlock']) {
  const iconPath = path.join(toolIconDir, `tool-${icon}.svg`);
  assert(fs.existsSync(iconPath), `missing tool icon ${iconPath}`);
  assertContains(`tool icon ${icon}`, fs.readFileSync(iconPath, 'utf8'), 'stroke=');
}

console.log('[check-tools-page] PASS');
