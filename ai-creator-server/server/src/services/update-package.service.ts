import fs from 'fs';
import path from 'path';
import * as tar from 'tar';
import { execFile, spawn, spawnSync } from 'child_process';
import { config } from '../utils/config';
import { query, queryOne } from '../utils/db';
import { runPm2Command } from './pm2-runtime.service';
import { writeInstallLock } from './install-readiness.service';

type CheckStatus = 'ok' | 'warning' | 'fail';
type PackageStatus = 'available' | 'invalid' | 'installed';

export interface PrecheckItem {
  name: string;
  status: CheckStatus;
  message: string;
}

interface ReleaseInfo {
  version: string;
  name: string;
  description: string;
  buildTime: string;
  commit: string;
  minRequiredVersion: string;
  packageType: string;
  notes: unknown[];
}

interface ArchiveEntryInfo {
  path: string;
  type: string;
}

interface ArchiveInfo {
  entries: ArchiveEntryInfo[];
  releaseJsonText: string;
}

export interface UpdatePackageSummary extends ReleaseInfo {
  filename: string;
  size: number;
  uploadedAt: string;
  status: PackageStatus;
  installed: boolean;
  isNewerThanCurrent: boolean;
  errors: string[];
  warnings: string[];
}

export interface ListUpdatePackagesResult {
  ok: boolean;
  currentVersion: string;
  packageDir: string;
  packages: UpdatePackageSummary[];
  warnings: string[];
  errors: string[];
}

export interface PrecheckResult extends ReleaseInfo {
  ok: boolean;
  filename: string;
  currentVersion: string;
  isNewerThanCurrent: boolean;
  installed: boolean;
  checks: PrecheckItem[];
  warnings: string[];
  errors: string[];
}

type InstallStatusValue = 'idle' | 'running' | 'success' | 'failed' | 'rollback_success' | 'rollback_failed' | 'stale';
type InstallStep =
  | 'precheck'
  | 'lock'
  | 'backup_database'
  | 'backup_code'
  | 'extract_release'
  | 'prepare_env'
  | 'install_dependencies'
  | 'build_or_check'
  | 'check_encoding'
  | 'run_migration'
  | 'switch_current'
  | 'pm2_reload'
  | 'health_check'
  | 'write_release_record'
  | 'cleanup'
  | 'rollback';

interface InstallLogItem {
  time: string;
  level: 'info' | 'warning' | 'error';
  step: InstallStep;
  message: string;
}

export interface InstallStatusResult {
  installing: boolean;
  installId: string;
  version: string;
  filename: string;
  status: InstallStatusValue;
  step: InstallStep | 'idle';
  startedAt: string | null;
  finishedAt: string | null;
  operator: string;
  error?: string;
  dbBackupPath?: string;
  codeBackupPath?: string;
  oldCurrentPath?: string;
  releaseDir?: string;
  dbMigrated?: boolean;
  workerPid?: number;
}

interface InstallContext extends InstallStatusResult {
  packagePath: string;
  releaseDir: string;
  oldVersion: string;
  switchedCurrent: boolean;
  dbMigrated: boolean;
  lockPath: string;
  logPath: string;
}

export interface StartInstallResult {
  ok: boolean;
  installId?: string;
  message: string;
}

export interface InstallLogsResult {
  installId: string;
  logs: InstallLogItem[];
}

export interface RestoreDatabaseBackupResult {
  ok: boolean;
  message: string;
  backupPath: string;
  restoredAt: string;
}

const SEMVER_PATTERN_TEXT = '(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?';
const SEMVER_PATTERN = new RegExp(`^${SEMVER_PATTERN_TEXT}$`);
const RELEASE_FILENAME = new RegExp(`^ai-creator-release-${SEMVER_PATTERN_TEXT}\\.tar\\.gz$`);
const ZIP_PACKAGE_HINT = '检测到 zip 更新包，但当前仅支持 .tar.gz，请在 WSL 中重新运行 scripts/build-release.sh 生成 tar.gz。';
const SENSITIVE_KEYS = /(password|secret|token|privatekey|api[-_]?key|apikey)/i;
const ALLOWED_ENV_FILES = new Set(['server/.env.example', 'server/.env.production.example']);
const DANGEROUS_DIR = /(^|\/)(node_modules|uploads|logs|backups|\.git|\.release-staging|\.codex-qa|update-packages|codex[^/]*)(\/|$)/;
const ALLOWED_DIST_DIRS = ['admin-web/dist', 'user-web/dist'];
const CANONICAL_PACKAGE_TYPE = 'server-admin-user-web';
const LEGACY_PACKAGE_TYPE = 'server-admin';
const ASSET_REFERENCE_PATTERN = /(?:^|["'(\s])\/?assets\/([^"'()<>\s]+?\.(?:js|css|mjs))(?:\?[^"'()<>\s]*)?/gi;
const JS_IMPORT_REFERENCE_PATTERN = /(?:from|import)\s*\(?\s*["']\.\/([^"']+?\.(?:js|css|mjs))(?:\?[^"']*)?["']/g;
const HASHED_BUILD_ASSET = /-[A-Za-z0-9_-]{8,}\.(?:js|css|mjs)(?:\.gz)?$/i;
const UNSUPPORTED_SQL_ROUTINE_PATTERN = /\bDELIMITER\b|\bCREATE\s+(PROCEDURE|FUNCTION|TRIGGER|EVENT)\b/i;
const FORBIDDEN_SQL_PATTERN = /\b(DROP\s+DATABASE|TRUNCATE)\b|\bDROP\s+(?!TEMPORARY\s+TABLE\b)/i;
const COMMAND_TIMEOUT_MS = {
  default: 5 * 60 * 1000,
  npmInstall: 10 * 60 * 1000,
  build: 10 * 60 * 1000,
  migration: 5 * 60 * 1000,
  databaseBackup: 5 * 60 * 1000,
  databaseRestore: 10 * 60 * 1000,
  pm2: 60 * 1000,
  health: 15 * 1000,
};
let currentInstall: InstallContext | null = null;
let lastInstall: InstallContext | null = null;

function emptyReleaseInfo(): ReleaseInfo {
  return {
    version: '',
    name: '',
    description: '',
    buildTime: '',
    commit: '',
    minRequiredVersion: '',
    packageType: '',
    notes: [],
  };
}

function safeError(err: any): string {
  const message = err?.message ? String(err.message) : 'unknown error';
  if (!/Unreachable code/i.test(message)) return message.slice(0, 4000);
  return [
    'Node.js/PM2 运行环境异常：检测到 Node 内部错误 "Unreachable code"。',
    '请切换到 Node.js 20 LTS 或稳定的 Node.js 22 LTS，重新执行 npm ci --include=dev && npm run build 后再重试。',
    `原始错误：${message}`,
  ].join(' ').slice(0, 4000);
}

function normalizeEntryPath(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isUnsafeArchivePath(entryPath: string): string {
  const normalized = normalizeEntryPath(entryPath);
  if (!normalized || normalized === '.') return '';
  if (normalized.startsWith('/')) return 'absolute archive path';
  if (/^[A-Za-z]:/.test(normalized)) return 'windows absolute archive path';
  if (normalized.split('/').includes('..')) return 'parent path segment';
  return '';
}

function isAllowedEntryType(type: string): boolean {
  return ['File', 'Directory', 'OldFile', 'ContiguousFile'].includes(type);
}

function hasPath(entries: ArchiveEntryInfo[], target: string): boolean {
  return entries.some(entry => entry.path === target || entry.path.startsWith(`${target}/`));
}

function hasFile(entries: ArchiveEntryInfo[], target: string): boolean {
  return entries.some(entry => entry.path === target && entry.type !== 'Directory');
}

function isDangerousFile(entryPath: string): boolean {
  const normalized = normalizeEntryPath(entryPath);
  const basename = path.posix.basename(normalized);
  if ((basename === '.env' || basename.startsWith('.env.')) && !ALLOWED_ENV_FILES.has(normalized)) return true;
  if (['npm-debug.log', 'yarn-error.log', 'pnpm-debug.log', '.DS_Store'].includes(basename)) return true;
  if (/\.(log|tmp|temp|cache|bak|swp|zip|tar\.gz|pem|key|crt|cert|dump|sqlite|sqlite3|db|p12|pfx|jks|keystore|sql\.gz)$/i.test(basename)) return true;
  return basename.endsWith('~');
}

function isAllowedReleaseDistPath(entryPath: string): boolean {
  const normalized = normalizeEntryPath(entryPath).replace(/\/$/, '');
  return ALLOWED_DIST_DIRS.some(distDir => normalized === distDir || normalized.startsWith(`${distDir}/`));
}

function isForbiddenDistPath(entryPath: string): boolean {
  const normalized = normalizeEntryPath(entryPath);
  return /(^|\/)dist(\/|$)/.test(normalized) && !isAllowedReleaseDistPath(normalized);
}

function normalizeAssetRelativePath(value: string): string {
  const raw = normalizeEntryPath(value).replace(/^\/+/, '').split('?')[0];
  if (!raw.startsWith('assets/')) return '';
  if (raw.split('/').includes('..')) return '';
  return raw;
}

function collectReleaseInfo(raw: any): ReleaseInfo {
  return {
    version: typeof raw.version === 'string' ? raw.version : '',
    name: typeof raw.name === 'string' ? raw.name : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    buildTime: typeof raw.buildTime === 'string' ? raw.buildTime : '',
    commit: typeof raw.commit === 'string' ? raw.commit : '',
    minRequiredVersion: typeof raw.minRequiredVersion === 'string' ? raw.minRequiredVersion : '',
    packageType: typeof raw.packageType === 'string' ? raw.packageType : '',
    notes: Array.isArray(raw.notes) ? raw.notes : [],
  };
}

function containsSensitiveKey(value: any): boolean {
  if (!value || typeof value !== 'object') return false;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.test(key)) return true;
    if (containsSensitiveKey(child)) return true;
  }
  return false;
}

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

function parseComparableVersion(version: string): ParsedSemver | null {
  const match = version.match(SEMVER_PATTERN);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function compareIdentifiers(a: string, b: string): number {
  const aNumeric = /^(0|[1-9]\d*)$/.test(a);
  const bNumeric = /^(0|[1-9]\d*)$/.test(b);
  if (aNumeric && bNumeric) return Number(a) - Number(b);
  if (aNumeric) return -1;
  if (bNumeric) return 1;
  return a.localeCompare(b);
}

function comparePrerelease(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const compared = compareIdentifiers(a[i], b[i]);
    if (compared !== 0) return compared;
  }
  return 0;
}

export function compareReleaseVersions(candidate: string, current: string): { isNewer: boolean; comparable: boolean } {
  const a = parseComparableVersion(candidate);
  const b = parseComparableVersion(current);
  if (a === null || b === null) return { isNewer: false, comparable: false };

  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return { isNewer: a[key] > b[key], comparable: true };
  }

  return { isNewer: comparePrerelease(a.prerelease, b.prerelease) > 0, comparable: true };
}

async function tableExists(tableName: string): Promise<boolean> {
  const row = await queryOne<any>(
    'SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    [config.db.database, tableName],
  );
  return Number(row?.cnt || 0) > 0;
}

function readSemverReleaseVersion(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return '';
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const version = typeof parsed?.version === 'string' ? parsed.version.trim() : '';
    return SEMVER_PATTERN.test(version) ? version : '';
  } catch {
    return '';
  }
}

