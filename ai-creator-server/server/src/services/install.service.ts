// server/src/services/install.service.ts
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn, spawnSync } from 'child_process';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { setInstallCacheInstalled } from '../middleware/install';
import { config } from '../utils/config';
import { resetDbPool } from '../utils/db';
import {
  collectDatabaseReadiness,
  collectEnvironmentReadiness,
  DB_ACCESS_DENIED_MESSAGE,
  DB_NOT_READY_MESSAGE,
  evaluateInstallStatus,
  FINALIZATION_REQUIRED_CONFIG_KEYS,
  getInstallLockPath,
  INSECURE_PRODUCTION_SECRET_MESSAGE,
  readInstallState,
  type PersistentInstallState,
  type PersistentInstallStepKey,
  type PersistentInstallStepStatus,
  writeInstallLock,
  writeInstallState,
} from './install-readiness.service';
import {
  checkPm2Version,
  ensurePm2AppStarted,
  pm2Home,
} from './pm2-runtime.service';
import { syncDeploymentConfigsFromEnv } from './deploy-config-sync.service';
import { syncProviderApiKeysFromEnv } from './provider-key-sync.service';

const SCHEMA_FILES = [
  'schema.sql',
  'schema_phase2.sql',
  'schema_phase3.sql',
  'schema_phase4.sql',
  'schema_phase5.sql',
  'schema_phase6.sql',
  'schema_phase7.sql',
  'schema_files.sql',
  'schema_phase8.sql',
  'schema_phase9.sql',
  'schema_phase10.sql',
  'schema_phase11.sql',
  'schema_phase12.sql',
];
const SEED_FILES = ['seed_phase3.sql', 'seed_phase7.sql', 'seed_phase12.sql'];
const REQUIRED_SQL_FILES = ['schema.sql', 'schema_phase12.sql', 'seed_phase12.sql'];
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
  'member_plan_feature_discounts',
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
  files: [
    'metadata_sanitized',
    'ai_implicit_label_kept',
    'platform_watermark_removed',
  ],
  point_accounts: [
    'total_refunded',
  ],
  signin_records: [
    'normal_signed_at',
    'super_signed_at',
    'super_streak_day',
    'super_reward_points',
    'normal_is_makeup',
  ],
  ad_reward_logs: [
    'ad_scene',
    'expires_at',
    'claimed_at',
  ],
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
  member_plan_rights: [
    'icon_url',
    'icon_file_id',
  ],
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

interface DbConfig { host: string; port: number; database: string; user: string; password: string; prefix: string; autoCreate: boolean }
interface SysConfig { siteName: string; adminPath: string; timezone: string; storageType: string; debugMode: boolean; allowRegister: boolean }
interface AdminConfig { username: string; password: string; confirmPassword?: string; email?: string; phone?: string }

type InstallTaskKind = 'install' | 'build';
type InstallTaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'partial_success';
type InstallTaskStepKey =
  | 'write_config'
  | 'test_database'
  | 'create_tables'
  | 'init_config'
  | 'create_admin'
  | 'write_lock'
  | 'pm2'
  | 'complete'
  | 'build_admin'
  | 'build_server';

interface InstallTaskStep {
  key: InstallTaskStepKey;
  title: string;
  status: InstallTaskStatus;
  message?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface InstallTaskSnapshot {
  id: string;
  kind: InstallTaskKind;
  status: InstallTaskStatus;
  step: InstallTaskStepKey;
  steps: InstallTaskStep[];
  logs: string[];
  error?: string;
  startedAt: string;
  finishedAt?: string;
  installed?: boolean;
  result?: Record<string, unknown>;
}

interface NormalizedInstallPayload {
  db: DbConfig;
  sys: SysConfig & { adminTitle: string };
  admin: { username: string; password: string; confirmPassword?: string; email?: string; phone?: string };
  port: number;
}

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

const DEFAULT_APP_ROOT_DIR = '/www/wwwroot/ai-creator';
const DEFAULT_PM2_APP_NAME = 'ai-creator';
const MAX_LOG_LINES = 300;
const SEMVER_VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const INSTALL_STEPS: InstallTaskStep[] = [
  { key: 'write_config', title: '正在写入配置', status: 'pending' },
  { key: 'test_database', title: '正在测试数据库', status: 'pending' },
  { key: 'create_tables', title: '正在创建数据表', status: 'pending' },
  { key: 'init_config', title: '正在初始化系统配置', status: 'pending' },
  { key: 'create_admin', title: '正在创建管理员', status: 'pending' },
  { key: 'write_lock', title: '正在写入安装锁', status: 'pending' },
  { key: 'pm2', title: '正在启动 PM2 服务', status: 'pending' },
  { key: 'complete', title: '安装完成', status: 'pending' },
];

const TASK_TO_PERSISTENT_STEP: Partial<Record<InstallTaskStepKey, PersistentInstallStepKey>> = {
  write_config: 'writeConfig',
  test_database: 'testDatabase',
  create_tables: 'migrateDatabase',
  init_config: 'initSystemConfig',
  create_admin: 'createAdmin',
  write_lock: 'writeInstallLock',
  pm2: 'startPm2',
};

const PERSISTENT_TO_TASK_STEP: Record<PersistentInstallStepKey, InstallTaskStepKey> = {
  writeConfig: 'write_config',
  testDatabase: 'test_database',
  migrateDatabase: 'create_tables',
  initSystemConfig: 'init_config',
  createAdmin: 'create_admin',
  writeInstallLock: 'write_lock',
  startPm2: 'pm2',
};

const BUILD_STEPS: InstallTaskStep[] = [
  { key: 'build_admin', title: '正在构建后台前端', status: 'pending' },
  { key: 'build_server', title: '正在构建后端服务', status: 'pending' },
  { key: 'complete', title: '构建完成', status: 'pending' },
];

let tempConfig: { db?: DbConfig; sys?: SysConfig; admin?: AdminConfig } = {};
const installTasks = new Map<string, InstallTaskSnapshot>();

export function getTempConfig() { return tempConfig; }

export function setTempDbConfigForCheck(cfg: DbConfig) {
  tempConfig.db = cfg;
}

function applyRuntimeDbConfig(cfg: DbConfig): void {
  process.env.DB_HOST = cfg.host;
  process.env.DB_PORT = String(cfg.port);
  process.env.DB_NAME = cfg.database;
  process.env.DB_USER = cfg.user;
  process.env.DB_PASSWORD = cfg.password;

  config.db.host = cfg.host;
  config.db.port = cfg.port;
  config.db.database = cfg.database;
  config.db.user = cfg.user;
  config.db.password = cfg.password;
  resetDbPool();
}

function serverDir(): string {
  return path.resolve(__dirname, '../..');
}

function hasProjectRootShape(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'server', 'package.json')) &&
    fs.existsSync(path.join(dir, 'admin-web', 'package.json'));
}

function appRootDir(): string {
  const envRoot = String(process.env.APP_ROOT_DIR || '').trim();
  if (envRoot && fs.existsSync(envRoot)) return path.resolve(envRoot);

  const serverParent = path.resolve(serverDir(), '..');
  const configured = String(config.release.appRootDir || '').trim();
  const configuredRoot = configured ? path.resolve(configured) : '';
  const configuredIsServerDir = configuredRoot && path.resolve(configuredRoot) === path.resolve(serverDir());

  if (configuredRoot && !configuredIsServerDir && fs.existsSync(configuredRoot)) {
    return configuredRoot;
  }
  if (hasProjectRootShape(serverParent)) return serverParent;
  if (configuredRoot && fs.existsSync(configuredRoot)) return configuredRoot;
  if (fs.existsSync(DEFAULT_APP_ROOT_DIR)) return DEFAULT_APP_ROOT_DIR;
  return serverParent;
}

function runtimeServerDir(): string {
  const currentServer = path.join(appRootDir(), 'current', 'server');
  if (fs.existsSync(path.join(currentServer, 'dist', 'index.js'))) {
    return assertPathInsideAppRoot(currentServer);
  }
  return serverDir();
}

function taskDir(): string {
  return assertPathInsideServer(path.join(serverDir(), 'runtime', 'install-tasks'));
}

function assertPathInsideServer(targetPath: string): string {
  const root = path.resolve(serverDir());
  const resolved = path.resolve(targetPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`文件路径超出 server 目录: ${resolved}`);
  }
  return resolved;
}

function assertPathInsideAppRoot(targetPath: string): string {
  const root = path.resolve(appRootDir());
  const resolved = path.resolve(targetPath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`执行目录超出项目目录: ${resolved}`);
  }
  return resolved;
}

function commandName(command: string): string {
  if (process.platform !== 'win32') return command;
  if (command === 'npm') return 'npm.cmd';
  if (command === 'pm2') return 'pm2.cmd';
  return command;
}

function checkCommandVersion(command: string, args: string[] = ['--version']): { exists: boolean; version?: string; error?: string } {
  const result = spawnSync(commandName(command), args, { encoding: 'utf8', shell: false, timeout: 8000 });
  if (result.error) return { exists: false, error: result.error.message };
  if (result.status !== 0) {
    return { exists: false, error: (result.stderr || result.stdout || `${command} exited with ${result.status}`).trim() };
  }
  return { exists: true, version: String(result.stdout || result.stderr || '').trim().split(/\r?\n/)[0] };
}

function envPath(): string {
  return assertPathInsideServer(path.join(serverDir(), '.env'));
}

function installLockPath(): string {
  return assertPathInsideAppRoot(getInstallLockPath());
}

function timestampForFile(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function backupEnvFile(): string | null {
  const file = envPath();
  if (!fs.existsSync(file)) return null;
  const backupPath = assertPathInsideServer(path.join(serverDir(), `.env.backup.${timestampForFile()}`));
  fs.copyFileSync(file, backupPath);
  return backupPath;
}

function formatEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@-]*$/.test(value)) return value;
  return JSON.stringify(value);
}

function writeEnvValues(values: Record<string, string>): { backupPath: string | null; envPath: string } {
  const file = envPath();
  const backupPath = backupEnvFile();
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const keys = new Set(Object.keys(values));
  const written = new Set<string>();
  const nextLines = existing
    .filter((line, index) => !(index === existing.length - 1 && line === ''))
    .map(line => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (!match || !keys.has(match[1])) return line;
      const key = match[1];
      written.add(key);
      return `${key}=${formatEnvValue(values[key])}`;
    });

  for (const key of Object.keys(values)) {
    if (!written.has(key)) nextLines.push(`${key}=${formatEnvValue(values[key])}`);
  }

  fs.writeFileSync(file, `${nextLines.join('\n')}\n`, 'utf8');
  return { backupPath, envPath: file };
}

