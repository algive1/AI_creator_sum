import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import mysql from 'mysql2/promise';
import { config } from '../utils/config';
import { getPm2ProcessDetails, pm2Home } from './pm2-runtime.service';

export type InstallState =
  | 'installed'
  | 'installing'
  | 'partial'
  | 'repair_required'
  | 'needs_finalize'
  | 'not_installed'
  | 'uninstalled'
  | 'env_missing'
  | 'db_unavailable'
  | 'db_not_ready'
  | 'config_missing'
  | 'unknown_error';

export interface EnvironmentIssue {
  key: string;
  reason: string;
}

export interface EnvironmentReadiness {
  ok: boolean;
  missing: string[];
  invalid: string[];
  issues: EnvironmentIssue[];
}

export interface DatabaseReadiness {
  connected: boolean;
  ready: boolean;
  error?: string;
  missingTables: string[];
  missingColumns: Record<string, string[]>;
  missingIndexes: Record<string, string[]>;
  missingConfigs: string[];
  systemInstalledValue: string | null;
  adminReady: boolean;
  adminUsers: number;
}

export interface InstallLockInfo {
  installedAt: string;
  version: string;
}

export type PersistentInstallStepKey =
  | 'writeConfig'
  | 'testDatabase'
  | 'migrateDatabase'
  | 'initSystemConfig'
  | 'createAdmin'
  | 'writeInstallLock'
  | 'startPm2';

export type PersistentInstallStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface PersistentInstallState {
  version: 1;
  steps: Partial<Record<PersistentInstallStepKey, PersistentInstallStepStatus>>;
  lastError?: {
    step: PersistentInstallStepKey;
    message: string;
    time: string;
  };
  warnings?: string[];
  updatedAt: string;
}

export interface ServiceReadiness {
  ready: boolean;
  port: number;
  pm2Home: string;
  pm2Status: string | null;
  pm2Cwd: string;
  pm2ScriptPath: string;
  healthCheckUrl: string;
  healthOk: boolean;
  healthStatus?: string;
  healthReleaseVersion?: string;
  healthResponse?: string;
  error?: string;
}

export interface RuntimeDiagnostics {
  appRootDir: string;
  currentPath: string;
  currentTarget: string;
  currentReleaseVersion: string;
  currentReleaseJsonPath: string;
  currentServerEntryExists: boolean;
  pm2AppName: string;
  pm2ScriptPath: string;
  installLockPath: string;
  installLockExists: boolean;
  legacyLockPaths: string[];
  sharedEnvPath: string;
  sharedEnvExists: boolean;
  healthCheckUrl: string;
  healthResponse: string;
  databaseCoreReady: boolean;
  databaseMissingTables: string[];
  databaseMissingConfigs: string[];
}

export interface InstallStatusReport {
  state: InstallState;
  installed: boolean;
  lockFileExists: boolean;
  lockFilePath: string;
  lockInfo: InstallLockInfo | null;
  environment: EnvironmentReadiness;
  database: DatabaseReadiness;
  installState: PersistentInstallState | null;
  service: ServiceReadiness;
  diagnostics: RuntimeDiagnostics;
  message: string;
}

const INSTALL_STATE_PATH = path.resolve(__dirname, '../../.install-state.json');
const CONNECT_TIMEOUT_MS = 3000;
const REQUIRED_ENV_KEYS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_NAME'];
const SYSTEM_INSTALLED_CONFIG_KEY = 'system.installed';
const SECRET_ENV_KEYS = ['JWT_SECRET', 'ENCRYPTION_KEY'];
const DEFAULT_APP_ROOT_DIR = '/www/wwwroot/ai-creator';
const DEFAULT_PM2_APP_NAME = 'ai-creator';

export const FINALIZATION_REQUIRED_CONFIG_KEYS = ['site.name', 'site.timezone', 'site.admin_title', 'storage.provider'];
export const INSECURE_PRODUCTION_SECRET_MESSAGE = '生产环境密钥不安全；首次安装请通过安装向导自动生成，已安装站点请重新生成 JWT_SECRET 和 ENCRYPTION_KEY 后重启服务。';
export const DB_ACCESS_DENIED_MESSAGE = '数据库账号或密码错误，无法连接数据库。';
export const DB_NOT_READY_MESSAGE = '数据库表结构未就绪，请通过安装向导执行初始化。';