export async function getCurrentReleaseVersion(): Promise<{ version: string; warnings: string[] }> {
  const warnings: string[] = [];
  try {
    if (await tableExists('app_releases')) {
      const row = await queryOne<any>(
        "SELECT version FROM app_releases WHERE status = 'installed' ORDER BY installed_at DESC, id DESC LIMIT 1",
      );
      const installedVersion = typeof row?.version === 'string' ? row.version.trim() : '';
      if (SEMVER_PATTERN.test(installedVersion)) return { version: installedVersion, warnings };
      if (row?.version) {
        warnings.push(`app_releases contains an invalid installed release version: ${String(row.version)}`);
      }
      warnings.push('app_releases has no installed release record; checking runtime release.json');
    } else {
      warnings.push('app_releases table not found; checking runtime release.json');
    }
  } catch (err: any) {
    warnings.push(`failed to read app_releases: ${safeError(err)}`);
  }

  const appRoot = appRootPath();
  const runtimeReleaseCandidates = [
    path.join(appRoot, 'current', 'release.json'),
    path.join(appRoot, 'release.json'),
  ];
  for (const candidate of runtimeReleaseCandidates) {
    const version = readSemverReleaseVersion(candidate);
    if (version) {
      warnings.push(`using runtime release.json version: ${version}`);
      return { version, warnings };
    }
  }
  warnings.push('runtime release.json has no valid semver version; falling back to package.json');

  try {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return { version: pkg.version || 'unknown', warnings };
  } catch (err: any) {
    warnings.push(`failed to read package.json version: ${safeError(err)}`);
    return { version: 'unknown', warnings };
  }
}

async function isInstalledVersion(version: string): Promise<{ installed: boolean; warning?: string }> {
  if (!version) return { installed: false };
  try {
    if (!await tableExists('app_releases')) return { installed: false, warning: 'app_releases table not found' };
    const row = await queryOne<any>(
      'SELECT id FROM app_releases WHERE version = ? AND status = ? LIMIT 1',
      [version, 'installed'],
    );
    return { installed: !!row };
  } catch (err: any) {
    return { installed: false, warning: `failed to read installed releases: ${safeError(err)}` };
  }
}

export function ensureUpdatePackageDir(): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  try {
    if (!fs.existsSync(config.release.updatePackagesDir)) {
      fs.mkdirSync(config.release.updatePackagesDir, { recursive: true });
      warnings.push('update-packages directory was created because it did not exist');
    }
    const stat = fs.statSync(config.release.updatePackagesDir);
    if (!stat.isDirectory()) errors.push('update-packages path exists but is not a directory');
  } catch (err: any) {
    errors.push(`failed to prepare update-packages directory: ${safeError(err)}`);
  }
  return { warnings, errors };
}

function safePackagePath(filename: string): { ok: boolean; path?: string; error?: string } {
  if (!filename || typeof filename !== 'string') return { ok: false, error: 'filename is required' };
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) return { ok: false, error: 'filename must be a plain file name' };
  if (path.isAbsolute(filename) || /^[A-Za-z]:/.test(filename)) return { ok: false, error: 'absolute filename is not allowed' };
  if (!filename.endsWith('.tar.gz')) return { ok: false, error: 'filename must end with .tar.gz' };
  if (!RELEASE_FILENAME.test(filename)) return { ok: false, error: 'filename must match ai-creator-release-<semver>.tar.gz, for example ai-creator-release-1.0.3.tar.gz' };

  const base = path.resolve(config.release.updatePackagesDir);
  const fullPath = path.resolve(base, filename);
  if (!fullPath.startsWith(`${base}${path.sep}`)) return { ok: false, error: 'filename escapes update-packages directory' };
  return { ok: true, path: fullPath };
}

async function readArchiveInfo(filePath: string): Promise<ArchiveInfo> {
  const entries: ArchiveEntryInfo[] = [];
  let releaseJsonText = '';
  let entryCount = 0;

  await tar.t({
    file: filePath,
    onentry: (entry: any) => {
      entryCount += 1;
      if (entryCount > 5000) throw new Error('archive has too many entries');

      const entryPath = normalizeEntryPath(entry.path || '');
      entries.push({ path: entryPath, type: entry.type || 'unknown' });

      if (entryPath === 'release.json' && isAllowedEntryType(entry.type || '')) {
        let collected = '';
        entry.on('data', (chunk: Buffer) => {
          collected += chunk.toString('utf8');
          if (Buffer.byteLength(collected, 'utf8') > 256 * 1024) {
            throw new Error('release.json is too large');
          }
        });
        entry.on('end', () => {
          releaseJsonText = collected;
        });
      }
    },
  });

  return { entries, releaseJsonText };
}

function addCheck(result: PrecheckResult, name: string, status: CheckStatus, message: string) {
  result.checks.push({ name, status, message });
  if (status === 'warning') result.warnings.push(message);
  if (status === 'fail') result.errors.push(message);
}

function checkArchiveSafety(result: PrecheckResult, entries: ArchiveEntryInfo[]) {
  const unsafe = entries.find(entry => isUnsafeArchivePath(entry.path));
  addCheck(result, '压缩包路径安全', unsafe ? 'fail' : 'ok', unsafe ? `${unsafe.path}: ${isUnsafeArchivePath(unsafe.path)}` : '未发现路径穿越或绝对路径');

  const badType = entries.find(entry => !isAllowedEntryType(entry.type));
  addCheck(result, '压缩包条目类型', badType ? 'fail' : 'ok', badType ? `${badType.path}: unsupported type ${badType.type}` : '未发现软链、硬链或特殊文件');

  const dangerous = entries.find(entry => isDangerousFile(entry.path) || isForbiddenDistPath(entry.path) || DANGEROUS_DIR.test(entry.path));
  addCheck(result, '危险运行时文件', dangerous ? 'fail' : 'ok', dangerous ? `发现禁止文件或目录: ${dangerous.path}` : '未发现 .env、node_modules、uploads、logs、backups、dist、.git、临时目录或本地压缩包');

  const dbBackup = entries.find(entry => {
    if (!entry.path.match(/\.(sql|dump|bak)$/i)) return false;
    return !(entry.path.startsWith('server/src/migrations/') || entry.path.startsWith('server/src/db/'));
  });
  addCheck(result, '数据库备份文件', dbBackup ? 'fail' : 'ok', dbBackup ? `发现禁止数据库文件: ${dbBackup.path}` : '未发现禁止的 SQL/dump/bak 文件');
}

function checkArchiveShape(result: PrecheckResult, entries: ArchiveEntryInfo[]) {
  const rootReleaseJson = hasFile(entries, 'release.json');
  const nestedReleaseJson = entries.find(entry => entry.path.endsWith('/release.json') && entry.type !== 'Directory');
  addCheck(
    result,
    'release.json',
    rootReleaseJson ? 'ok' : 'fail',
    rootReleaseJson
      ? 'release.json 存在于包根目录'
      : nestedReleaseJson
        ? `release.json 不在包根目录: ${nestedReleaseJson.path}`
        : '缺少包根目录 release.json',
  );
  addCheck(result, 'server/package.json', hasFile(entries, 'server/package.json') ? 'ok' : 'fail', hasFile(entries, 'server/package.json') ? '存在' : '缺少 server/package.json');
  addCheck(result, 'server/package-lock.json', hasFile(entries, 'server/package-lock.json') ? 'ok' : 'fail', hasFile(entries, 'server/package-lock.json') ? '存在' : '缺少 server/package-lock.json');
  addCheck(result, 'server/tsconfig.json', hasFile(entries, 'server/tsconfig.json') ? 'ok' : 'fail', hasFile(entries, 'server/tsconfig.json') ? '存在' : '缺少 server/tsconfig.json');
  addCheck(result, 'server/.env.example', hasFile(entries, 'server/.env.example') ? 'ok' : 'fail', hasFile(entries, 'server/.env.example') ? '存在' : '缺少 server/.env.example');
  addCheck(result, 'server/.env.production.example', hasFile(entries, 'server/.env.production.example') ? 'ok' : 'fail', hasFile(entries, 'server/.env.production.example') ? '存在' : '缺少 server/.env.production.example');
  addCheck(result, 'server/src', hasPath(entries, 'server/src') ? 'ok' : 'fail', hasPath(entries, 'server/src') ? '存在' : '缺少 server/src');
  addCheck(result, 'server/src/db', hasPath(entries, 'server/src/db') ? 'ok' : 'fail', hasPath(entries, 'server/src/db') ? '存在' : '缺少 server/src/db');
  addCheck(result, 'server/src/migrations', hasPath(entries, 'server/src/migrations') ? 'ok' : 'fail', hasPath(entries, 'server/src/migrations') ? '存在' : '缺少 server/src/migrations');
  addCheck(result, 'server/scripts', hasPath(entries, 'server/scripts') ? 'ok' : 'fail', hasPath(entries, 'server/scripts') ? '存在' : '缺少 server/scripts');
  addCheck(result, 'docs', hasPath(entries, 'docs') ? 'ok' : 'warning', hasPath(entries, 'docs') ? '存在' : '建议包含 docs');
  addCheck(result, 'admin-web/package.json', hasFile(entries, 'admin-web/package.json') ? 'ok' : 'fail', hasFile(entries, 'admin-web/package.json') ? '存在' : '缺少 admin-web/package.json');
  addCheck(result, 'admin-web/package-lock.json', hasFile(entries, 'admin-web/package-lock.json') ? 'ok' : 'fail', hasFile(entries, 'admin-web/package-lock.json') ? '存在' : '缺少 admin-web/package-lock.json');
  addCheck(result, 'admin-web/tsconfig.json', hasFile(entries, 'admin-web/tsconfig.json') ? 'ok' : 'fail', hasFile(entries, 'admin-web/tsconfig.json') ? '存在' : '缺少 admin-web/tsconfig.json');
  addCheck(result, 'admin-web/vite.config.ts', hasFile(entries, 'admin-web/vite.config.ts') ? 'ok' : 'fail', hasFile(entries, 'admin-web/vite.config.ts') ? '存在' : '缺少 admin-web/vite.config.ts');
  addCheck(result, 'admin-web/index.html', hasFile(entries, 'admin-web/index.html') ? 'ok' : 'fail', hasFile(entries, 'admin-web/index.html') ? '存在' : '缺少 admin-web/index.html');
  addCheck(result, 'admin-web/src', hasPath(entries, 'admin-web/src') ? 'ok' : 'fail', hasPath(entries, 'admin-web/src') ? '存在' : '缺少 admin-web/src');
  addCheck(result, 'admin-web/dist/index.html', hasFile(entries, 'admin-web/dist/index.html') ? 'ok' : 'fail', hasFile(entries, 'admin-web/dist/index.html') ? 'exists' : 'missing admin-web/dist/index.html');
  addCheck(result, 'admin-web/dist/assets', hasPath(entries, 'admin-web/dist/assets') ? 'ok' : 'fail', hasPath(entries, 'admin-web/dist/assets') ? 'exists' : 'missing admin-web/dist/assets');
  addCheck(result, 'user-web/package.json', hasFile(entries, 'user-web/package.json') ? 'ok' : 'fail', hasFile(entries, 'user-web/package.json') ? '存在' : '缺少 user-web/package.json');
  addCheck(result, 'user-web/package-lock.json', hasFile(entries, 'user-web/package-lock.json') ? 'ok' : 'fail', hasFile(entries, 'user-web/package-lock.json') ? '存在' : '缺少 user-web/package-lock.json');
  addCheck(result, 'user-web/tsconfig.json', hasFile(entries, 'user-web/tsconfig.json') ? 'ok' : 'fail', hasFile(entries, 'user-web/tsconfig.json') ? '存在' : '缺少 user-web/tsconfig.json');
  addCheck(result, 'user-web/eslint.config.js', hasFile(entries, 'user-web/eslint.config.js') ? 'ok' : 'fail', hasFile(entries, 'user-web/eslint.config.js') ? '存在' : '缺少 user-web/eslint.config.js');
  addCheck(result, 'user-web/vite.config.ts', hasFile(entries, 'user-web/vite.config.ts') ? 'ok' : 'fail', hasFile(entries, 'user-web/vite.config.ts') ? '存在' : '缺少 user-web/vite.config.ts');
  addCheck(result, 'user-web/index.html', hasFile(entries, 'user-web/index.html') ? 'ok' : 'fail', hasFile(entries, 'user-web/index.html') ? '存在' : '缺少 user-web/index.html');
  addCheck(result, 'user-web/src', hasPath(entries, 'user-web/src') ? 'ok' : 'fail', hasPath(entries, 'user-web/src') ? '存在' : '缺少 user-web/src');
  addCheck(result, 'user-web/dist/index.html', hasFile(entries, 'user-web/dist/index.html') ? 'ok' : 'fail', hasFile(entries, 'user-web/dist/index.html') ? 'exists' : 'missing user-web/dist/index.html');
  addCheck(result, 'user-web/dist/assets', hasPath(entries, 'user-web/dist/assets') ? 'ok' : 'fail', hasPath(entries, 'user-web/dist/assets') ? 'exists' : 'missing user-web/dist/assets');
}

