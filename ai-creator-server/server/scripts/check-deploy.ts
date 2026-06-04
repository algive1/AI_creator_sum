import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/utils/config';
import { collectEnvironmentReadiness, evaluateInstallStatus, isStrongProductionSecret } from '../src/services/install-readiness.service';

type CheckStatus = 'ok' | 'warning' | 'fail';

interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  details?: Record<string, unknown>;
}

const results: CheckResult[] = [];
const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..');
const configuredAppRoot = String(process.env.APP_ROOT_DIR || config.release.appRootDir || '').trim();
const appRoot = configuredAppRoot && fs.existsSync(configuredAppRoot) ? path.resolve(configuredAppRoot) : repoRoot;
const serverNodeModules = path.join(serverRoot, 'node_modules');
const adminWebNodeModules = path.join(repoRoot, 'admin-web', 'node_modules');
const serverDist = path.join(serverRoot, 'dist');
const adminWebDist = path.join(repoRoot, 'admin-web', 'dist');

function addCheck(name: string, status: CheckStatus, message: string, details?: Record<string, unknown>): void {
  results.push({ name, status, message, details });
}

function isProduction(): boolean {
  return String(process.env.NODE_ENV || config.nodeEnv || '').toLowerCase() === 'production';
}

function resolveLocalUploadDir(): string {
  const configured = String(process.env.LOCAL_UPLOAD_DIR || '').trim();
  if (configured) return path.resolve(configured);
  return path.join(appRoot, 'uploads');
}

function resolveUpdatePackagesDir(): string {
  const configured = String(process.env.UPDATE_PACKAGES_DIR || '').trim();
  if (configured) return path.resolve(configured);
  return path.join(appRoot, 'update-packages');
}

function ensureWritableDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, `.check-deploy-${process.pid}-${Date.now()}.tmp`);
  fs.writeFileSync(probe, 'ok');
  fs.unlinkSync(probe);
}

function collectDirs(root: string, depth = 0, maxDepth = 2, output: string[] = []): string[] {
  if (depth > maxDepth || !fs.existsSync(root)) return output;
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) return output;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(root, entry.name);
    output.push(full);
    if (!entry.name.startsWith('.') && depth < maxDepth) {
      collectDirs(full, depth + 1, maxDepth, output);
    }
  }

  return output;
}

function hasForeignPlatformPackages(nodeModulesDir: string): string[] {
  if (!fs.existsSync(nodeModulesDir)) return [];

  const foreignTagsByPlatform: Record<string, string[]> = {
    win32: ['linux', 'darwin', 'freebsd', 'openbsd', 'sunos', 'aix', 'android', 'musl'],
    linux: ['win32', 'darwin', 'freebsd', 'openbsd', 'sunos', 'aix', 'android'],
    darwin: ['win32', 'linux', 'freebsd', 'openbsd', 'sunos', 'aix', 'android', 'musl'],
  };
  const foreignTags = foreignTagsByPlatform[process.platform] || [];
  const dirs = collectDirs(nodeModulesDir);
  return dirs
    .map(dir => path.relative(nodeModulesDir, dir).replace(/\\/g, '/'))
    .filter(rel => rel && foreignTags.some(tag => rel.toLowerCase().includes(tag)));
}