const REQUIRED_CONFIG_KEYS = [SYSTEM_INSTALLED_CONFIG_KEY, ...FINALIZATION_REQUIRED_CONFIG_KEYS];

const REQUIRED_TABLES = [
  'schema_migrations',
  'app_releases',
  'release_update_logs',
  'config_check_results',
  'users',
  'user_profiles',
  'point_accounts',
  'point_logs',
  'user_assets',
  'signin_records',
  'ad_reward_logs',
  'point_tasks',
  'user_point_task_logs',
  'ai_model_providers',
  'ai_models',
  'ai_model_capabilities',
  'ai_model_fallback_rules',
  'ai_tasks',
  'ai_task_inputs',
  'ai_task_outputs',
  'ai_task_logs',
  'ai_model_call_logs',
  'ai_task_cost_logs',
  'ai_model_price_rules',
  'admin_users',
  'admin_operation_logs',
  'audit_logs',
  'files',
  'file_upload_logs',
  'file_delete_logs',
  'file_export_records',
  'storage_configs',
  'system_configs',
  'config_change_logs',
  'app_configs',
  'model_features',
  'model_tiers',
  'tier_model_bindings',
  'tier_capabilities',
  'member_versions',
  'member_plans',
  'member_benefit_icons',
  'member_plan_rights',
  'member_plan_point_rules',
  'user_memberships',
  'member_orders',
  'point_packages',
  'payment_logs',
  'invite_relations',
  'user_invites',
  'invite_reward_logs',
  'work_favorites',
  'template_categories',
  'templates',
  'template_tags',
  'template_favorites',
  'template_tag_relations',
  'template_usage_logs',
  'template_review_logs',
  'announcements',
  'announcement_user_records',
  'legal_documents',
  'user_legal_acceptances',
  'user_compliance_confirmations',
  'system_prompts',
];

const REQUIRED_COLUMNS: Record<string, string[]> = {
  ai_tasks: [
    'tier_id',
    'actual_model_id',
    'provider_task_id',
    'provider_status',
    'provider_status_message',
    'provider_started_at',
    'next_poll_at',
    'poll_count',
    'last_polled_at',
    'video_mode',
    'video_duration',
    'video_ratio',
    'processing_lock_until',
    'failed_at',
    'canceled_at',
  ],
  files: ['metadata_sanitized', 'ai_implicit_label_kept', 'platform_watermark_removed'],
  point_accounts: ['total_refunded'],
  signin_records: ['normal_signed_at', 'super_signed_at', 'super_streak_day', 'super_reward_points', 'normal_is_makeup', 'updated_at'],
  ad_reward_logs: ['ad_scene', 'expires_at', 'claimed_at'],
  templates: [
    'title',
    'template_type',
    'target_feature',
    'source',
    'prompt',
    'params_json',
    'ratio',
    'style',
    'tags_json',
    'is_enabled',
    'visibility',
    'status',
    'review_status',
    'usage_count',
    'favorite_count',
  ],
  member_orders: [
    'product_id',
    'product_name',
    'amount_total',
    'currency',
    'points_amount',
    'member_plan_id',
    'member_duration_days',
    'pay_status',
    'pay_channel',
    'wx_prepay_id',
    'grant_status',
    'grant_at',
  ],
  member_plan_rights: ['icon_url', 'icon_file_id'],
};

const REQUIRED_INDEXES: Record<string, string[]> = {
  ad_reward_logs: ['idx_ad_reward_scene_user_date'],
  ai_tasks: ['idx_video_poll', 'idx_user_status_created'],
  ai_task_outputs: ['uk_task_output_index'],
  point_logs: ['idx_user_created'],
  member_plan_rights: ['uk_plan_right', 'idx_icon_file'],
  member_benefit_icons: ['uk_icon_key', 'idx_status_sort'],
  templates: ['idx_templates_public', 'idx_templates_feature'],
  member_orders: ['idx_order_pay_status', 'idx_order_type_created', 'idx_user_status_created'],
  user_memberships: ['idx_user_status_expire'],
};

function safeError(err: any): string {
  return err?.message ? String(err.message).slice(0, 300) : 'unknown error';
}

function isWeakSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.length < 32) return true;
  if ([
    'please_change_this',
    'please_change_this_32_chars',
    'your-jwt-secret-change-in-production',
    'your-32-char-aes-key-here!!',
    'default-key-32-chars!!',
  ].includes(normalized)) {
    return true;
  }
  return /^(please|your|change|default|placeholder|secret|key)[-_:.]/.test(normalized);
}

export function isStrongProductionSecret(value: string): boolean {
  return !isWeakSecret(value);
}

export function getInstallLockPath(): string {
  return path.join(currentAppRoot(), 'shared', '.env.installed');
}

export function getInstallStatePath(): string {
  return INSTALL_STATE_PATH;
}

function sanitizeStateMessage(message: string): string {
  return String(message || '')
    .replace(/(DB_PASSWORD|JWT_SECRET|ENCRYPTION_KEY|password|passwd|pwd|secret|token|api[_-]?key)\s*=\s*("[^"]*"|'[^']*'|[^\s&]+)/gi, '$1=******')
    .replace(/(Access denied for user '[^']+'@'[^']+' \(using password: )YES(\))/gi, '$1******$2')
    .slice(0, 1200);
}

export function readInstallState(): PersistentInstallState | null {
  if (!fs.existsSync(INSTALL_STATE_PATH)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(INSTALL_STATE_PATH, 'utf8')) as PersistentInstallState;
    if (parsed?.version !== 1 || !parsed.steps || typeof parsed.steps !== 'object') return null;
    return {
      version: 1,
      steps: parsed.steps,
      lastError: parsed.lastError
        ? {
          step: parsed.lastError.step,
          message: sanitizeStateMessage(parsed.lastError.message),
          time: parsed.lastError.time,
        }
        : undefined,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(sanitizeStateMessage).slice(-20) : undefined,
      updatedAt: parsed.updatedAt || '',
    };
  } catch {
    return null;
  }
}

export function writeInstallState(state: PersistentInstallState): void {
  fs.mkdirSync(path.dirname(INSTALL_STATE_PATH), { recursive: true });
  const safeState: PersistentInstallState = {
    version: 1,
    steps: state.steps || {},
    lastError: state.lastError
      ? {
        step: state.lastError.step,
        message: sanitizeStateMessage(state.lastError.message),
        time: state.lastError.time,
      }
      : undefined,
    warnings: Array.isArray(state.warnings) ? state.warnings.map(sanitizeStateMessage).slice(-20) : undefined,
    updatedAt: state.updatedAt || new Date().toISOString(),
  };
  const tmpPath = `${INSTALL_STATE_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(safeState, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, INSTALL_STATE_PATH);
}

export function readInstallLock(lockPath = getInstallLockPath()): InstallLockInfo | null {
  if (!fs.existsSync(lockPath)) return null;

  try {
    const content = fs.readFileSync(lockPath, 'utf8');
    const data: Record<string, string> = {};
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const index = line.indexOf('=');
      if (index <= 0) continue;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
      data[key] = value;
    }
    return {
      installedAt: data.installed_at || data.installedAt || '',
      version: data.releaseVersion || data.version || '',
    };
  } catch {
    return { installedAt: '', version: '' };
  }
}

function legacyInstallLockPaths(): string[] {
  const paths = [
    path.join(currentServerDir(), '.env.installed'),
    path.join(currentAppRoot(), 'current', 'server', '.env.installed'),
    path.join(currentAppRoot(), 'server', '.env.installed'),
    path.resolve(__dirname, '../../.env.installed'),
  ];
  return Array.from(new Set(paths.map(item => path.resolve(item)))).filter(item => item !== getInstallLockPath());
}

function currentHealthCheckUrl(): string {
  return String(process.env.HEALTH_CHECK_URL || config.release.healthCheckUrl || `http://127.0.0.1:${currentPort()}/health`).trim();
}

function readCurrentReleaseVersion(): string {
  const currentRelease = currentReleaseInfo();
  return currentRelease.version;
}