function checkReleaseJson(result: PrecheckResult, releaseJsonText: string): ReleaseInfo | null {
  if (!releaseJsonText) {
    addCheck(result, 'release.json 内容', 'fail', '缺少包根目录 release.json，不能用于安装');
    return null;
  }

  try {
    const parsed = JSON.parse(releaseJsonText);
    if (containsSensitiveKey(parsed)) {
      addCheck(result, 'release.json 敏感字段', 'fail', 'release.json 包含 password/secret/token/privateKey/apiKey 等敏感字段');
    } else {
      addCheck(result, 'release.json 敏感字段', 'ok', '未发现明显敏感字段');
    }

    const info = collectReleaseInfo(parsed);
    if (!info.version) addCheck(result, '版本号', 'fail', 'release.json 缺少 version');
    else if (!SEMVER_PATTERN.test(info.version)) addCheck(result, '版本号', 'fail', `release.json version 不是 semver 格式: ${info.version}，应使用 1.0.3 这种格式`);
    else addCheck(result, '版本号', 'ok', `版本号: ${info.version}`);

    if (!info.packageType || info.packageType === CANONICAL_PACKAGE_TYPE) {
      addCheck(result, '包类型', 'ok', info.packageType || '未填写 packageType');
    } else if (info.packageType === LEGACY_PACKAGE_TYPE) {
      addCheck(result, '包类型', 'warning', '兼容旧包类型 server-admin；新包应使用 server-admin-user-web');
    } else {
      addCheck(result, '包类型', 'warning', `未识别 packageType: ${info.packageType}；将按兼容模式继续检查`);
    }
    return info;
  } catch (err: any) {
    addCheck(result, 'release.json 内容', 'fail', `release.json 不是合法 JSON: ${safeError(err)}`);
    return null;
  }
}

async function addVersionChecks(result: PrecheckResult, releaseVersion: string, currentVersion: string) {
  const installed = await isInstalledVersion(releaseVersion);
  result.installed = installed.installed;
  if (installed.warning) addCheck(result, '已安装记录', 'warning', installed.warning);
  else addCheck(result, '已安装记录', installed.installed ? 'warning' : 'ok', installed.installed ? '该版本已安装过' : '未发现已安装记录');

  const comparison = compareReleaseVersions(releaseVersion, currentVersion);
  result.isNewerThanCurrent = comparison.isNewer;
  if (!comparison.comparable) {
    addCheck(result, '版本比较', 'warning', '无法准确比较版本，请人工确认');
  } else if (comparison.isNewer) {
    addCheck(result, '版本比较', 'ok', '该包版本高于当前版本');
  } else {
    addCheck(result, '版本比较', 'warning', '不是新版本，可能用于回滚或重复安装，不建议直接安装');
  }
}

async function addDiskCheck(result: PrecheckResult, packageSize: number) {
  const statfs = (fs.promises as any).statfs;
  if (typeof statfs !== 'function') {
    addCheck(result, '磁盘空间', 'warning', '当前 Node.js 不支持 statfs，请人工确认磁盘空间');
    return;
  }

  try {
    const stat = await statfs(config.release.updatePackagesDir);
    const freeBytes = Number(stat.bavail || stat.bfree || 0) * Number(stat.bsize || 0);
    if (freeBytes < packageSize * 3) {
      addCheck(result, '磁盘空间', 'warning', '剩余空间不足版本包大小的 3 倍，请人工确认');
    } else {
      addCheck(result, '磁盘空间', 'ok', '剩余空间满足预检查建议');
    }
  } catch (err: any) {
    addCheck(result, '磁盘空间', 'warning', `无法读取磁盘剩余空间: ${safeError(err)}`);
  }
}

async function addEnvironmentChecks(result: PrecheckResult) {
  const sharedEnv = path.join(config.release.appRootDir, 'shared/.env');
  const currentPath = path.join(config.release.appRootDir, 'current');
  const releasesPath = path.join(config.release.appRootDir, 'releases');
  const backupsPath = path.join(config.release.appRootDir, 'backups');
  const envSource = findExistingEnvSource();
  const legacyDeployment = hasLegacyFlatDeployment();

  if (fs.existsSync(sharedEnv)) {
    addCheck(result, 'shared/.env', 'ok', 'shared/.env 存在');
  } else if (envSource) {
    addCheck(result, 'shared/.env', 'warning', `shared/.env 不存在，安装时将从 ${relativeToAppRoot(envSource)} 初始化`);
  } else {
    addCheck(result, 'shared/.env', 'fail', 'shared/.env 不存在，且未找到可迁移的 server/.env');
  }

  if (fs.existsSync(currentPath)) {
    const currentStat = fs.lstatSync(currentPath);
    addCheck(result, 'current', currentStat.isSymbolicLink() ? 'ok' : 'fail', currentStat.isSymbolicLink() ? 'current 存在' : 'current 已存在但不是符号链接，不能安全切换版本');
  } else if (legacyDeployment) {
    addCheck(result, 'current', 'warning', 'current 不存在，安装时将从当前平铺部署目录初始化 legacy current');
  } else {
    addCheck(result, 'current', 'fail', 'current 不存在，且未找到可迁移的 server/package.json');
  }

  addCheck(result, 'releases 目录', fs.existsSync(releasesPath) ? 'ok' : 'warning', fs.existsSync(releasesPath) ? 'releases 目录存在' : 'releases 目录不存在，安装时将自动创建');
  addCheck(result, 'backups 目录', fs.existsSync(backupsPath) ? 'ok' : 'warning', fs.existsSync(backupsPath) ? 'backups 目录存在' : 'backups 目录不存在，安装时将自动创建');

  try {
    const exists = await tableExists('app_releases');
    addCheck(result, 'app_releases 表', exists ? 'ok' : 'warning', exists ? 'app_releases 可读取' : 'app_releases 表不存在');
  } catch (err: any) {
    addCheck(result, 'app_releases 表', 'warning', `app_releases 读取失败: ${safeError(err)}`);
  }

  try {
    const exists = await tableExists('schema_migrations');
    addCheck(result, 'schema_migrations 表', exists ? 'ok' : 'warning', exists ? 'schema_migrations 可读取' : 'schema_migrations 表不存在');
  } catch (err: any) {
    addCheck(result, 'schema_migrations 表', 'warning', `schema_migrations 读取失败: ${safeError(err)}`);
  }

  const mysqldumpOk = commandAvailable('mysqldump');
  addCheck(result, 'mysqldump 依赖', mysqldumpOk ? 'ok' : 'fail', mysqldumpOk
    ? 'mysqldump 可执行，更新前数据库备份可运行'
    : '未找到 mysqldump，系统更新无法安全备份数据库；请安装 mysql-client 或 MariaDB client 后再更新');
  const mysqlOk = commandAvailable('mysql');
  addCheck(result, 'mysql 客户端', mysqlOk ? 'ok' : 'warning', mysqlOk
    ? 'mysql 客户端可执行，数据库备份恢复功能可用'
    : '未找到 mysql 客户端，更新失败后的数据库备份导入需要人工安装客户端后执行');
  const curlOk = commandAvailable('curl');
  addCheck(result, 'curl 依赖', curlOk ? 'ok' : 'fail', curlOk
    ? 'curl 可执行，更新后的健康检查可运行'
    : '未找到 curl，无法执行更新后的健康检查');
  const pm2Ok = commandAvailable('pm2');
  addCheck(result, 'pm2 依赖', pm2Ok ? 'ok' : 'fail', pm2Ok
    ? 'pm2 可执行，更新后可重启 ai-creator'
    : '未找到 pm2，无法在更新后重启服务');
}

function sortPackages(items: UpdatePackageSummary[]) {
  items.sort((a, b) => {
    const buildTime = (b.buildTime || '').localeCompare(a.buildTime || '');
    if (buildTime !== 0) return buildTime;
    return (b.version || b.filename).localeCompare(a.version || a.filename);
  });
}

function formatScanList(items: string[]): string {
  return items.length > 0 ? items.join(', ') : '(none)';
}

function logPackageScan(message: string, level: 'info' | 'warning' = 'info') {
  const text = `[update-package] ${message}`;
  if (level === 'warning') console.warn(text);
  else console.log(text);
}