function applyRuntimeEnvValues(values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
  if (values.PORT) config.port = normalizePort(values.PORT, config.port || 3000);
  if (values.NODE_ENV) config.nodeEnv = values.NODE_ENV;
  if (values.DB_HOST) config.db.host = values.DB_HOST;
  if (values.DB_PORT) config.db.port = normalizePort(values.DB_PORT, config.db.port || 3306);
  if (values.DB_NAME) config.db.database = values.DB_NAME;
  if (values.DB_USER) config.db.user = values.DB_USER;
  if (values.DB_PASSWORD) config.db.password = values.DB_PASSWORD;
  if (values.JWT_SECRET) config.jwt.secret = values.JWT_SECRET;
  if (values.ENCRYPTION_KEY) config.encryption.key = values.ENCRYPTION_KEY;
  if (values.STORAGE_PROVIDER) config.storage.provider = values.STORAGE_PROVIDER;
  if (values.LOCAL_UPLOAD_DIR) config.storage.localUploadDir = values.LOCAL_UPLOAD_DIR;
  if (values.LOCAL_BASE_URL) config.storage.localBaseUrl = values.LOCAL_BASE_URL;
  if (values.APP_ROOT_DIR) config.release.appRootDir = values.APP_ROOT_DIR;
  if (values.UPDATE_PACKAGES_DIR) config.release.updatePackagesDir = values.UPDATE_PACKAGES_DIR;
  if (values.PM2_APP_NAME) config.release.pm2AppName = values.PM2_APP_NAME;
  if (values.HEALTH_CHECK_URL) config.release.healthCheckUrl = values.HEALTH_CHECK_URL;
}

function reloadRuntimeEnvFromFile(file = envPath()): void {
  if (!fs.existsSync(file)) return;
  applyRuntimeEnvValues(dotenv.parse(fs.readFileSync(file, 'utf8')));
}