export function writeInstallLock(lockPath = getInstallLockPath(), metadata: Partial<InstallLockInfo> & {
  releaseVersion?: string;
  appRootDir?: string;
  pm2AppName?: string;
  healthCheckUrl?: string;
} = {}): void {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const tmpPath = `${lockPath}.${process.pid}.${Date.now()}.tmp`;
  const installedAt = metadata.installedAt || new Date().toISOString();
  const releaseVersion = metadata.releaseVersion || metadata.version || readCurrentReleaseVersion() || '';
  const lines = [
    'installed=true',
    `installedAt=${installedAt}`,
    releaseVersion ? `releaseVersion=${releaseVersion}` : '',
    `appRootDir=${metadata.appRootDir || currentAppRoot()}`,
    `pm2AppName=${metadata.pm2AppName || currentPm2AppName()}`,
    `healthCheckUrl=${metadata.healthCheckUrl || currentHealthCheckUrl()}`,
  ].filter(Boolean);
  fs.writeFileSync(tmpPath, `${lines.join('\n')}\n`, 'utf8');
  fs.renameSync(tmpPath, lockPath);
}

function migrateLegacyInstallLockIfNeeded(): void {
  const target = getInstallLockPath();
  if (fs.existsSync(target)) return;

  for (const legacyPath of legacyInstallLockPaths()) {
    if (!fs.existsSync(legacyPath)) continue;
    const legacy = readInstallLock(legacyPath);
    writeInstallLock(target, {
      installedAt: legacy?.installedAt || undefined,
      releaseVersion: legacy?.version || readCurrentReleaseVersion(),
    });
    return;
  }
}

export function collectEnvironmentReadiness(): EnvironmentReadiness {
  const missing: string[] = [];
  const invalid: string[] = [];
  const issues: EnvironmentIssue[] = [];

  for (const key of REQUIRED_ENV_KEYS) {
    const value = String(process.env[key] || '').trim();
    if (!value) {
      missing.push(key);
      issues.push({ key, reason: 'missing' });
    }
  }

  for (const key of SECRET_ENV_KEYS) {
    const value = String(process.env[key] || '').trim();
    if (!value) {
      missing.push(key);
      issues.push({ key, reason: 'missing' });
    } else if (isWeakSecret(value)) {
      invalid.push(key);
      issues.push({ key, reason: 'weak production secret' });
    }
  }

  return {
    ok: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    issues,
  };
}

async function tableExists(conn: mysql.Connection, tableName: string): Promise<boolean> {
  const [rows] = await conn.execute(
    'SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [tableName],
  ) as any;
  return Number(rows?.[0]?.cnt || 0) > 0;
}

async function readSystemConfigValue(conn: mysql.Connection, key: string): Promise<string | null> {
  if (!await tableExists(conn, 'system_configs')) return null;
  const [rows] = await conn.execute(
    'SELECT config_value AS config_value FROM system_configs WHERE config_key = ? LIMIT 1',
    [key],
  ) as any;
  return rows?.[0]?.config_value != null ? String(rows[0].config_value) : null;
}

async function collectMissingConfigs(conn: mysql.Connection): Promise<string[]> {
  if (!await tableExists(conn, 'system_configs')) return [...REQUIRED_CONFIG_KEYS];
  const placeholders = REQUIRED_CONFIG_KEYS.map(() => '?').join(',');
  const [rows] = await conn.execute(
    `SELECT config_key FROM system_configs WHERE config_key IN (${placeholders})`,
    REQUIRED_CONFIG_KEYS,
  ) as any;
  const existing = new Set((rows as any[]).map(row => String(row.config_key)));
  return REQUIRED_CONFIG_KEYS.filter(key => !existing.has(key));
}

async function collectAdminReadiness(conn: mysql.Connection): Promise<{ adminReady: boolean; adminUsers: number }> {
  if (!await tableExists(conn, 'admin_users')) return { adminReady: false, adminUsers: 0 };
  const [rows] = await conn.execute('SELECT COUNT(*) AS cnt FROM admin_users') as any;
  const adminUsers = Number(rows?.[0]?.cnt || 0);
  return { adminReady: adminUsers > 0, adminUsers };
}