export async function listUpdatePackages(): Promise<ListUpdatePackagesResult> {
  const dirState = ensureUpdatePackageDir();
  const current = await getCurrentReleaseVersion();
  const result: ListUpdatePackagesResult = {
    ok: dirState.errors.length === 0,
    currentVersion: current.version,
    packageDir: config.release.updatePackagesDir,
    packages: [],
    warnings: [...dirState.warnings, ...current.warnings],
    errors: [...dirState.errors],
  };
  if (dirState.errors.length > 0) return result;

  const files: string[] = [];
  const ignoredFiles: Array<{ filename: string; reason: string }> = [];
  try {
    const entries = fs.readdirSync(config.release.updatePackagesDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    logPackageScan(`扫描目录: ${config.release.updatePackagesDir}`);
    logPackageScan(`扫描到的文件列表: ${formatScanList(entries.map(entry => entry.name))}`);

    for (const entry of entries) {
      const filename = entry.name;
      if (!entry.isFile()) {
        ignoredFiles.push({ filename, reason: '不是普通文件' });
      } else if (filename.endsWith('.zip')) {
        ignoredFiles.push({ filename, reason: ZIP_PACKAGE_HINT });
        result.warnings.push(`${filename}: ${ZIP_PACKAGE_HINT}`);
      } else if (!filename.endsWith('.tar.gz')) {
        ignoredFiles.push({ filename, reason: '不是 .tar.gz 更新包' });
      } else if (!RELEASE_FILENAME.test(filename)) {
        ignoredFiles.push({ filename, reason: '文件名不符合 ai-creator-release-<semver>.tar.gz，例如 ai-creator-release-1.0.3.tar.gz' });
      } else {
        files.push(filename);
      }
    }

    for (const ignored of ignoredFiles) {
      logPackageScan(`忽略文件: ${ignored.filename}; 原因: ${ignored.reason}`, ignored.reason === ZIP_PACKAGE_HINT ? 'warning' : 'info');
    }
    logPackageScan(`待解析 tar.gz 更新包列表: ${formatScanList(files)}`);
  } catch (err: any) {
    result.ok = false;
    result.errors.push(`failed to scan update-packages: ${safeError(err)}`);
    return result;
  }

  for (const filename of files) {
    const fullPath = path.join(config.release.updatePackagesDir, filename);
    const stat = fs.statSync(fullPath);
    const item: UpdatePackageSummary = {
      ...emptyReleaseInfo(),
      filename,
      size: stat.size,
      uploadedAt: stat.mtime.toISOString(),
      status: 'available',
      installed: false,
      isNewerThanCurrent: false,
      errors: [],
      warnings: [],
    };
    try {
      if (!stat.isFile()) throw new Error('not a regular file');
      const archive = await readArchiveInfo(fullPath);
      const precheck: PrecheckResult = { ...emptyReleaseInfo(), ok: true, filename, currentVersion: current.version, isNewerThanCurrent: false, installed: false, checks: [], warnings: [], errors: [] };
      checkArchiveSafety(precheck, archive.entries);
      checkArchiveShape(precheck, archive.entries);
      const info = checkReleaseJson(precheck, archive.releaseJsonText);
      if (info) Object.assign(item, info);
      await addVersionChecks(precheck, item.version, current.version);
      item.installed = precheck.installed;
      item.isNewerThanCurrent = precheck.isNewerThanCurrent;
      item.errors = precheck.errors;
      item.warnings = precheck.warnings;
      item.status = item.installed ? 'installed' : item.errors.length > 0 ? 'invalid' : 'available';
    } catch (err: any) {
      item.status = 'invalid';
      item.errors.push(safeError(err));
    }
    if (item.errors.length > 0) {
      logPackageScan(`更新包无效: ${filename}; 原因: ${item.errors.join('; ')}`, 'warning');
    }
    result.packages.push(item);
  }

  sortPackages(result.packages);
  logPackageScan(`有效更新包列表: ${formatScanList(result.packages.filter(item => item.status !== 'invalid').map(item => `${item.filename}(${item.version || 'unknown'})`))}`);
  return result;
}

export async function precheckUpdatePackage(filename: string): Promise<PrecheckResult> {
  const current = await getCurrentReleaseVersion();
  const result: PrecheckResult = {
    ...emptyReleaseInfo(),
    ok: true,
    filename,
    currentVersion: current.version,
    isNewerThanCurrent: false,
    installed: false,
    checks: [],
    warnings: [...current.warnings],
    errors: [],
  };

  const dirState = ensureUpdatePackageDir();
  for (const warning of dirState.warnings) addCheck(result, 'update-packages 目录', 'warning', warning);
  for (const error of dirState.errors) addCheck(result, 'update-packages 目录', 'fail', error);

  const safePath = safePackagePath(filename);
  addCheck(result, '文件名安全', safePath.ok ? 'ok' : 'fail', safePath.ok ? '文件名合法' : safePath.error || '文件名非法');
  if (!safePath.ok || !safePath.path) {
    result.ok = false;
    return result;
  }

  let packageSize: number;
  try {
    const stat = fs.statSync(safePath.path);
    packageSize = stat.size;
    addCheck(result, '文件存在', stat.isFile() ? 'ok' : 'fail', stat.isFile() ? '文件存在且是普通文件' : '不是普通文件');
  } catch {
    addCheck(result, '文件存在', 'fail', '文件不存在于 update-packages 目录');
    result.ok = false;
    return result;
  }

  try {
    const archive = await readArchiveInfo(safePath.path);
    checkArchiveSafety(result, archive.entries);
    checkArchiveShape(result, archive.entries);
    const info = checkReleaseJson(result, archive.releaseJsonText);
    if (info) Object.assign(result, info);
    await addVersionChecks(result, result.version, current.version);
    await addDiskCheck(result, packageSize);
    await addEnvironmentChecks(result);
  } catch (err: any) {
    addCheck(result, '压缩包读取', 'fail', `无法读取压缩包: ${safeError(err)}`);
  }

  result.ok = result.errors.length === 0;
  return result;
}

function nowText(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function timestampId(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function sanitizeLog(input: string): string {
  return input
    .replace(/(password|secret|token|private[_-]?key|api[_-]?key|appsecret|key)=([^\s&]+)/ig, '$1=***')
    .replace(/MYSQL_PWD=[^\s]+/ig, 'MYSQL_PWD=***')
    .slice(0, 4000);
}

function safeCommandTempDir(): string | null {
  for (const value of [process.env.TMPDIR, process.env.TEMP, process.env.TMP]) {
    if (value && !value.replace(/\\/g, '/').startsWith('/mnt/c/') && fs.existsSync(value)) return value;
  }
  return fs.existsSync('/tmp') ? '/tmp' : null;
}

function sharedRuntimeEnv(): Record<string, string> {
  const sharedEnv = path.join(config.release.appRootDir, 'shared/.env');
  if (!fs.existsSync(sharedEnv)) return {};
  try {
    return readEnvFile(sharedEnv);
  } catch {
    return {};
  }
}

function commandEnvironment(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const tempDir = safeCommandTempDir();
  return {
    ...process.env,
    ...sharedRuntimeEnv(),
    ...(tempDir ? { TMPDIR: tempDir, TEMP: tempDir, TMP: tempDir } : {}),
    ...env,
  };
}

function databaseRuntimeConfig() {
  const env = sharedRuntimeEnv();
  const dbHost = env.DB_HOST || config.db.host;
  const dbPort = env.DB_PORT || String(config.db.port || 3306);
  const dbUser = env.DB_USER || config.db.user;
  const dbPassword = env.DB_PASSWORD || config.db.password || '';
  const dbName = env.DB_NAME || config.db.database;
  if (!dbHost || !dbUser || !dbName) throw new Error('database connection info is incomplete in shared/.env');
  return { dbHost, dbPort, dbUser, dbPassword, dbName };
}

function execCommand(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv, timeoutMs = COMMAND_TIMEOUT_MS.default): Promise<string> {
  return new Promise((resolve, reject) => {
    const invocation = commandInvocation(command, args);
    execFile(invocation.command, invocation.args, { cwd, env: commandEnvironment(env), timeout: timeoutMs, killSignal: 'SIGTERM', windowsHide: true, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      const output = sanitizeLog(`${stdout || ''}${stderr || ''}`.trim());
      if (err) {
        const timedOut = (err as any).killed && (err as any).signal === 'SIGTERM';
        reject(new Error(output || (timedOut ? `${command} ${args.join(' ')} 执行超时` : err.message)));
        return;
      }
      resolve(output);
    });
  });
}

function commandInvocation(command: string, args: string[]): { command: string; args: string[] } {
  const executable = commandName(command);
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable)) {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/c', executable, ...args],
    };
  }
  return { command: executable, args };
}

function commandName(command: string): string {
  if (process.platform !== 'win32') return command;
  if (command === 'npm') return 'npm.cmd';
  if (command === 'pm2') return 'pm2.cmd';
  return command;
}

function commandAvailable(command: string): boolean {
  const probeArgs = process.platform === 'win32'
    ? ['/d', '/c', 'where', commandName(command)]
    : ['-lc', `command -v ${shellQuote(command)}`];
  const probeCommand = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'sh';
  const result = spawnSync(probeCommand, probeArgs, {
    cwd: config.release.appRootDir,
    env: commandEnvironment(),
    encoding: 'utf8',
    windowsHide: true,
  });
  return result.status === 0;
}

