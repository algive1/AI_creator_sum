import { queryOne, query, getConnection } from '../utils/db';
import { encryptApiKey, decryptApiKey } from './openai-adapter.service';

const cache = new Map<string, { value: string; type: string; isSecret: boolean; maskedValue: string }>();
const CACHE_TTL_MS = 30_000;
let lastClearTime = 0;

interface SetOptions {
  isSecret?: boolean;
}

function shouldClearCache(): boolean {
  if (Date.now() - lastClearTime <= CACHE_TTL_MS) return false;
  lastClearTime = Date.now();
  return true;
}

function hasConfigValue(value: any): value is string {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function normalizeLegacyConfigValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'string') return parsed;
    if (typeof parsed === 'boolean' || typeof parsed === 'number') return String(parsed);
    if (parsed === null || parsed === undefined) return '';
    return JSON.stringify(parsed);
  } catch {
    return text;
  }
}

export class SettingsService {
  /** Get a single config value. Order: system_configs -> app_configs -> env -> default */
  static async get(key: string, defaultValue = ''): Promise<string> {
    if (shouldClearCache()) cache.clear();
    const cached = cache.get(key);
    if (cached) return cached.value;

    const candidates = [key, ...this.getAliasKeys(key)];
    for (const candidate of candidates) {
      const value = await this.resolveDirect(candidate);
      if (hasConfigValue(value)) {
        cache.set(key, { value, type: 'string', isSecret: false, maskedValue: '' });
        return value;
      }
    }

    return defaultValue;
  }

  static async getString(key: string, defaultValue = ''): Promise<string> {
    const value = await this.get(key, defaultValue);
    return hasConfigValue(value) ? String(value) : defaultValue;
  }

  static async getSystemString(key: string, defaultValue = ''): Promise<string> {
    const row = await queryOne<any>(
      'SELECT config_value, value_type, is_secret FROM system_configs WHERE config_key = ?',
      [key],
    );
    if (!row) return defaultValue;
    const value = row.is_secret ? decryptApiKey(row.config_value) : row.config_value;
    return hasConfigValue(value) ? String(value) : defaultValue;
  }

