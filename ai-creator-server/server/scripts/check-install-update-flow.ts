import '../src/utils/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import * as tar from 'tar';
import axios from 'axios';
import mysql from 'mysql2/promise';
import { config } from '../src/utils/config';
import { executeInit, finishInstall, saveSystemConfig, setTempDbConfigForCheck, validateAdmin } from '../src/services/install.service';
import { compareReleaseVersions, getCurrentReleaseVersion, precheckUpdatePackage } from '../src/services/update-package.service';
import { endDbPool, query, queryOne, resetDbPool } from '../src/utils/db';

const CHECK_DB_NAME = process.env.CHECK_DB_NAME || 'ai_creator_install_update_check';
const ADMIN_USERNAME = process.env.CHECK_ADMIN_USERNAME || 'install_update_admin';
const ADMIN_PASSWORD = process.env.CHECK_ADMIN_PASSWORD || 'InstallUpdate#2026';
const APP_ROOT = path.resolve(process.env.CHECK_APP_ROOT || path.join(__dirname, '../runtime/check-install-update-flow'));
const RELEASE_VERSION = process.env.CHECK_RELEASE_VERSION || '9.9.9';
const UPDATE_VERSION = process.env.CHECK_UPDATE_VERSION || '9.9.10';
let healthServer: http.Server | null = null;

const cfg = {
  host: process.env.CHECK_DB_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.CHECK_DB_PORT || process.env.DB_PORT || '3306', 10),
  database: CHECK_DB_NAME,
  user: process.env.CHECK_DB_USER || process.env.DB_USER || 'root',
  password: process.env.CHECK_DB_PASSWORD || process.env.DB_PASSWORD || '',
  prefix: '',
  autoCreate: true,
};

function assert(condition: any, message: string): void {
  if (!condition) throw new Error(message);
}

function writeJson(filePath: string, value: any): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function recreateDatabase(): Promise<void> {
  if (cfg.database === process.env.DB_NAME) throw new Error('CHECK_DB_NAME cannot equal DB_NAME');
  const root = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password });
  await root.query(`DROP DATABASE IF EXISTS ${mysql.escapeId(cfg.database)}`);
  await root.query(`CREATE DATABASE ${mysql.escapeId(cfg.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.end();
}

async function startHealthServer(): Promise<string> {
  healthServer = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ status: 'ok', releaseVersion: RELEASE_VERSION }));
  });
  await new Promise<void>((resolve) => healthServer!.listen(0, '127.0.0.1', resolve));
  const address = healthServer.address();
  if (!address || typeof address === 'string') throw new Error('failed to allocate health server port');
  return `http://127.0.0.1:${address.port}/health`;
}