async function collectMissingColumns(conn: mysql.Connection): Promise<Record<string, string[]>> {
  const missing: Record<string, string[]> = {};
  for (const [tableName, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const placeholders = columns.map(() => '?').join(',');
    const [rows] = await conn.execute(
      `SELECT COLUMN_NAME AS column_name
         FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = ? AND column_name IN (${placeholders})`,
      [tableName, ...columns],
    ) as any;
    const existing = new Set((rows as any[]).map(row => String(row.column_name)));
    const missingColumns = columns.filter(column => !existing.has(column));
    if (missingColumns.length > 0) missing[tableName] = missingColumns;
  }
  return missing;
}

async function collectMissingIndexes(conn: mysql.Connection): Promise<Record<string, string[]>> {
  const missing: Record<string, string[]> = {};
  for (const [tableName, indexes] of Object.entries(REQUIRED_INDEXES)) {
    const placeholders = indexes.map(() => '?').join(',');
    const [rows] = await conn.execute(
      `SELECT DISTINCT INDEX_NAME AS index_name
         FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ? AND index_name IN (${placeholders})`,
      [tableName, ...indexes],
    ) as any;
    const existing = new Set((rows as any[]).map(row => String(row.index_name)));
    const missingIndexes = indexes.filter(index => !existing.has(index));
    if (missingIndexes.length > 0) missing[tableName] = missingIndexes;
  }
  return missing;
}

export async function collectDatabaseReadiness(): Promise<DatabaseReadiness> {
  const report: DatabaseReadiness = {
    connected: false,
    ready: false,
    missingTables: [...REQUIRED_TABLES],
    missingColumns: {},
    missingIndexes: {},
    missingConfigs: [...REQUIRED_CONFIG_KEYS],
    systemInstalledValue: null,
    adminReady: false,
    adminUsers: 0,
  };

  let conn: mysql.Connection | null = null;
  try {
    conn = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      connectTimeout: CONNECT_TIMEOUT_MS,
    });
    report.connected = true;

    const placeholders = REQUIRED_TABLES.map(() => '?').join(',');
    const [tableRows] = await conn.execute(
      `SELECT TABLE_NAME AS table_name
         FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name IN (${placeholders})`,
      REQUIRED_TABLES,
    ) as any;
    const existingTables = new Set((tableRows as any[]).map(row => String(row.table_name)));
    report.missingTables = REQUIRED_TABLES.filter(table => !existingTables.has(table));

    report.missingColumns = await collectMissingColumns(conn);
    report.missingIndexes = await collectMissingIndexes(conn);
    report.missingConfigs = await collectMissingConfigs(conn);
    report.systemInstalledValue = await readSystemConfigValue(conn, SYSTEM_INSTALLED_CONFIG_KEY);
    const adminReadiness = await collectAdminReadiness(conn);
    report.adminReady = adminReadiness.adminReady;
    report.adminUsers = adminReadiness.adminUsers;

    const missingColumnsCount = Object.values(report.missingColumns).reduce((sum, items) => sum + items.length, 0);
    const missingIndexesCount = Object.values(report.missingIndexes).reduce((sum, items) => sum + items.length, 0);
    report.ready =
      report.missingTables.length === 0 &&
      missingColumnsCount === 0 &&
      missingIndexesCount === 0 &&
      report.missingConfigs.length === 0 &&
      report.adminReady &&
      isSystemInstalledValue(report.systemInstalledValue);
  } catch (err: any) {
    report.error = safeError(err);
  } finally {
    if (conn) await conn.end().catch(() => undefined);
  }

  return report;
}

function isSystemInstalledValue(value: string | null): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function hasSecretIssue(environment: EnvironmentReadiness): boolean {
  return environment.issues.some(issue => SECRET_ENV_KEYS.includes(issue.key));
}

function hasStructureIssue(database: DatabaseReadiness): boolean {
  return database.missingTables.length > 0 ||
    Object.values(database.missingColumns).some(items => items.length > 0) ||
    Object.values(database.missingIndexes).some(items => items.length > 0);
}

function hasRuntimeConfigIssue(database: DatabaseReadiness): boolean {
  return database.missingConfigs.length > 0 || !database.adminReady || !isSystemInstalledValue(database.systemInstalledValue);
}

function isAccessDenied(error?: string): boolean {
  return !!error && /access denied/i.test(error);
}

function currentPort(): number {
  const port = parseInt(String(process.env.PORT || config.port || 3000), 10);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 3000;
}

