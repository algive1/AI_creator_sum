import axios, { AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import { SettingsService } from './settings.service';
import { WechatPayConfig } from './payment-config.service';

const WECHAT_PAY_API_BASE_URL = 'https://api.mch.weixin.qq.com';
const WECHAT_PAY_SANDBOX_BASE_URL = 'https://api.mch.weixin.qq.com/sandboxnew';
const WECHAT_PAY_NOTIFY_PATH = '/api/v1/payments/wechat/notify';
const PLATFORM_CERT_CACHE = new Map<string, { pem: string; cachedAt: number }>();
const PLATFORM_CERT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface JsapiPrepayInput {
  orderNo: string;
  description: string;
  amountTotal: number;
  openid: string;
  notifyUrl: string;
}

export interface JsapiPaymentParams {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'RSA';
  paySign: string;
}

export interface WechatNotifyHeaders {
  timestamp?: string;
  nonce?: string;
  signature?: string;
  serial?: string;
}

export interface WechatNotifyResource {
  algorithm: string;
  ciphertext: string;
  associated_data?: string;
  nonce: string;
}

export interface WechatNotifyPayload {
  id: string;
  create_time: string;
  event_type: string;
  resource_type: string;
  resource: WechatNotifyResource;
}

export interface WechatTransactionQueryResult {
  appid: string;
  mchid: string;
  out_trade_no: string;
  transaction_id?: string;
  trade_state: string;
  trade_state_desc?: string;
  success_time?: string;
  payer?: { openid?: string };
  amount?: { total: number; currency: string; payer_total?: number; payer_currency?: string };
  scene_info?: Record<string, any>;
  attach?: string;
  description?: string;
}

export interface WechatCertificatesResponse {
  data?: Array<{
    serial_no: string;
    effective_time?: string;
    expire_time?: string;
    encrypt_certificate: {
      algorithm: string;
      associated_data: string;
      nonce: string;
      ciphertext: string;
    };
  }>;
}

export function signWithPrivateKey(privateKey: string, message: string): string {
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(message);
  sign.end();
  return sign.sign(privateKey, 'base64');
}

export function buildAuthorizationHeader(params: {
  method: string;
  pathWithQuery: string;
  body: string;
  mchId: string;
  merchantSerialNo: string;
  privateKey: string;
  timestamp?: string;
  nonceStr?: string;
}): { authorization: string; timestamp: string; nonceStr: string } {
  const timestamp = params.timestamp || Math.floor(Date.now() / 1000).toString();
  const nonceStr = params.nonceStr || randomNonce();
  const message = [
    params.method.toUpperCase(),
    params.pathWithQuery,
    timestamp,
    nonceStr,
    params.body,
    '',
  ].join('\n');
  const signature = signWithPrivateKey(params.privateKey, message);
  const authorizationParams = [
    `mchid="${params.mchId}"`,
    `nonce_str="${nonceStr}"`,
    `signature="${signature}"`,
    `timestamp="${timestamp}"`,
    `serial_no="${params.merchantSerialNo}"`,
  ].join(',');
  const authorization = `WECHATPAY2-SHA256-RSA2048 ${authorizationParams}`;
  return { authorization, timestamp, nonceStr };
}

export async function createJsapiPrepay(input: JsapiPrepayInput, cfg: WechatPayConfig): Promise<{ prepayId: string; response: any }> {
  const body = JSON.stringify({
    appid: cfg.appId,
    mchid: cfg.mchId,
    description: input.description,
    out_trade_no: input.orderNo,
    notify_url: input.notifyUrl,
    amount: {
      total: Math.trunc(input.amountTotal),
      currency: 'CNY',
    },
    payer: {
      openid: input.openid,
    },
  });
  const path = '/v3/pay/transactions/jsapi';
  const headers = buildRequestHeaders('POST', path, body, cfg);
  const response = await requestWechatPay<any>({
    method: 'POST',
    path,
    body,
    headers,
    cfg,
  });
  if (!response?.prepay_id) {
    throw Object.assign(new Error('微信支付下单未返回 prepay_id'), { code: 3010, response });
  }
  return { prepayId: String(response.prepay_id), response };
}

export async function queryJsapiOrder(orderNo: string, cfg: WechatPayConfig): Promise<WechatTransactionQueryResult> {
  const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}?mchid=${encodeURIComponent(cfg.mchId)}`;
  const headers = buildRequestHeaders('GET', path, '', cfg);
  return requestWechatPay<WechatTransactionQueryResult>({
    method: 'GET',
    path,
    body: '',
    headers,
    cfg,
  });
}

export async function getPlatformCertificatePem(serialNo: string, cfg: WechatPayConfig): Promise<string> {
  const direct = normalizePem(cfg.platformCert);
  if (direct && (!serialNo || !cfg.platformCertSerialNo || cfg.platformCertSerialNo === serialNo)) {
    return direct;
  }

  const cached = PLATFORM_CERT_CACHE.get(serialNo);
  if (cached && Date.now() - cached.cachedAt < PLATFORM_CERT_CACHE_TTL_MS) {
    return cached.pem;
  }

  const response = await fetchPlatformCertificates(cfg);
  const certs = Array.isArray(response?.data) ? response.data : [];
  for (const cert of certs) {
    const pem = decryptCertificate(cert.encrypt_certificate, cfg.apiV3Key);
    PLATFORM_CERT_CACHE.set(cert.serial_no, { pem, cachedAt: Date.now() });
  }

  const matched = PLATFORM_CERT_CACHE.get(serialNo);
  if (matched) return matched.pem;

  throw Object.assign(new Error(`未找到微信支付平台证书: ${serialNo}`), { code: 3011 });
}

export async function verifyNotifySignature(headers: WechatNotifyHeaders, rawBody: string, cfg: WechatPayConfig): Promise<boolean> {
  if (!headers.timestamp || !headers.nonce || !headers.signature || !headers.serial) {
    return false;
  }
  const message = `${headers.timestamp}\n${headers.nonce}\n${rawBody}\n`;
  const certificate = await getPlatformCertificatePem(headers.serial, cfg);
  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(message);
  verify.end();
  return verify.verify(certificate, headers.signature, 'base64');
}

export function decryptNotifyResource(resource: WechatNotifyResource, apiV3Key: string): any {
  if (!resource || resource.algorithm !== 'AEAD_AES_256_GCM') {
    throw Object.assign(new Error('微信回调资源算法不支持'), { code: 3012 });
  }
  const plaintext = decryptAes256Gcm(resource.ciphertext, resource.associated_data || '', resource.nonce, apiV3Key);
  try {
    return JSON.parse(plaintext);
  } catch {
    return plaintext;
  }
}

export function decryptCertificate(
  encryptCertificate: { algorithm: string; associated_data: string; nonce: string; ciphertext: string },
  apiV3Key: string,
): string {
  if (!encryptCertificate || encryptCertificate.algorithm !== 'AEAD_AES_256_GCM') {
    throw Object.assign(new Error('微信平台证书算法不支持'), { code: 3011 });
  }
  return decryptAes256Gcm(
    encryptCertificate.ciphertext,
    encryptCertificate.associated_data || '',
    encryptCertificate.nonce,
    apiV3Key,
  );
}

export async function buildJsapiPaymentParams(input: {
  appId: string;
  prepayId: string;
  privateKey: string;
}): Promise<JsapiPaymentParams> {
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = randomNonce();
  const packageValue = `prepay_id=${input.prepayId}`;
  const message = `${input.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`;
  const paySign = signWithPrivateKey(input.privateKey, message);
  return {
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: 'RSA',
    paySign,
  };
}

function buildRequestHeaders(method: string, path: string, body: string, cfg: WechatPayConfig): Record<string, string> {
  const { authorization } = buildAuthorizationHeader({
    method,
    pathWithQuery: path,
    body,
    mchId: cfg.mchId,
    merchantSerialNo: cfg.merchantSerialNo,
    privateKey: cfg.privateKey,
  });
  return {
    Authorization: authorization,
    'Content-Type': 'application/json; charset=utf-8',
    Accept: 'application/json',
  };
}

async function requestWechatPay<T>(params: {
  method: 'GET' | 'POST';
  path: string;
  body: string;
  headers: Record<string, string>;
  cfg: WechatPayConfig;
}): Promise<T> {
  const url = resolveApiBaseUrl(params.cfg) + params.path;
  const requestConfig: AxiosRequestConfig = {
    method: params.method,
    url,
    headers: params.headers,
    data: params.body || undefined,
    timeout: 15000,
    validateStatus: () => true,
  };

  const response = await axios.request(requestConfig);
  const data = response.data;

  if (response.status < 200 || response.status >= 300) {
    const message = extractWeChatErrorMessage(data, response.status);
    throw Object.assign(new Error(message), { code: 3010, response: data, status: response.status });
  }

  return data as T;
}

async function fetchPlatformCertificates(cfg: WechatPayConfig): Promise<WechatCertificatesResponse> {
  const path = '/v3/certificates';
  const headers = buildRequestHeaders('GET', path, '', cfg);
  return requestWechatPay<WechatCertificatesResponse>({
    method: 'GET',
    path,
    body: '',
    headers,
    cfg,
  });
}

function resolveApiBaseUrl(cfg: WechatPayConfig): string {
  if (cfg.env === 'sandbox') {
    return WECHAT_PAY_SANDBOX_BASE_URL;
  }
  return WECHAT_PAY_API_BASE_URL;
}

function extractWeChatErrorMessage(data: any, status: number): string {
  if (data && typeof data === 'object') {
    const code = data.code || status;
    const message = data.message || data.errmsg || '微信支付接口返回错误';
    return `${code}: ${message}`;
  }
  if (typeof data === 'string' && data.trim()) return data.slice(0, 200);
  return `微信支付接口返回错误 (${status})`;
}

function decryptAes256Gcm(ciphertextBase64: string, associatedData: string, nonce: string, key: string): string {
  const content = Buffer.from(ciphertextBase64, 'base64');
  if (content.length < 17) {
    throw Object.assign(new Error('微信支付密文格式错误'), { code: 3012 });
  }
  const authTag = content.subarray(content.length - 16);
  const encrypted = content.subarray(0, content.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key, 'utf8'), Buffer.from(nonce, 'utf8'));
  if (associatedData) {
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
  }
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

function normalizePem(value: string): string {
  return String(value || '').replace(/\\n/g, '\n').trim();
}

function randomNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

export async function buildResolvedNotifyUrl(rawNotifyUrl: string): Promise<string> {
  const trimmed = String(rawNotifyUrl || '').trim();
  if (!trimmed) {
    throw Object.assign(new Error('微信支付回调地址未配置'), { code: 4000 });
  }
  if (/^https?:\/\//i.test(trimmed)) return assertWechatNotifyUrl(trimmed);
  if (!trimmed.startsWith('/')) {
    throw Object.assign(new Error('微信支付回调地址格式不正确'), { code: 4000 });
  }

  const apiDomain = await SettingsService.getString('site.api_domain', '');
  if (!apiDomain.trim()) {
    throw Object.assign(new Error('站点 API 域名未配置，无法拼接微信支付回调地址'), { code: 4000 });
  }
  return assertWechatNotifyUrl(normalizeHttpsOrigin(apiDomain) + trimmed);
}

function normalizeHttpsOrigin(value: string): string {
  const trimmed = String(value || '').trim();
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(candidate);
  if (url.protocol !== 'https:') {
    throw Object.assign(new Error('site.api_domain 必须使用 HTTPS'), { code: 4000 });
  }
  return url.origin;
}

function assertWechatNotifyUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
      throw Object.assign(new Error('微信支付回调地址必须使用 HTTPS'), { code: 4000 });
    }
    if (url.pathname !== WECHAT_PAY_NOTIFY_PATH) {
      throw Object.assign(new Error(`微信支付回调路径必须为 ${WECHAT_PAY_NOTIFY_PATH}`), { code: 4000 });
    }
    return url.toString();
  } catch (err: any) {
    if (err?.code) throw err;
    throw Object.assign(new Error('微信支付回调地址不是有效 URL'), { code: 4000 });
  }
}
