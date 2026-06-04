import fs from 'node:fs';
import path from 'node:path';
import '../src/utils/config';
import pool, { query, queryOne } from '../src/utils/db';
import { SettingsService } from '../src/services/settings.service';

type Status = 'PASS' | 'WARN' | 'FAIL';

interface CheckItem {
  status: Status;
  name: string;
  message: string;
}

const EXPECTED_NOTIFY_PATH = '/api/v1/payments/wechat/notify';
const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..');
const results: CheckItem[] = [];

function add(status: Status, name: string, message: string): void {
  results.push({ status, name, message });
}

function read(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function hasValue(value: unknown): boolean {
  return String(value ?? '').trim() !== '';
}

function firstEnvValue(keys: string | string[]): string {
  const candidates = Array.isArray(keys) ? keys : [keys];
  for (const envKey of candidates) {
    if (hasValue(process.env[envKey])) return String(process.env[envKey]);
  }
  return '';
}

async function getSystemSetting(key: string, fallback = ''): Promise<string> {
  try {
    return await SettingsService.getString(key, fallback);
  } catch {
    const envMap: Record<string, string | string[]> = {
      'wechat_pay.enabled': 'WECHAT_PAY_ENABLED',
      'wechat_pay.appid': 'WECHAT_PAY_APPID',
      'wechat_pay.mchid': ['WECHAT_PAY_MCHID', 'WECHAT_PAY_MCH_ID'],
      'wechat_pay.api_v3_key': 'WECHAT_PAY_API_V3_KEY',
      'wechat_pay.private_key': 'WECHAT_PAY_PRIVATE_KEY',
      'wechat_pay.merchant_serial_no': ['WECHAT_PAY_MERCHANT_SERIAL_NO', 'WECHAT_PAY_SERIAL_NO'],
      'wechat_pay.notify_url': 'WECHAT_PAY_NOTIFY_URL',
      'site.api_domain': 'SITE_API_DOMAIN',
    };
    const envValue = envMap[key] ? firstEnvValue(envMap[key]) : '';
    return envValue || fallback;
  }
}

function parseBoolean(value: string): boolean {
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value || '').trim().toLowerCase());
}

