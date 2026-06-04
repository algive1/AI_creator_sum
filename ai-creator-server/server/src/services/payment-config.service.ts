import { SettingsService } from './settings.service';

export interface WechatPayConfig {
  enabled: boolean;
  appId: string;
  mchId: string;
  apiV3Key: string;
  privateKey: string;
  merchantSerialNo: string;
  notifyUrl: string;
  platformCertSerialNo: string;
  platformCert: string;
  env: 'production' | 'sandbox' | string;
  timeoutMinutes: number;
  verifySignature: boolean;
}

const REQUIRED_FIELDS: Array<{ key: keyof WechatPayConfig; message: string }> = [
  { key: 'appId', message: '微信支付 AppID 未配置' },
  { key: 'mchId', message: '微信支付商户号未配置' },
  { key: 'apiV3Key', message: '微信支付 APIv3 密钥未配置' },
  { key: 'privateKey', message: '微信支付商户私钥未配置' },
  { key: 'merchantSerialNo', message: '微信支付商户证书序列号未配置' },
  { key: 'notifyUrl', message: '微信支付回调地址未配置' },
];

export async function getWechatPayConfig(): Promise<WechatPayConfig> {
  const [
    enabled,
    appId,
    mchId,
    apiV3Key,
    privateKey,
    merchantSerialNo,
    notifyUrl,
    platformCertSerialNo,
    platformCert,
    env,
    timeoutMinutes,
    verifySignature,
  ] = await Promise.all([
    SettingsService.getBoolean('wechat_pay.enabled', false),
    SettingsService.getString('wechat_pay.appid', ''),
    SettingsService.getString('wechat_pay.mchid', ''),
    SettingsService.getString('wechat_pay.api_v3_key', ''),
    SettingsService.getString('wechat_pay.private_key', ''),
    SettingsService.getString('wechat_pay.merchant_serial_no', ''),
    SettingsService.getString('wechat_pay.notify_url', ''),
    SettingsService.getString('wechat_pay.platform_cert_serial_no', ''),
    SettingsService.getString('wechat_pay.platform_cert', ''),
    SettingsService.getString('wechat_pay.env', 'production'),
    SettingsService.getString('wechat_pay.timeout_minutes', '30'),
    SettingsService.getBoolean('wechat_pay.verify_signature', true),
  ]);

  return {
    enabled,
    appId: appId.trim(),
    mchId: mchId.trim(),
    apiV3Key: apiV3Key.trim(),
    privateKey: normalizePem(privateKey),
    merchantSerialNo: merchantSerialNo.trim(),
    notifyUrl: notifyUrl.trim(),
    platformCertSerialNo: platformCertSerialNo.trim(),
    platformCert: normalizePem(platformCert),
    env: env.trim() || 'production',
    timeoutMinutes: normalizeTimeout(timeoutMinutes, 30),
    verifySignature,
  };
}

export async function requireWechatPayConfig(): Promise<WechatPayConfig> {
  const cfg = await getWechatPayConfig();
  if (!cfg.enabled) throw configError('支付功能未启用');
  for (const field of REQUIRED_FIELDS) {
    if (!String(cfg[field.key] || '').trim()) throw configError(field.message);
  }
  return cfg;
}

export function getPaymentMissingMessages(cfg: WechatPayConfig): string[] {
  const messages: string[] = [];
  if (!cfg.enabled) messages.push('支付功能未启用');
  for (const field of REQUIRED_FIELDS) {
    if (!String(cfg[field.key] || '').trim()) messages.push(field.message);
  }
  return messages;
}

function normalizePem(value: string): string {
  return String(value || '').replace(/\\n/g, '\n').trim();
}

function normalizeTimeout(value: string, fallback: number): number {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function configError(message: string) {
  return Object.assign(new Error(message), { code: 4000 });
}
