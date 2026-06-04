import fs from 'fs';
import path from 'path';

const DEFAULT_APP_ROOT_DIR = '/www/wwwroot/ai-creator';
const DEFAULT_LOCAL_BASE_URL = '/static';

export class LocalStoragePathError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'LocalStoragePathError';
    this.code = code;
  }
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

function isSubPath(child: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertSafeStorageKey(key: string): void {
  const normalized = String(key || '').replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (!normalized || path.isAbsolute(normalized) || parts.some(part => !part || part === '.' || part === '..')) {
    throw new LocalStoragePathError('INVALID_STORAGE_KEY', 'INVALID_STORAGE_KEY: storage key must be a relative object path');
  }
}

export function getAppRootDir(): string {
  return path.resolve(process.env.APP_ROOT_DIR || DEFAULT_APP_ROOT_DIR);
}

export function getLocalUploadDir(): string {
  const configured = String(process.env.LOCAL_UPLOAD_DIR || '').trim();
  return path.resolve(configured || path.join(getAppRootDir(), 'uploads'));
}

export function getLocalBaseUrl(): string {
  const base = String(process.env.LOCAL_BASE_URL || DEFAULT_LOCAL_BASE_URL).trim() || DEFAULT_LOCAL_BASE_URL;
  return base.replace(/\/+$/, '') || DEFAULT_LOCAL_BASE_URL;
}

export function getLocalStaticMountPath(): string {
  const base = getLocalBaseUrl();
  try {
    return normalizeMountPath(new URL(base).pathname || DEFAULT_LOCAL_BASE_URL);
  } catch {
    return normalizeMountPath(base);
  }
}

export function buildLocalFileUrl(key: string): string {
  assertSafeStorageKey(key);
  const encodedKey = key.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
  return `${getLocalBaseUrl()}/${encodedKey}`;
}

export function assertLocalUploadDirSafe(uploadDir = getLocalUploadDir()): void {
  const resolved = path.resolve(uploadDir);
  const appRoot = getAppRootDir();
  const updatePackagesDir = path.resolve(process.env.UPDATE_PACKAGES_DIR || path.join(appRoot, 'update-packages'));
  const forbiddenRoots = [
    path.join(appRoot, '.git'),
    path.join(appRoot, 'node_modules'),
    path.join(appRoot, 'server', 'node_modules'),
    path.join(appRoot, 'admin-web', 'node_modules'),
    path.join(appRoot, 'server', 'src'),
    path.join(appRoot, 'admin-web', 'src'),
    updatePackagesDir,
  ];

  const baseName = path.basename(resolved).toLowerCase();
  if (['.git', 'node_modules', 'src', 'dist', 'update-packages'].includes(baseName)) {
    throw new LocalStoragePathError('LOCAL_UPLOAD_DIR_UNSAFE', `LOCAL_UPLOAD_DIR_UNSAFE: ${resolved}`);
  }
  if (samePath(resolved, appRoot) || isSubPath(appRoot, resolved)) {
    throw new LocalStoragePathError('LOCAL_UPLOAD_DIR_UNSAFE', `LOCAL_UPLOAD_DIR_UNSAFE: ${resolved}`);
  }

  for (const forbidden of forbiddenRoots) {
    if (samePath(resolved, forbidden) || isSubPath(resolved, forbidden) || isSubPath(forbidden, resolved)) {
      throw new LocalStoragePathError('LOCAL_UPLOAD_DIR_UNSAFE', `LOCAL_UPLOAD_DIR_UNSAFE: ${resolved}`);
    }
  }
}

export function ensureLocalUploadDir(): string {
  const uploadDir = getLocalUploadDir();
  assertLocalUploadDirSafe(uploadDir);
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.accessSync(uploadDir, fs.constants.W_OK);
  return uploadDir;
}

export function resolveLocalFilePath(key: string): string {
  assertSafeStorageKey(key);
  const uploadDir = ensureLocalUploadDir();
  const target = path.resolve(uploadDir, key);
  if (!isSubPath(target, uploadDir)) {
    throw new LocalStoragePathError('INVALID_STORAGE_KEY', 'INVALID_STORAGE_KEY: storage key escapes upload directory');
  }
  return target;
}

function normalizeMountPath(value: string): string {
  const trimmed = value.trim();
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, '') || DEFAULT_LOCAL_BASE_URL;
}
