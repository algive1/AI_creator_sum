import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as tar from 'tar';

function writeFile(filePath: string, content = 'check\n'): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeJson(filePath: string, value: unknown): void {
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeCommandStub(binDir: string, name: string): void {
  if (process.platform === 'win32') {
    writeFile(path.join(binDir, `${name}.cmd`), '@echo off\r\nexit /b 0\r\n');
    return;
  }

  const commandPath = path.join(binDir, name);
  writeFile(commandPath, '#!/usr/bin/env sh\nexit 0\n');
  fs.chmodSync(commandPath, 0o755);
}

async function createPackage(
  updateDir: string,
  stageDir: string,
  options: { packageType?: string; includeUserWebDist?: boolean; includeDangerousEnv?: boolean } = {},
): Promise<string> {
  const version = '9.9.10';
  const filename = `ai-creator-release-${version}.tar.gz`;
  const packagePath = path.join(updateDir, filename);

  writeJson(path.join(stageDir, 'release.json'), {
    version,
    packageType: options.packageType || 'server-admin-user-web',
    name: 'AI Creator user web dist check',
  });

  const packageJson = { name: 'check', version, scripts: {} };
  const files = [
    'server/package.json',
    'server/package-lock.json',
    'server/tsconfig.json',
    'server/.env.example',
    'server/.env.production.example',
    'server/src/index.ts',
    'server/src/db/schema.sql',
    'server/src/migrations/20260707_001_check.sql',
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
    'docs/README.md',
  ];
  if (options.includeUserWebDist !== false) {
    files.push('user-web/dist/index.html', 'user-web/dist/assets/app-check.js');
  }
  if (options.includeDangerousEnv) files.push('server/.env');

  for (const file of files) {
    const fullPath = path.join(stageDir, file);
    if (file.endsWith('package.json') || file.endsWith('package-lock.json') || file.endsWith('tsconfig.json')) {
      writeJson(fullPath, packageJson);
    } else if (file.endsWith('.sql')) {
      writeFile(fullPath, 'SELECT 1;\n');
    } else {
      writeFile(fullPath);
    }
  }

  fs.mkdirSync(updateDir, { recursive: true });
  await tar.c({ gzip: true, file: packagePath, cwd: stageDir }, ['.']);
  return filename;
}

test('update precheck allows packaged user-web dist artifacts', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-creator-user-web-dist-'));
  const appRoot = path.join(tempRoot, 'app-root');
  const updateDir = path.join(appRoot, 'update-packages');
  const stageDir = path.join(tempRoot, 'stage');
  const binDir = path.join(tempRoot, 'bin');

  fs.mkdirSync(path.join(appRoot, 'shared'), { recursive: true });
  fs.mkdirSync(path.join(appRoot, 'server'), { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  writeFile(path.join(appRoot, 'shared/.env'), 'DB_NAME=precheck_user_web_dist\n');
  writeJson(path.join(appRoot, 'server/package.json'), { version: '9.9.9' });
  for (const command of ['mysqldump', 'mysql', 'curl', 'pm2']) writeCommandStub(binDir, command);

  process.env.APP_ROOT_DIR = appRoot;
  process.env.UPDATE_PACKAGES_DIR = updateDir;
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = '1';
  process.env.DB_USER = 'root';
  process.env.DB_PASSWORD = '';
  process.env.DB_NAME = 'precheck_user_web_dist';
  process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH || ''}`;

  const filename = await createPackage(updateDir, stageDir);
  const { config } = await import('../src/utils/config');
  config.release.appRootDir = appRoot;
  config.release.updatePackagesDir = updateDir;
  config.db.host = '127.0.0.1';
  config.db.port = 1;
  config.db.user = 'root';
  config.db.password = '';
  config.db.database = 'precheck_user_web_dist';
  const { getCurrentReleaseVersion, precheckUpdatePackage } = await import('../src/services/update-package.service');
  const { endDbPool, resetDbPool } = await import('../src/utils/db');

  try {
    const precheck = await precheckUpdatePackage(filename);
    const dangerousRuntime = precheck.checks.find(check => check.name === '危险运行时文件');

    assert.notEqual(dangerousRuntime?.status, 'fail', dangerousRuntime?.message);
    assert.equal(precheck.checks.find(check => check.name === '包类型')?.status, 'ok');
    assert.ok(
      !precheck.errors.some(error => error.includes('user-web/dist')),
      `user-web/dist should not be reported as forbidden: ${precheck.errors.join('; ')}`,
    );

    fs.mkdirSync(path.join(appRoot, 'current'), { recursive: true });
    writeJson(path.join(appRoot, 'current/release.json'), { version: '9.9.8' });
    const runtimeVersion = await getCurrentReleaseVersion();
    assert.equal(runtimeVersion.version, '9.9.8');
    assert.ok(runtimeVersion.warnings.some(warning => warning.includes('runtime release.json')));

    const legacyFilename = await createPackage(updateDir, path.join(tempRoot, 'legacy-stage'), {
      packageType: 'server-admin',
    });
    const legacyPrecheck = await precheckUpdatePackage(legacyFilename);
    assert.equal(legacyPrecheck.checks.find(check => check.name === '包类型')?.status, 'warning');
    assert.ok(!legacyPrecheck.errors.some(error => error.includes('packageType')));

    const incompleteFilename = await createPackage(updateDir, path.join(tempRoot, 'incomplete-stage'), {
      includeUserWebDist: false,
    });
    const incompletePrecheck = await precheckUpdatePackage(incompleteFilename);
    assert.ok(incompletePrecheck.errors.some(error => error.includes('user-web/dist/index.html')));

    const dangerousFilename = await createPackage(updateDir, path.join(tempRoot, 'dangerous-stage'), {
      includeDangerousEnv: true,
    });
    const dangerousPrecheck = await precheckUpdatePackage(dangerousFilename);
    assert.ok(dangerousPrecheck.errors.some(error => error.includes('危险运行时文件')) || dangerousPrecheck.errors.some(error => error.includes('.env')));
  } finally {
    await endDbPool().catch(() => undefined);
    resetDbPool();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
