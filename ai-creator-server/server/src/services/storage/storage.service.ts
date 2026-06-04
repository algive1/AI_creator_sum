// services/storage/storage.service.ts
// 存储服务工厂：根据 STORAGE_PROVIDER 环境变量创建适配器

import {
  IStorageAdapter,
  StorageProvider,
  FileCategory,
  genStorageKey,
  genFileNo,
  isSupportedStorageProvider,
  SUPPORTED_STORAGE_PROVIDERS,
} from './adapter.interface';
import { LocalAdapter } from './local.adapter';
import { CosAdapter } from './cos.adapter';
import { OssAdapter } from './oss.adapter';
import { QiniuAdapter } from './qiniu.adapter';
import { UpyunAdapter } from './upyun.adapter';
import { EosAdapter } from './eos.adapter';
import { ensureLocalUploadDir } from './local-paths';

const ADAPTER_MAP: Record<StorageProvider, () => IStorageAdapter> = {
  local:            () => new LocalAdapter(),
  tencent_cos:      () => new CosAdapter(),
  aliyun_oss:       () => new OssAdapter(),
  qiniu_kodo:       () => new QiniuAdapter(),
  upyun_uss:        () => new UpyunAdapter(),
  chinamobile_eos:  () => new EosAdapter(),
};

let _adapter: IStorageAdapter | null = null;

export class StorageConfigError extends Error {
  readonly code: string;
  readonly details?: Record<string, any>;

  constructor(code: string, message: string, details?: Record<string, any>) {
    super(message);
    this.name = 'StorageConfigError';
    this.code = code;
    this.details = details;
  }
}

const REQUIRED_ENV: Record<StorageProvider, string[]> = {
  local: [],
  tencent_cos: ['COS_SECRET_ID', 'COS_SECRET_KEY', 'COS_BUCKET', 'COS_REGION'],
  aliyun_oss: ['OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET', 'OSS_BUCKET', 'OSS_ENDPOINT', 'OSS_REGION'],
  qiniu_kodo: ['QINIU_ACCESS_KEY', 'QINIU_SECRET_KEY', 'QINIU_BUCKET'],
  upyun_uss: ['UPYUN_BUCKET', 'UPYUN_OPERATOR', 'UPYUN_PASSWORD'],
  chinamobile_eos: ['EOS_ACCESS_KEY', 'EOS_SECRET_KEY', 'EOS_BUCKET', 'EOS_ENDPOINT', 'EOS_REGION'],
};

export class StorageService {
  /** 获取当前激活的存储适配器 */
  static getActiveAdapter(): IStorageAdapter {
    if (_adapter) return _adapter;

    const provider = this.getActiveProvider();
    this.assertProviderConfigured(provider);
    const factory = ADAPTER_MAP[provider];
    _adapter = factory();
    console.log(`[Storage] Using provider: ${_adapter.provider}`);
    return _adapter;
  }

  static getActiveProvider(): StorageProvider {
    const provider = String(process.env.STORAGE_PROVIDER || 'local').trim() || 'local';
    if (!isSupportedStorageProvider(provider)) {
      throw new StorageConfigError(
        'UNSUPPORTED_STORAGE_PROVIDER',
        `UNSUPPORTED_STORAGE_PROVIDER: ${provider}`,
        { provider, supportedProviders: SUPPORTED_STORAGE_PROVIDERS },
      );
    }
    return provider;
  }

  static getSupportedProviders(): readonly StorageProvider[] {
    return SUPPORTED_STORAGE_PROVIDERS;
  }

  static getMissingConfigKeys(provider: StorageProvider): string[] {
    return REQUIRED_ENV[provider].filter(key => !String(process.env[key] || '').trim());
  }

  static assertProviderConfigured(provider: StorageProvider): void {
    if (provider === 'local') {
      try {
        ensureLocalUploadDir();
      } catch (err: any) {
        throw new StorageConfigError(
          err?.code || 'LOCAL_UPLOAD_DIR_NOT_WRITABLE',
          `${err?.code || 'LOCAL_UPLOAD_DIR_NOT_WRITABLE'}: ${err?.message || 'local upload directory is not writable'}`,
          { provider },
        );
      }
      return;
    }

    const missing = this.getMissingConfigKeys(provider);
    if (missing.length > 0) {
      throw new StorageConfigError(
        'STORAGE_PROVIDER_CONFIG_MISSING',
        `STORAGE_PROVIDER_CONFIG_MISSING: ${provider} missing ${missing.join(', ')}`,
        { provider, missing },
      );
    }
  }

  /** 重置适配器（用于测试或热切换） */
  static resetAdapter(): void {
    _adapter = null;
  }

  /** 便捷方法 */
  static genStorageKey(category: FileCategory, originalName: string): string {
    return genStorageKey(category, originalName);
  }

  static genFileNo(): string {
    return genFileNo();
  }
}