function currentAppRoot(): string {
  return path.resolve(process.env.APP_ROOT_DIR || config.release.appRootDir || DEFAULT_APP_ROOT_DIR);
}

function currentServerDir(): string {
  return path.resolve(__dirname, '../..');
}

function readJsonVersion(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return '';
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return typeof parsed?.version === 'string' ? parsed.version.trim() : '';
  } catch {
    return '';
  }
}

function currentReleaseInfo(): { currentPath: string; target: string; releaseJsonPath: string; version: string; serverEntryExists: boolean } {
  const currentPath = path.join(currentAppRoot(), 'current');
  let target: string;
  try {
    target = fs.realpathSync(currentPath);
  } catch {
    target = '';
  }
  const releaseJsonPath = target ? path.join(target, 'release.json') : path.join(currentPath, 'release.json');
  return {
    currentPath,
    target,
    releaseJsonPath,
    version: readJsonVersion(releaseJsonPath),
    serverEntryExists: !!target && fs.existsSync(path.join(target, 'server', 'dist', 'index.js')),
  };
}

function currentPm2AppName(): string {
  const name = String(process.env.PM2_APP_NAME || config.release.pm2AppName || DEFAULT_PM2_APP_NAME).trim();
  return /^[A-Za-z0-9._-]{1,80}$/.test(name) ? name : DEFAULT_PM2_APP_NAME;
}

function requestHealth(healthCheckUrl: string, timeoutMs = 1500): Promise<{
  ok: boolean;
  statusCode: number | null;
  response: string;
  status?: string;
  releaseVersion?: string;
  error?: string;
}> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(healthCheckUrl);
    } catch (err: any) {
      resolve({ ok: false, statusCode: null, response: '', error: safeError(err) });
      return;
    }

    const client = url.protocol === 'https:' ? https : http;
    const req = client.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += String(chunk);
        if (body.length > 4000) req.destroy();
      });
      res.on('end', () => {
        let parsed: any;
        try {
          parsed = JSON.parse(body || '{}');
        } catch {
          parsed = null;
        }
        const status = typeof parsed?.status === 'string' ? parsed.status : undefined;
        const releaseVersion = typeof parsed?.releaseVersion === 'string' ? parsed.releaseVersion : undefined;
        resolve({
          ok: !!res.statusCode && res.statusCode >= 200 && res.statusCode < 300 && status === 'ok',
          statusCode: res.statusCode || null,
          response: body.slice(0, 2000),
          status,
          releaseVersion,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, statusCode: null, response: '', error: 'health check timeout' });
    });
    req.on('error', err => resolve({ ok: false, statusCode: null, response: '', error: safeError(err) }));
  });
}

async function collectServiceReadiness(): Promise<ServiceReadiness> {
  const port = currentPort();
  const appRoot = currentAppRoot();
  const healthCheckUrl = currentHealthCheckUrl();
  const options = {
    appRoot,
    serverDir: currentServerDir(),
    appName: currentPm2AppName(),
    port,
  };
  let pm2Status: string | null = null;
  let pm2Cwd = '';
  let pm2ScriptPath = '';
  let error = '';

  try {
    const pm2 = await getPm2ProcessDetails(options);
    pm2Status = pm2.status;
    pm2Cwd = pm2.cwd;
    pm2ScriptPath = pm2.scriptPath;
  } catch (err: any) {
    error = safeError(err);
  }

  const health = await requestHealth(healthCheckUrl, 1200);
  return {
    ready: health.ok,
    port,
    pm2Home: pm2Home(appRoot),
    pm2Status,
    pm2Cwd,
    pm2ScriptPath,
    healthCheckUrl,
    healthOk: health.ok,
    healthStatus: health.status,
    healthReleaseVersion: health.releaseVersion,
    healthResponse: health.response || health.error,
    error: error || health.error || undefined,
  };
}

