import fs from 'node:fs';
import path from 'node:path';

const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..');
const failures: string[] = [];

type RouteSpec = `${'GET' | 'POST' | 'PUT' | 'DELETE'} ${string}`;

function rel(file: string): string {
  return path.relative(repoRoot, file).replace(/\\/g, '/');
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function fail(message: string): void {
  failures.push(message);
}

function walk(target: string): string[] {
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  if (!stat.isDirectory()) return [];

  const ignored = new Set(['node_modules', 'dist', 'build', '.git', '.release-staging']);
  const files: string[] = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    if (entry.isFile()) files.push(full);
  }
  return files;
}

function textFiles(roots: string[]): Array<{ file: string; content: string }> {
  const exts = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt', '.sql', '.env', '.example']);
  const self = path.join(serverRoot, 'scripts', 'check-architecture-unified.ts');
  return roots
    .flatMap(root => walk(path.join(repoRoot, root)))
    .filter(file => file !== self)
    .filter(file => exts.has(path.extname(file)) || file.endsWith('.env.example'))
    .map(file => ({ file, content: fs.readFileSync(file, 'utf8') }));
}

function extractRoutes(relativePath: string): RouteSpec[] {
  const content = read(relativePath);
  const routes: RouteSpec[] = [];
  const routeRe = /router\.(get|post|put|delete)\(\s*['"`]([^'"`]+)['"`]/g;
  let match: RegExpExecArray | null;
  while ((match = routeRe.exec(content))) {
    routes.push(`${match[1].toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE'} ${match[2]}`);
  }
  return routes;
}

function assertRoutes(relativePath: string, expected: RouteSpec[]): void {
  const actual = extractRoutes(relativePath);
  const missing = expected.filter(route => !actual.includes(route));
  const extra = actual.filter(route => !expected.includes(route));
  if (missing.length > 0) fail(`${relativePath} missing routes: ${missing.join(', ')}`);
  if (extra.length > 0) fail(`${relativePath} contains non-mainline routes: ${extra.join(', ')}`);
}

function assertNoPattern(label: string, content: string, pattern: RegExp): void {
  if (pattern.test(content)) fail(label);
}

function sectionBetween(content: string, startNeedle: string, endNeedle: string): string {
  const start = content.indexOf(startNeedle);
  if (start < 0) return '';
  const end = content.indexOf(endNeedle, start + startNeedle.length);
  return end < 0 ? content.slice(start) : content.slice(start, end);
}

function assertMainlineRoutes(): void {
  assertRoutes('server/src/routes/orders.ts', [
    'POST /',
    'GET /',
    'GET /:orderNo',
    'POST /:orderNo/cancel',
  ]);
  assertRoutes('server/src/routes/wechat-payments.ts', [
    'POST /wechat/jsapi',
    'POST /wechat/query',
    'POST /wechat/notify',
  ]);
  assertRoutes('server/src/routes/admin-payments.ts', [
    'GET /orders',
    'GET /orders/:orderNo',
    'POST /orders/:orderNo/query-wechat',
    'POST /orders/:orderNo/regrant',
  ]);
  assertRoutes('server/src/routes/membership.ts', [
    'GET /plans',
    'GET /plans/:id(\\\\d+)',
    'GET /me',
    'GET /rights',
  ]);
  assertRoutes('server/src/routes/users.ts', [
    'GET /me',
    'PUT /me',
    'GET /me/full',
    'POST /me/phone',
  ]);
  assertRoutes('server/src/routes/tasks.ts', [
    'GET /',
    'POST /optimize-prompt',
    'POST /script',
    'POST /prompt',
    'POST /storyboard',
    'POST /image',
    'POST /video',
    'GET /:id(\\\\d+)',
    'POST /:id(\\\\d+)/cancel',
  ]);
}

function assertOldEntrypointsDeleted(): void {
  const index = read('server/src/index.ts');
  const membership = read('server/src/routes/membership.ts');
  const payments = read('server/src/routes/wechat-payments.ts');
  const admin = read('server/src/routes/admin.ts');
  const sources = textFiles(['server/src/routes', 'server/src/index.ts', 'server/src/services'])
    .filter(item => !rel(item.file).startsWith('server/src/migrations/'));

  if (/\bpayRouter\b/.test(index) || /\bpayRouter\b/.test(membership)) {
    fail('payRouter must not exist in index.ts or membership.ts.');
  }
  if (/router\.post\(\s*['"`]\/order['"`]/.test(membership)) {
    fail('POST /api/v1/membership/order must be deleted, not deprecated.');
  }
  assertNoPattern('POST /api/v1/payments/order must be deleted.', payments, /router\.post\(\s*['"`]\/order['"`]/);
  assertNoPattern('GET /api/v1/payments/orders must be deleted.', payments, /router\.get\(\s*['"`]\/orders/);
  assertNoPattern('POST /api/v1/payments/callback must be deleted.', payments, /router\.post\(\s*['"`]\/callback['"`]/);
  assertNoPattern('POST /api/v1/payments/admin/wechat/query must be deleted.', payments, /admin\/wechat\/query/);
  assertNoPattern('POST /api/v1/admin/orders/:id/refund must be deleted.', admin, /router\.post\(\s*['"`]\/orders\/:id[^'"`]*\/refund['"`]/);
  assertNoPattern('GET /api/v1/admin/orders must not be a payment order entrypoint.', admin, /router\.get\(\s*['"`]\/orders['"`]/);

  for (const item of sources) {
    const relative = rel(item.file);
    if (/\bcreateMembershipOrder\b/.test(item.content)) fail(`createMembershipOrder still referenced in ${relative}`);
    if (/\bprocessPaymentCallback\b/.test(item.content)) fail(`processPaymentCallback still referenced in ${relative}`);
  }
}

function assertPaymentAndStorageConfig(): void {
  const settingsService = read('server/src/services/settings.service.ts');
  const settingsPage = read('admin-web/src/pages/settings/index.tsx');
  const checkPayment = read('server/scripts/check-payment.ts');
  const launch = read('server/scripts/check-launch.ts');
  const adminConfigCheck = read('server/src/routes/admin-config-check.ts');
  const wechatPayService = read('server/src/services/wechat-pay.service.ts');

  if (/payment\./.test(settingsPage)) fail('admin-web settings page must not show or save payment.* keys.');
  if (/['"`]payment\./.test(settingsService)) fail('SettingsService must not alias or read payment.* keys.');
  if (/payment\.enabled|payment\.wechat_appid|payment\.mch_id|payment\.notify_url/.test(checkPayment)) fail('check:payment must only check wechat_pay.* keys.');
  if (/payment\.enabled|payment\.wechat_appid|payment\.mch_id|payment\.notify_url/.test(launch)) fail('check:launch must not check payment.* keys.');
  if (/payment\.enabled|payment\.wechat_appid|payment\.mch_id|payment\.notify_url/.test(adminConfigCheck + wechatPayService)) {
    fail('runtime WeChat Pay checks must not read payment.* keys.');
  }
  if (!/wechat_pay\.enabled/.test(settingsPage + checkPayment + adminConfigCheck + wechatPayService)) {
    fail('wechat_pay.* must be the formal payment configuration namespace.');
  }
  if (!/storage\.provider/.test(read('server/src/services/install.service.ts'))) fail('install must write storage.provider.');
  if (!/storage\.provider/.test(read('server/src/services/install-readiness.service.ts'))) fail('install readiness must require storage.provider.');
  if (/storage\.type/.test(settingsPage + adminConfigCheck + launch)) fail('formal storage checks/settings must not use storage.type.');
}

function assertGrantStatus(): void {
  const files = textFiles(['server/src', 'server/scripts'])
    .filter(item => !rel(item.file).startsWith('server/src/migrations/20260525_001_unify_config_keys.sql'));
  for (const item of files) {
    const content = item.content;
    if (/grant_status[\s\S]{0,80}['"`]success['"`]/.test(content) || /grantStatus\s*[=!]==?\s*['"`]success['"`]/.test(content)) {
      fail(`grant_status must use pending/granted/failed only: ${rel(item.file)}`);
    }
  }

  const paymentOrder = read('server/src/services/payment-order.service.ts');
  for (const status of ['pending', 'granted', 'failed']) {
    if (!paymentOrder.includes(`'${status}'`) && !paymentOrder.includes(`"${status}"`)) {
      fail(`payment-order.service.ts does not reference grant status ${status}.`);
    }
  }
  if (!/grantStatus === 'granted'/.test(paymentOrder)) fail('regrant must block already granted orders.');
  if (!/payStatus !== 'paid'/.test(paymentOrder)) fail('regrant must require pay_status=paid.');
}

function assertRegrant(): void {
  const adminPayments = read('server/src/routes/admin-payments.ts');
  const paymentOrder = read('server/src/services/payment-order.service.ts');
  const ordersPage = read('admin-web/src/pages/Orders.tsx');

  if (!/router\.post\(\s*['"`]\/orders\/:orderNo\/regrant['"`]\s*,\s*adminAuthMiddleware/.test(adminPayments)) {
    fail('POST /api/v1/admin/payments/orders/:orderNo/regrant must exist and use adminAuthMiddleware.');
  }
  for (const event of ['regrant_attempt', 'regrant_success', 'regrant_failed']) {
    if (!paymentOrder.includes(event)) fail(`regrant must write payment_logs event ${event}.`);
  }
  if (!/grantOrderBenefits\(orderNo\)/.test(paymentOrder)) fail('regrant must reuse grantOrderBenefits.');
  if (!/\/payments\/orders\/\$\{row\.orderNo\}\/regrant/.test(ordersPage)) fail('admin-web orders page must call the regrant endpoint.');
  if (!/canRegrant/.test(ordersPage) || !/payStatus === 'paid'/.test(ordersPage) || !/pending/.test(ordersPage) || !/failed/.test(ordersPage)) {
    fail('admin-web must show regrant only for paid pending/failed grant orders.');
  }
}

function assertUsersAndTasks(): void {
  const users = read('server/src/routes/users.ts');
  const userService = read('server/src/services/user.service.ts');
  const tasks = read('server/src/routes/tasks.ts');

  if (!/router\.get\(\s*['"`]\/me\/full['"`]/.test(users)) fail('GET /api/v1/users/me/full must exist.');
  for (const key of ['user', 'points', 'membership', 'assets', 'invite', 'menus']) {
    if (!new RegExp(`${key}\\s*:`).test(userService)) fail(`/users/me/full result must include ${key}.`);
  }
  if (/menuItems|creationActions/.test(userService + users)) fail('/users/me/full must not expose legacy menuItems or creationActions.');

  const pc = read('server/src/routes/public-config.ts');
  const modelTierList = read('server/src/services/model-tier-list.service.ts');
  if (!/router\.get\(\s*['"`]\/public\/model-tiers['"`]/.test(pc)) {
    fail('GET /api/v1/public/model-tiers must exist.');
  }
  if (!/getModelTierList\(feature,\s*req\.user\?\.userId\)/.test(pc)) {
    fail('GET /api/v1/public/model-tiers must use getModelTierList with optional user discount.');
  }
  for (const key of ['id', 'tierId', 'tierKey', 'tierName', 'description', 'iconUrl', 'pointsCost', 'capabilities', 'isDefault', 'isRecommended']) {
    if (!new RegExp(`${key}\\s*:`).test(modelTierList)) fail(`GET /api/v1/public/model-tiers must include ${key}.`);
  }
  const publicModelTiersRoute = sectionBetween(pc, "router.get('/public/model-tiers'", '// GET /public/templates');
  if (/api_key|secret_key|private_key|providerConfig|apiBaseUrl|providerApiKey/i.test(publicModelTiersRoute)
    || /(?:apiKey|providerConfig|providerApiKey|apiBaseUrl|secretKey|privateKey)\s*:/.test(modelTierList)) {
    fail('GET /api/v1/public/model-tiers must not return sensitive provider/model configuration.');
  }
  const rejectsModelId = /modelId is not allowed/.test(tasks) || /请使用模型档位/.test(tasks);
  const requiresTier = /tierKey or tierId is required/.test(tasks) || /请先选择模型档位/.test(tasks);
  if (!rejectsModelId || !requiresTier) {
    fail("POST /api/v1/tasks/image and /video must reject modelId and require tierId/tierKey.");
  }
}

function assertAdminWebOrders(): void {
  const ordersPage = read('admin-web/src/pages/Orders.tsx');
  if (!ordersPage.includes('/payments/orders')) fail('admin-web orders page must use /api/v1/admin/payments/orders.');
  if (/api\.(get|post|put|delete)\(\s*['"`]\/orders/.test(ordersPage)) fail('admin-web orders page must not call /api/v1/admin/orders.');
  if (/refund/i.test(ordersPage)) fail('admin-web orders page must not expose old refund controls.');
  for (const field of ['orderNo', 'orderType', 'payStatus', 'grantStatus', 'amountTotal', 'createdAt', 'paidAt']) {
    if (!ordersPage.includes(field)) fail(`admin-web orders page must display ${field}.`);
  }
}

function assertDocs(): void {
  const docs = textFiles(['docs', 'README.md']);
  const oldPaths = [
    '/api/v1/payments/order',
    '/api/v1/payments/callback',
    '/api/v1/membership/order',
    '/api/v1/payments/admin/wechat/query',
    '/api/v1/admin/orders',
  ];

  for (const item of docs) {
    const lines = item.content.split(/\r?\n/);
    let historical = false;
    lines.forEach((line, index) => {
      if (/deleted old endpoints|removed old endpoints|history|historical|已删除旧接口|历史说明/i.test(line)) {
        historical = true;
      }
      if (/^#{1,4}\s+/.test(line) && !/deleted old endpoints|removed old endpoints|history|historical|已删除旧接口|历史说明/i.test(line)) {
        historical = false;
      }
      for (const oldPath of oldPaths) {
        if (line.includes(oldPath) && !historical) {
          fail(`docs must not recommend old endpoint ${oldPath}: ${rel(item.file)}:${index + 1}`);
        }
      }
    });
  }
}

function assertCheckLaunchCallsArchitecture(): void {
  const pkg = JSON.parse(read('server/package.json'));
  const launchScript = String(pkg.scripts?.['check:launch'] || '');
  const archScript = String(pkg.scripts?.['check:architecture-unified'] || '');
  const launchSource = read('server/scripts/check-launch.ts');
  if (!archScript.includes('check-architecture-unified.ts')) fail('package.json must define npm run check:architecture-unified.');
  if (!/check:architecture-unified/.test(launchSource + launchScript)) fail('npm run check:launch must call check:architecture-unified.');
}

assertMainlineRoutes();
assertOldEntrypointsDeleted();
assertPaymentAndStorageConfig();
assertGrantStatus();
assertRegrant();
assertUsersAndTasks();
assertAdminWebOrders();
assertDocs();
assertCheckLaunchCallsArchitecture();

if (failures.length > 0) {
  console.error('check:architecture-unified failed');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log('check:architecture-unified passed');