function formatDetails(details: Record<string, unknown> | undefined): string {
  if (!details) return '';
  const parts = Object.entries(details).map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

async function checkPlatform(): Promise<void> {
  const status: CheckStatus = process.platform === 'linux' ? 'ok' : (isProduction() ? 'fail' : 'warning');
  addCheck('current platform', status, `${process.platform}/${process.arch}`, {
    expected: 'linux',
  });
}

async function checkNodeModules(): Promise<void> {
  if (!fs.existsSync(serverNodeModules)) {
    addCheck('server/node_modules', 'fail', 'server/node_modules is missing');
    return;
  }

  try {
    await import('sharp');
    addCheck('sharp native module', 'ok', 'sharp loaded successfully');
  } catch (err: any) {
    addCheck('sharp native module', 'fail', 'sharp failed to load', {
      error: err?.message || String(err),
    });
  }

  const serverForeign = hasForeignPlatformPackages(serverNodeModules);
  if (serverForeign.length > 0) {
    addCheck('server node_modules platform', 'fail', 'foreign platform packages found in server/node_modules', {
      matches: serverForeign.slice(0, 20),
      count: serverForeign.length,
    });
  } else {
    addCheck('server node_modules platform', 'ok', 'no foreign platform packages detected in server/node_modules');
  }

  if (!fs.existsSync(adminWebNodeModules)) {
    addCheck('admin-web/node_modules', 'ok', 'admin-web/node_modules is absent after build cleanup');
    return;
  }

  const adminForeign = hasForeignPlatformPackages(adminWebNodeModules);
  if (adminForeign.length > 0) {
    addCheck('admin-web node_modules platform', 'fail', 'foreign platform packages found in admin-web/node_modules', {
      matches: adminForeign.slice(0, 20),
      count: adminForeign.length,
    });
  } else {
    addCheck('admin-web node_modules platform', 'ok', 'no foreign platform packages detected in admin-web/node_modules');
  }
}

function checkBuildOutputs(): void {
  addCheck('server build output', fs.existsSync(path.join(serverDist, 'index.js')) ? 'ok' : 'fail', fs.existsSync(path.join(serverDist, 'index.js')) ? 'server/dist/index.js exists' : 'server/dist/index.js is missing');
  addCheck('admin-web build output', fs.existsSync(path.join(adminWebDist, 'index.html')) ? 'ok' : 'fail', fs.existsSync(path.join(adminWebDist, 'index.html')) ? 'admin-web/dist/index.html exists' : 'admin-web/dist/index.html is missing');
}

function checkRequiredFiles(): void {
  const requiredFiles = [
    ['server/package.json', path.join(serverRoot, 'package.json')],
    ['server/package-lock.json', path.join(serverRoot, 'package-lock.json')],
    ['server/tsconfig.json', path.join(serverRoot, 'tsconfig.json')],
    ['server/.env.production.example', path.join(serverRoot, '.env.production.example')],
  ] as const;
  const advisoryFiles = [
    ['docs/DEPLOYMENT.md', path.join(repoRoot, 'docs', 'DEPLOYMENT.md')],
  ] as const;

  for (const [name, filePath] of requiredFiles) {
    addCheck(name, fs.existsSync(filePath) ? 'ok' : 'fail', fs.existsSync(filePath) ? 'exists' : 'missing');
  }
  for (const [name, filePath] of advisoryFiles) {
    addCheck(name, fs.existsSync(filePath) ? 'ok' : 'warning', fs.existsSync(filePath) ? 'exists' : 'missing');
  }
}

async function checkEnvironment(): Promise<void> {
  const envReadiness = collectEnvironmentReadiness();
  const production = isProduction();

  addCheck(
    'environment vars',
    envReadiness.ok ? 'ok' : production ? 'fail' : 'warning',
    envReadiness.ok ? 'required environment variables are present' : 'required environment variables are missing or invalid',
    {
      missing: envReadiness.missing,
      invalid: envReadiness.invalid,
    },
  );

  if (production) {
    const jwtSecret = String(process.env.JWT_SECRET || '').trim();
    const encryptionKey = String(process.env.ENCRYPTION_KEY || '').trim();
    addCheck(
      'JWT_SECRET',
      isStrongProductionSecret(jwtSecret) ? 'ok' : 'fail',
      isStrongProductionSecret(jwtSecret) ? 'strong production secret configured' : 'JWT_SECRET must be replaced with a strong random string',
      { length: jwtSecret.length },
    );
    addCheck(
      'ENCRYPTION_KEY',
      isStrongProductionSecret(encryptionKey) ? 'ok' : 'fail',
      isStrongProductionSecret(encryptionKey)
        ? 'strong production secret configured'
        : 'ENCRYPTION_KEY must be replaced with a strong random string and should not be changed casually after go-live',
      { length: encryptionKey.length },
    );
  }
}

async function checkInstallState(): Promise<void> {
  const status = await evaluateInstallStatus();
  if (status.state === 'installed') {
    addCheck('install state', 'ok', status.message, {
      state: status.state,
      lockFileExists: status.lockFileExists,
      databaseReady: status.database.ready,
    });
    return;
  }

  if (status.state === 'repair_required' || status.state === 'needs_finalize') {
    addCheck('install state', 'warning', status.message, {
      state: status.state,
      lockFileExists: status.lockFileExists,
      lockInfo: status.lockInfo,
      diagnostics: status.diagnostics,
      databaseError: status.database.error,
      missingTables: status.database.missingTables,
      missingColumns: status.database.missingColumns,
      missingIndexes: status.database.missingIndexes,
      missingConfigs: status.database.missingConfigs,
    });
    return;
  }

  if (status.state === 'env_missing') {
    addCheck('install state', isProduction() ? 'fail' : 'warning', status.message, {
      state: status.state,
      missingEnv: status.environment.missing,
      invalidEnv: status.environment.invalid,
    });
    return;
  }

  addCheck('install state', 'warning', status.message, {
    state: status.state,
    lockFileExists: status.lockFileExists,
    databaseReady: status.database.ready,
    databaseError: status.database.error,
    diagnostics: status.diagnostics,
  });
}

function checkWritablePaths(): void {
  const pathsToCheck = [
    ['server/dist', serverDist],
    ['admin-web/dist', adminWebDist],
    ['app logs', path.join(appRoot, 'logs')],
    ['app backups', path.join(appRoot, 'backups')],
    ['update packages', resolveUpdatePackagesDir()],
    ['local uploads', resolveLocalUploadDir()],
  ] as const;

  for (const [name, dir] of pathsToCheck) {
    try {
      ensureWritableDir(dir);
      addCheck(name, 'ok', `writable: ${dir}`);
    } catch (err: any) {
      addCheck(name, isProduction() ? 'fail' : 'warning', `not writable: ${dir}`, {
        error: err?.message || String(err),
      });
    }
  }
}

async function main(): Promise<void> {
  await checkPlatform();
  checkRequiredFiles();
  await checkEnvironment();
  await checkNodeModules();
  checkBuildOutputs();
  await checkInstallState();
  checkWritablePaths();

  for (const check of results) {
    const tag = check.status === 'ok' ? 'OK' : check.status === 'warning' ? 'WARN' : 'FAIL';
    console.log(`[${tag}] ${check.name}: ${check.message}${formatDetails(check.details)}`);
  }

  const failCount = results.filter(result => result.status === 'fail').length;
  const warnCount = results.filter(result => result.status === 'warning').length;

  if (failCount > 0) {
    console.error(`[FAIL] check:deploy failed (${failCount} failed, ${warnCount} warnings)`);
    process.exit(1);
  }

  console.log(`[OK] check:deploy passed (${warnCount} warnings)`);
}

main().catch(err => {
  console.error('[FAIL] check:deploy crashed:', err?.message || err);
  process.exit(1);
});