function collectRuntimeDiagnostics(
  lockFilePath: string,
  lockFileExists: boolean,
  database: DatabaseReadiness,
  service: ServiceReadiness,
): RuntimeDiagnostics {
  const current = currentReleaseInfo();
  return {
    appRootDir: currentAppRoot(),
    currentPath: current.currentPath,
    currentTarget: current.target,
    currentReleaseVersion: current.version,
    currentReleaseJsonPath: current.releaseJsonPath,
    currentServerEntryExists: current.serverEntryExists,
    pm2AppName: currentPm2AppName(),
    pm2ScriptPath: service.pm2ScriptPath,
    installLockPath: lockFilePath,
    installLockExists: lockFileExists,
    legacyLockPaths: legacyInstallLockPaths().filter(item => fs.existsSync(item)),
    sharedEnvPath: path.join(currentAppRoot(), 'shared', '.env'),
    sharedEnvExists: fs.existsSync(path.join(currentAppRoot(), 'shared', '.env')),
    healthCheckUrl: service.healthCheckUrl,
    healthResponse: service.healthResponse || '',
    databaseCoreReady: database.ready,
    databaseMissingTables: database.missingTables,
    databaseMissingConfigs: database.missingConfigs,
  };
}

export async function evaluateInstallStatus(): Promise<InstallStatusReport> {
  migrateLegacyInstallLockIfNeeded();
  const lockFilePath = getInstallLockPath();
  const lockInfo = readInstallLock(lockFilePath);
  const lockFileExists = fs.existsSync(lockFilePath);
  const installState = readInstallState();
  const environment = collectEnvironmentReadiness();
  const database = await collectDatabaseReadiness();
  const service = await collectServiceReadiness();
  const diagnostics = collectRuntimeDiagnostics(lockFilePath, lockFileExists, database, service);

  let state: InstallState = 'not_installed';
  let message = '系统未安装';
  const hasRunningStep = Object.values(installState?.steps || {}).includes('running');
  const startPm2Status = installState?.steps.startPm2;

  if (!environment.ok) {
    state = 'env_missing';
    message = hasSecretIssue(environment) ? INSECURE_PRODUCTION_SECRET_MESSAGE : '环境变量缺失或无效';
  } else if (!database.connected) {
    state = 'db_unavailable';
    message = isAccessDenied(database.error) ? DB_ACCESS_DENIED_MESSAGE : '数据库不可用，无法连接数据库。';
  } else if (hasStructureIssue(database)) {
    state = 'not_installed';
    message = DB_NOT_READY_MESSAGE;
  } else if (hasRuntimeConfigIssue(database)) {
    state = 'config_missing';
    message = !database.adminReady
      ? '管理员账号未创建，请重新执行安装初始化。'
      : '必要系统配置缺失或安装标记未写入，请重新执行安装初始化。';
  } else if (database.ready && !lockFileExists) {
    state = 'repair_required';
    message = `数据库已初始化，但 ${lockFilePath} 安装锁缺失。请点击“修复安装状态/重新执行安装收尾”。`;
  } else if (database.ready && lockFileExists) {
    if (service.ready) {
      state = 'installed';
      message = startPm2Status === 'failed'
        ? '安装已完成。PM2 启动步骤曾失败，但当前服务健康检查通过，系统正常运行。'
        : '已安装且服务可访问';
    } else if (hasRunningStep) {
      state = 'installing';
      message = '安装任务正在执行。';
    } else {
      state = 'repair_required';
      message = `数据库和安装锁已就绪，但 ${service.healthCheckUrl} 健康检查未通过，请检查 current 指向和 PM2 服务后重新执行安装收尾。`;
    }
  }

  return {
    state,
    installed: state === 'installed',
    lockFileExists,
    lockFilePath,
    lockInfo,
    environment,
    database,
    installState,
    service,
    diagnostics,
    message,
  };
}

export async function assertInstallFinalizationReady(): Promise<void> {
  const status = await evaluateInstallStatus();
  if (status.state !== 'installed') {
    const dbMessage = status.database.error
      ? `; database error: ${status.database.error}`
      : status.database.missingTables.length || Object.keys(status.database.missingColumns).length || Object.keys(status.database.missingIndexes).length || status.database.missingConfigs.length
        ? `; database incomplete: tables=${status.database.missingTables.join(',') || 'none'} configs=${status.database.missingConfigs.join(',') || 'none'}`
        : '';
    const envMessage = status.environment.ok
      ? ''
      : `; env missing=${status.environment.missing.join(',') || 'none'} invalid=${status.environment.invalid.join(',') || 'none'}`;
    throw new Error(`${status.message}${dbMessage}${envMessage}`);
  }
}
