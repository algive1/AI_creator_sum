import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../../user-web/', import.meta.url);
const packageJsonPath = new URL('package.json', root);
const appPath = new URL('src/App.tsx', root);
const apiPath = new URL('src/services/api.ts', root);

test('user-web is an independent React Vite app', () => {
  assert.ok(existsSync(packageJsonPath), 'user-web/package.json should exist');
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  assert.equal(pkg.name, 'ai-creator-user-web');
  assert.ok(pkg.scripts.build.includes('vite build'));
  assert.ok(pkg.dependencies.react);
  assert.ok(pkg.dependencies.antd);
});

test('user-web app exposes the first-phase creator routes and mobile guidance', () => {
  assert.ok(existsSync(appPath), 'user-web/src/App.tsx should exist');
  const source = readFileSync(appPath, 'utf8');
  for (const route of ['/login', '/register', '/image', '/video', '/comic', '/templates', '/works', '/tools', '/points', '/profile']) {
    assert.match(source, new RegExp(`path=["']${route.replace('/', '\\/')}["']`));
  }
  assert.match(source, /MobileOnlyNotice/);
  assert.match(source, /建议使用电脑访问|小程序/);
  assert.match(source, /TaskQueue/);
});

test('user-web login shows local-only account guidance without exposing a production default account', () => {
  assert.ok(existsSync(appPath), 'user-web/src/App.tsx should exist');
  const source = readFileSync(appPath, 'utf8');
  assert.match(source, /import\.meta\.env\.DEV/);
  assert.match(source, /local-dev-auth-help/);
  assert.match(source, /没有默认测试账号/);
  assert.match(source, /填入示例信息/);
});

test('user-web creator surface uses a readable model dropdown and task-state motion hooks', () => {
  assert.ok(existsSync(appPath), 'user-web/src/App.tsx should exist');
  const appSource = readFileSync(appPath, 'utf8');
  const cssSource = readFileSync(new URL('src/styles.css', root), 'utf8');

  assert.match(appSource, /renderModelTierOption/);
  assert.match(appSource, /className="model-tier-select"/);
  assert.match(appSource, /popupClassName="model-tier-dropdown"/);
  assert.match(appSource, /optionLabelProp="title"/);
  assert.match(cssSource, /--workspace-bg/);
  assert.match(cssSource, /\.model-tier-dropdown\s+\.ant-select-item-option-content/);
  assert.match(cssSource, /\.model-tier-option-name/);
  assert.match(cssSource, /white-space:\s*normal/);
  assert.match(cssSource, /@keyframes\s+queue-scan/);
  assert.match(cssSource, /prefers-reduced-motion:\s*reduce/);
});

test('user-web creator asks users to choose real models instead of model tiers', () => {
  assert.ok(existsSync(appPath), 'user-web/src/App.tsx should exist');
  const appSource = readFileSync(appPath, 'utf8');

  assert.match(appSource, /creatorModelLabel/);
  assert.match(appSource, /realModelName/);
  assert.match(appSource, /modelName/);
  assert.match(appSource, /apiModelName/);
  assert.match(appSource, /label=\{creatorModelLabel\(mode\)\}/);
  assert.match(appSource, /placeholder=\{`选择\$\{creatorModelLabel\(mode\)\}`\}/);
  assert.doesNotMatch(appSource, /模型档位|选择档位|请先选择模型档位/);
});

test('user-web requests web-specific model visibility and display configuration', () => {
  assert.ok(existsSync(appPath), 'user-web/src/App.tsx should exist');
  const appSource = readFileSync(appPath, 'utf8');

  assert.match(appSource, /clientType:\s*['"]web['"]/);
  assert.match(appSource, /webDisplayName/);
  assert.match(appSource, /webVisible/);
});

test('user-web template cards open image and video previews before use', () => {
  assert.ok(existsSync(appPath), 'user-web/src/App.tsx should exist');
  const appSource = readFileSync(appPath, 'utf8');
  const cssSource = readFileSync(new URL('src/styles.css', root), 'utf8');

  assert.match(appSource, /TemplatePreviewModal/);
  assert.match(appSource, /selectedTemplate/);
  assert.match(appSource, /setSelectedTemplate\(template\)/);
  assert.match(appSource, /<video[^>]+controls/);
  assert.match(appSource, /playsInline/);
  assert.match(appSource, /template-preview-modal/);
  assert.match(cssSource, /\.template-preview-modal/);
  assert.match(cssSource, /\.template-preview-stage/);
  assert.match(cssSource, /\.template-preview-meta/);
});

test('user-web dashboard shell follows the uploaded PC workstation prototype structure', () => {
  assert.ok(existsSync(appPath), 'user-web/src/App.tsx should exist');
  const appSource = readFileSync(appPath, 'utf8');
  const cssSource = readFileSync(new URL('src/styles.css', root), 'utf8');

  for (const label of ['产品首页', 'AI 生图工作台', 'AI 生视频工作台', '灵感模板广场', '资产与记录', '会员积分商城']) {
    assert.match(appSource, new RegExp(label));
  }

  for (const component of ['SidebarProfileCard', 'MembershipPromoCard']) {
    assert.match(appSource, new RegExp(`function ${component}`));
  }

  for (const className of [
    'sidebar-profile-card',
    'membership-promo-card',
    'dashboard-hero',
    'dashboard-hero-preview',
    'dashboard-metric-grid',
    'workflow-steps',
    'recent-generation-panel',
  ]) {
    assert.match(appSource, new RegExp(className));
    assert.match(cssSource, new RegExp(`\\.${className}`));
  }
});

test('user-web api client stores user tokens separately from admin tokens', () => {
  assert.ok(existsSync(apiPath), 'user-web/src/services/api.ts should exist');
  const source = readFileSync(apiPath, 'utf8');
  assert.match(source, /user_web_token/);
  assert.match(source, /user_web_refresh_token/);
  assert.doesNotMatch(source, /admin_token/);
});