function resolveNotifyUrl(notifyUrl: string, apiDomain: string): { url: string; error?: string } {
  const raw = notifyUrl.trim();
  if (!raw) return { url: '', error: 'wechat_pay.notify_url is empty' };
  if (/^https?:\/\//i.test(raw)) return { url: raw };
  if (!raw.startsWith('/')) return { url: '', error: 'wechat_pay.notify_url must be HTTPS URL or absolute path' };
  if (!apiDomain.trim()) return { url: '', error: 'site.api_domain is required when notify_url is relative' };
  try {
    const origin = /^https?:\/\//i.test(apiDomain.trim()) ? apiDomain.trim() : `https://${apiDomain.trim()}`;
    return { url: new URL(raw, new URL(origin).origin).toString() };
  } catch {
    return { url: '', error: 'site.api_domain is not a valid origin' };
  }
}

function checkRouteEntrypoints(): boolean {
  let ok = true;
  const index = read('server/src/index.ts');
  const ordersRoute = read('server/src/routes/orders.ts');
  const paymentsRoute = read('server/src/routes/wechat-payments.ts');
  const membershipRoute = read('server/src/routes/membership.ts');
  const adminPaymentsRoute = read('server/src/routes/admin-payments.ts');

  const required = [
    ['POST /api/v1/orders', /router\.post\(\s*['"]\/['"]/.test(ordersRoute)],
    ['POST /api/v1/payments/wechat/jsapi', /router\.post\(\s*['"]\/wechat\/jsapi['"]/.test(paymentsRoute)],
    ['POST /api/v1/payments/wechat/query', /router\.post\(\s*['"]\/wechat\/query['"]/.test(paymentsRoute)],
    ['POST /api/v1/payments/wechat/notify', /router\.post\(\s*['"]\/wechat\/notify['"]/.test(paymentsRoute)],
    ['POST /api/v1/admin/payments/orders/:orderNo/regrant', /router\.post\(\s*['"]\/orders\/:orderNo\/regrant['"]/.test(adminPaymentsRoute)],
  ] as const;

  for (const [name, exists] of required) {
    add(exists ? 'PASS' : 'FAIL', name, exists ? 'formal entrypoint exists' : 'formal entrypoint missing');
    if (!exists) ok = false;
  }

  const oldChecks = [
    ['payRouter', /\bpayRouter\b/.test(index + membershipRoute)],
    ['POST /api/v1/membership/order', /router\.post\(\s*['"]\/order['"]/.test(membershipRoute)],
    ['POST /api/v1/payments/order', /router\.post\(\s*['"]\/order['"]/.test(paymentsRoute)],
    ['GET /api/v1/payments/orders', /router\.get\(\s*['"]\/orders/.test(paymentsRoute)],
    ['POST /api/v1/payments/callback', /router\.post\(\s*['"]\/callback['"]/.test(paymentsRoute)],
    ['POST /api/v1/payments/admin/wechat/query', /admin\/wechat\/query/.test(paymentsRoute)],
  ] as const;

  for (const [name, exists] of oldChecks) {
    add(exists ? 'FAIL' : 'PASS', name, exists ? 'old entrypoint still exists' : 'old entrypoint deleted');
    if (exists) ok = false;
  }

  return ok;
}

async function checkWechatPayConfig(): Promise<boolean> {
  const cfg = {
    enabled: parseBoolean(await getSystemSetting('wechat_pay.enabled', 'false')),
    appid: await getSystemSetting('wechat_pay.appid', ''),
    mchid: await getSystemSetting('wechat_pay.mchid', ''),
    apiV3Key: await getSystemSetting('wechat_pay.api_v3_key', ''),
    privateKey: await getSystemSetting('wechat_pay.private_key', ''),
    merchantSerialNo: await getSystemSetting('wechat_pay.merchant_serial_no', ''),
    notifyUrl: await getSystemSetting('wechat_pay.notify_url', ''),
    apiDomain: await getSystemSetting('site.api_domain', ''),
  };

  let readyForRealCollection = true;
  if (!cfg.enabled) {
    add('WARN', 'wechat_pay.enabled', 'disabled; payment API can be checked but real collection is not recommended');
    readyForRealCollection = false;
  } else {
    add('PASS', 'wechat_pay.enabled', 'enabled');
  }

  for (const [key, value] of [
    ['wechat_pay.appid', cfg.appid],
    ['wechat_pay.mchid', cfg.mchid],
    ['wechat_pay.api_v3_key', cfg.apiV3Key],
    ['wechat_pay.private_key', cfg.privateKey],
    ['wechat_pay.merchant_serial_no', cfg.merchantSerialNo],
  ] as const) {
    if (hasValue(value)) add('PASS', key, 'configured');
    else {
      add('WARN', key, 'missing; cannot perform real WeChat collection');
      readyForRealCollection = false;
    }
  }

  if (!hasValue(cfg.notifyUrl) && hasValue(cfg.apiDomain)) cfg.notifyUrl = EXPECTED_NOTIFY_PATH;
  const resolved = resolveNotifyUrl(cfg.notifyUrl, cfg.apiDomain);
  if (resolved.error) {
    add('WARN', 'wechat_pay.notify_url', resolved.error);
    readyForRealCollection = false;
  } else {
    const url = new URL(resolved.url);
    if (url.pathname !== EXPECTED_NOTIFY_PATH) {
      add('FAIL', 'wechat_pay.notify_url', `path must be ${EXPECTED_NOTIFY_PATH}`);
      readyForRealCollection = false;
    } else if (url.protocol !== 'https:') {
      add(String(process.env.NODE_ENV || '').toLowerCase() === 'production' ? 'FAIL' : 'WARN', 'wechat_pay.notify_url', 'notify URL should use HTTPS');
      readyForRealCollection = false;
    } else {
      add('PASS', 'wechat_pay.notify_url', `${url.origin}${url.pathname}`);
    }
  }

  return readyForRealCollection;
}

async function tableExists(tableName: string): Promise<boolean> {
  const row = await queryOne<any>(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName],
  );
  return Number(row?.cnt || 0) > 0;
}

async function getColumns(tableName: string): Promise<Set<string>> {
  const rows = await query<any>(
    `SELECT COLUMN_NAME AS column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName],
  );
  return new Set(rows.map((row: any) => row.column_name));
}

async function checkDatabaseShape(): Promise<boolean> {
  try {
    await query('SELECT 1 AS ok');
  } catch (err: any) {
    add('WARN', 'database', `database unavailable; schema checks skipped: ${err?.message || err}`);
    return true;
  }

  let ok = true;
  for (const table of ['member_orders', 'payment_logs', 'point_logs', 'point_accounts', 'user_memberships']) {
    const exists = await tableExists(table);
    add(exists ? 'PASS' : 'FAIL', `table ${table}`, exists ? 'exists' : 'missing');
    if (!exists) ok = false;
  }

  if (await tableExists('member_orders')) {
    const columns = await getColumns('member_orders');
    for (const column of ['order_no', 'order_type', 'pay_status', 'grant_status', 'grant_message', 'amount_total', 'user_id']) {
      const exists = columns.has(column);
      add(exists ? 'PASS' : 'FAIL', `member_orders.${column}`, exists ? 'exists' : 'missing');
      if (!exists) ok = false;
    }
  }

  return ok;
}

function checkGrantAndRegrant(): boolean {
  const service = read('server/src/services/payment-order.service.ts');
  let ok = true;
  const required = [
    ['grantOrderBenefits', /function\s+grantOrderBenefits|async\s+function\s+grantOrderBenefits/],
    ['grant_status=granted', /grant_status\s*=\s*'granted'|grant_status:\s*'granted'/],
    ['grant_status=failed', /grant_status:\s*'failed'|grant_status\s*=\s*'failed'/],
    ['regrant pay_status guard', /payStatus !== 'paid'/],
    ['regrant granted guard', /grantStatus === 'granted'/],
    ['regrant pending failed guard', /\['pending', 'failed'\]\.includes\(order\.grantStatus\)/],
    ['payment_logs regrant_attempt', /regrant_attempt/],
    ['payment_logs regrant_success', /regrant_success/],
    ['payment_logs regrant_failed', /regrant_failed/],
  ] as const;

  for (const [name, pattern] of required) {
    const pass = pattern.test(service);
    add(pass ? 'PASS' : 'FAIL', name, pass ? 'ok' : 'missing');
    if (!pass) ok = false;
  }

  if (/grant_status[\s\S]{0,80}['"]success['"]|grantStatus\s*[=!]==?\s*['"]success['"]/.test(service)) {
    add('FAIL', 'grant_status enum', 'success must not be used as grant status');
    ok = false;
  } else {
    add('PASS', 'grant_status enum', 'only pending/granted/failed detected');
  }

  return ok;
}

async function main(): Promise<void> {
  const entrypointsOk = checkRouteEntrypoints();
  const configReady = await checkWechatPayConfig();
  const dbOk = await checkDatabaseShape();
  const grantOk = checkGrantAndRegrant();

  for (const item of results) {
    console.log(`[${item.status}] ${item.name}: ${item.message}`);
  }

  const failed = results.filter(item => item.status === 'FAIL').length;
  const warned = results.filter(item => item.status === 'WARN').length;
  console.log('');
  console.log(`Summary: PASS=${results.filter(item => item.status === 'PASS').length} WARN=${warned} FAIL=${failed}`);

  if (failed > 0 || !entrypointsOk || !dbOk || !grantOk) {
    console.log('Conclusion: payment mainline is not ready');
    process.exitCode = 1;
  } else if (!configReady || warned > 0) {
    console.log('Conclusion: API integration is possible, real collection is not recommended yet');
  } else {
    console.log('Conclusion: payment API integration and real collection config are ready');
  }
}

main()
  .catch(err => {
    console.error('[FAIL] check:payment crashed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
