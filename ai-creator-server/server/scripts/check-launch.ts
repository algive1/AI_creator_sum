import { spawnSync } from 'node:child_process';
import '../src/utils/config';
import pool, { queryOne } from '../src/utils/db';
import { SettingsService } from '../src/services/settings.service';
import { evaluateInstallStatus } from '../src/services/install-readiness.service';

type Status = 'PASS' | 'WARN' | 'FAIL';
type MiniProgramReady = 'YES' | 'PARTIAL' | 'NO';

interface ModuleResult {
  name: string;
  status: Status;
  message: string;
}

const modules: ModuleResult[] = [];
let databaseAvailable = true;
let suggestRealCollection = false;
let miniProgramReady: MiniProgramReady = 'YES';

function add(name: string, status: Status, message: string): void {
  modules.push({ name, status, message });
  if (status === 'FAIL') miniProgramReady = 'NO';
  if (status === 'WARN' && miniProgramReady === 'YES') miniProgramReady = 'PARTIAL';
}

function runNpmScript(script: string): { status: Status; output: string; code: number | null } {
  const command = process.platform === 'win32' ? 'cmd' : 'npm';
  const args = process.platform === 'win32'
    ? ['/c', 'npm', 'run', '--silent', script]
    : ['run', '--silent', script];
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}${result.error ? result.error.message : ''}`.trim();
  const status: Status = result.status === 0 ? (/\[WARN\]|WARN=|WARN|not recommended/i.test(output) ? 'WARN' : 'PASS') : 'FAIL';
  return { status, output, code: result.status };
}

async function getSetting(key: string, fallback = ''): Promise<string> {
  try {
    return await SettingsService.getString(key, fallback);
  } catch {
    return fallback;
  }
}

async function getSystemSetting(key: string, fallback = ''): Promise<string> {
  try {
    return await SettingsService.getSystemString(key, fallback);
  } catch {
    return fallback;
  }
}

function isEnabled(value: unknown): boolean {
  return ['1', 'true', 'yes', 'on', 'active', 'enabled'].includes(String(value ?? '').trim().toLowerCase());
}

function isPlaceholderValue(value: unknown): boolean {
  return /please_replace|your[-_]|example\.com/i.test(String(value ?? ''));
}

async function tableExists(tableName: string): Promise<boolean> {
  const row = await queryOne<any>(
    `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName],
  );
  return Number(row?.cnt || 0) > 0;
}

async function assertDatabase(): Promise<void> {
  try {
    await queryOne('SELECT 1 AS ok');
    databaseAvailable = true;
    add('database', 'PASS', 'database connection is available');
  } catch (err: any) {
    databaseAvailable = false;
    add('database', 'WARN', `database unavailable; data checks skipped: ${err?.message || err}`);
  }
}

async function checkInstallState(): Promise<void> {
  const status = await evaluateInstallStatus();
  if (status.installed) {
    add('install', 'PASS', 'installed=true, system.installed=true and shared install lock are ready');
    return;
  }

  const details = [
    `state=${status.state}`,
    status.environment.missing.length ? `missing env=${status.environment.missing.join(',')}` : '',
    status.environment.invalid.length ? `invalid env=${status.environment.invalid.join(',')}` : '',
    status.database.error ? `database=${status.database.error}` : '',
    status.database.missingTables.length ? `missing tables=${status.database.missingTables.length}` : '',
    status.database.missingConfigs.length ? `missing configs=${status.database.missingConfigs.join(',')}` : '',
    status.lockFileExists ? 'lock exists' : 'lock missing',
  ].filter(Boolean).join('; ');
  const level = status.state === 'repair_required' || status.state === 'needs_finalize' ? 'WARN' : 'FAIL';
  add('install', level, `${status.message}${details ? `; ${details}` : ''}`);
}

function checkArchitecture(): void {
  const result = runNpmScript('check:architecture-unified');
  add('architecture', result.status === 'FAIL' ? 'FAIL' : 'PASS', result.status === 'FAIL' ? result.output || 'architecture check failed' : 'new mainline architecture is unified');
}

function checkUnifiedApi(): void {
  const result = runNpmScript('check:unified-api');
  add('unified-api', result.status === 'FAIL' ? 'FAIL' : 'PASS', result.status === 'FAIL' ? result.output || 'unified API check failed' : 'API entrypoints are unified');
}

function checkPayment(): void {
  const result = runNpmScript('check:payment');
  const output = result.output || '';
  if (result.status === 'FAIL') {
    add('payment', 'FAIL', output || 'payment check failed');
    suggestRealCollection = false;
    return;
  }
  suggestRealCollection = output.includes('real collection config are ready');
  add('payment', suggestRealCollection ? 'PASS' : 'WARN', suggestRealCollection ? 'WeChat Pay config is ready for real collection' : 'payment API can be integrated, but real collection is not recommended yet');
}

function checkCustomerService(): void {
  const result = runNpmScript('check:customer-service');
  if (result.status === 'FAIL') {
    add('customer-service', 'FAIL', result.output || 'customer service check failed');
  } else {
    add('customer-service', result.status, result.status === 'PASS' ? 'customer_service.* and public app config are ready' : 'customer service check has warnings');
  }
}

async function checkWechatLogin(): Promise<void> {
  const enabled = isEnabled(await getSetting('wechat.login_enabled', 'true'));
  const appId = await getSetting('wechat.app_id', '');
  const appSecret = await getSetting('wechat.app_secret', '');
  if (!enabled) {
    add('wechat-login', 'WARN', 'wechat login is disabled');
    return;
  }
  if (!appId || !appSecret) {
    add('wechat-login', 'WARN', 'wechat.app_id or wechat.app_secret is missing');
    return;
  }
  add('wechat-login', 'PASS', 'wechat login base config exists');
}

