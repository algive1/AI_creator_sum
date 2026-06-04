// services/storage/storage-config-loader.ts
// Preloads formal storage.* configs from system_configs into process.env.
// Storage adapters are synchronous, so process.env is only the runtime carrier.

import { SettingsService } from '../settings.service';
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

export async function preloadStorageConfigs(): Promise<void> {
  const formalStorageConfigured = await hasFormalStorageConfig();

  for (const [configKey, envKey] of Object.entries(STORAGE_ENV_MAP)) {
    try {
      const value = await SettingsService.getSystemString(configKey, '');
      if (value && value.trim() !== '') {
        process.env[envKey] = value;
      } else if (formalStorageConfigured && configKey.startsWith('storage.')) {
        delete process.env[envKey];
      }
    } catch {
      if (formalStorageConfigured && configKey.startsWith('storage.')) {
        delete process.env[envKey];
      }
    }
  }
  StorageService.resetAdapter();
  console.log('[StorageConfig] Preloaded storage.* from system_configs');
}

async function hasFormalStorageConfig(): Promise<boolean> {
  try {
    return !!(await SettingsService.getSystemString('storage.provider', '')).trim();
  } catch {
    return false;
  }
}