async function prepareRuntimeEnv(): Promise<void> {
  fs.rmSync(APP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(APP_ROOT, { recursive: true });
  const healthUrl = await startHealthServer();
  const binDir = path.join(APP_ROOT, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, process.platform === 'win32' ? 'pm2.cmd' : 'pm2'), process.platform === 'win32' ? '@echo off\r\necho check-pm2\r\n' : '#!/usr/bin/env sh\necho check-pm2\n', 'utf8');
  if (process.platform !== 'win32') fs.chmodSync(path.join(binDir, 'pm2'), 0o755);
  process.env.APP_ROOT_DIR = APP_ROOT;
  process.env.UPDATE_PACKAGES_DIR = path.join(APP_ROOT, 'update-packages');
  process.env.PM2_APP_NAME = 'ai-creator-check-install-update';
  process.env.HEALTH_CHECK_URL = healthUrl;
  process.env.PORT = '0';
  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET = 'check-install-update-jwt-secret-0123456789abcdef';
  process.env.ENCRYPTION_KEY = 'check-install-update-encryption-key-0123456789abcdef';
  process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH || ''}`;
  config.release.appRootDir = APP_ROOT;
  config.release.updatePackagesDir = process.env.UPDATE_PACKAGES_DIR;
  config.release.pm2AppName = process.env.PM2_APP_NAME;
  config.release.healthCheckUrl = process.env.HEALTH_CHECK_URL;
  config.port = 0;
  config.nodeEnv = 'development';
  config.jwt.secret = process.env.JWT_SECRET;
  config.encryption.key = process.env.ENCRYPTION_KEY;
  writeJson(path.join(APP_ROOT, 'release.json'), {
    version: RELEASE_VERSION,
    packageType: 'server-admin',
    name: 'AI Creator check release',
  });
}

async function runInstallInit(): Promise<void> {
  setTempDbConfigForCheck(cfg);
  await saveSystemConfig({
    siteName: 'AI Creator Install Update Check',
    adminPath: 'admin',
    timezone: 'Asia/Shanghai',
    storageType: 'local',
    debugMode: true,
    allowRegister: true,
  });
  const admin = await validateAdmin({
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
    confirmPassword: ADMIN_PASSWORD,
  });
  assert(admin.valid, admin.error || 'admin validation failed');
  const init = await executeInit();
  assert(init.success, JSON.stringify(init.steps, null, 2));
}

async function createRuntimeSnapshot(): Promise<void> {
  const releaseDir = path.join(APP_ROOT, 'releases', `initial-${RELEASE_VERSION}`);
  fs.mkdirSync(path.join(releaseDir, 'server/dist'), { recursive: true });
  fs.mkdirSync(path.join(releaseDir, 'user-web/dist/assets'), { recursive: true });
  writeJson(path.join(releaseDir, 'release.json'), {
    version: RELEASE_VERSION,
    packageType: 'server-admin',
    name: 'AI Creator check initial release',
  });
  fs.writeFileSync(path.join(releaseDir, 'server/dist/index.js'), 'module.exports = {};\n', 'utf8');
  fs.writeFileSync(path.join(releaseDir, 'user-web/dist/index.html'), '<script type="module" src="/assets/app-check.js"></script>\n', 'utf8');
  fs.writeFileSync(path.join(releaseDir, 'user-web/dist/assets/app-check.js'), 'console.log("check");\n', 'utf8');
  fs.mkdirSync(path.join(APP_ROOT, 'shared'), { recursive: true });
  fs.writeFileSync(path.join(APP_ROOT, 'shared/.env'), `DB_NAME=${cfg.database}\n`, 'utf8');
  fs.symlinkSync(releaseDir, path.join(APP_ROOT, 'current'), process.platform === 'win32' ? 'junction' : 'dir');
}

async function finishInstallWithoutHealthServer(): Promise<void> {
  const originalGet = axios.get;
  (axios.get as any) = async () => ({ data: { status: 'ok', releaseVersion: RELEASE_VERSION } });
  try {
    const result = await finishInstall();
    assert(result.success && result.baseInstalled, 'finishInstall did not mark install complete');
  } finally {
    (axios.get as any) = originalGet;
  }
}

async function assertAdminLoginWorks(): Promise<void> {
  const admin = await queryOne<any>('SELECT username, password_hash, role_key, status FROM admin_users WHERE username = ?', [ADMIN_USERNAME]);
  assert(admin, 'admin user not found');
  const bcrypt = await import('bcryptjs');
  assert(bcrypt.default.compareSync(ADMIN_PASSWORD, admin.password_hash), 'admin password hash does not match');
  assert(admin.role_key === 'super_admin' && admin.status === 'active', 'admin user is not active super_admin');
}

async function assertInstallDatabaseState(): Promise<void> {
  const installed = await queryOne<any>("SELECT config_value FROM system_configs WHERE config_key = 'system.installed'");
  assert(installed?.config_value === 'true', 'system.installed was not written');
  const migrationCount = await queryOne<any>('SELECT COUNT(*) AS cnt FROM schema_migrations WHERE success = 1');
  assert(Number(migrationCount?.cnt || 0) > 0, 'schema_migrations has no successful migrations');
  const release = await queryOne<any>("SELECT version, status FROM app_releases WHERE status = 'installed' ORDER BY installed_at DESC LIMIT 1");
  assert(release?.version === RELEASE_VERSION, `initial app_releases version mismatch: ${release?.version}`);
}

async function createMinimalUpdatePackage(): Promise<string> {
  const packageDir = config.release.updatePackagesDir;
  const stageDir = path.join(APP_ROOT, 'package-stage');
  const packagePath = path.join(packageDir, `ai-creator-release-${UPDATE_VERSION}.tar.gz`);
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });
  writeJson(path.join(stageDir, 'release.json'), {
    version: UPDATE_VERSION,
    packageType: 'server-admin-user-web',
    name: 'AI Creator check update release',
  });
  const files = [
    'server/package.json',
    'server/package-lock.json',
    'server/tsconfig.json',
    'server/.env.example',
    'server/.env.production.example',
    'server/src/index.ts',
    'server/src/db/schema_files.sql',
    'server/src/migrations/20260699_001_check_update.sql',
    'server/scripts/migrate.ts',
    'admin-web/package.json',
    'admin-web/package-lock.json',
    'admin-web/tsconfig.json',
    'admin-web/vite.config.ts',
    'admin-web/index.html',
    'admin-web/src/App.tsx',
    'admin-web/dist/index.html',
    'admin-web/dist/assets/app-check.js',
    'user-web/package.json',
    'user-web/package-lock.json',
    'user-web/tsconfig.json',
    'user-web/eslint.config.js',
    'user-web/vite.config.ts',
    'user-web/index.html',
    'user-web/src/App.tsx',
    'user-web/dist/index.html',
    'user-web/dist/assets/app-check.js',
    'docs/INSTALL_UPDATE_RUNTIME.md',
  ];
  for (const file of files) {
    const full = path.join(stageDir, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (file.endsWith('.sql')) {
      fs.writeFileSync(full, 'SELECT 1;\n', 'utf8');
    } else if (file.endsWith('.json')) {
      writeJson(full, { name: 'check', version: UPDATE_VERSION, scripts: {} });
    } else {
      fs.writeFileSync(full, 'check\n', 'utf8');
    }
  }
  fs.mkdirSync(packageDir, { recursive: true });
  await tar.c({ gzip: true, file: packagePath, cwd: stageDir }, ['.']);
  return path.basename(packagePath);
}

async function assertUpdatePrecheckAndVersionRecord(): Promise<void> {
  const filename = await createMinimalUpdatePackage();
  const precheck = await precheckUpdatePackage(filename);
  assert(precheck.version === UPDATE_VERSION, `precheck version mismatch: ${precheck.version}`);
  assert(precheck.isNewerThanCurrent, 'precheck did not mark update as newer');
  assert(precheck.errors.length === 0, `precheck errors: ${precheck.errors.join('; ')}`);
  assert(compareReleaseVersions(UPDATE_VERSION, RELEASE_VERSION).isNewer, 'version comparator failed');

  await query(
    `INSERT INTO app_releases (version, release_name, package_name, status, installed_at, note)
     VALUES (?, ?, ?, 'installed', NOW(3), 'check update installed')
     ON DUPLICATE KEY UPDATE status = VALUES(status), installed_at = VALUES(installed_at), note = VALUES(note)`,
    [UPDATE_VERSION, UPDATE_VERSION, filename],
  );
  await query(
    `INSERT INTO release_update_logs (version_from, version_to, status, message, backup_path, started_at, finished_at)
     VALUES (?, ?, 'success', 'check update log', '', NOW(3), NOW(3))`,
    [RELEASE_VERSION, UPDATE_VERSION],
  );
  const current = await getCurrentReleaseVersion();
  assert(current.version === UPDATE_VERSION, `current release version mismatch after update record: ${current.version}`);
  const log = await queryOne<any>('SELECT version_from, version_to, status FROM release_update_logs WHERE version_to = ? ORDER BY id DESC LIMIT 1', [UPDATE_VERSION]);
  assert(log?.version_from === RELEASE_VERSION && log?.status === 'success', 'release_update_logs record mismatch');
}

async function main(): Promise<void> {
  await prepareRuntimeEnv();
  await recreateDatabase();
  await runInstallInit();
  await createRuntimeSnapshot();
  await finishInstallWithoutHealthServer();
  await assertAdminLoginWorks();
  await assertInstallDatabaseState();
  await assertUpdatePrecheckAndVersionRecord();
  console.log(JSON.stringify({
    database: cfg.database,
    appRoot: APP_ROOT,
    adminLogin: {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD,
      url: '/login',
    },
    installedVersion: RELEASE_VERSION,
    updatedVersion: UPDATE_VERSION,
    checks: [
      'executeInit created schema, migrations, seed data and admin',
      'finishInstall wrote system.installed and app_releases',
      'admin password hash verifies',
      'update package precheck reads release.json and validates package shape',
      'release_update_logs and app_releases can advance current version',
    ],
  }, null, 2));
  console.log('check:install-update-flow passed');
}

main()
  .catch(err => {
    console.error('check:install-update-flow failed:', err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await endDbPool().catch(() => undefined);
    resetDbPool();
    if (healthServer) {
      await new Promise<void>(resolve => healthServer!.close(() => resolve()));
    }
  });