async function checkFeature(featureKey: 'image_create' | 'video_create', label: string): Promise<void> {
  if (!databaseAvailable) {
    add(label, 'WARN', 'database unavailable; tier/model binding check skipped');
    return;
  }
  const row = await queryOne<any>(
    `SELECT t.tier_key, t.tier_name, m.id AS model_id, m.name AS model_name,
            p.id AS provider_id, p.name AS provider_name, p.api_base_url, p.api_key
       FROM model_features f
       JOIN model_tiers t ON t.feature_id = f.id AND t.status = 'active'
       JOIN tier_model_bindings b ON b.tier_id = t.id AND b.binding_type = 'primary'
       JOIN ai_models m ON m.id = b.model_id AND m.status = 'active'
       JOIN ai_model_providers p ON p.id = m.provider_id AND p.status = 'active'
      WHERE f.feature_key = ? AND f.status = 'active'
      ORDER BY t.is_default DESC, t.sort_order ASC
      LIMIT 1`,
    [featureKey],
  );
  if (!row) {
    add(label, featureKey === 'video_create' ? 'WARN' : 'FAIL', `${featureKey} has no active tier bound to an active primary model`);
    return;
  }
  if (!String(row.api_base_url || '').trim() || !String(row.api_key || '').trim()) {
    add(label, 'FAIL', `${row.provider_name || row.provider_id} is missing api_base_url or api_key`);
    return;
  }
  add(label, 'PASS', `${row.tier_name || row.tier_key} is bound to ${row.model_name || row.model_id}`);
}

async function checkStorage(): Promise<void> {
  if (!databaseAvailable) {
    add('storage', 'WARN', 'database unavailable; storage.provider check skipped');
    return;
  }
  const provider = await getSystemSetting('storage.provider', '');
  if (!provider) {
    add('storage', 'FAIL', 'storage.provider is missing from system_configs');
    return;
  }

  if (provider === 'local') {
    const uploadDir = await getSystemSetting('storage.local.upload_dir', '');
    const baseUrl = await getSystemSetting('storage.local.base_url', '');
    if (!uploadDir || !baseUrl) {
      add('storage', 'FAIL', 'local storage requires storage.local.upload_dir and storage.local.base_url');
      return;
    }
    if (isPlaceholderValue(baseUrl)) {
      add('storage', 'FAIL', 'storage.local.base_url still uses a placeholder domain');
      return;
    }
    const production = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    if (!/^https:\/\//i.test(baseUrl)) {
      add('storage', production ? 'FAIL' : 'WARN', 'storage.local.base_url should be a full HTTPS URL before launch');
      return;
    }
  }

  add('storage', 'PASS', `storage.provider=${provider}`);
}

async function checkPointsAndMembership(): Promise<void> {
  if (!databaseAvailable) {
    add('points', 'WARN', 'database unavailable; points table check skipped');
    add('membership', 'WARN', 'database unavailable; membership table check skipped');
    return;
  }

  const pointsOk = await tableExists('point_accounts') && await tableExists('point_logs') && await tableExists('point_packages');
  const membershipOk = await tableExists('user_memberships')
    && await tableExists('member_plans')
    && await tableExists('member_plan_rights')
    && await tableExists('member_benefit_icons');
  add('points', pointsOk ? 'PASS' : 'FAIL', pointsOk ? 'points tables exist' : 'points tables are incomplete');
  add('membership', membershipOk ? 'PASS' : 'FAIL', membershipOk ? 'membership tables exist; purchasing uses POST /api/v1/orders' : 'membership tables are incomplete');
}

function printSummary(): void {
  for (const item of modules) {
    console.log(`[${item.status}] ${item.name}: ${item.message}`);
  }

  const failCount = modules.filter(item => item.status === 'FAIL').length;
  const warnCount = modules.filter(item => item.status === 'WARN').length;
  console.log('');
  console.log(`deploy-environment: ${modules.find(item => item.name === 'database')?.status || 'WARN'}`);
  console.log(`wechat-login: ${modules.find(item => item.name === 'wechat-login')?.status || 'WARN'}`);
  console.log(`payment: ${modules.find(item => item.name === 'payment')?.status || 'WARN'}`);
  console.log(`suggest-real-collection: ${suggestRealCollection ? 'YES' : 'NO'}`);
  console.log(`image-create: ${modules.find(item => item.name === 'image-create')?.status || 'WARN'}`);
  console.log(`video-create: ${modules.find(item => item.name === 'video-create')?.status || 'WARN'}`);
  console.log(`storage: ${modules.find(item => item.name === 'storage')?.status || 'WARN'}`);
  console.log(`points: ${modules.find(item => item.name === 'points')?.status || 'WARN'}`);
  console.log(`membership: ${modules.find(item => item.name === 'membership')?.status || 'WARN'}`);
  console.log(`mini-program-integration-ready: ${miniProgramReady}`);

  let conclusion = 'ready for launch';
  if (failCount > 0 || miniProgramReady === 'NO') conclusion = 'not ready for integration';
  else if (warnCount > 0 || !suggestRealCollection) conclusion = 'integration can start, but not ready for production launch';
  console.log(`final-conclusion: ${conclusion}`);
  if (failCount > 0) process.exitCode = 1;
}

async function main(): Promise<void> {
  checkArchitecture();
  checkUnifiedApi();
  checkPayment();
  checkCustomerService();
  await checkInstallState();
  await assertDatabase();
  await checkWechatLogin();
  await checkFeature('image_create', 'image-create');
  await checkFeature('video_create', 'video-create');
  await checkStorage();
  await checkPointsAndMembership();
  printSummary();
}

main()
  .catch(err => {
    add('launch', 'FAIL', err?.message || String(err));
    printSummary();
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
