// services/storage/storage-config-loader.ts
// Preloads formal storage.* configs from system_configs into process.env.
// Storage adapters are synchronous, so process.env is only the runtime carrier.

import { query } from '../../utils/db';
import { decryptApiKey } from '../openai-adapter.service';
import { StorageService } from './storage.service';

const STORAGE_ENV_MAP: Record<string, string> = {
  'storage.provider': 'STORAGE_PROVIDER',
  'storage.local.upload_dir': 'LOCAL_UPLOAD_DIR',
  'storage.local.base_url': 'LOCAL_BASE_URL',
  'storage.cos.secret_id': 'COS_SECRET_ID',
  'storage.cos.secret_key': 'COS_SECRET_KEY',
  'storage.cos.bucket': 'COS_BUCKET',
  'storage.cos.region': 'COS_REGION',
  'storage.cos.cdn_domain': 'COS_CDN_DOMAIN',
  'storage.cos.sts_endpoint': 'COS_STS_ENDPOINT',
  'storage.cos.sts_duration_seconds': 'COS_STS_DURATION_SECONDS',
  'storage.oss.access_key_id': 'OSS_ACCESS_KEY_ID',
  'storage.oss.access_key_secret': 'OSS_ACCESS_KEY_SECRET',
  'storage.oss.bucket': 'OSS_BUCKET',
  'storage.oss.endpoint': 'OSS_ENDPOINT',
  'storage.oss.region': 'OSS_REGION',
  'storage.oss.cdn_domain': 'OSS_CDN_DOMAIN',
  'storage.oss.ram_role_arn': 'OSS_RAM_ROLE_ARN',
  'storage.oss.sts_endpoint': 'OSS_STS_ENDPOINT',
  'storage.oss.sts_duration_seconds': 'OSS_STS_DURATION_SECONDS',
  'storage.qiniu.access_key': 'QINIU_ACCESS_KEY',
  'storage.qiniu.secret_key': 'QINIU_SECRET_KEY',
  'storage.qiniu.bucket': 'QINIU_BUCKET',
  'storage.qiniu.zone': 'QINIU_ZONE',
  'storage.qiniu.cdn_domain': 'QINIU_CDN_DOMAIN',
  'storage.qiniu.callback_url': 'QINIU_CALLBACK_URL',
  'storage.qiniu.callback_body': 'QINIU_CALLBACK_BODY',
  'storage.qiniu.token_expire_seconds': 'QINIU_TOKEN_EXPIRE_SECONDS',
  'storage.upyun.bucket': 'UPYUN_BUCKET',
  'storage.upyun.operator': 'UPYUN_OPERATOR',
  'storage.upyun.password': 'UPYUN_PASSWORD',
  'storage.upyun.cdn_domain': 'UPYUN_CDN_DOMAIN',
  'storage.upyun.return_url': 'UPYUN_RETURN_URL',
  'storage.eos.access_key': 'EOS_ACCESS_KEY',
  'storage.eos.secret_key': 'EOS_SECRET_KEY',
  'storage.eos.bucket': 'EOS_BUCKET',
  'storage.eos.endpoint': 'EOS_ENDPOINT',
  'storage.eos.region': 'EOS_REGION',
  'storage.eos.cdn_domain': 'EOS_CDN_DOMAIN',
  'storage.eos.presign_expire_seconds': 'EOS_PRESIGN_EXPIRE_SECONDS',
  'upload.max_file_size': 'UPLOAD_MAX_FILE_SIZE',
  'upload.max_video_size': 'UPLOAD_MAX_VIDEO_SIZE',
};

interface PreloadStorageConfigOptions {
  force?: boolean;
}

interface StorageConfigSnapshot {
  values: Record<string, string>;
  formalStorageConfigured: boolean;
}

const STORAGE_CONFIG_PRELOAD_CACHE_TTL_MS = positiveInt(
  process.env.STORAGE_CONFIG_PRELOAD_CACHE_TTL_MS,
  10_000,
);

let preloadCacheUntil = 0;
let preloadPromise: Promise<void> | null = null;
let hasAppliedStorageConfig = false;

export function invalidateStorageConfigCache(): void {
  preloadCacheUntil = 0;
}

export async function preloadStorageConfigs({ force = false }: PreloadStorageConfigOptions = {}): Promise<void> {
  const now = Date.now();
  if (!force && preloadCacheUntil > now) return;
  if (!force && preloadPromise) return preloadPromise;

  preloadPromise = preloadStorageConfigsUncached()
    .then(() => {
      preloadCacheUntil = Date.now() + STORAGE_CONFIG_PRELOAD_CACHE_TTL_MS;
    })
    .finally(() => {
      preloadPromise = null;
    });

  return preloadPromise;
}

async function preloadStorageConfigsUncached(): Promise<void> {
  const snapshot = await loadStorageConfigSnapshot();
  const envChanged = applyStorageConfigSnapshot(snapshot);
  const shouldResetAdapter = !hasAppliedStorageConfig || envChanged;
  hasAppliedStorageConfig = true;

  if (shouldResetAdapter) {
    StorageService.resetAdapter();
  }
  console.log(`[StorageConfig] Preloaded storage.* from system_configs${shouldResetAdapter ? ' and refreshed adapter' : ' from cacheable snapshot'}`);
}

function applyStorageConfigSnapshot(snapshot: StorageConfigSnapshot): boolean {
  let changed = false;
  for (const [configKey, envKey] of Object.entries(STORAGE_ENV_MAP)) {
    const value = String(snapshot.values[configKey] || '').trim();
    if (value) {
      if (shouldKeepLocalDevOverride(envKey)) continue;
      if (process.env[envKey] !== value) changed = true;
      process.env[envKey] = value;
    } else if (snapshot.formalStorageConfigured && configKey.startsWith('storage.')) {
      if (shouldKeepLocalDevOverride(envKey)) continue;
      if (process.env[envKey] !== undefined) changed = true;
      delete process.env[envKey];
    }
  }
  return changed;
}

async function loadStorageConfigSnapshot(): Promise<StorageConfigSnapshot> {
  const keys = Object.keys(STORAGE_ENV_MAP);
  const placeholders = keys.map(() => '?').join(',');
  const rows = await query<any>(
    `SELECT config_key, config_value, is_secret
       FROM system_configs
      WHERE config_key IN (${placeholders})`,
    keys,
  );
  const values: Record<string, string> = {};
  for (const row of rows) {
    const key = String(row.config_key || '');
    const raw = row.config_value === undefined || row.config_value === null ? '' : String(row.config_value);
    values[key] = row.is_secret ? decryptApiKey(raw) : raw;
  }
  return {
    values,
    formalStorageConfigured: !!String(values['storage.provider'] || '').trim(),
  };
}

function shouldKeepLocalDevOverride(envKey: string): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  if (!['LOCAL_UPLOAD_DIR', 'LOCAL_BASE_URL'].includes(envKey)) return false;
  return !!String(process.env[envKey] || '').trim();
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