  static async getBoolean(key: string, defaultValue = false): Promise<boolean> {
    const value = await this.get(key, defaultValue ? 'true' : 'false');
    if (typeof value === 'boolean') return value;
    const text = String(value || '').trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(text)) return true;
    if (['0', 'false', 'no', 'off'].includes(text)) return false;
    return defaultValue;
  }

  static async requireString(key: string, readableName?: string): Promise<string> {
    const value = await this.getString(key, '');
    if (!hasConfigValue(value)) {
      throw Object.assign(new Error(`${readableName || key} 未配置`), { code: 4000, configKey: key });
    }
    return value;
  }

  /** Get a group of configs (for admin panel). Sensitive values masked. */
  static async getGroup(group: string): Promise<Record<string, any>> {
    const rows = await query<any>(
      'SELECT config_key, config_value, value_type, is_secret, masked_value, description, sort_order FROM system_configs WHERE config_group = ? ORDER BY sort_order',
      [group],
    );
    const result: Record<string, any> = {};
    for (const r of rows) {
      result[r.config_key] = {
        value: r.is_secret ? '' : r.config_value,
        type: r.value_type,
        isSecret: !!r.is_secret,
        maskedValue: r.is_secret ? (r.masked_value || '****') : r.config_value,
        description: r.description,
      };
    }
    return result;
  }

  static async set(key: string, value: string, adminUserId: number, options?: SetOptions): Promise<void>;
  static async set(key: string, value: string, group: string, adminUserId: number, options?: SetOptions): Promise<void>;
  static async set(
    key: string,
    value: string,
    groupOrAdminUserId: string | number,
    adminUserIdOrOptions?: number | SetOptions,
    options: SetOptions = {},
  ): Promise<void> {
    const group = typeof groupOrAdminUserId === 'string' ? groupOrAdminUserId : 'general';
    const adminUserId = typeof groupOrAdminUserId === 'string'
      ? adminUserIdOrOptions as number
      : groupOrAdminUserId;
    const setOptions = typeof groupOrAdminUserId === 'string'
      ? options
      : (adminUserIdOrOptions as SetOptions | undefined) || {};

    const conn = await getConnection();
    try {
      await conn.beginTransaction();

      const existing = await queryOne<any>(
        'SELECT config_value, is_secret, masked_value FROM system_configs WHERE config_key = ?',
        [key],
      );

      const isSecret = existing?.is_secret || setOptions.isSecret ? 1 : 0;
      let oldMasked = '';
      let storeValue = value;

      if (isSecret) {
        if (!value || value.trim() === '') {
          await conn.rollback();
          return;
        }
        storeValue = encryptApiKey(value);
        const newMasked = this.maskValue(value, key);
        oldMasked = existing?.masked_value || (existing?.config_value ? '****' : '');
        await conn.execute(
          `INSERT INTO system_configs (config_key, config_value, value_type, config_group, is_secret, masked_value, updated_by, created_at, updated_at)
           VALUES (?, ?, 'string', ?, 1, ?, ?, NOW(3), NOW(3))
           ON DUPLICATE KEY UPDATE config_value = ?, config_group = ?, is_secret = 1, masked_value = ?, updated_by = ?, updated_at = NOW(3)`,
          [key, storeValue, group, newMasked, adminUserId, storeValue, group, newMasked, adminUserId],
        );
      } else {
        oldMasked = existing?.config_value || '';
        await conn.execute(
          `INSERT INTO system_configs (config_key, config_value, value_type, config_group, is_secret, updated_by, created_at, updated_at)
           VALUES (?, ?, 'string', ?, 0, ?, NOW(3), NOW(3))
           ON DUPLICATE KEY UPDATE config_value = ?, config_group = ?, updated_by = ?, updated_at = NOW(3)`,
          [key, storeValue, group, adminUserId, storeValue, group, adminUserId],
        );
      }

      await conn.execute(
        `INSERT INTO config_change_logs (admin_user_id, config_group, config_key, action, old_value_masked, new_value_masked, created_at)
         VALUES (?, ?, ?, 'update', ?, ?, NOW(3))`,
        [adminUserId, group, key, oldMasked.substring(0, 127), isSecret ? this.maskValue(value, key) : value.substring(0, 127)],
      );

      await conn.commit();
      this.invalidateCacheKeyAndAliases(key);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  static async setGroup(group: string, values: Record<string, string>, isSecret: boolean, adminUserId: number): Promise<void> {
    for (const [key, value] of Object.entries(values)) {
      await this.set(key, value, group, adminUserId, { isSecret });
    }
  }

  static clearCache(): void {
    cache.clear();
    lastClearTime = Date.now();
  }

  static maskValue(value: string, _key: string): string {
    if (!value || value.length <= 8) return '****';
    if (value.length <= 12) return value.substring(0, 2) + '****' + value.substring(value.length - 2);
    return value.substring(0, 4) + '****' + value.substring(value.length - 4);
  }

  private static async resolveDirect(key: string): Promise<string | undefined> {
    const cached = cache.get(key);
    if (cached) return cached.value;

    const row = await queryOne<any>(
      'SELECT config_value, value_type, is_secret FROM system_configs WHERE config_key = ?',
      [key],
    );
    if (row) {
      const value = row.is_secret ? decryptApiKey(row.config_value) : row.config_value;
      if (hasConfigValue(value)) {
        cache.set(key, { value, type: row.value_type, isSecret: !!row.is_secret, maskedValue: row.is_secret ? this.maskValue(value, key) : '' });
        return value;
      }
    }

    const legacy = await queryOne<any>(
      'SELECT config_value FROM app_configs WHERE config_key = ?',
      [key],
    );
    if (legacy) {
      const value = normalizeLegacyConfigValue(legacy.config_value);
      if (hasConfigValue(value)) {
        cache.set(key, { value, type: 'string', isSecret: false, maskedValue: '' });
        return value;
      }
    }

    const envValue = this.getEnvFallback(key);
    if (hasConfigValue(envValue)) {
      cache.set(key, { value: envValue, type: 'string', isSecret: false, maskedValue: '' });
      return envValue;
    }

    return undefined;
  }

  private static invalidateCacheKeyAndAliases(key: string): void {
    cache.delete(key);
    for (const alias of this.getAliasKeys(key)) {
      cache.delete(alias);
    }
  }

  private static getAliasKeys(key: string): string[] {
    const map: Record<string, string[]> = {};
    return map[key] || [];
  }

  private static getEnvFallback(key: string): string | undefined {
    const map: Record<string, string | string[]> = {
      'site.name': ['SITE_NAME', 'APP_NAME', 'PUBLIC_APP_NAME'],
      'site.api_domain': ['SITE_API_DOMAIN', 'PUBLIC_API_DOMAIN', 'APP_PUBLIC_URL'],
      'app.name': ['APP_NAME', 'SITE_NAME', 'PUBLIC_APP_NAME'],
      'public.app_name': ['PUBLIC_APP_NAME', 'APP_NAME', 'SITE_NAME'],
      'wechat.app_id': 'WECHAT_APP_ID',
      'wechat.app_secret': 'WECHAT_APP_SECRET',
      'wechat.login_enabled': ['WECHAT_LOGIN_ENABLED', 'WECHAT_ENABLED'],
      'wechat.login_bypass_dev': 'WECHAT_LOGIN_BYPASS',
      'wechat_pay.enabled': 'WECHAT_PAY_ENABLED',
      'wechat_pay.appid': 'WECHAT_PAY_APPID',
      'wechat_pay.mchid': ['WECHAT_PAY_MCHID', 'WECHAT_PAY_MCH_ID'],
      'wechat_pay.api_v3_key': 'WECHAT_PAY_API_V3_KEY',
      'wechat_pay.private_key': 'WECHAT_PAY_PRIVATE_KEY',
      'wechat_pay.merchant_serial_no': ['WECHAT_PAY_MERCHANT_SERIAL_NO', 'WECHAT_PAY_SERIAL_NO'],
      'wechat_pay.notify_url': 'WECHAT_PAY_NOTIFY_URL',
      'wechat_pay.platform_cert_serial_no': 'WECHAT_PAY_PLATFORM_CERT_SERIAL_NO',
      'wechat_pay.platform_cert': 'WECHAT_PAY_PLATFORM_CERT',
      'wechat_pay.env': 'WECHAT_PAY_ENV',
      'wechat_pay.timeout_minutes': 'WECHAT_PAY_TIMEOUT_MINUTES',
      'wechat_pay.verify_signature': 'WECHAT_PAY_VERIFY_SIGNATURE',
      'membership.enabled': 'MEMBERSHIP_ENABLED',
      'invite.enabled': 'INVITE_ENABLED',
      'invite.reward_on_use_enabled': 'INVITE_REWARD_ON_USE_ENABLED',
      'invite.reward_on_use_points': 'INVITE_REWARD_ON_USE_POINTS',
      'invite.reward_on_member_enabled': 'INVITE_REWARD_ON_MEMBER_ENABLED',
      'invite.reward_on_member_points': 'INVITE_REWARD_ON_MEMBER_POINTS',
      'invite.max_reward_per_day': 'INVITE_MAX_REWARD_PER_DAY',
      'ad.reward.enabled': 'AD_REWARD_ENABLED',
      'ad.reward.points_per_watch': 'AD_REWARD_POINTS_PER_WATCH',
      'ad.reward.max_daily_count': 'AD_REWARD_MAX_DAILY_COUNT',
      'ad.reward.ad_unit_id': 'AD_REWARD_AD_UNIT_ID',
      'signin.enabled': 'SIGNIN_ENABLED',
      'signin.normal_enabled': 'SIGNIN_NORMAL_ENABLED',
      'signin.super_enabled': 'SIGNIN_SUPER_ENABLED',
      'signin.super_requires_ad': 'SIGNIN_SUPER_REQUIRES_AD',
      'signin.rewards_json': 'SIGNIN_REWARDS_JSON',
      'signin.super_rewards_json': 'SIGNIN_SUPER_REWARDS_JSON',
      'signin.allow_makeup': 'SIGNIN_ALLOW_MAKEUP',
      'signin.makeup_cost_points': 'SIGNIN_MAKEUP_COST_POINTS',
      'storage.provider': 'STORAGE_PROVIDER',
      'storage.local.upload_dir': 'LOCAL_UPLOAD_DIR',
      'storage.local.base_url': 'LOCAL_BASE_URL',
      'storage.file_domain': ['STORAGE_FILE_DOMAIN', 'LOCAL_BASE_URL', 'CDN_DOMAIN'],
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
      'ai.prompt_optimize.enabled': 'AI_PROMPT_OPTIMIZE_ENABLED',
      'ai.prompt_optimize.model_id': 'AI_PROMPT_OPTIMIZE_MODEL_ID',
      'ai.prompt_optimize.points_cost': 'AI_PROMPT_OPTIMIZE_POINTS_COST',
      'ai.script_generate.enabled': 'AI_SCRIPT_GENERATE_ENABLED',
      'ai.script_generate.model_id': 'AI_SCRIPT_GENERATE_MODEL_ID',
      'ai.script_generate.points_cost': 'AI_SCRIPT_GENERATE_POINTS_COST',
      'ai.prompt_generate.enabled': 'AI_PROMPT_GENERATE_ENABLED',
      'ai.prompt_generate.model_id': 'AI_PROMPT_GENERATE_MODEL_ID',
      'ai.prompt_generate.points_cost': 'AI_PROMPT_GENERATE_POINTS_COST',
      'ai.storyboard_generate.enabled': 'AI_STORYBOARD_GENERATE_ENABLED',
      'ai.storyboard_generate.model_id': 'AI_STORYBOARD_GENERATE_MODEL_ID',
      'ai.storyboard_generate.points_cost': 'AI_STORYBOARD_GENERATE_POINTS_COST',
      'backup.enabled': 'BACKUP_ENABLED',
      'backup.dir': 'BACKUP_DIR',
      'backup.retention_days': 'BACKUP_RETENTION_DAYS',
      'backup.auto_hour': 'BACKUP_AUTO_HOUR',
      'backup.timeout_seconds': 'BACKUP_TIMEOUT_SECONDS',
      'backup.email.enabled': 'BACKUP_EMAIL_ENABLED',
      'backup.email.smtp_host': 'BACKUP_EMAIL_SMTP_HOST',
      'backup.email.smtp_port': 'BACKUP_EMAIL_SMTP_PORT',
      'backup.email.smtp_secure': 'BACKUP_EMAIL_SMTP_SECURE',
      'backup.email.smtp_user': 'BACKUP_EMAIL_SMTP_USER',
      'backup.email.smtp_pass': 'BACKUP_EMAIL_SMTP_PASS',
      'backup.email.from': 'BACKUP_EMAIL_FROM',
      'backup.email.to': 'BACKUP_EMAIL_TO',
      'upload.max_file_size': 'UPLOAD_MAX_FILE_SIZE',
      'upload.max_video_size': 'UPLOAD_MAX_VIDEO_SIZE',
      'security.jwt_secret': 'JWT_SECRET',
      'security.encryption_key': 'ENCRYPTION_KEY',
    };

    const envKeys = map[key];
    if (Array.isArray(envKeys)) {
      for (const envKey of envKeys) {
        if (hasConfigValue(process.env[envKey])) return process.env[envKey];
      }
      return undefined;
    }
    if (envKeys) return process.env[envKeys];
    return undefined;
  }
}