function reloadRuntimeEnvIfConfigWritten(): void {
  if (isPersistentStepCompleted('writeConfig')) reloadRuntimeEnvFromFile();
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function powershellQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function powershellArray(values: string[]): string {
  return `@(${values.map(powershellQuote).join(', ')})`;
}

function pathExistsOrSymlink(targetPath: string): boolean {
  try {
    fs.lstatSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

function initialReleaseVersion(): string {
  const version =
    tryReadReleaseVersion(path.join(appRootDir(), 'release.json')) ||
    tryReadReleaseVersion(path.join(serverDir(), 'package.json'));
  return SEMVER_VERSION_RE.test(version) ? version : '0.0.0';
}

function shouldCopyInitialReleasePath(sourcePath: string): boolean {
  const appRoot = path.resolve(appRootDir());
  const relative = path.relative(appRoot, path.resolve(sourcePath)).replace(/\\/g, '/');
  const segments = relative.split('/').filter(Boolean);
  if (segments.includes('node_modules')) return false;
  if (segments.some(segment => [
    'runtime',
    'logs',
    'backups',
    '.pm2',
    'uploads',
    'update-packages',
    'releases',
    'shared',
    'current',
    '.git',
    '.codex-qa',
    '.release-staging',
  ].includes(segment))) {
    return false;
  }
  if (segments.some(segment => /^codex[^/]*$/i.test(segment))) return false;

  const basename = path.basename(sourcePath);
  if (basename === '.env') return false;
  if (basename.startsWith('.env.') && !['.env.example', '.env.production.example'].includes(basename)) return false;
  if (/\.(log|tmp|temp|cache|bak|swp)$/i.test(basename) || basename.endsWith('~')) return false;
  return true;
}

function allocateInitialReleaseDir(version: string): string {
  const releasesDir = assertPathInsideAppRoot(path.join(appRootDir(), 'releases'));
  fs.mkdirSync(releasesDir, { recursive: true });
  const base = path.join(releasesDir, `initial-${version}-${timestampForFile()}`);
  if (!fs.existsSync(base)) return base;
  for (let i = 1; i <= 99; i += 1) {
    const candidate = `${base}-${i}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Unable to allocate initial release directory');
}

function linkOrCopyFile(source: string, target: string): void {
  if (pathExistsOrSymlink(target)) fs.rmSync(target, { force: true });
  try {
    fs.symlinkSync(source, target, 'file');
  } catch {
    fs.copyFileSync(source, target);
  }
}

function createDirectoryLink(target: string, linkPath: string): void {
  const resolvedTarget = path.resolve(target);
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(resolvedTarget, linkPath, linkType);
}

function linkInitialServerNodeModules(releaseDir: string): string | null {
  const source = path.join(appRootDir(), 'server', 'node_modules');
  const target = path.join(releaseDir, 'server', 'node_modules');
  if (!fs.existsSync(source)) return null;
  if (pathExistsOrSymlink(target)) fs.rmSync(target, { recursive: true, force: true });
  try {
    createDirectoryLink(source, target);
  } catch (err: any) {
    throw new Error(`无法为初始运行目录创建 server/node_modules 链接：${err?.message || String(err)}。请在 server 目录执行 npm ci --include=dev 后重试安装。`);
  }
  return target;
}

function createInitialReleaseSnapshot(releaseDir: string): void {
  const appRoot = appRootDir();
  fs.mkdirSync(releaseDir, { recursive: false });
  for (const item of ['server', 'admin-web', 'scripts', 'docs']) {
    const source = path.join(appRoot, item);
    if (!fs.existsSync(source)) continue;
    fs.cpSync(source, path.join(releaseDir, item), {
      recursive: true,
      dereference: false,
      filter: shouldCopyInitialReleasePath,
    });
  }
  linkInitialServerNodeModules(releaseDir);
  fs.writeFileSync(path.join(releaseDir, 'release.json'), JSON.stringify({
    version: initialReleaseVersion(),
    packageType: 'server-admin',
    buildTime: new Date().toISOString(),
    name: 'AI Creator initial install',
    description: 'Initial runtime snapshot created by install wizard',
  }, null, 2) + '\n', 'utf8');
}

function ensureInitialRuntimeLayout(): { releaseDir: string; sharedEnv: string; currentPath: string } {
  const appRoot = appRootDir();
  const sharedDir = assertPathInsideAppRoot(path.join(appRoot, 'shared'));
  const sharedEnv = assertPathInsideAppRoot(path.join(sharedDir, '.env'));
  fs.mkdirSync(sharedDir, { recursive: true });
  fs.copyFileSync(envPath(), sharedEnv);
  try { fs.chmodSync(sharedEnv, 0o600); } catch { /* best-effort on Windows */ }

  const current = currentReleasePath();
  if (pathExistsOrSymlink(current)) {
    const stat = fs.lstatSync(current);
    if (!stat.isSymbolicLink()) {
      throw new Error(`current exists but is not a symbolic link: ${current}`);
    }
    return { releaseDir: fs.realpathSync(current), sharedEnv, currentPath: current };
  }

  const releaseDir = allocateInitialReleaseDir(initialReleaseVersion());
  createInitialReleaseSnapshot(releaseDir);
  linkOrCopyFile(sharedEnv, path.join(releaseDir, 'server', '.env'));
  createDirectoryLink(releaseDir, current);
  return { releaseDir, sharedEnv, currentPath: current };
}

function applyRuntimeInstallConfig(payload: NormalizedInstallPayload, secrets: { jwtSecret: string; encryptionKey: string }): void {
  applyRuntimeDbConfig(payload.db);

  const envValues: Record<string, string> = {
    PORT: String(payload.port),
    NODE_ENV: 'production',
    JWT_SECRET: secrets.jwtSecret,
    ENCRYPTION_KEY: secrets.encryptionKey,
    APP_ROOT_DIR: appRootDir(),
    UPDATE_PACKAGES_DIR: process.env.UPDATE_PACKAGES_DIR || path.join(appRootDir(), 'update-packages'),
    PM2_APP_NAME: process.env.PM2_APP_NAME || config.release.pm2AppName || DEFAULT_PM2_APP_NAME,
    STORAGE_PROVIDER: payload.sys.storageType,
    LOCAL_UPLOAD_DIR: process.env.LOCAL_UPLOAD_DIR || config.storage.localUploadDir || path.join(appRootDir(), 'uploads'),
    LOCAL_BASE_URL: process.env.LOCAL_BASE_URL || config.storage.localBaseUrl || '/static',
  };

  for (const [key, value] of Object.entries(envValues)) process.env[key] = value;
  config.port = payload.port;
  config.nodeEnv = envValues.NODE_ENV;
  config.jwt.secret = secrets.jwtSecret;
  config.encryption.key = secrets.encryptionKey;
  config.storage.provider = payload.sys.storageType;
  config.storage.localUploadDir = envValues.LOCAL_UPLOAD_DIR;
  config.storage.localBaseUrl = envValues.LOCAL_BASE_URL;
  config.release.appRootDir = envValues.APP_ROOT_DIR;
  config.release.updatePackagesDir = envValues.UPDATE_PACKAGES_DIR;
  config.release.pm2AppName = envValues.PM2_APP_NAME;
  config.release.healthCheckUrl = process.env.HEALTH_CHECK_URL || `http://127.0.0.1:${payload.port}/health`;
}

function sanitizeLog(message: string): string {
  return String(message || '')
    .replace(/(DB_PASSWORD|JWT_SECRET|ENCRYPTION_KEY|password|passwd|pwd|secret|token|api[_-]?key)\s*=\s*("[^"]*"|'[^']*'|[^\s&]+)/gi, '$1=******')
    .replace(/(Access denied for user '[^']+'@'[^']+' \(using password: )YES(\))/gi, '$1******$2')
    .slice(0, 4000);
}

function normalizeNodeRuntimeError(message: string): string {
  if (!/Unreachable code/i.test(message)) return message;
  return [
    `Node.js/PM2 运行环境异常（当前 Node ${process.version}）：检测到 Node 内部错误 "Unreachable code"。`,
    '请在服务器切换到 Node.js 20 LTS 或稳定的 Node.js 22 LTS，重新执行 npm ci --include=dev && npm run build 后，再回到安装向导重试启动服务。',
    '如果是重新上传文件和数据库的新部署，请同时确认 /www/wwwroot/ai-creator/current、shared/.env、shared/.env.installed 和 .pm2 均属于本次部署，旧残留会导致安装状态误判。',
    `原始错误：${message}`,
  ].join(' ');
}

function installErrorText(err: any): string {
  return normalizeNodeRuntimeError(err?.message || String(err));
}

function emptyInstallState(): PersistentInstallState {
  return { version: 1, steps: {}, updatedAt: new Date().toISOString() };
}

function currentInstallState(): PersistentInstallState {
  return readInstallState() || emptyInstallState();
}

function persistentStepStatus(step: PersistentInstallStepKey): PersistentInstallStepStatus | undefined {
  return readInstallState()?.steps?.[step];
}

function isPersistentStepCompleted(step: PersistentInstallStepKey): boolean {
  return persistentStepStatus(step) === 'completed';
}

function markPersistentStep(step: PersistentInstallStepKey, status: PersistentInstallStepStatus, message?: string, warnings?: string[]): void {
  const state = currentInstallState();
  state.steps = { ...(state.steps || {}), [step]: status };
  state.updatedAt = new Date().toISOString();
  if (status === 'failed') {
    state.lastError = { step, message: sanitizeLog(message || '步骤执行失败'), time: state.updatedAt };
  } else if (state.lastError?.step === step && status === 'completed') {
    delete state.lastError;
  }
  if (warnings?.length) {
    state.warnings = [...(state.warnings || []), ...warnings.map(sanitizeLog)].slice(-20);
  }
  writeInstallState(state);
}

function markPersistentTaskStep(taskStep: InstallTaskStepKey, status: PersistentInstallStepStatus, message?: string, warnings?: string[]): void {
  const persistentStep = TASK_TO_PERSISTENT_STEP[taskStep];
  if (!persistentStep) return;
  markPersistentStep(persistentStep, status, message, warnings);
}

function applyCompletedInstallStateToTask(task: InstallTaskSnapshot): void {
  const state = readInstallState();
  if (!state?.steps) return;

  for (const [persistentStep, status] of Object.entries(state.steps) as Array<[PersistentInstallStepKey, PersistentInstallStepStatus]>) {
    if (status !== 'completed') continue;
    const taskStepKey = PERSISTENT_TO_TASK_STEP[persistentStep];
    const taskStep = task.steps.find(item => item.key === taskStepKey);
    if (taskStep) {
      taskStep.status = 'success';
      taskStep.message = taskStep.message || '已完成，跳过';
      taskStep.finishedAt = taskStep.finishedAt || state.updatedAt;
    }
  }
  persistTask(task);
}

function persistTask(task: InstallTaskSnapshot): void {
  try {
    fs.mkdirSync(taskDir(), { recursive: true });
    fs.writeFileSync(path.join(taskDir(), `${task.id}.json`), JSON.stringify(task, null, 2), 'utf8');
  } catch {
    // Task persistence is best-effort; the in-memory snapshot is still returned.
  }
}

function createTask(kind: InstallTaskKind): InstallTaskSnapshot {
  const steps = (kind === 'install' ? INSTALL_STEPS : BUILD_STEPS).map(step => ({ ...step }));
  const task: InstallTaskSnapshot = {
    id: `${kind}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    kind,
    status: 'pending',
    step: steps[0].key,
    steps,
    logs: [],
    startedAt: new Date().toISOString(),
  };
  installTasks.set(task.id, task);
  persistTask(task);
  return task;
}

function appendTaskLog(task: InstallTaskSnapshot, message: string): void {
  task.logs.push(sanitizeLog(message));
  if (task.logs.length > MAX_LOG_LINES) task.logs.splice(0, task.logs.length - MAX_LOG_LINES);
  persistTask(task);
}

function markTaskStep(task: InstallTaskSnapshot, key: InstallTaskStepKey, status: InstallTaskStatus, message?: string): void {
  task.step = key;
  task.status = status === 'failed' ? 'failed' : task.status === 'pending' ? 'running' : task.status;
  for (const step of task.steps) {
    if (step.key === key) {
      step.status = status;
      if (message) step.message = sanitizeLog(message);
      if (status === 'running' && !step.startedAt) step.startedAt = new Date().toISOString();
      if (status === 'success' || status === 'failed') step.finishedAt = new Date().toISOString();
    }
  }
  if (status === 'failed') {
    task.error = sanitizeLog(message || '任务失败');
    task.finishedAt = new Date().toISOString();
  }
  persistTask(task);
}

function finishTask(task: InstallTaskSnapshot, result: Record<string, unknown>): void {
  task.status = 'success';
  task.step = 'complete';
  task.result = result;
  task.installed = result.installed === true;
  task.finishedAt = new Date().toISOString();
  markTaskStep(task, 'complete', 'success');
  persistTask(task);
}

function finishPartialTask(task: InstallTaskSnapshot, result: Record<string, unknown>, message: string): void {
  task.status = 'partial_success';
  task.step = 'pm2';
  task.result = result;
  task.installed = false;
  task.error = sanitizeLog(message);
  task.finishedAt = new Date().toISOString();
  persistTask(task);
}

export function getInstallTask(id: string): InstallTaskSnapshot | null {
  if (!id) return null;
  if (!/^(install|build)_\d+_[a-f0-9]{8}$/.test(id)) return null;
  const inMemory = installTasks.get(id);
  if (inMemory) return inMemory;
  const file = assertPathInsideServer(path.join(taskDir(), `${id}.json`));
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as InstallTaskSnapshot;
  } catch {
    return null;
  }
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function normalizePort(value: unknown, fallback = 3000): number {
  const port = parseInt(String(value || fallback), 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('后端端口必须是 1-65535 的数字');
  return port;
}

function normalizeInstallPayload(raw: any): NormalizedInstallPayload {
  const dbRaw = raw?.db || raw || {};
  const sysRaw = raw?.system || raw?.sys || raw || {};
  const adminRaw = raw?.admin || raw || {};
  const dbName = firstString(dbRaw.DB_NAME, dbRaw.dbName, dbRaw.database, dbRaw.name);
  if (!/^[A-Za-z0-9_$-]{1,64}$/.test(dbName)) throw new Error('数据库名只能包含字母、数字、下划线、短横线或 $，长度不超过 64');

  const db: DbConfig = {
    host: firstString(dbRaw.DB_HOST, dbRaw.host) || '127.0.0.1',
    port: normalizePort(firstString(dbRaw.DB_PORT, dbRaw.port) || 3306, 3306),
    database: dbName,
    user: firstString(dbRaw.DB_USER, dbRaw.user, dbRaw.username),
    password: typeof dbRaw.DB_PASSWORD === 'string' ? dbRaw.DB_PASSWORD : typeof dbRaw.password === 'string' ? dbRaw.password : '',
    prefix: '',
    autoCreate: true,
  };
  if (!db.user) throw new Error('请填写数据库用户名');

  const siteName = firstString(sysRaw.siteName, sysRaw.site?.name, sysRaw['site.name']) || 'AI创作工坊';
  const timezone = firstString(sysRaw.timezone, sysRaw.siteTimezone, sysRaw['site.timezone']) || 'Asia/Shanghai';
  const adminTitle = firstString(sysRaw.adminTitle, sysRaw.siteAdminTitle, sysRaw['site.admin_title']) || `${siteName}后台`;
  const storageType = firstString(sysRaw.storageProvider, sysRaw.storageType, sysRaw['storage.provider']) || 'local';
  if (siteName.length > 64) throw new Error('站点名称不能超过 64 个字符');

  const admin = {
    username: firstString(adminRaw.username, adminRaw.adminUsername),
    password: typeof adminRaw.password === 'string' ? adminRaw.password : typeof adminRaw.adminPassword === 'string' ? adminRaw.adminPassword : '',
    confirmPassword: typeof adminRaw.confirmPassword === 'string' ? adminRaw.confirmPassword : typeof adminRaw.adminConfirmPassword === 'string' ? adminRaw.adminConfirmPassword : undefined,
    email: firstString(adminRaw.email),
    phone: firstString(adminRaw.phone),
  };
  if (!admin.username || admin.username.length < 3 || admin.username.length > 32) throw new Error('管理员账号需 3-32 个字符');
  if (!admin.password || admin.password.length < 8) throw new Error('管理员密码至少 8 个字符');
  if (admin.confirmPassword !== undefined && admin.password !== admin.confirmPassword) throw new Error('两次管理员密码不一致');

  return {
    db,
    sys: {
      siteName,
      adminPath: 'admin',
      timezone,
      storageType,
      debugMode: false,
      allowRegister: true,
      adminTitle,
    },
    admin,
    port: normalizePort(firstString(raw?.PORT, raw?.port, sysRaw.port) || 3000, 3000),
  };
}

// ===== 环境检测 =====
export async function checkEnvironment() {
  const checks: any[] = [];
  const nodeMajor = parseInt(process.version.replace('v', '').split('.')[0]);
  checks.push({ name: 'Node.js', key: 'node', current: process.version, required: '>=18.0.0', passed: nodeMajor >= 18, level: 'required' });

  const npm = checkCommandVersion('npm', ['--version']);
  checks.push({
    name: 'npm',
    key: 'npm',
    current: npm.version || npm.error || 'not found',
    required: '可用于高级重新构建',
    passed: npm.exists,
    level: 'suggested',
    suggestion: npm.exists ? undefined : '请安装 Node.js 自带的 npm，或使用包含 dist 的 release 包。',
  });

  const pm2 = checkPm2Version({ appRoot: appRootDir(), port: config.port || Number(process.env.PORT || 3000) || 3000 });
  checks.push({
    name: 'PM2',
    key: 'pm2',
    current: pm2.version ? `${pm2.version} (PM2_HOME=${pm2Home(appRootDir())})` : pm2.error || 'not found',
    required: '必须可执行',
    passed: pm2.exists,
    level: 'required',
    suggestion: pm2.exists ? undefined : '缺少 PM2，请执行：npm install -g pm2',
  });

  try { require('mysql2'); checks.push({ name: 'MySQL 驱动', key: 'mysql_driver', passed: true, level: 'required' }); }
  catch { checks.push({ name: 'MySQL 驱动', key: 'mysql_driver', passed: false, level: 'required', suggestion: 'npm install mysql2' }); }

  const envExists = fs.existsSync(envPath());
  checks.push({
    name: 'server/.env',
    key: 'env_file',
    current: envExists ? envPath() : 'not found',
    required: '安装时会自动写入',
    passed: envExists,
    level: 'info',
  });

  try { fs.accessSync(serverDir(), fs.constants.W_OK); checks.push({ name: 'server 目录可写', key: 'server_writable', current: serverDir(), passed: true, level: 'required' }); }
  catch { checks.push({ name: 'server 目录可写', key: 'server_writable', current: serverDir(), passed: false, level: 'required', suggestion: `请确保 ${serverDir()} 可写` }); }

  const lockExists = fs.existsSync(installLockPath());
  checks.push({
    name: 'shared/.env.installed',
    key: 'install_lock',
    current: lockExists ? installLockPath() : 'not found',
    required: '未安装时应不存在；已安装后统一写入 shared/.env.installed',
    passed: !lockExists,
    level: lockExists ? 'required' : 'info',
    suggestion: lockExists ? '检测到安装锁，系统可能已经安装；请访问后台登录页或确认后再处理。' : undefined,
  });

  const adminDist = path.join(appRootDir(), 'admin-web', 'dist', 'index.html');
  checks.push({
    name: 'admin-web/dist/index.html',
    key: 'admin_dist',
    current: fs.existsSync(adminDist) ? adminDist : 'not found',
    required: '解压后需完成服务器构建',
    passed: fs.existsSync(adminDist),
    level: 'required',
    suggestion: fs.existsSync(adminDist) ? undefined : '当前部署目录缺少构建产物，请点击高级操作执行 npm ci && npm run build，或按部署文档先在服务器构建。',
  });

  const serverDist = path.join(serverDir(), 'dist', 'index.js');
  checks.push({
    name: 'server/dist/index.js',
    key: 'server_dist',
    current: fs.existsSync(serverDist) ? serverDist : 'not found',
    required: '解压后需完成服务器构建',
    passed: fs.existsSync(serverDist),
    level: 'required',
    suggestion: fs.existsSync(serverDist) ? undefined : '当前部署目录缺少构建产物，请点击高级操作执行 npm ci && npm run build，或按部署文档先在服务器构建。',
  });

  const hasDbEnv = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_NAME'].every(key => String(process.env[key] || '').trim());
  if (hasDbEnv) {
    const dbReport = await collectDatabaseReadiness();
    checks.push({
      name: 'MySQL 连接',
      key: 'mysql_connection',
      current: dbReport.connected ? `${config.db.host}:${config.db.port}/${config.db.database}` : dbReport.error || 'connect failed',
      required: '可连接',
      passed: dbReport.connected,
      level: dbReport.connected ? 'info' : 'suggested',
      suggestion: dbReport.connected ? undefined : '请在数据库配置步骤填写正确的数据库账号和密码。',
    });
  } else {
    checks.push({
      name: 'MySQL 连接',
      key: 'mysql_connection',
      current: '未配置数据库连接',
      required: '下一步填写后检测',
      passed: false,
      level: 'info',
      suggestion: '请在数据库配置步骤填写并测试连接。',
    });
  }

  const totalMem = Math.round(require('os').totalmem() / 1024 / 1024);
  checks.push({ name: '系统内存', key: 'memory', current: totalMem + 'MB', required: '>=512MB', passed: totalMem >= 512, level: 'suggested' });
  checks.push({ name: '系统时区', key: 'timezone', current: Intl.DateTimeFormat().resolvedOptions().timeZone, passed: true, level: 'suggested' });

  return { checks, allPassed: checks.filter((c: any) => c.level === 'required' && !c.passed).length === 0 };
}

// ===== 测试数据库连接 =====
export async function testDbConnection(cfg: DbConfig) {
  let conn1: mysql.Connection | null = null;
  let conn2: mysql.Connection | null = null;
  let dbExists: boolean;
  try {
    // 先连接不指定数据库
    conn1 = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, connectTimeout: 5000 });
    const [dbs] = await conn1.query('SHOW DATABASES LIKE ?', [cfg.database]) as any;
    dbExists = dbs.length > 0;

    if (!dbExists && !cfg.autoCreate) {
      return { success: false, message: `数据库 "${cfg.database}" 不存在，请勾选"自动创建数据库"` };
    }
    if (!dbExists && cfg.autoCreate) {
      await conn1.query(`CREATE DATABASE ${mysql.escapeId(cfg.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      dbExists = true;
    }
  } finally {
    if (conn1) await conn1.end().catch(() => undefined);
  }

  try {
    // 连接指定数据库
    conn2 = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: cfg.database, connectTimeout: 5000 });
    const [tables] = await conn2.execute('SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = ?', [cfg.database]) as any;
    const hasTables = tables[0].cnt > 0;

    return { success: true, message: '连接成功', databaseExists: dbExists, hasTables, warning: hasTables ? '数据库已有表，将保留已有数据（不会覆盖）' : '' };
  } finally {
    if (conn2) await conn2.end().catch(() => undefined);
  }
}

// ===== 保存数据库配置 =====
export async function saveDbConfig(cfg: DbConfig) {
  tempConfig.db = cfg;
  const file = envPath();
  backupEnvFile();
  let lines: string[] = [];
  if (fs.existsSync(file)) {
    lines = fs.readFileSync(file, 'utf-8').split('\n');
  }

  const keys = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const values: Record<string, string> = {
    DB_HOST: cfg.host,
    DB_PORT: String(cfg.port),
    DB_NAME: cfg.database,
    DB_USER: cfg.user,
    DB_PASSWORD: cfg.password,
  };

  const found = new Set<string>();
  lines = lines.map(line => {
    for (const key of keys) {
      const trimmed = line.trimStart();
      if (trimmed.startsWith(key + '=') || trimmed.startsWith(key + ' ')) {
        found.add(key);
        return key + '=' + values[key];
      }
    }
    return line;
  });

  for (const key of keys) {
    if (!found.has(key)) {
      lines.push(key + '=' + values[key]);
    }
  }

  fs.writeFileSync(file, lines.join('\n') + '\n');
  applyRuntimeDbConfig(cfg);
  return { success: true };
}

// ===== 保存系统配置 =====
export async function saveSystemConfig(cfg: SysConfig) {
  tempConfig.sys = cfg;
  return { success: true };
}

// ===== 创建管理员(预校验) =====
export async function validateAdmin(cfg: AdminConfig) {
  if (!cfg.username || cfg.username.length < 3 || cfg.username.length > 32) return { valid: false, error: '用户名需3-32字符' };
  if (!cfg.password || cfg.password.length < 8) return { valid: false, error: '密码至少8字符' };
  if (cfg.password !== (cfg as any).confirmPassword) return { valid: false, error: '两次密码不一致' };
  tempConfig.admin = { ...cfg, password: bcrypt.hashSync(cfg.password, 10) };
  return { valid: true };
}

// ===== 执行完整初始化 =====
export async function executeInit(onProgress?: (step: InstallTaskStepKey) => void): Promise<{ success: boolean; steps: any[]; adminUrl: string }> {
  const { db, sys, admin } = tempConfig;
  if (!db || !sys || !admin) throw new Error('缺少配置，请返回前面步骤重新填写');

  assertEnvironmentReady();

  const adminUrl = '/login';
  const conn = await connectInstallDatabase(db);
  const steps: any[] = [];
  try {
    onProgress?.('create_tables');
    let step = await runStep('建表', async () => {
      const currentDatabase = await assertCurrentDatabase(conn, db.database);
      const report = await executeSqlFiles(conn, SCHEMA_FILES, { allowIdempotentDdlErrors: true });
      if (report.statementCount === 0) {
        throw new Error(`未执行任何建表 SQL，请检查 schema 目录和部署文件；schemaDir=${report.schemaDir}`);
      }
      return { currentDatabase, ...report };
    });
    steps.push(step);
    if (step.status === 'failed') return { success: false, steps, adminUrl };

    onProgress?.('create_tables');
    step = await runStep('数据库迁移与结构校验', async () => {
      const migrationDir = resolveMigrationDir();
      const migrationFiles = readSqlFiles(migrationDir);
      if (migrationFiles.length === 0) {
        throw new Error(`未找到迁移 SQL 文件，请检查目录：${migrationDir}`);
      }
      const migrationReport = await executeSqlFiles(conn, migrationFiles, { allowIdempotentDdlErrors: true }, migrationDir);
      await recordInstalledMigrations(conn, migrationFiles, migrationDir);
      await assertRequiredTables(conn, db.database, migrationReport);
      await assertRequiredColumns(conn, db.database);
      await assertRequiredIndexes(conn, db.database);
      return migrationReport;
    });
    steps.push(step);
    if (step.status === 'failed') return { success: false, steps, adminUrl };

    onProgress?.('create_tables');
    step = await runStep('种子数据', async () => {
      const report = await executeSqlFiles(conn, SEED_FILES, { allowIdempotentDdlErrors: false });
      if (report.statementCount === 0) {
        throw new Error(`未执行任何种子 SQL，请检查 schema 目录和部署文件；schemaDir=${report.schemaDir}`);
      }
      return report;
    });
    steps.push(step);
    if (step.status === 'failed') return { success: false, steps, adminUrl };

    onProgress?.('init_config');
    step = await runStep('系统配置', async () => {
      const localUploadDir = process.env.LOCAL_UPLOAD_DIR || config.storage.localUploadDir || path.join(appRootDir(), 'uploads');
      const configs = [
        ['site.name', sys.siteName, 'general', 0],
        ['site.timezone', sys.timezone, 'general', 0],
        ['site.lang', 'zh-CN', 'general', 0],
        ['site.debug', sys.debugMode ? 'true' : 'false', 'general', 0],
        ['site.allow_register', sys.allowRegister ? 'true' : 'false', 'general', 0],
        ['site.admin_title', (sys as any).adminTitle || 'AI创作工坊', 'general', 0],
        ['wechat.app_id', '', 'wechat', 1],
        ['wechat.app_secret', '', 'wechat', 1],
        ['wechat.login_enabled', 'true', 'wechat', 0],
        ['wechat.login_bypass_dev', 'false', 'wechat', 0],
        ['wechat_pay.enabled', 'false', 'wechat_pay', 0],
        ['wechat_pay.appid', '', 'wechat_pay', 0],
        ['wechat_pay.mchid', '', 'wechat_pay', 0],
        ['wechat_pay.api_v3_key', '', 'wechat_pay', 1],
        ['wechat_pay.private_key', '', 'wechat_pay', 1],
        ['wechat_pay.merchant_serial_no', '', 'wechat_pay', 0],
        ['wechat_pay.notify_url', '/api/v1/payments/wechat/notify', 'wechat_pay', 0],
        ['wechat_pay.platform_cert_serial_no', '', 'wechat_pay', 0],
        ['wechat_pay.platform_cert', '', 'wechat_pay', 1],
        ['wechat_pay.timeout_minutes', '30', 'wechat_pay', 0],
        ['wechat_pay.verify_signature', 'true', 'wechat_pay', 0],
        ['storage.provider', sys.storageType, 'storage', 0],
        ['storage.local.upload_dir', localUploadDir, 'storage', 0],
        ['storage.local.base_url', process.env.LOCAL_BASE_URL || config.storage.localBaseUrl || '/static', 'storage', 0],
        ['security.login_lock_count', '5', 'security', 0],
        ['security.captcha_enabled', 'true', 'security', 0],
        ['security.operation_log_enabled', 'true', 'security', 0],
        ['content.filter_enabled', 'true', 'general', 0],
        ['membership.enabled', 'true', 'general', 0],
        ['membership.template_save_use_member_only', 'false', 'general', 0],
        ['ai.prompt_optimize.enabled', 'true', 'ai', 0],
        ['ai.script_generate.enabled', 'true', 'ai', 0],
        ['ai.prompt_generate.enabled', 'true', 'ai', 0],
        ['ai.storyboard_generate.enabled', 'true', 'ai', 0],
        ['template.user_share_enabled', 'true', 'general', 0],
        ['template.user_public_enabled', 'true', 'general', 0],
        ['template.member_gate_enabled', 'true', 'general', 0],
        ['inspiration.member_gate_enabled', 'true', 'general', 0],
      ];
      for (const [k, v, group, isSecret] of configs) {
        await conn.execute("INSERT INTO system_configs (config_key, config_value, value_type, config_group, is_secret, description, created_at, updated_at) VALUES (?, ?, 'string', ?, ?, '', NOW(3), NOW(3)) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), config_group = VALUES(config_group), is_secret = VALUES(is_secret), updated_at = NOW(3)", [k, typeof v === 'string' ? v : JSON.stringify(v), group, isSecret]);
      }
      const customerServiceConfigs = [
        ['customer_service.enabled', 'true', 'boolean', '是否开启小程序客服入口', 10],
        ['customer_service.title', '联系客服', 'string', '小程序个人中心客服入口名称', 20],
        ['customer_service.subtitle', '订单、会员、生成问题都可以咨询', 'string', '小程序个人中心客服入口描述', 30],
        ['customer_service.icon', 'customer-service', 'string', '客服入口图标标识', 40],
        ['customer_service.show_in_profile', 'true', 'boolean', '是否显示在个人中心', 50],
        ['customer_service.session_from', 'profile', 'string', '微信客服会话来源 sessionFrom', 60],
        ['customer_service.show_message_card', 'true', 'boolean', '是否向客服发送小程序卡片', 70],
        ['customer_service.send_message_title', 'AI创作助手客服咨询', 'string', '小程序客服卡片标题', 80],
        ['customer_service.send_message_path', '/pages/user/index', 'string', '小程序客服卡片路径', 90],
        ['customer_service.send_message_img', '', 'string', '小程序客服卡片 HTTPS 图片 URL，可为空', 100],
      ];
      for (const [key, value, valueType, description, sortOrder] of customerServiceConfigs) {
        await conn.execute(
          "INSERT IGNORE INTO system_configs (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at) VALUES (?, ?, ?, 'customer_service', 0, ?, ?, NOW(3), NOW(3))",
          [key, value, valueType, description, sortOrder],
        );
      }
      const miniappHelpConfigs = [
        ['miniapp_help.enabled', 'true', 'boolean', '是否启用小程序使用帮助内容配置', 10],
        ['miniapp_help.title', '使用帮助', 'string', '小程序使用帮助标题', 20],
        ['miniapp_help.content_html', '', 'html', '小程序使用帮助 HTML 富文本内容', 30],
      ];
      for (const [key, value, valueType, description, sortOrder] of miniappHelpConfigs) {
        await conn.execute(
          "INSERT IGNORE INTO system_configs (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at) VALUES (?, ?, ?, 'miniapp_help', 0, ?, ?, NOW(3), NOW(3))",
          [key, value, valueType, description, sortOrder],
        );
      }
      const miniappVisualAssetConfigs = [
        ['miniapp_visual_assets.home_banner_url', '', 'string', '小程序首页顶部 Banner HTTPS 图片 URL', 10],
        ['miniapp_visual_assets.home_member_upsell_url', '', 'string', '小程序首页会员悬浮引导 HTTPS 图片 URL', 20],
        ['miniapp_visual_assets.inspiration_banner_url', '', 'string', '小程序灵感页顶部 Banner HTTPS 图片 URL', 30],
        ['miniapp_visual_assets.comic_banner_url', '', 'string', '小程序 AI 漫剧页顶部 Banner HTTPS 图片 URL', 40],
        ['miniapp_visual_assets.profile_member_offer_banner_url', '', 'string', '小程序我的页会员套餐入口 Banner HTTPS 图片 URL', 50],
      ];
      for (const [key, value, valueType, description, sortOrder] of miniappVisualAssetConfigs) {
        await conn.execute(
          "INSERT IGNORE INTO system_configs (config_key, config_value, value_type, config_group, is_secret, description, sort_order, created_at, updated_at) VALUES (?, ?, ?, 'miniapp_visual_assets', 0, ?, ?, NOW(3), NOW(3))",
          [key, value, valueType, description, sortOrder],
        );
      }
      const providerKeySync = await syncProviderApiKeysFromEnv(conn);
      const deploymentConfigSync = await syncDeploymentConfigsFromEnv(conn);
      return {
        configCount: configs.length + customerServiceConfigs.length + miniappHelpConfigs.length + miniappVisualAssetConfigs.length + 2,
        providerKeySync: providerKeySync.filter(item => item.updated).map(item => item.providerKey),
        deploymentConfigSync: deploymentConfigSync.filter(item => item.updated).map(item => item.configKey),
      };
    });
    steps.push(step);
    if (step.status === 'failed') return { success: false, steps, adminUrl };

    step = await runStep('内容审核配置', async () => {
      await conn.execute("INSERT INTO system_configs (config_key, config_value, value_type, config_group, is_secret, description, created_at, updated_at) VALUES ('content.sensitive_words', '[]', 'json', 'general', 0, '敏感词列表', NOW(3), NOW(3)) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), value_type = VALUES(value_type), updated_at = NOW(3)");
    });
    steps.push(step);
    if (step.status === 'failed') return { success: false, steps, adminUrl };

    onProgress?.('create_admin');
    step = await runStep('创建管理员', async () => {
      if (await tableExists(conn, 'admin_users')) {
        const [rows] = await conn.execute('SELECT COUNT(*) AS cnt FROM admin_users') as any;
        if (Number(rows?.[0]?.cnt || 0) > 0) {
          return { skipped: true, message: '管理员账号已存在，跳过创建' };
        }
      }
      await conn.execute(
        "INSERT INTO admin_users (username, password_hash, nickname, role_key, status, created_at) VALUES (?, ?, ?, 'super_admin', 'active', NOW(3))",
        [admin.username, admin.password, '超级管理员']
      );
      return { created: true };
    });
    steps.push(step);

    return { success: step.status === 'done', steps, adminUrl };
  } finally {
    await conn.end();
  }
}

async function runStep(name: string, fn: () => Promise<any>) {
  try {
    const detail = await fn();
    return detail === undefined ? { name, status: 'done' } : { name, status: 'done', detail };
  }
  catch (e: any) { return { name, status: 'failed', message: e.message }; }
}

async function executeSqlFiles(conn: mysql.Connection, files: string[], options: { allowIdempotentDdlErrors: boolean }, baseDir = resolveSchemaDir()) {
  const schemaDir = baseDir;
  assertSqlFilesExist(schemaDir, files);
  let statementCount = 0;
  let fileCount = 0;

  for (const file of files) {
    const filePath = path.join(schemaDir, file);

    const rawSql = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
    const statements = splitSqlStatements(removeSqlComments(rawSql))
      .filter(sql => sql.trim())
      .filter(sql => !/^(CREATE\s+DATABASE|USE)\b/i.test(sql.trim()));

    fileCount++;
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      try {
        await conn.query(statement);
        statementCount++;
      } catch (e: any) {
        if (options.allowIdempotentDdlErrors && isIgnorableDdlError(e, statement)) continue;
        throw new Error(formatSqlExecutionError(file, i + 1, statement, e), { cause: e });
      }
    }
  }

  return { schemaDir, fileCount, statementCount };
}

async function assertCurrentDatabase(conn: mysql.Connection, expectedDatabase: string) {
  const [rows] = await conn.query('SELECT DATABASE() AS currentDatabase') as any;
  const currentDatabase = rows?.[0]?.currentDatabase || '';
  if (currentDatabase !== expectedDatabase) {
    throw new Error(`当前连接数据库 ${currentDatabase || '(空)'} 与安装配置 ${expectedDatabase} 不一致`);
  }
  return currentDatabase;
}

function resolveSchemaDir() {
  const candidates = [
    path.resolve(process.cwd(), 'src/db'),
    path.resolve(__dirname, '../db'),
    path.resolve(__dirname, '../../src/db'),
    path.resolve(__dirname, '../../dist/db'),
  ];

  for (const dir of candidates) {
    if (REQUIRED_SQL_FILES.every(file => fs.existsSync(path.join(dir, file)))) {
      return dir;
    }
  }

  throw new Error('找不到 SQL 目录，已检查: ' + candidates.join(', '));
}

function resolveMigrationDir() {
  const candidates = [
    path.resolve(process.cwd(), 'src/migrations'),
    path.resolve(__dirname, '../migrations'),
    path.resolve(__dirname, '../../src/migrations'),
    path.resolve(__dirname, '../../dist/migrations'),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
  }

  throw new Error('找不到 migrations 目录，已检查：' + candidates.join(', '));
}

function readSqlFiles(dir: string) {
  return fs.readdirSync(dir).filter(file => file.endsWith('.sql')).sort((a, b) => a.localeCompare(b));
}

function assertSqlFilesExist(schemaDir: string, files: string[]) {
  for (const file of files) {
    if (!fs.existsSync(path.join(schemaDir, file))) {
      throw new Error(`缺少 SQL 文件：${file}，当前 schema 目录：${schemaDir}`);
    }
  }
}

function removeSqlComments(sql: string) {
  let output = '';
  let quote: "'" | '"' | '`' | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  let atLineStart = true;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === '\n' || ch === '\r') {
        inLineComment = false;
        output += ch;
        atLineStart = true;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      } else if (ch === '\n' || ch === '\r') {
        output += ch;
        atLineStart = true;
      }
      continue;
    }

    if (quote) {
      output += ch;
      if (ch === '\\') {
        if (next) output += sql[++i];
        continue;
      }
      if (ch === quote) {
        if (quote === "'" && next === "'") {
          output += sql[++i];
          continue;
        }
        quote = null;
      }
      atLineStart = false;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      output += ch;
      atLineStart = false;
      continue;
    }

    if (ch === '-' && next === '-' && (atLineStart || sql[i + 2] === undefined || /\s/.test(sql[i + 2]))) {
      inLineComment = true;
      i++;
      continue;
    }

    if (ch === '#') {
      inLineComment = true;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    output += ch;
    if (ch === '\n' || ch === '\r') {
      atLineStart = true;
    } else if (!/\s/.test(ch)) {
      atLineStart = false;
    }
  }

  return output;
}

function splitSqlStatements(sql: string) {
  const statements: string[] = [];
  let current = '';
  let quote: "'" | '"' | '`' | null = null;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];
    current += ch;

    if (quote) {
      if (ch === '\\') {
        if (next) current += sql[++i];
        continue;
      }
      if (ch === quote) {
        if (quote === "'" && next === "'") {
          current += sql[++i];
          continue;
        }
        quote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === ';') {
      statements.push(current.slice(0, -1).trim());
      current = '';
    }
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

function isIgnorableDdlError(error: any, statement: string) {
  if (!/^(CREATE|ALTER|DROP)\b/i.test(statement.trim())) return false;
  return [1050, 1060, 1061, 1091].includes(error?.errno);
}

function formatSqlExecutionError(file: string, index: number, statement: string, error: any) {
  const preview = statement.replace(/\s+/g, ' ').slice(0, 200);
  const reason = error?.sqlMessage || error?.message || String(error);
  return `执行 ${file} 第 ${index} 条 SQL 失败：${reason}；SQL 前 200 字符：${preview}`;
}

async function assertRequiredTables(conn: mysql.Connection, database: string, detail?: { schemaDir?: string; fileCount?: number; statementCount?: number; currentDatabase?: string }) {
  const placeholders = REQUIRED_TABLES.map(() => '?').join(',');
  const [rows] = await conn.execute(
    `SELECT TABLE_NAME AS table_name FROM information_schema.tables WHERE table_schema = ? AND table_name IN (${placeholders})`,
    [database, ...REQUIRED_TABLES]
  ) as any;
  const existing = new Set((rows as any[]).map(row => row.table_name));
  const missing = REQUIRED_TABLES.filter(table => !existing.has(table));
  if (missing.length > 0) {
    const diagnostics = [
      `当前数据库: ${detail?.currentDatabase || database}`,
      `schemaDir: ${detail?.schemaDir || 'unknown'}`,
      `已读取 SQL 文件数: ${detail?.fileCount ?? 'unknown'}`,
      `已执行 SQL 条数: ${detail?.statementCount ?? 'unknown'}`,
      `缺失表数量: ${missing.length}`,
      `缺失表: ${missing.join(', ')}`,
    ];
    throw new Error('缺少必需数据表；' + diagnostics.join('；'));
  }
}

// ===== 完成安装 =====
async function assertRequiredColumns(conn: mysql.Connection, database: string) {
  for (const [tableName, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const placeholders = columns.map(() => '?').join(',');
    const [rows] = await conn.execute(
      `SELECT COLUMN_NAME AS column_name
         FROM information_schema.columns
        WHERE table_schema = ? AND table_name = ? AND column_name IN (${placeholders})`,
      [database, tableName, ...columns],
    ) as any;
    const existing = new Set((rows as any[]).map(row => row.column_name));
    const missing = columns.filter(column => !existing.has(column));
    if (missing.length) {
      throw new Error(`安装结构不完整，表 ${tableName} 缺少字段：${missing.join(', ')}`);
    }
  }
}

async function assertRequiredIndexes(conn: mysql.Connection, database: string) {
  for (const [tableName, indexes] of Object.entries(REQUIRED_INDEXES)) {
    const placeholders = indexes.map(() => '?').join(',');
    const [rows] = await conn.execute(
      `SELECT DISTINCT INDEX_NAME AS index_name
         FROM information_schema.statistics
        WHERE table_schema = ? AND table_name = ? AND index_name IN (${placeholders})`,
      [database, tableName, ...indexes],
    ) as any;
    const existing = new Set((rows as any[]).map(row => row.index_name));
    const missing = indexes.filter(index => !existing.has(index));
    if (missing.length) {
      throw new Error(`安装结构不完整，表 ${tableName} 缺少索引：${missing.join(', ')}`);
    }
  }
}

async function recordInstalledMigrations(conn: mysql.Connection, files: string[], dir: string) {
  if (!await tableExists(conn, 'schema_migrations')) return;

  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf-8').replace(/^\uFEFF/, '');
    const key = file.replace(/\.sql$/i, '');
    const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    await conn.execute(
      `INSERT INTO schema_migrations (migration_key, filename, checksum, executed_at, success, error_message)
       VALUES (?, ?, ?, NOW(3), 1, NULL)
       ON DUPLICATE KEY UPDATE filename = VALUES(filename), checksum = VALUES(checksum),
         executed_at = VALUES(executed_at), success = 1, error_message = NULL`,
      [key, file, hash],
    );
  }
}

async function tableExists(conn: mysql.Connection, tableName: string): Promise<boolean> {
  const [rows] = await conn.execute(
    'SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [tableName],
  ) as any;
  return Number(rows?.[0]?.cnt || 0) > 0;
}

function currentDbConfig(): DbConfig {
  return tempConfig.db || {
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    prefix: '',
    autoCreate: false,
  };
}

function assertEnvironmentReady(): void {
  const environment = collectEnvironmentReadiness();
  if (environment.ok) return;

  const hasSecretIssue = environment.issues.some(issue => ['JWT_SECRET', 'ENCRYPTION_KEY'].includes(issue.key));
  if (hasSecretIssue) {
    throw new Error(INSECURE_PRODUCTION_SECRET_MESSAGE);
  }

  throw new Error(`环境变量缺失或无效：missing=${environment.missing.join(',') || 'none'} invalid=${environment.invalid.join(',') || 'none'}`);
}

function translateDbConnectError(err: any): Error {
  const message = err?.message || String(err);
  if (/access denied/i.test(message)) return new Error(DB_ACCESS_DENIED_MESSAGE);
  return new Error(`数据库不可用，无法连接数据库：${message}`);
}

async function connectInstallDatabase(db: DbConfig): Promise<mysql.Connection> {
  try {
    return await mysql.createConnection({
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      database: db.database,
      connectTimeout: 5000,
    });
  } catch (err: any) {
    throw translateDbConnectError(err);
  }
}

async function assertRequiredSystemConfigs(conn: mysql.Connection): Promise<void> {
  if (!await tableExists(conn, 'system_configs')) {
    throw new Error('必要系统配置缺失，请先执行数据库迁移或重新初始化。');
  }

  const placeholders = FINALIZATION_REQUIRED_CONFIG_KEYS.map(() => '?').join(',');
  const [rows] = await conn.execute(
    `SELECT config_key FROM system_configs WHERE config_key IN (${placeholders})`,
    FINALIZATION_REQUIRED_CONFIG_KEYS,
  ) as any;
  const existing = new Set((rows as any[]).map(row => String(row.config_key)));
  const missing = FINALIZATION_REQUIRED_CONFIG_KEYS.filter(key => !existing.has(key));
  if (missing.length > 0) {
    throw new Error(`必要系统配置缺失：${missing.join(', ')}，请重新执行安装初始化。`);
  }
}

async function assertAdminReady(conn: mysql.Connection): Promise<void> {
  if (!await tableExists(conn, 'admin_users')) {
    throw new Error(DB_NOT_READY_MESSAGE);
  }

  const [rows] = await conn.execute('SELECT COUNT(*) AS cnt FROM admin_users') as any;
  if (Number(rows?.[0]?.cnt || 0) <= 0) {
    throw new Error('管理员账号未创建，请重新执行安装初始化。');
  }
}

async function writeSystemInstalled(conn: mysql.Connection): Promise<void> {
  await conn.execute(
    `INSERT INTO system_configs (config_key, config_value, value_type, config_group, is_secret, description, created_at, updated_at)
     VALUES ('system.installed', 'true', 'boolean', 'general', 0, 'Installation completion marker', NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), value_type = VALUES(value_type),
       config_group = VALUES(config_group), is_secret = VALUES(is_secret), updated_at = NOW(3)`,
  );
}

function tryReadReleaseVersion(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return '';
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const version = typeof raw?.version === 'string' ? raw.version.trim() : '';
    if (!SEMVER_VERSION_RE.test(version)) return '';
    return version;
  } catch {
    return '';
  }
}

function sharedEnvPath(): string {
  return assertPathInsideAppRoot(path.join(appRootDir(), 'shared', '.env'));
}

function currentReleasePath(): string {
  return assertPathInsideAppRoot(path.join(appRootDir(), 'current'));
}

function resolveInstalledReleaseVersion(): string {
  const currentRelease = tryReadReleaseVersion(path.join(currentReleasePath(), 'release.json'));
  if (currentRelease) return currentRelease;
  const appRootRelease = tryReadReleaseVersion(path.join(appRootDir(), 'release.json'));
  if (appRootRelease) return appRootRelease;
  const serverPackageVersion = tryReadReleaseVersion(path.resolve(serverDir(), '../package.json'));
  if (serverPackageVersion) return serverPackageVersion;
  return '';
}

async function assertFinalizeRuntimeReady(): Promise<string> {
  const appRoot = appRootDir();
  if (!fs.existsSync(appRoot)) throw new Error(`APP_ROOT_DIR 不存在：${appRoot}`);
  const sharedEnv = sharedEnvPath();
  if (!fs.existsSync(sharedEnv)) throw new Error(`shared/.env 不存在：${sharedEnv}`);

  const currentPath = currentReleasePath();
  if (!fs.existsSync(currentPath)) throw new Error(`current 不存在：${currentPath}`);
  const currentRealPath = fs.realpathSync(currentPath);
  const releaseJson = path.join(currentRealPath, 'release.json');
  if (!fs.existsSync(releaseJson)) throw new Error(`current/release.json 不存在：${releaseJson}`);
  const releaseVersion = tryReadReleaseVersion(releaseJson);
  if (!releaseVersion) throw new Error(`current/release.json 缺少合法版本号：${releaseJson}`);

  const serverEntry = path.join(currentRealPath, 'server', 'dist', 'index.js');
  if (!fs.existsSync(serverEntry)) throw new Error(`current/server/dist/index.js 不存在：${serverEntry}`);

  const status = await evaluateInstallStatus();
  if (!status.service.healthOk) {
    throw new Error(`HEALTH_CHECK_URL 未返回 status=ok：${status.service.healthCheckUrl}，返回：${status.service.healthResponse || status.service.error || '无响应'}`);
  }
  return status.service.healthReleaseVersion || releaseVersion;
}

async function writeInitialInstalledRelease(conn: mysql.Connection): Promise<void> {
  if (!await tableExists(conn, 'app_releases')) return;
  const version = resolveInstalledReleaseVersion();
  if (!version) return;
  const packageName = `ai-creator-release-${version}.tar.gz`;
  await conn.execute(
    `INSERT INTO app_releases (version, release_name, package_name, status, installed_at, note)
     VALUES (?, ?, ?, 'installed', NOW(3), 'initial install completed')
     ON DUPLICATE KEY UPDATE release_name = VALUES(release_name), package_name = VALUES(package_name),
       status = 'installed', installed_at = NOW(3), note = VALUES(note)`,
    [version, version, packageName],
  );
}

async function assertInstallCanRun(options: { allowRepairState?: boolean } = {}): Promise<void> {
  const status = await evaluateInstallStatus();
  if (status.installed) {
    throw new Error('系统已经安装，安装接口已关闭');
  }
  if (!options.allowRepairState && status.database.ready && ['repair_required', 'needs_finalize', 'partial'].includes(status.state)) {
    throw new Error('数据库已初始化，但安装状态需要修复。请点击“修复安装状态/重新执行安装收尾”，不要重新初始化数据库。');
  }
}

function generateInstallSecrets(): { jwtSecret: string; encryptionKey: string } {
  return {
    jwtSecret: crypto.randomBytes(32).toString('hex'),
    encryptionKey: crypto.randomBytes(32).toString('hex'),
  };
}

function writeInstallEnv(payload: NormalizedInstallPayload): { backupPath: string | null; envPath: string } {
  const secrets = generateInstallSecrets();
  const appRoot = appRootDir();
  const values: Record<string, string> = {
    PORT: String(payload.port),
    NODE_ENV: 'production',
    DB_HOST: payload.db.host,
    DB_PORT: String(payload.db.port),
    DB_NAME: payload.db.database,
    DB_USER: payload.db.user,
    DB_PASSWORD: payload.db.password,
    JWT_SECRET: secrets.jwtSecret,
    ENCRYPTION_KEY: secrets.encryptionKey,
    APP_ROOT_DIR: appRoot,
    UPDATE_PACKAGES_DIR: process.env.UPDATE_PACKAGES_DIR || path.join(appRoot, 'update-packages'),
    PM2_APP_NAME: process.env.PM2_APP_NAME || config.release.pm2AppName || DEFAULT_PM2_APP_NAME,
    HEALTH_CHECK_URL: process.env.HEALTH_CHECK_URL || `http://127.0.0.1:${payload.port}/health`,
    STORAGE_PROVIDER: payload.sys.storageType,
    LOCAL_UPLOAD_DIR: process.env.LOCAL_UPLOAD_DIR || config.storage.localUploadDir || path.join(appRoot, 'uploads'),
    LOCAL_BASE_URL: process.env.LOCAL_BASE_URL || config.storage.localBaseUrl || '/static',
  };
  const result = writeEnvValues(values);
  applyRuntimeInstallConfig(payload, secrets);
  return result;
}

function execCommand(command: string, args: string[], cwd: string, onOutput?: (line: string) => void): Promise<CommandResult> {
  const safeCwd = assertPathInsideAppRoot(cwd);
  return new Promise((resolve, reject) => {
    const child = spawn(commandName(command), args, {
      cwd: safeCwd,
      shell: false,
      windowsHide: true,
      env: { ...process.env },
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      const text = chunk.toString();
      stdout += text;
      for (const line of text.split(/\r?\n/).filter(Boolean)) onOutput?.(line);
    });
    child.stderr.on('data', chunk => {
      const text = chunk.toString();
      stderr += text;
      for (const line of text.split(/\r?\n/).filter(Boolean)) onOutput?.(line);
    });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

async function runCheckedCommand(command: string, args: string[], cwd: string, onOutput?: (line: string) => void): Promise<CommandResult> {
  const result = await execCommand(command, args, cwd, onOutput);
  if (result.code !== 0) {
    const output = sanitizeLog(`${result.stdout}\n${result.stderr}`.trim()).slice(-4000);
    throw new Error(`${command} ${args.join(' ')} 执行失败，退出码 ${result.code}${output ? `：${output}` : ''}`);
  }
  return result;
}

function currentPm2AppName(): string {
  const appName = process.env.PM2_APP_NAME || config.release.pm2AppName || DEFAULT_PM2_APP_NAME;
  return /^[A-Za-z0-9._-]{1,80}$/.test(appName) ? appName : DEFAULT_PM2_APP_NAME;
}

async function ensurePm2Started(
  port = config.port || Number(process.env.PORT || 3000) || 3000,
  onOutput?: (line: string) => void,
  onWarning?: (message: string) => void,
) {
  return ensurePm2AppStarted({
    appRoot: appRootDir(),
    serverDir: runtimeServerDir(),
    appName: currentPm2AppName(),
    port: normalizePort(port, 3000),
    onOutput,
    onWarning,
  });
}

function pm2RebindWorkerPath(): string {
  const workerPath = path.resolve(__dirname, '../scripts/install-pm2-rebind-worker.js');
  if (!fs.existsSync(workerPath)) {
    throw new Error('PM2 rebind worker script missing; run npm run build before installing.');
  }
  return workerPath;
}

function startDetachedPm2Rebind(contextPath: string): number {
  if (process.platform !== 'win32') {
    const command = `nohup ${shellQuote(process.execPath)} ${shellQuote(pm2RebindWorkerPath())} ${shellQuote(contextPath)} >/dev/null 2>&1 & echo $!`;
    const result = spawnSync('sh', ['-c', command], {
      cwd: appRootDir(),
      env: { ...process.env },
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.status !== 0 || result.error) {
      throw new Error((result.stderr || result.stdout || result.error?.message || 'failed to start PM2 rebind worker').trim());
    }
    return Number(String(result.stdout || '').trim()) || 0;
  }

  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$p = Start-Process -FilePath ${powershellQuote(process.execPath)} -ArgumentList ${powershellArray([pm2RebindWorkerPath(), contextPath])} -WorkingDirectory ${powershellQuote(appRootDir())} -WindowStyle Hidden -PassThru`,
    'Write-Output $p.Id',
  ].join('; ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    cwd: appRootDir(),
    env: { ...process.env },
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0 || result.error) {
    throw new Error((result.stderr || result.stdout || result.error?.message || 'failed to start PM2 rebind worker').trim());
  }
  return Number(String(result.stdout || '').trim().split(/\r?\n/).pop()) || 0;
}

function schedulePm2RebindAfterInstall(task: InstallTaskSnapshot, port: number): { ok: boolean; message?: string } {
  try {
    const contextPath = assertPathInsideServer(path.join(taskDir(), `pm2-rebind-${task.id}.json`));
    const logPath = assertPathInsideServer(path.join(taskDir(), `pm2-rebind-${task.id}.log`));
    fs.writeFileSync(contextPath, JSON.stringify({
      appRoot: appRootDir(),
      serverDir: runtimeServerDir(),
      appName: currentPm2AppName(),
      port: normalizePort(port, 3000),
      delayMs: 1500,
      logPath,
    }, null, 2) + '\n', 'utf8');
    const pid = startDetachedPm2Rebind(contextPath);
    appendTaskLog(task, `PM2 rebind worker started: pid=${pid || 'unknown'}, log=${logPath}`);
    return { ok: true };
  } catch (err: any) {
    const message = `PM2 rebind worker failed to start: ${err?.message || String(err)}`;
    appendTaskLog(task, message);
    return { ok: false, message };
  }
}

async function runInstallTask(task: InstallTaskSnapshot, rawPayload: any): Promise<void> {
  try {
    task.status = 'running';
    const payload = normalizeInstallPayload(rawPayload);

    reloadRuntimeEnvIfConfigWritten();
    await assertInstallCanRun();
    applyCompletedInstallStateToTask(task);

    if (isPersistentStepCompleted('writeConfig') && fs.existsSync(envPath())) {
      reloadRuntimeEnvFromFile();
      process.env.PORT = String(payload.port);
      config.port = payload.port;
      applyRuntimeDbConfig(payload.db);
      markTaskStep(task, 'write_config', 'success', '配置已完成，跳过写入');
    } else {
      markTaskStep(task, 'write_config', 'running');
      markPersistentTaskStep('write_config', 'running');
      const envResult = writeInstallEnv(payload);
      appendTaskLog(task, envResult.backupPath ? `已备份旧 .env: ${envResult.backupPath}` : '未发现旧 .env，已创建新配置文件');
      markTaskStep(task, 'write_config', 'success', '配置已写入');
      markPersistentTaskStep('write_config', 'completed');
    }

    const layout = ensureInitialRuntimeLayout();
    appendTaskLog(task, `运行目录已准备: current=${layout.currentPath}, release=${layout.releaseDir}, sharedEnv=${layout.sharedEnv}`);

    if (isPersistentStepCompleted('testDatabase')) {
      applyRuntimeDbConfig(payload.db);
      markTaskStep(task, 'test_database', 'success', '数据库连接已验证，跳过');
    } else {
      markTaskStep(task, 'test_database', 'running');
      markPersistentTaskStep('test_database', 'running');
      const dbResult = await testDbConnection(payload.db);
      if (!dbResult.success) throw new Error(dbResult.message || '数据库连接失败');
      applyRuntimeDbConfig(payload.db);
      markTaskStep(task, 'test_database', 'success', dbResult.warning || '数据库连接正常');
      markPersistentTaskStep('test_database', 'completed');
    }

    tempConfig = {
      db: payload.db,
      sys: payload.sys,
      admin: {
        username: payload.admin.username,
        password: bcrypt.hashSync(payload.admin.password, 10),
        email: payload.admin.email,
        phone: payload.admin.phone,
      },
    };

    const dbStepsCompleted =
      isPersistentStepCompleted('migrateDatabase') &&
      isPersistentStepCompleted('initSystemConfig') &&
      isPersistentStepCompleted('createAdmin');
    if (dbStepsCompleted) {
      markTaskStep(task, 'create_tables', 'success', '数据表与迁移已完成，跳过');
      markTaskStep(task, 'init_config', 'success', '系统配置已完成，跳过');
      markTaskStep(task, 'create_admin', 'success', '管理员账号已存在，跳过');
    } else {
      markTaskStep(task, 'create_tables', 'running');
      markPersistentTaskStep('create_tables', 'running');
      const init = await executeInit((step) => {
        if (step === 'init_config' && task.steps.find(item => item.key === 'create_tables')?.status === 'running') {
          markTaskStep(task, 'create_tables', 'success', '数据表与迁移已完成');
          markPersistentTaskStep('create_tables', 'completed');
        }
        if (step === 'create_admin' && task.steps.find(item => item.key === 'init_config')?.status === 'running') {
          markTaskStep(task, 'init_config', 'success', '系统配置已写入');
          markPersistentTaskStep('init_config', 'completed');
        }
        markTaskStep(task, step, 'running');
        markPersistentTaskStep(step, 'running');
      });
      if (!init.success) {
        const failed = init.steps.find((item: any) => item.status === 'failed');
        throw new Error(failed?.message || '数据库初始化失败');
      }
      markTaskStep(task, 'create_tables', 'success', '数据表与迁移已完成');
      markPersistentTaskStep('create_tables', 'completed');
      markTaskStep(task, 'init_config', 'success', '系统配置已写入');
      markPersistentTaskStep('init_config', 'completed');
      const adminStep = init.steps.find((item: any) => item.name === '创建管理员');
      markTaskStep(task, 'create_admin', 'success', adminStep?.detail?.skipped ? '管理员账号已存在，跳过' : '管理员账号已创建');
      markPersistentTaskStep('create_admin', 'completed');
    }

    const currentStatus = await evaluateInstallStatus();
    if (currentStatus.service.ready) {
      markTaskStep(task, 'pm2', 'success', `PM2 服务已可访问，PM2_HOME=${currentStatus.service.pm2Home}`);
      markPersistentTaskStep('pm2', 'completed');
    } else {
      markTaskStep(task, 'pm2', 'running');
      markPersistentTaskStep('pm2', 'running');
      const pm2 = await ensurePm2Started(payload.port, line => appendTaskLog(task, line), warning => appendTaskLog(task, `WARNING: ${warning}`));
      if (!pm2.ok) {
        const message = `PM2 启动失败：${pm2.manualCommand || pm2.action}`;
        markTaskStep(task, 'pm2', 'failed', message);
        markPersistentTaskStep('pm2', 'failed', message, pm2.warnings);
        appendTaskLog(task, `PM2_HOME=${pm2.pm2Home}`);
        finishPartialTask(task, { installed: false, partial: true, status: 'partial_success', adminPath: '/login', pm2Home: pm2.pm2Home }, message);
        return;
      }
      markTaskStep(task, 'pm2', 'success', `PM2 已启动，PM2_HOME=${pm2.pm2Home}`);
      markPersistentTaskStep('pm2', 'completed', undefined, pm2.warnings);
    }

    if (isPersistentStepCompleted('writeInstallLock') && fs.existsSync(installLockPath())) {
      markTaskStep(task, 'write_lock', 'success', '安装锁已写入，跳过');
    } else {
      markTaskStep(task, 'write_lock', 'running');
      markPersistentTaskStep('write_lock', 'running');
      const finished = await finishInstall();
      if (!finished.baseInstalled) throw new Error('基础安装状态确认失败');
      markTaskStep(task, 'write_lock', 'success', '安装锁已写入');
      markPersistentTaskStep('write_lock', 'completed');
    }

    const rebind = schedulePm2RebindAfterInstall(task, payload.port);
    if (!rebind.ok) {
      const message = rebind.message || 'PM2 rebind worker failed to start';
      markPersistentTaskStep('pm2', 'failed', message);
      finishPartialTask(task, { installed: false, partial: true, status: 'partial_success', adminPath: '/login' }, message);
      return;
    }
    finishTask(task, { installed: true, adminPath: '/login', pm2Action: currentStatus.service.ready ? 'already_running' : 'start' });
    setInstallCacheInstalled();
  } catch (err: any) {
    const message = sanitizeLog(installErrorText(err));
    markPersistentTaskStep(task.step || 'write_config', 'failed', message);
    markTaskStep(task, task.step || 'write_config', 'failed', message);
    appendTaskLog(task, message);
  }
}

async function runPm2RetryTask(task: InstallTaskSnapshot, rawPayload: any): Promise<void> {
  try {
    task.status = 'running';
    applyCompletedInstallStateToTask(task);
    task.step = 'pm2';
    reloadRuntimeEnvIfConfigWritten();
    await assertInstallCanRun({ allowRepairState: true });

    const status = await evaluateInstallStatus();
    if (!status.database.ready) {
      throw new Error(status.message || '基础安装未完成，不能只重试 PM2');
    }
    reloadRuntimeEnvFromFile();

    const requestedPort = rawPayload?.port ?? rawPayload?.PORT ?? status.service.port ?? config.port ?? 3000;
    const port = normalizePort(requestedPort, 3000);
    process.env.PORT = String(port);
    config.port = port;

    markTaskStep(task, 'pm2', 'running');
    markPersistentTaskStep('pm2', 'running');
    const pm2 = await ensurePm2Started(port, line => appendTaskLog(task, line), warning => appendTaskLog(task, `WARNING: ${warning}`));
    if (!pm2.ok) {
      const message = `PM2 启动失败：${pm2.manualCommand || pm2.action}`;
      markTaskStep(task, 'pm2', 'failed', message);
      markPersistentTaskStep('pm2', 'failed', message, pm2.warnings);
      appendTaskLog(task, `PM2_HOME=${pm2.pm2Home}`);
      finishPartialTask(task, { installed: false, partial: true, status: 'partial_success', adminPath: '/login', pm2Home: pm2.pm2Home }, message);
      return;
    }

    markTaskStep(task, 'pm2', 'success', `PM2 已启动，PM2_HOME=${pm2.pm2Home}`);
    markPersistentTaskStep('pm2', 'completed', undefined, pm2.warnings);
    if (!status.lockFileExists) {
      markTaskStep(task, 'write_lock', 'running');
      markPersistentTaskStep('write_lock', 'running');
      const finished = await finishInstall();
      if (!finished.baseInstalled) throw new Error('安装收尾状态确认失败');
      markTaskStep(task, 'write_lock', 'success', '安装收尾修复完成，安装锁已写入');
      markPersistentTaskStep('write_lock', 'completed');
    }
    finishTask(task, { installed: true, adminPath: '/login', pm2Action: pm2.action, pm2Home: pm2.pm2Home });
    setInstallCacheInstalled();
  } catch (err: any) {
    const message = sanitizeLog(installErrorText(err));
    markPersistentTaskStep(task.step || 'pm2', 'failed', message);
    markTaskStep(task, task.step || 'pm2', 'failed', message);
    appendTaskLog(task, message);
  }
}

export async function runInstallNow(rawPayload: any): Promise<Record<string, unknown>> {
  await assertInstallCanRun();
  const task = createTask('install');
  await runInstallTask(task, rawPayload);
  if (task.status === 'partial_success') return task.result || { installed: false, partial: true };
  if (task.status !== 'success') throw new Error(task.error || '安装失败');
  return task.result || { installed: true };
}

export async function startInstallTask(rawPayload: any): Promise<InstallTaskSnapshot> {
  await assertInstallCanRun();
  const task = createTask('install');
  applyCompletedInstallStateToTask(task);
  runInstallTask(task, rawPayload).catch(err => {
    const message = sanitizeLog(installErrorText(err));
    markTaskStep(task, task.step || 'write_config', 'failed', message);
  });
  return task;
}

export async function startPm2RetryTask(rawPayload: any): Promise<InstallTaskSnapshot> {
  await assertInstallCanRun({ allowRepairState: true });
  const task = createTask('install');
  applyCompletedInstallStateToTask(task);
  runPm2RetryTask(task, rawPayload || {}).catch(err => {
    const message = sanitizeLog(installErrorText(err));
    markTaskStep(task, task.step || 'pm2', 'failed', message);
  });
  return task;
}

async function runBuildTask(task: InstallTaskSnapshot): Promise<void> {
  try {
    task.status = 'running';
    const adminDir = assertPathInsideAppRoot(path.join(appRootDir(), 'admin-web'));
    const backendDir = assertPathInsideAppRoot(serverDir());

    markTaskStep(task, 'build_admin', 'running');
    appendTaskLog(task, 'admin-web: npm ci --include=dev');
    await runCheckedCommand('npm', ['ci', '--include=dev'], adminDir, line => appendTaskLog(task, `admin-web ${line}`));
    appendTaskLog(task, 'admin-web: npm run build');
    await runCheckedCommand('npm', ['run', 'build'], adminDir, line => appendTaskLog(task, `admin-web ${line}`));
    markTaskStep(task, 'build_admin', 'success', '后台前端构建完成');

    markTaskStep(task, 'build_server', 'running');
    appendTaskLog(task, 'server: npm ci --include=dev');
    await runCheckedCommand('npm', ['ci', '--include=dev'], backendDir, line => appendTaskLog(task, `server ${line}`));
    appendTaskLog(task, 'server: npm run build');
    await runCheckedCommand('npm', ['run', 'build'], backendDir, line => appendTaskLog(task, `server ${line}`));
    markTaskStep(task, 'build_server', 'success', '后端构建完成');

    finishTask(task, { built: true });
  } catch (err: any) {
    const message = sanitizeLog(installErrorText(err));
    markTaskStep(task, task.step || 'build_admin', 'failed', message);
    appendTaskLog(task, message);
  }
}

export async function startBuildTask(): Promise<InstallTaskSnapshot> {
  await assertInstallCanRun();
  const task = createTask('build');
  runBuildTask(task).catch(err => {
    const message = sanitizeLog(installErrorText(err));
    markTaskStep(task, task.step || 'build_admin', 'failed', message);
  });
  return task;
}

export async function finishInstall() {
  assertEnvironmentReady();

  const db = currentDbConfig();
  applyRuntimeDbConfig(db);
  const conn = await connectInstallDatabase(db);
  let transactionStarted = false;
  const lockPath = installLockPath();

  try {
    const currentDatabase = await assertCurrentDatabase(conn, db.database);
    await assertRequiredTables(conn, db.database, { currentDatabase });
    await assertRequiredColumns(conn, db.database);
    await assertRequiredIndexes(conn, db.database);
    await assertRequiredSystemConfigs(conn);
    await assertAdminReady(conn);
    const releaseVersion = await assertFinalizeRuntimeReady();

    await conn.beginTransaction();
    transactionStarted = true;
    await writeSystemInstalled(conn);
    await writeInitialInstalledRelease(conn);
    await conn.commit();
    transactionStarted = false;

    writeInstallLock(lockPath, {
      releaseVersion,
      appRootDir: appRootDir(),
      pm2AppName: currentPm2AppName(),
      healthCheckUrl: process.env.HEALTH_CHECK_URL || config.release.healthCheckUrl || `http://127.0.0.1:${config.port || 3000}/health`,
    });
  } catch (err) {
    if (transactionStarted) {
      await conn.rollback().catch(() => undefined);
    }
    throw err;
  } finally {
    await conn.end();
  }

  const finalStatus = await evaluateInstallStatus();
  if (!finalStatus.lockFileExists || !finalStatus.database.ready) {
    throw new Error(finalStatus.message || '基础安装完成状态校验失败');
  }

  const finalAdminPath = '/login';
  tempConfig = {}; // 清理临时数据
  return {
    success: true,
    installed: finalStatus.installed,
    baseInstalled: true,
    status: finalStatus.state,
    adminPath: finalAdminPath,
    message: '安装收尾修复完成，系统已恢复为已安装状态。',
  };
}