function readEnvFile(envPath: string): Record<string, string> {
  const values: Record<string, string> = {};
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    value = value.replace(/^['"]|['"]$/g, '');
    values[key] = value;
  }
  return values;
}

function ensureInsideAppRoot(target: string): string {
  const appRoot = path.resolve(config.release.appRootDir);
  const resolved = path.resolve(target);
  if (resolved !== appRoot && !resolved.startsWith(`${appRoot}${path.sep}`)) {
    throw new Error(`unsafe path outside APP_ROOT_DIR: ${resolved}`);
  }
  return resolved;
}

function appRootPath(): string {
  return path.resolve(config.release.appRootDir);
}

function releaseRuntimeEnvValue(key: string, fallback: string): string {
  const env = sharedRuntimeEnv();
  return env[key] || process.env[key] || fallback;
}

function releasePm2AppName(): string {
  return releaseRuntimeEnvValue('PM2_APP_NAME', config.release.pm2AppName || 'ai-creator');
}

function releaseHealthCheckUrl(): string {
  return releaseRuntimeEnvValue('HEALTH_CHECK_URL', config.release.healthCheckUrl || 'http://127.0.0.1:3000/health');
}

function releasePort(): number {
  const raw = releaseRuntimeEnvValue('PORT', String(config.port || 3000));
  const port = Number.parseInt(raw, 10);
  return Number.isInteger(port) && port > 0 ? port : 3000;
}

function relativeToAppRoot(target: string): string {
  const relative = path.relative(appRootPath(), path.resolve(target)).replace(/\\/g, '/');
  return relative && !relative.startsWith('..') ? relative : target;
}

function findExistingEnvSource(): string {
  const appRoot = appRootPath();
  const candidates = [
    path.join(appRoot, 'shared/.env'),
    path.join(appRoot, 'current/server/.env'),
    path.join(appRoot, 'server/.env'),
    path.resolve(__dirname, '../../.env'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return '';
}

function hasLegacyFlatDeployment(): boolean {
  const appRoot = appRootPath();
  return fs.existsSync(path.join(appRoot, 'server/package.json'));
}

function shouldCopyLegacyPath(sourcePath: string): boolean {
  const relative = path.relative(appRootPath(), sourcePath).replace(/\\/g, '/');
  if (!relative) return true;
  const segments = relative.split('/').filter(Boolean);
  if (segments.includes('node_modules')) return false;
  if (segments.some(segment => ['uploads', 'logs', 'backups', '.pm2', '.git', '.release-staging', '.codex-qa', 'update-packages'].includes(segment))) return false;
  if (segments.some(segment => /^codex[^/]*$/i.test(segment))) return false;
  return true;
}

function linkLegacyServerNodeModules(targetDir: string): void {
  const source = path.join(appRootPath(), 'server/node_modules');
  const target = path.join(targetDir, 'server/node_modules');
  if (!fs.existsSync(source)) return;
  if (pathExistsOrLink(target)) fs.rmSync(target, { recursive: true, force: true });
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  try {
    fs.symlinkSync(path.resolve(source), target, linkType);
  } catch (err: any) {
    throw new Error(`无法为旧版本运行目录创建 server/node_modules 链接：${safeError(err)}。请在 server 目录执行 npm ci --include=dev 后重试。`);
  }
}

function nextLegacyCurrentDir(): string {
  const releasesDir = ensureInsideAppRoot(path.join(config.release.appRootDir, 'releases'));
  const base = path.join(releasesDir, `legacy-current-${timestampId()}`);
  if (!fs.existsSync(base)) return base;
  for (let i = 1; i <= 99; i += 1) {
    const candidate = `${base}-${i}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error('unable to allocate legacy current directory');
}

function copyLegacyFlatDeployment(targetDir: string) {
  const appRoot = appRootPath();
  const items = ['server', 'admin-web', 'user-web', 'scripts', 'docs'];
  fs.mkdirSync(targetDir, { recursive: false });
  for (const item of items) {
    const source = path.join(appRoot, item);
    if (!fs.existsSync(source)) continue;
    fs.cpSync(source, path.join(targetDir, item), {
      recursive: true,
      dereference: false,
      filter: shouldCopyLegacyPath,
    });
  }
  linkLegacyServerNodeModules(targetDir);
  fs.writeFileSync(path.join(targetDir, 'release.json'), JSON.stringify({
    version: 'legacy-current',
    packageType: 'server-admin',
    buildTime: new Date().toISOString(),
    name: 'Legacy current deployment',
    description: 'Automatically captured before first system update install',
  }, null, 2));
}

function readReleaseJsonVersion(releaseDir: string): string {
  const releaseJson = path.join(releaseDir, 'release.json');
  if (!fs.existsSync(releaseJson)) throw new Error(`release.json 不存在：${releaseJson}`);
  const parsed = JSON.parse(fs.readFileSync(releaseJson, 'utf8'));
  const version = typeof parsed?.version === 'string' ? parsed.version.trim() : '';
  if (!version) throw new Error(`release.json 缺少 version：${releaseJson}`);
  return version;
}

function assertReleaseVersion(releaseDir: string, expectedVersion: string) {
  const actualVersion = readReleaseJsonVersion(releaseDir);
  if (actualVersion !== expectedVersion) {
    throw new Error(`release.json 版本不匹配，期望 ${expectedVersion}，实际 ${actualVersion}`);
  }
  return actualVersion;
}

function assertServerEntryExists(releaseDir: string) {
  const entry = path.join(releaseDir, 'server/dist/index.js');
  if (!fs.existsSync(entry)) throw new Error(`新版本启动文件不存在：${entry}`);
  return entry;
}

function assertUserWebDistExists(releaseDir: string) {
  const index = path.join(releaseDir, 'user-web/dist/index.html');
  const assets = path.join(releaseDir, 'user-web/dist/assets');
  if (!fs.existsSync(index) || !fs.existsSync(assets)) {
    throw new Error(`用户端预构建产物不完整：需要 ${index} 和 ${assets}`);
  }
  return index;
}

function addReferencedAsset(referenced: Set<string>, assetPath: string): void {
  if (!assetPath) return;
  referenced.add(assetPath);
  referenced.add(`${assetPath}.gz`);
}

function trackReferencedAsset(referenced: Set<string>, pendingJs: string[], assetPath: string): void {
  if (!assetPath || referenced.has(assetPath)) return;
  addReferencedAsset(referenced, assetPath);
  if (/\.(?:js|mjs)$/i.test(assetPath)) pendingJs.push(assetPath);
}

function collectAdminDistAssetReferences(indexHtml: string, assetsDir: string): Set<string> {
  const referenced = new Set<string>();
  const pendingJs: string[] = [];
  for (const match of indexHtml.matchAll(ASSET_REFERENCE_PATTERN)) {
    const assetPath = normalizeAssetRelativePath(match[1] ? `assets/${match[1]}` : '');
    trackReferencedAsset(referenced, pendingJs, assetPath);
  }

  const distDir = path.dirname(assetsDir);
  const processedJs = new Set<string>();
  for (let index = 0; index < pendingJs.length; index += 1) {
    const jsAssetPath = pendingJs[index];
    if (processedJs.has(jsAssetPath)) continue;
    processedJs.add(jsAssetPath);

    const fullPath = path.join(distDir, jsAssetPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    for (const match of content.matchAll(ASSET_REFERENCE_PATTERN)) {
      const assetPath = normalizeAssetRelativePath(match[1] ? `assets/${match[1]}` : '');
      trackReferencedAsset(referenced, pendingJs, assetPath);
    }
    for (const match of content.matchAll(JS_IMPORT_REFERENCE_PATTERN)) {
      const assetPath = normalizeAssetRelativePath(match[1] ? `assets/${match[1]}` : '');
      trackReferencedAsset(referenced, pendingJs, assetPath);
    }
  }
  return referenced;
}

export function cleanupOrphanAdminAssets(releaseDir: string): string[] {
  const distDir = path.join(releaseDir, 'admin-web/dist');
  const indexPath = path.join(distDir, 'index.html');
  const assetsDir = path.join(distDir, 'assets');
  if (!fs.existsSync(indexPath) || !fs.existsSync(assetsDir)) return [];

  const referenced = collectAdminDistAssetReferences(fs.readFileSync(indexPath, 'utf8'), assetsDir);
  const deleted: string[] = [];

  for (const entry of fs.readdirSync(assetsDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const relativeAssetPath = normalizeAssetRelativePath(`assets/${entry.name}`);
    if (!relativeAssetPath || referenced.has(relativeAssetPath)) continue;
    if (!HASHED_BUILD_ASSET.test(entry.name)) continue;

    fs.unlinkSync(path.join(assetsDir, entry.name));
    deleted.push(relativeAssetPath);
  }

  return deleted;
}

function cleanupOrphanAdminAssetsBestEffort(ctx: InstallContext, step: InstallStep): void {
  try {
    const deleted = cleanupOrphanAdminAssets(ctx.releaseDir);
    if (deleted.length > 0) {
      appendInstallLog(ctx, 'info', step, `cleaned orphan admin assets: ${deleted.join(', ')}`);
    }
  } catch (err: any) {
    appendInstallLog(ctx, 'warning', step, `cleanup orphan admin assets failed: ${safeError(err)}`);
  }
}

function ensureReleaseRuntimeLayout(): { oldCurrentPath: string; warnings: string[] } {
  const warnings: string[] = [];
  const appRoot = appRootPath();
  const sharedDir = ensureInsideAppRoot(path.join(appRoot, 'shared'));
  const sharedEnv = ensureInsideAppRoot(path.join(sharedDir, '.env'));
  const releasesDir = ensureInsideAppRoot(path.join(appRoot, 'releases'));
  const backupsDir = ensureInsideAppRoot(path.join(appRoot, 'backups'));
  const currentPath = ensureInsideAppRoot(path.join(appRoot, 'current'));

  fs.mkdirSync(sharedDir, { recursive: true });
  fs.mkdirSync(releasesDir, { recursive: true });
  fs.mkdirSync(backupsDir, { recursive: true });

  if (!fs.existsSync(sharedEnv)) {
    const envSource = findExistingEnvSource();
    if (!envSource) throw new Error('shared/.env not found and no server/.env source was found');
    fs.copyFileSync(envSource, sharedEnv);
    try { fs.chmodSync(sharedEnv, 0o600); } catch { /* chmod is best-effort across filesystems */ }
    warnings.push(`created shared/.env from ${relativeToAppRoot(envSource)}`);
  }

  if (fs.existsSync(currentPath)) {
    const stat = fs.lstatSync(currentPath);
    if (!stat.isSymbolicLink()) {
      throw new Error('current exists but is not a symbolic link; refusing to overwrite it');
    }
    return { oldCurrentPath: fs.realpathSync(currentPath), warnings };
  }

  if (!hasLegacyFlatDeployment()) {
    throw new Error('current not found and legacy server/package.json was not found');
  }

  const legacyDir = nextLegacyCurrentDir();
  copyLegacyFlatDeployment(legacyDir);
  replaceCurrentLink(currentPath, legacyDir);
  warnings.push(`created current symlink from legacy deployment: ${relativeToAppRoot(legacyDir)}`);
  return { oldCurrentPath: fs.realpathSync(currentPath), warnings };
}

function lockPath(): string {
  return path.join(config.release.appRootDir, 'update-install.lock');
}

function logsDir(): string {
  return path.join(config.release.appRootDir, 'logs/update-install');
}

function lastInstallPath(): string {
  return path.join(logsDir(), 'last.json');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readLock(): any | null {
  const file = lockPath();
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { installId: '', startedAt: '' };
  }
}

function writeLock(ctx: InstallContext) {
  const file = ctx.lockPath;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({
    installId: ctx.installId,
    version: ctx.version,
    filename: ctx.filename,
    operator: ctx.operator,
    startedAt: ctx.startedAt,
    workerPid: ctx.workerPid || 0,
  }, null, 2));
}

function releaseStatusFromContext(ctx: InstallContext | null): InstallStatusResult {
  if (!ctx) {
    const locked = readLock();
    const persisted = readLastInstallStatus();
    if (locked?.installId) {
      const workerPid = Number(locked.workerPid || persisted?.workerPid || 0);
      if (
        persisted &&
        persisted.installId === locked.installId &&
        persisted.status === 'running' &&
        workerPid > 0 &&
        isProcessAlive(workerPid)
      ) {
        return { ...persisted, installing: true, workerPid };
      }
      return {
        installing: false,
        installId: String(locked.installId || ''),
        version: String(locked.version || ''),
        filename: String(locked.filename || ''),
        status: 'stale',
        step: 'lock',
        startedAt: String(locked.startedAt || ''),
        finishedAt: null,
        operator: String(locked.operator || ''),
        workerPid: workerPid || undefined,
        error: '检测到安装锁，但当前进程没有安装任务状态。可能是服务重启或安装中断，请人工确认后再删除锁文件。',
      };
    }
    if (persisted) return persisted;
    return { installing: false, installId: '', version: '', filename: '', status: 'idle', step: 'idle', startedAt: null, finishedAt: null, operator: '' };
  }
  const { packagePath: _packagePath, logPath: _logPath, lockPath: _lockPath, oldVersion: _oldVersion, switchedCurrent: _switchedCurrent, ...safe } = ctx;
  return { ...safe, installing: ctx.status === 'running' };
}

function readLastInstallStatus(): InstallStatusResult | null {
  const file = lastInstallPath();
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw?.installId) return null;
    return {
      installing: false,
      installId: String(raw.installId || ''),
      version: String(raw.version || ''),
      filename: String(raw.filename || ''),
      status: raw.status || 'idle',
      step: raw.step || 'idle',
      startedAt: raw.startedAt || null,
      finishedAt: raw.finishedAt || null,
      operator: String(raw.operator || ''),
      error: raw.error || undefined,
      dbBackupPath: raw.dbBackupPath || undefined,
      codeBackupPath: raw.codeBackupPath || undefined,
      oldCurrentPath: raw.oldCurrentPath || undefined,
      releaseDir: raw.releaseDir || undefined,
      dbMigrated: !!raw.dbMigrated,
      workerPid: Number(raw.workerPid || 0) || undefined,
    };
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function persistLastInstallStatus(ctx: InstallContext) {
  fs.mkdirSync(logsDir(), { recursive: true });
  fs.writeFileSync(lastInstallPath(), JSON.stringify({
    installId: ctx.installId,
    version: ctx.version,
    filename: ctx.filename,
    status: ctx.status,
    step: ctx.step,
    startedAt: ctx.startedAt,
    finishedAt: ctx.finishedAt,
    operator: ctx.operator,
    error: ctx.error || '',
    dbBackupPath: ctx.dbBackupPath || '',
    codeBackupPath: ctx.codeBackupPath || '',
    oldCurrentPath: ctx.oldCurrentPath || '',
    releaseDir: ctx.releaseDir || '',
    dbMigrated: !!ctx.dbMigrated,
    workerPid: ctx.workerPid || 0,
  }, null, 2));
}

function writeLastInstallStatus(ctx: InstallContext) {
  persistLastInstallStatus(ctx);
}

function installContextPath(installId: string): string {
  return path.join(logsDir(), `${installId}.context.json`);
}

function writeInstallContext(ctx: InstallContext, contextPath: string) {
  fs.mkdirSync(path.dirname(contextPath), { recursive: true });
  fs.writeFileSync(contextPath, JSON.stringify(ctx, null, 2));
}

function workerScriptPath(): string {
  const workerPath = path.resolve(__dirname, '../scripts/update-install-worker.js');
  if (!fs.existsSync(workerPath)) {
    throw new Error('安装工作进程脚本不存在，请先重新构建后端');
  }
  return workerPath;
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

function startInstallWorker(ctx: InstallContext, contextPath: string): number {
  if (process.platform !== 'win32') {
    const command = `nohup ${shellQuote(process.execPath)} ${shellQuote(workerScriptPath())} ${shellQuote(contextPath)} >/dev/null 2>&1 & echo $!`;
    const result = spawnSync('sh', ['-c', command], {
      cwd: config.release.appRootDir,
      env: commandEnvironment(),
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.status !== 0 || result.error) {
      throw new Error((result.stderr || result.stdout || result.error?.message || '启动安装工作进程失败').trim());
    }
    return Number(String(result.stdout || '').trim()) || 0;
  }

  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$p = Start-Process -FilePath ${powershellQuote(process.execPath)} -ArgumentList ${powershellArray([workerScriptPath(), contextPath])} -WorkingDirectory ${powershellQuote(config.release.appRootDir)} -WindowStyle Hidden -PassThru`,
    'Write-Output $p.Id',
  ].join('; ');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    cwd: config.release.appRootDir,
    env: commandEnvironment(),
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0 || result.error) {
    throw new Error((result.stderr || result.stdout || result.error?.message || '启动安装工作进程失败').trim());
  }
  return Number(String(result.stdout || '').trim().split(/\r?\n/).pop()) || 0;
}

function appendInstallLog(ctx: InstallContext, level: InstallLogItem['level'], step: InstallStep, message: string) {
  const item: InstallLogItem = { time: nowText(), level, step, message: sanitizeLog(message) };
  fs.mkdirSync(path.dirname(ctx.logPath), { recursive: true });
  fs.appendFileSync(ctx.logPath, JSON.stringify(item) + '\n');
  ctx.step = step;
  try {
    persistLastInstallStatus(ctx);
  } catch {
    // Status persistence is best-effort; the install log remains the source of details.
  }
}

function readInstallLogsFile(installId: string): InstallLogItem[] {
  if (!installId) return [];
  const file = path.join(logsDir(), `${installId}.log`);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line) as InstallLogItem; }
      catch { return { time: nowText(), level: 'warning', step: 'cleanup', message: 'unreadable log line' }; }
    });
}

async function backupDatabase(ctx: InstallContext) {
  const { dbHost, dbPort, dbUser, dbPassword, dbName } = databaseRuntimeConfig();

  const backupDir = ensureInsideAppRoot(path.join(config.release.appRootDir, 'backups/db'));
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${timestampId()}_${ctx.version}.sql`);
  ctx.dbBackupPath = backupPath;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const out = fs.createWriteStream(backupPath, { flags: 'wx' });
    const child = spawn('mysqldump', ['--single-transaction', '--routines', '--triggers', '-h', dbHost, '-P', dbPort, '-u', dbUser, dbName], {
      env: commandEnvironment({ MYSQL_PWD: dbPassword }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      out.close();
      reject(new Error('数据库备份执行超时'));
    }, COMMAND_TIMEOUT_MS.databaseBackup);
    child.stdout.pipe(out);
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      out.close();
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      out.close();
      if (code === 0) resolve();
      else reject(new Error(sanitizeLog(stderr || `mysqldump exited with code ${code}`)));
    });
  });

  const stat = fs.statSync(backupPath);
  if (stat.size <= 0) throw new Error('database backup file is empty');
}

function normalizeDatabaseBackupPath(input?: string): string {
  const fallback = readLastInstallStatus()?.dbBackupPath || '';
  const raw = String(input || fallback || '').trim();
  if (!raw) throw new Error('未找到可导入的数据库备份路径');

  const backupDir = ensureInsideAppRoot(path.join(config.release.appRootDir, 'backups/db'));
  const base = path.resolve(backupDir);
  const target = path.resolve(path.isAbsolute(raw) ? raw : path.join(base, raw));
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    throw new Error('数据库备份路径非法，只允许导入 backups/db 目录内的备份文件');
  }
  if (!target.endsWith('.sql')) throw new Error('当前仅支持导入 .sql 数据库备份');

  const stat = fs.statSync(target);
  if (!stat.isFile()) throw new Error('数据库备份不是普通文件');
  if (stat.size <= 0) throw new Error('数据库备份文件为空');
  return target;
}

function assertRestoreCanRun() {
  if (currentInstall?.status === 'running') {
    throw new Error('安装任务正在运行，不能导入数据库备份');
  }
  if (readLock()) {
    throw new Error('检测到安装锁，请先确认没有安装任务运行，再导入数据库备份');
  }
}

async function importDatabaseSql(backupPath: string) {
  const { dbHost, dbPort, dbUser, dbPassword, dbName } = databaseRuntimeConfig();

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const input = fs.createReadStream(backupPath);
    const child = spawn('mysql', ['--binary-mode=1', '-h', dbHost, '-P', dbPort, '-u', dbUser, dbName], {
      env: commandEnvironment({ MYSQL_PWD: dbPassword }),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      input.destroy();
      reject(new Error('数据库备份导入执行超时'));
    }, COMMAND_TIMEOUT_MS.databaseRestore);

    input.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      reject(err);
    });
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.stdin.on('error', () => {
      // mysql may close stdin early after an error; the close handler reports the real failure.
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.destroy();
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.destroy();
      if (code === 0) resolve();
      else reject(new Error(sanitizeLog(stderr || stdout || `mysql exited with code ${code}`)));
    });
    input.pipe(child.stdin);
  });
}

async function backupCode(ctx: InstallContext) {
  if (!ctx.oldCurrentPath) throw new Error('old current path is empty');
  const backupDir = ensureInsideAppRoot(path.join(config.release.appRootDir, 'backups/code'));
  fs.mkdirSync(backupDir, { recursive: true });
  const oldName = path.basename(ctx.oldCurrentPath);
  const backupPath = path.join(backupDir, `${timestampId()}_${oldName}_${ctx.version}.tar.gz`);
  ctx.codeBackupPath = backupPath;
  await tar.c({ gzip: true, file: backupPath, cwd: path.dirname(ctx.oldCurrentPath) }, [oldName]);
}

async function extractRelease(ctx: InstallContext) {
  if (fs.existsSync(ctx.releaseDir)) throw new Error(`release directory already exists: ${ctx.releaseDir}`);
  fs.mkdirSync(ctx.releaseDir, { recursive: false });
  await tar.x({ file: ctx.packagePath, cwd: ctx.releaseDir });
  assertReleaseVersion(ctx.releaseDir, ctx.version);
  cleanupOrphanAdminAssetsBestEffort(ctx, 'extract_release');
}

function prepareEnv(ctx: InstallContext) {
  const sharedEnv = path.join(config.release.appRootDir, 'shared/.env');
  const targetEnv = path.join(ctx.releaseDir, 'server/.env');
  if (!fs.existsSync(sharedEnv)) throw new Error('shared/.env not found');
  if (fs.existsSync(targetEnv)) throw new Error('release unexpectedly contains server/.env');
  try {
    fs.symlinkSync(sharedEnv, targetEnv, 'file');
  } catch {
    fs.copyFileSync(sharedEnv, targetEnv);
  }
}

async function scanMigrationsForDanger(ctx: InstallContext) {
  const sqlDirs = [
    path.join(ctx.releaseDir, 'server/src/migrations'),
    path.join(ctx.releaseDir, 'server/src/db'),
  ];
  for (const sqlDir of sqlDirs) {
    if (!fs.existsSync(sqlDir)) continue;
    const files = fs.readdirSync(sqlDir).filter(file => file.endsWith('.sql'));
    for (const file of files) {
      const text = fs.readFileSync(path.join(sqlDir, file), 'utf8');
      const executableSql = stripSqlLiteralsAndComments(text);
      if (UNSUPPORTED_SQL_ROUTINE_PATTERN.test(executableSql)) {
        throw new Error(`unsupported SQL routine/delimiter found in SQL source file: ${path.relative(ctx.releaseDir, path.join(sqlDir, file))}`);
      }
      if (FORBIDDEN_SQL_PATTERN.test(executableSql)) {
        throw new Error(`forbidden SQL statement found in SQL source file: ${path.relative(ctx.releaseDir, path.join(sqlDir, file))}`);
      }
    }
  }
}

function stripSqlLiteralsAndComments(sql: string): string {
  let output = '';
  let quote: "'" | '"' | '`' | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  let atLineStart = true;

  for (let i = 0; i < sql.length; i += 1) {
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
        i += 1;
      } else if (ch === '\n' || ch === '\r') {
        output += ch;
        atLineStart = true;
      }
      continue;
    }

    if (quote) {
      if (ch === '\\') {
        if (next) i += 1;
        continue;
      }
      if (ch === quote) {
        if (quote === "'" && next === "'") {
          i += 1;
          continue;
        }
        quote = null;
      }
      output += ' ';
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      output += ' ';
      atLineStart = false;
      continue;
    }

    if (ch === '-' && next === '-' && (atLineStart || sql[i + 2] === undefined || /\s/.test(sql[i + 2]))) {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (ch === '#') {
      inLineComment = true;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
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

function currentPath(): string {
  return ensureInsideAppRoot(path.join(config.release.appRootDir, 'current'));
}

function pathExistsOrLink(targetPath: string): boolean {
  try {
    fs.lstatSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

function verifyCurrentTarget(expectedTarget: string): string {
  const target = path.resolve(expectedTarget);
  const current = currentPath();
  if (!fs.existsSync(current)) throw new Error('current 软链接不存在');
  const stat = fs.lstatSync(current);
  if (!stat.isSymbolicLink()) throw new Error('current 已存在但不是符号链接');
  const actual = fs.realpathSync(current);
  if (!samePathOrReal(actual, target)) {
    throw new Error(`current 指向不正确，期望 ${target}，实际 ${actual}`);
  }
  return actual;
}

async function switchCurrent(ctx: InstallContext, targetDir = ctx.releaseDir) {
  const currentPath = ensureInsideAppRoot(path.join(config.release.appRootDir, 'current'));
  const targetPath = ensureInsideAppRoot(targetDir);
  if (!fs.existsSync(targetPath)) throw new Error(`目标 release 目录不存在：${targetPath}`);
  replaceCurrentLink(currentPath, targetPath);
  ctx.switchedCurrent = true;
  return verifyCurrentTarget(targetPath);
}

function replaceCurrentLink(currentPath: string, targetPath: string): void {
  const tempLink = ensureInsideAppRoot(`${currentPath}.next-${process.pid}-${Date.now()}`);
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(path.resolve(targetPath), tempLink, linkType);
  try {
    if (pathExistsOrLink(currentPath)) {
      const stat = fs.lstatSync(currentPath);
      if (!stat.isSymbolicLink()) {
        throw new Error('current exists but is not a symbolic link; refusing to overwrite it');
      }
      fs.rmSync(currentPath, { recursive: true, force: true });
    }
    fs.renameSync(tempLink, currentPath);
  } catch (err) {
    try { fs.rmSync(tempLink, { recursive: true, force: true }); } catch {}
    throw err;
  }
}

function pm2CommandOptions(serverDir: string) {
  return {
    appRoot: config.release.appRootDir,
    serverDir,
    appName: releasePm2AppName(),
    port: releasePort(),
    timeoutMs: COMMAND_TIMEOUT_MS.pm2,
  };
}

async function runPm2Checked(args: string[], serverDir: string) {
  const result = await runPm2Command(args, pm2CommandOptions(serverDir));
  if (result.code !== 0) {
    const output = safeError(new Error(`${result.stdout}\n${result.stderr}`.trim()));
    throw new Error(`pm2 ${args.join(' ')} 执行失败，退出码 ${result.code}${output ? `：${output}` : ''}`);
  }
  return result;
}

function samePathOrReal(actual: string, expected: string): boolean {
  if (!actual) return false;
  const actualResolved = path.resolve(actual);
  const expectedResolved = path.resolve(expected);
  if (actualResolved === expectedResolved) return true;
  try {
    return fs.realpathSync(actualResolved) === fs.realpathSync(expectedResolved);
  } catch {
    return false;
  }
}

interface PortListenerInfo {
  pid: number;
  command: string;
  cwd: string;
}

function readLinuxProcText(pid: number, name: string): string {
  if (process.platform === 'win32') return '';
  try {
    return fs.readFileSync(`/proc/${pid}/${name}`, 'utf8').replace(/\0/g, ' ').trim();
  } catch {
    return '';
  }
}

function readLinuxProcCwd(pid: number): string {
  if (process.platform === 'win32') return '';
  try {
    return fs.realpathSync(`/proc/${pid}/cwd`);
  } catch {
    return '';
  }
}

function isPathInside(target: string, root: string): boolean {
  if (!target) return false;
  const resolvedTarget = path.resolve(target);
  const resolvedRoot = path.resolve(root);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
}

function listPortListeners(port: number): PortListenerInfo[] {
  if (process.platform === 'win32' || !Number.isInteger(port) || port <= 0) return [];
  const result = spawnSync('ss', ['-ltnp'], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0 || result.error) return [];

  const listeners: PortListenerInfo[] = [];
  for (const line of String(result.stdout || '').split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    const localAddress = columns[3] || '';
    if (!localAddress.endsWith(`:${port}`)) continue;

    for (const match of line.matchAll(/pid=(\d+)/g)) {
      const pid = Number(match[1]);
      if (!Number.isInteger(pid) || pid <= 0) continue;
      listeners.push({
        pid,
        command: readLinuxProcText(pid, 'cmdline') || readLinuxProcText(pid, 'comm'),
        cwd: readLinuxProcCwd(pid),
      });
    }
  }

  return listeners.filter((item, index, all) => all.findIndex(other => other.pid === item.pid) === index);
}

function portListenerSummary(listener: PortListenerInfo): string {
  return `pid=${listener.pid}, cwd=${listener.cwd || '-'}, command=${listener.command || '-'}`;
}

function isManagedAppRootListener(listener: PortListenerInfo): boolean {
  if (listener.pid === process.pid) return false;
  const appRoot = appRootPath();
  return isPathInside(listener.cwd, appRoot) || listener.command.includes(appRoot);
}

async function waitForPortFree(port: number, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  do {
    if (listPortListeners(port).length === 0) return true;
    await sleep(500);
  } while (Date.now() - startedAt < timeoutMs);
  return listPortListeners(port).length === 0;
}

async function terminatePortListener(listener: PortListenerInfo, port: number): Promise<void> {
  try {
    process.kill(listener.pid, 'SIGTERM');
  } catch {
    return;
  }
  if (await waitForPortFree(port, 5000)) return;
  try {
    process.kill(listener.pid, 'SIGKILL');
  } catch {
    // The process may have exited after the last check.
  }
  await waitForPortFree(port, 2000);
}

async function ensureReleasePortAvailable(ctx: InstallContext | undefined, step: InstallStep, port: number) {
  if (process.platform === 'win32') return;
  if (await waitForPortFree(port, 5000)) return;

  const listeners = listPortListeners(port);
  const external = listeners.filter(listener => !isManagedAppRootListener(listener));
  if (external.length > 0) {
    throw new Error(`PORT ${port} is already used by non-release process: ${external.map(portListenerSummary).join('; ')}`);
  }

  for (const listener of listeners) {
    if (ctx) appendInstallLog(ctx, 'warning', step, `发现旧版本进程仍占用端口 ${port}，准备结束：${portListenerSummary(listener)}`);
    await terminatePortListener(listener, port);
  }

  const remaining = listPortListeners(port);
  if (remaining.length > 0) {
    throw new Error(`PORT ${port} is still occupied after cleanup: ${remaining.map(portListenerSummary).join('; ')}`);
  }
}

async function getPm2CurrentProcess(serverDir: string): Promise<any | null> {
  const result = await runPm2Command(['jlist'], pm2CommandOptions(serverDir));
  if (result.code !== 0) return null;
  try {
    const list = JSON.parse(result.stdout || '[]') as any[];
    return list.find(item => item?.name === releasePm2AppName()) || null;
  } catch {
    return null;
  }
}

async function waitForPm2Current(serverDir: string) {
  const expectedEntry = path.join(serverDir, 'dist/index.js');
  let lastStatus = '';
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const processInfo = await getPm2CurrentProcess(serverDir);
    const env = processInfo?.pm2_env || {};
    lastStatus = env.status || 'not_found';
    const cwdOk = samePathOrReal(env.pm_cwd || '', serverDir);
    const entryOk = samePathOrReal(env.pm_exec_path || '', expectedEntry);
    if (lastStatus === 'online' && cwdOk && entryOk) return;
    await sleep(2000);
  }
  throw new Error(`PM2 未运行新版本目录，当前状态：${lastStatus}`);
}

function pm2ProcessSummary(processInfo: any | null): string {
  if (!processInfo) return 'PM2 进程未找到';
  const env = processInfo.pm2_env || {};
  return [
    `name=${processInfo.name || '-'}`,
    `status=${env.status || '-'}`,
    `cwd=${env.pm_cwd || '-'}`,
    `script=${env.pm_exec_path || '-'}`,
  ].join(', ');
}

function isPm2AppNotFound(output: string): boolean {
  return /not found|does not exist|not launched|unknown process|process or namespace not found/i.test(output);
}

async function restartPm2Current(ctx?: InstallContext, step: InstallStep = 'pm2_reload') {
  const currentServerDir = ensureInsideAppRoot(path.join(config.release.appRootDir, 'current/server'));
  const entry = path.join(currentServerDir, 'dist/index.js');
  if (!fs.existsSync(entry)) throw new Error(`新版本启动文件不存在：${entry}`);
  const appName = releasePm2AppName();

  const before = await getPm2CurrentProcess(currentServerDir);
  if (ctx) appendInstallLog(ctx, 'info', step, `PM2 重新绑定到 current/server，旧状态：${pm2ProcessSummary(before)}`);

  const deleted = await runPm2Command(['delete', appName], pm2CommandOptions(currentServerDir));
  if (deleted.code !== 0) {
    const output = `${deleted.stdout}\n${deleted.stderr}`.trim();
    if (output && !isPm2AppNotFound(output)) {
      throw new Error(`pm2 delete ${appName} 执行失败，退出码 ${deleted.code}：${output}`);
    }
    if (ctx) appendInstallLog(ctx, 'warning', step, `PM2 进程不存在，改为启动新进程：${appName}`);
  }

  await ensureReleasePortAvailable(ctx, step, releasePort());
  await runPm2Checked(['start', 'dist/index.js', '--name', appName, '--update-env', '--max-restarts', '30', '--restart-delay', '3000'], currentServerDir);
  await runPm2Checked(['save'], currentServerDir);
  await waitForPm2Current(currentServerDir);

  if (ctx) {
    const processInfo = await getPm2CurrentProcess(currentServerDir);
    appendInstallLog(ctx, 'info', step, `PM2 重启完成：${pm2ProcessSummary(processInfo)}`);
  }
}

async function curlWithRetry(ctx: InstallContext, args: string[], label: string): Promise<string> {
  let lastError = '';
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const output = await execCommand('curl', args, config.release.appRootDir, undefined, COMMAND_TIMEOUT_MS.health);
      if (attempt > 1) appendInstallLog(ctx, 'info', 'health_check', `${label} passed on attempt ${attempt}`);
      return output;
    } catch (err: any) {
      lastError = safeError(err);
      if (attempt < 5) {
        appendInstallLog(ctx, 'warning', 'health_check', `${label} failed on attempt ${attempt}; retrying in 3 seconds`);
        await sleep(3000);
      }
    }
  }
  throw new Error(`${label} failed after 5 attempts: ${lastError}`);
}

function readReleaseJsonVersionSafe(releaseDir: string): string {
  try {
    return readReleaseJsonVersion(releaseDir);
  } catch (err: any) {
    return `读取失败：${safeError(err)}`;
  }
}

function currentRuntimeSummary(): string {
  const current = currentPath();
  let linkTarget: string;
  let realTarget: string;
  let version = '-';
  let entryExists = false;
  try {
    linkTarget = fs.readlinkSync(current);
  } catch {
    linkTarget = '不是符号链接或无法读取';
  }
  try {
    realTarget = fs.realpathSync(current);
    version = readReleaseJsonVersionSafe(realTarget);
    entryExists = fs.existsSync(path.join(realTarget, 'server/dist/index.js'));
  } catch (err: any) {
    realTarget = `解析失败：${safeError(err)}`;
  }
  return `current=${current}, linkTarget=${linkTarget}, realTarget=${realTarget}, releaseVersion=${version}, distIndex=${entryExists ? 'exists' : 'missing'}`;
}

async function appendHealthFailureDiagnostics(ctx: InstallContext, healthOutput: string) {
  appendInstallLog(ctx, 'error', 'health_check', `诊断 current：${currentRuntimeSummary()}`);
  appendInstallLog(ctx, 'error', 'health_check', `诊断目标 release：path=${ctx.releaseDir}, releaseVersion=${readReleaseJsonVersionSafe(ctx.releaseDir)}, distIndex=${fs.existsSync(path.join(ctx.releaseDir, 'server/dist/index.js')) ? 'exists' : 'missing'}`);
  appendInstallLog(ctx, 'error', 'health_check', `诊断健康检查：url=${releaseHealthCheckUrl()}, response=${sanitizeLog(healthOutput || '无返回').slice(0, 1000)}`);
  try {
    const processInfo = await getPm2CurrentProcess(path.join(config.release.appRootDir, 'current/server'));
    appendInstallLog(ctx, 'error', 'health_check', `诊断 PM2：${pm2ProcessSummary(processInfo)}`);
  } catch (err: any) {
    appendInstallLog(ctx, 'error', 'health_check', `诊断 PM2 失败：${safeError(err)}`);
  }
}

async function healthCheck(ctx: InstallContext) {
  const healthUrl = releaseHealthCheckUrl();
  appendInstallLog(ctx, 'info', 'health_check', `读取 HEALTH_CHECK_URL：${healthUrl}`);
  let healthOutput = '';
  let diagnosticsWritten = false;
  const writeDiagnostics = async () => {
    if (diagnosticsWritten) return;
    diagnosticsWritten = true;
    await appendHealthFailureDiagnostics(ctx, healthOutput);
  };
  try {
    healthOutput = await curlWithRetry(ctx, ['-fsS', healthUrl], 'health check');
    const parsed = JSON.parse(healthOutput || '{}');
    if (parsed.releaseVersion !== ctx.version) {
      await writeDiagnostics();
      throw new Error(`健康检查版本不匹配，期望 ${ctx.version}，实际 ${parsed.releaseVersion || '未返回 releaseVersion'}`);
    }
    appendInstallLog(ctx, 'info', 'health_check', `健康检查通过：releaseVersion=${parsed.releaseVersion}`);
  } catch (err: any) {
    await writeDiagnostics();
    const message = err instanceof SyntaxError ? '健康检查返回内容不是合法 JSON' : err?.message;
    throw new Error(message || '健康检查失败', { cause: err });
  }

  if (config.release.systemCheckUrl && config.release.systemCheckToken) {
    await curlWithRetry(ctx, ['-fsS', '-H', `Authorization: Bearer ${config.release.systemCheckToken}`, config.release.systemCheckUrl], 'system check');
  } else if (config.release.systemCheckUrl) {
    appendInstallLog(ctx, 'warning', 'health_check', 'SYSTEM_CHECK_TOKEN is not configured; skipped protected system check URL');
  }
}

async function rollbackCurrent(ctx: InstallContext) {
  if (!ctx.oldCurrentPath) throw new Error('old current path is empty; cannot rollback');
  appendInstallLog(ctx, 'warning', 'rollback', `回滚 current 到旧版本：${ctx.oldCurrentPath}`);
  const actual = await switchCurrent(ctx, ctx.oldCurrentPath);
  appendInstallLog(ctx, 'warning', 'rollback', `current 回滚完成：${actual}`);
  await restartPm2Current(ctx, 'rollback');
}

async function writeReleaseRecord(ctx: InstallContext, status: string, message: string) {
  try {
    await query(
      `INSERT INTO app_releases (version, release_name, package_name, status, installed_at, note)
       VALUES (?, ?, ?, ?, NOW(3), ?)
       ON DUPLICATE KEY UPDATE release_name = VALUES(release_name), package_name = VALUES(package_name), status = VALUES(status), installed_at = VALUES(installed_at), note = VALUES(note)`,
      [ctx.version, ctx.version, ctx.filename, status === 'success' ? 'installed' : status, message],
    );
  } catch (err: any) {
    appendInstallLog(ctx, 'warning', 'write_release_record', `failed to write app_releases: ${safeError(err)}`);
  }

  try {
    await query(
      `INSERT INTO release_update_logs (version_from, version_to, status, message, backup_path, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(3))`,
      [ctx.oldVersion || '', ctx.version, status, message, ctx.dbBackupPath || ctx.codeBackupPath || '', ctx.startedAt || nowText()],
    );
  } catch (err: any) {
    appendInstallLog(ctx, 'warning', 'write_release_record', `failed to write release_update_logs: ${safeError(err)}`);
  }

  try {
    writeLastInstallStatus(ctx);
  } catch (err: any) {
    appendInstallLog(ctx, 'warning', 'write_release_record', `failed to write last install status: ${safeError(err)}`);
  }
}

async function runInstall(ctx: InstallContext) {
  currentInstall = ctx;
  lastInstall = ctx;
  try {
    appendInstallLog(ctx, 'info', 'precheck', `start installing ${ctx.version}`);

    appendInstallLog(ctx, 'info', 'backup_database', 'backing up database');
    await backupDatabase(ctx);
    appendInstallLog(ctx, 'info', 'backup_database', `database backup completed: ${ctx.dbBackupPath}`);

    appendInstallLog(ctx, 'info', 'backup_code', 'backing up current code');
    await backupCode(ctx);
    appendInstallLog(ctx, 'info', 'backup_code', `code backup completed: ${ctx.codeBackupPath}`);

    appendInstallLog(ctx, 'info', 'extract_release', `extracting package into ${ctx.releaseDir}`);
    await extractRelease(ctx);
    appendInstallLog(ctx, 'info', 'extract_release', `解压完成：release.json version=${readReleaseJsonVersion(ctx.releaseDir)}`);

    appendInstallLog(ctx, 'info', 'prepare_env', 'linking shared .env');
    prepareEnv(ctx);

    appendInstallLog(ctx, 'info', 'install_dependencies', 'running npm ci --include=dev');
    await execCommand('npm', ['ci', '--include=dev'], path.join(ctx.releaseDir, 'server'), undefined, COMMAND_TIMEOUT_MS.npmInstall);

    appendInstallLog(ctx, 'info', 'check_encoding', 'running encoding check');
    await execCommand('npm', ['run', 'check:encoding'], path.join(ctx.releaseDir, 'server'));

    appendInstallLog(ctx, 'info', 'build_or_check', 'running server build');
    await execCommand('npm', ['run', 'build'], path.join(ctx.releaseDir, 'server'), undefined, COMMAND_TIMEOUT_MS.build);

    appendInstallLog(ctx, 'info', 'build_or_check', 'running admin-web npm ci --include=dev');
    await execCommand('npm', ['ci', '--include=dev'], path.join(ctx.releaseDir, 'admin-web'), undefined, COMMAND_TIMEOUT_MS.npmInstall);

    appendInstallLog(ctx, 'info', 'build_or_check', 'running admin-web build');
    await execCommand('npm', ['run', 'build'], path.join(ctx.releaseDir, 'admin-web'), undefined, COMMAND_TIMEOUT_MS.build);
    cleanupOrphanAdminAssetsBestEffort(ctx, 'build_or_check');
    assertReleaseVersion(ctx.releaseDir, ctx.version);
    assertServerEntryExists(ctx.releaseDir);
    assertUserWebDistExists(ctx.releaseDir);
    appendInstallLog(ctx, 'info', 'build_or_check', '构建完成：server/dist/index.js 和 user-web/dist 已生成，release.json 版本已确认');

    if (process.platform === 'linux') {
      appendInstallLog(ctx, 'info', 'build_or_check', 'running deploy self-check');
      await execCommand('npm', ['run', 'check:deploy'], path.join(ctx.releaseDir, 'server'));
    } else {
      appendInstallLog(ctx, 'warning', 'build_or_check', `skipped Linux deploy self-check on ${process.platform}; production Linux updates still run check:deploy`);
    }

    appendInstallLog(ctx, 'info', 'run_migration', 'checking migrations');
    await scanMigrationsForDanger(ctx);
    appendInstallLog(ctx, 'info', 'run_migration', 'running db:migrate');
    await execCommand('npm', ['run', 'db:migrate'], path.join(ctx.releaseDir, 'server'), undefined, COMMAND_TIMEOUT_MS.migration);
    ctx.dbMigrated = true;
    appendInstallLog(ctx, 'info', 'run_migration', '迁移完成：db:migrate passed');

    appendInstallLog(ctx, 'info', 'switch_current', `switching current to ${ctx.releaseDir}`);
    const currentTarget = await switchCurrent(ctx);
    appendInstallLog(ctx, 'info', 'switch_current', `current 切换完成：${currentTarget}`);

    appendInstallLog(ctx, 'info', 'pm2_reload', `restarting PM2 app ${releasePm2AppName()} from current/server`);
    await restartPm2Current(ctx);

    appendInstallLog(ctx, 'info', 'health_check', 'running health checks');
    await healthCheck(ctx);

    appendInstallLog(ctx, 'info', 'cleanup', `writing stable install lock: ${path.join(config.release.appRootDir, 'shared/.env.installed')}`);
    writeInstallLock(undefined, {
      releaseVersion: ctx.version,
      appRootDir: config.release.appRootDir,
      pm2AppName: releasePm2AppName(),
      healthCheckUrl: releaseHealthCheckUrl(),
    });

    appendInstallLog(ctx, 'info', 'cleanup', 'cleaning release build dependencies');
    try {
      await execCommand('npm', ['prune', '--omit=dev'], path.join(ctx.releaseDir, 'server'));
    } catch (cleanupErr: any) {
      appendInstallLog(ctx, 'warning', 'cleanup', `server dev dependencies cleanup failed: ${safeError(cleanupErr)}`);
    }
    try {
      fs.rmSync(path.join(ctx.releaseDir, 'admin-web/node_modules'), { recursive: true, force: true });
    } catch (cleanupErr: any) {
      appendInstallLog(ctx, 'warning', 'cleanup', `admin-web node_modules cleanup failed: ${safeError(cleanupErr)}`);
    }

    ctx.status = 'success';
    ctx.finishedAt = nowText();
    appendInstallLog(ctx, 'info', 'write_release_record', 'writing release records');
    await writeReleaseRecord(ctx, 'success', 'install completed');
    appendInstallLog(ctx, 'info', 'cleanup', 'install completed successfully');
  } catch (err: any) {
    const baseError = safeError(err);
    ctx.error = ctx.dbMigrated
      ? `${baseError}；数据库迁移已执行，代码未确认成功。请保留数据库备份 ${ctx.dbBackupPath || '未生成'}，必要时人工恢复后再重试。`
      : baseError;
    appendInstallLog(ctx, 'error', ctx.step === 'idle' ? 'precheck' : ctx.step as InstallStep, ctx.error);
    if (ctx.switchedCurrent) {
      appendInstallLog(ctx, 'warning', 'rollback', 'failure happened after current switch; rolling back code');
      try {
        await rollbackCurrent(ctx);
        ctx.status = 'rollback_success';
        const dbNote = ctx.dbMigrated
          ? ` 数据库已迁移且未自动回滚。若需恢复，请使用数据库备份：${ctx.dbBackupPath || '备份路径未记录'}，通过后台"数据库备份恢复"功能手动导入。`
          : '';
        appendInstallLog(ctx, 'warning', 'rollback', `code rollback completed; database was not restored automatically.${dbNote}`);
      } catch (rollbackErr: any) {
        ctx.status = 'rollback_failed';
        appendInstallLog(ctx, 'error', 'rollback', `code rollback failed: ${safeError(rollbackErr)}`);
      }
    } else {
      ctx.status = 'failed';
      appendInstallLog(ctx, 'error', 'cleanup', 'install failed before current switch; current was not changed');
    }
    ctx.finishedAt = nowText();
    await writeReleaseRecord(ctx, ctx.status, ctx.error || 'install failed');
  } finally {
    appendInstallLog(ctx, 'info', 'cleanup', 'releasing install lock');
    try {
      if (fs.existsSync(ctx.lockPath)) fs.unlinkSync(ctx.lockPath);
    } catch (err: any) {
      appendInstallLog(ctx, 'warning', 'cleanup', `failed to remove install lock: ${safeError(err)}`);
    }
    try {
      writeLastInstallStatus(ctx);
    } catch (err: any) {
      appendInstallLog(ctx, 'warning', 'cleanup', `failed to persist last install status: ${safeError(err)}`);
    }
    currentInstall = null;
    lastInstall = ctx;
  }
}

export async function startInstallUpdatePackage(filename: string, confirmText: string, operator: string): Promise<StartInstallResult> {
  const safePath = safePackagePath(filename);
  if (!safePath.ok || !safePath.path) return { ok: false, message: safePath.error || 'invalid filename' };

  const locked = readLock();
  if (locked) {
    return { ok: false, message: '检测到安装锁，可能有安装任务正在运行或上次安装中断。请先在后台查看安装状态和日志，人工确认后再处理锁文件。' };
  }
  if (currentInstall?.status === 'running') return { ok: false, message: '已有安装任务正在运行，请勿重复点击安装' };

  const precheck = await precheckUpdatePackage(filename);
  if (!precheck.ok || precheck.errors.length > 0) return { ok: false, message: `预检查失败：${precheck.errors.join('；')}` };
  if (!precheck.version) return { ok: false, message: '未识别到发布包版本号' };
  if (!precheck.isNewerThanCurrent) {
    return { ok: false, message: `目标版本 ${precheck.version} 必须高于当前版本 ${precheck.currentVersion || 'unknown'}，普通更新不允许安装同版本或旧版本` };
  }
  if (confirmText !== precheck.version) return { ok: false, message: '确认文本必须与 release.json.version 完全一致' };

  const releaseDir = ensureInsideAppRoot(path.join(config.release.appRootDir, 'releases', precheck.version));
  if (fs.existsSync(releaseDir)) return { ok: false, message: `release directory already exists: ${releaseDir}` };

  let layoutState: { oldCurrentPath: string; warnings: string[] };
  try {
    layoutState = ensureReleaseRuntimeLayout();
  } catch (err: any) {
    return { ok: false, message: `failed to prepare release runtime layout: ${safeError(err)}` };
  }

  const installId = `${precheck.version}_${timestampId()}`;
  const ctx: InstallContext = {
    installing: true,
    installId,
    version: precheck.version,
    filename,
    status: 'running',
    step: 'precheck',
    startedAt: nowText(),
    finishedAt: null,
    operator,
    packagePath: safePath.path,
    releaseDir,
    oldVersion: precheck.currentVersion || '',
    oldCurrentPath: layoutState.oldCurrentPath,
    switchedCurrent: false,
    dbMigrated: false,
    lockPath: lockPath(),
    logPath: path.join(logsDir(), `${installId}.log`),
  };

  writeLock(ctx);
  appendInstallLog(ctx, 'info', 'lock', 'install lock acquired');
  if (layoutState.warnings.length > 0) {
    appendInstallLog(ctx, 'warning', 'precheck', `release runtime layout initialized: ${layoutState.warnings.join('; ')}`);
  }
  if (precheck.warnings.length > 0) {
    appendInstallLog(ctx, 'warning', 'precheck', `precheck warnings: ${precheck.warnings.join('; ')}`);
  }

  const contextPath = installContextPath(installId);
  try {
    writeInstallContext(ctx, contextPath);
    ctx.workerPid = startInstallWorker(ctx, contextPath);
    writeLock(ctx);
    writeInstallContext(ctx, contextPath);
    writeLastInstallStatus(ctx);
    appendInstallLog(ctx, 'info', 'lock', `install worker started: pid ${ctx.workerPid || 'unknown'}`);
  } catch (err: any) {
    ctx.status = 'failed';
    ctx.error = `安装工作进程启动失败：${safeError(err)}`;
    ctx.finishedAt = nowText();
    appendInstallLog(ctx, 'error', 'lock', ctx.error);
    try {
      if (fs.existsSync(ctx.lockPath)) fs.unlinkSync(ctx.lockPath);
    } catch {
      // Keep the original start failure as the API response.
    }
    writeLastInstallStatus(ctx);
    return { ok: false, message: ctx.error };
  }

  return { ok: true, installId, message: '安装任务已开始' };
}

export function getInstallStatus(): InstallStatusResult {
  if (currentInstall) return releaseStatusFromContext(currentInstall);
  if (readLock()) return releaseStatusFromContext(null);
  return releaseStatusFromContext(lastInstall);
}

export function getInstallLogs(installId?: string): InstallLogsResult {
  const locked = readLock();
  const persisted = readLastInstallStatus();
  const id = installId || currentInstall?.installId || locked?.installId || lastInstall?.installId || persisted?.installId || '';
  return { installId: id, logs: readInstallLogsFile(id) };
}

export async function restoreDatabaseBackup(backupPath?: string): Promise<RestoreDatabaseBackupResult> {
  assertRestoreCanRun();
  const target = normalizeDatabaseBackupPath(backupPath);
  await importDatabaseSql(target);
  return {
    ok: true,
    message: '数据库备份导入完成',
    backupPath: target,
    restoredAt: nowText(),
  };
}

export async function runInstallWorkerFromContextFile(contextPath: string): Promise<void> {
  if (!contextPath) throw new Error('missing update install context path');
  const resolvedContextPath = ensureInsideAppRoot(contextPath);
  const raw = JSON.parse(fs.readFileSync(resolvedContextPath, 'utf8')) as InstallContext;
  raw.workerPid = process.pid;
  raw.installing = true;
  raw.status = 'running';
  raw.finishedAt = null;
  writeLock(raw);
  writeInstallContext(raw, resolvedContextPath);
  appendInstallLog(raw, 'info', 'lock', `install worker is running: pid ${process.pid}`);
  await runInstall(raw);
}
