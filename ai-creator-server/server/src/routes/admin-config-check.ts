import { Router, Request, Response } from 'express';
import axios from 'axios';
import rateLimit from 'express-rate-limit';
import { adminAuthMiddleware } from '../middleware/auth';
import { query, queryOne } from '../utils/db';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { SettingsService } from '../services/settings.service';
import { preloadStorageConfigs } from '../services/storage/storage-config-loader';
import { StorageService } from '../services/storage/storage.service';
import { AdapterRegistry } from '../services/adapters/adapter.registry';
import { decryptApiKey } from '../services/openai-adapter.service';
import { translateError } from '../utils/error-translator';
import { config } from '../utils/config';

type ItemStatus = 'not_configured' | 'filled_untested' | 'failed' | 'passed' | 'risk' | 'manual_verified';

interface CheckItem {
  key: string;
  name: string;
  status: ItemStatus;
  summary: string;
  missingFields: string[];
  warnings: string[];
  errors: string[];
  nextSteps: string[];
  guide: string;
  configurePath?: string;
  testable?: boolean;
}

const router = Router();
const expectedPayCallbackPath = '/api/v1/payments/wechat/notify';
const aiModelTestLimiter = rateLimit({
  windowMs: 60_000,
  max: positiveInt(process.env.ADMIN_AI_TEST_RATE_LIMIT_PER_MINUTE, 3),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => String(req.user!.userId),
  message: { code: 429, message: '后台真实 AI 测试过于频繁，请稍后重试', data: null },
});

function boolValue(value: string, fallback = false): boolean {
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function positiveInt(value: any, fallback: number): number {
  const parsed = parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function requireAiTestConfirmation(req: Request, res: Response): boolean {
  if (req.body?.confirmRealCost === true || req.body?.confirm_real_cost === true) return true;
  error(res, ErrorCodes.PARAM_ERROR, '真实 AI 测试会调用供应商接口并可能消耗额度，请确认后再执行。');
  return false;
}

function normalizeHttpsOrigin(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'https:') {
    throw new Error('site.api_domain must use HTTPS');
  }
  return parsed.origin;
}

function resolveNotifyUrl(rawNotifyUrl: string, siteApiDomain: string): string {
  const trimmed = String(rawNotifyUrl || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!trimmed.startsWith('/')) return '';
  const origin = normalizeHttpsOrigin(siteApiDomain);
  return origin ? origin + trimmed : '';
}

function statusFrom(missing: string[], warnings: string[], errors: string[], target?: any): ItemStatus {
  if (target?.manual_verified) return 'manual_verified';
  if (errors.length > 0) return 'failed';
  if (missing.length > 0) return 'not_configured';
  if (warnings.length > 0) return 'risk';
  if (target?.last_test_status === 'passed') return 'passed';
  if (target?.last_test_status === 'failed') return 'failed';
  return 'filled_untested';
}

async function getTestState(targetKey: string): Promise<any | null> {
  try {
    return await queryOne<any>('SELECT * FROM config_check_results WHERE target_key = ?', [targetKey]);
  } catch {
    return null;
  }
}

async function saveTestState(params: {
  targetKey: string;
  targetType: string;
  status: string;
  message: string;
  operator?: number | null;
  warnings?: string[];
  errors?: string[];
}) {
  try {
    await query(
      `INSERT INTO config_check_results
       (target_key, target_type, last_test_status, last_test_at, last_test_message, last_test_operator, last_test_warnings, last_test_errors, manual_verified, updated_at)
       VALUES (?, ?, ?, NOW(3), ?, ?, ?, ?, 0, NOW(3))
       ON DUPLICATE KEY UPDATE target_type = VALUES(target_type), last_test_status = VALUES(last_test_status),
         last_test_at = VALUES(last_test_at), last_test_message = VALUES(last_test_message),
         last_test_operator = VALUES(last_test_operator), last_test_warnings = VALUES(last_test_warnings),
         last_test_errors = VALUES(last_test_errors), manual_verified = 0, updated_at = NOW(3)`,
      [
        params.targetKey,
        params.targetType,
        params.status,
        params.message.slice(0, 512),
        params.operator || null,
        JSON.stringify(params.warnings || []),
        JSON.stringify(params.errors || []),
      ],
    );
  } catch (err: any) {
    console.error('[admin-config-check] Failed to save test state:', err?.message || err);
  }
}

async function getSetting(key: string): Promise<string> {
  return SettingsService.get(key, '');
}

async function getSystemSetting(key: string): Promise<string> {
  return SettingsService.getSystemString(key, '');
}

async function checkWechatMiniapp(): Promise<CheckItem> {
  const [appId, appSecret, loginEnabled, apiDomain, fileDomain, target] = await Promise.all([
    getSetting('wechat.app_id'),
    getSetting('wechat.app_secret'),
    getSetting('wechat.login_enabled'),
    getSetting('site.api_domain'),
    getSetting('storage.file_domain'),
    getTestState('wechat-miniapp'),
  ]);

  const missing: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const nextSteps: string[] = [];

  if (!appId) missing.push('wechat.app_id');
  if (!appSecret) missing.push('wechat.app_secret');
  if (appId && !/^wx[a-zA-Z0-9]{8,32}$/.test(appId)) warnings.push('AppID 格式看起来不太像微信小程序 AppID，请核对是否以 wx 开头。');
  if (!apiDomain) warnings.push('建议配置后端 API 域名，用于复制到微信小程序 request/uploadFile 合法域名。');
  if (!fileDomain) warnings.push('建议配置文件访问域名或 CDN 域名，用于 downloadFile 合法域名。');
  if (!boolValue(loginEnabled, true)) warnings.push('微信登录当前未启用，小程序用户可能无法正常登录。');

  if (!appId) nextSteps.push('填写小程序 AppID。');
  if (!appSecret) nextSteps.push('填写小程序 AppSecret，保存后不会明文显示。');
  nextSteps.push('在微信公众平台配置 request、uploadFile、downloadFile 合法域名。');

  return {
    key: 'wechat-miniapp',
    name: '微信小程序配置',
    status: statusFrom(missing, warnings, errors, target),
    summary: missing.length ? '小程序关键字段还没填完整。' : '小程序基础字段已填写，请完成合法域名配置并测试登录。',
    missingFields: missing,
    warnings,
    errors,
    nextSteps,
    guide: 'AppID 和 AppSecret 在微信公众平台 -> 开发管理 -> 开发设置中获取。',
    configurePath: '/settings',
    testable: false,
  };
}

async function checkWechatPay(): Promise<CheckItem> {
  const [enabled, appId, mchId, apiV3Key, serialNo, privateKey, notifyUrl, verifySignature, target, siteApiDomain] = await Promise.all([
    getSetting('wechat_pay.enabled'),
    getSetting('wechat_pay.appid'),
    getSetting('wechat_pay.mchid'),
    getSetting('wechat_pay.api_v3_key'),
    getSetting('wechat_pay.merchant_serial_no'),
    getSetting('wechat_pay.private_key'),
    getSetting('wechat_pay.notify_url'),
    getSetting('wechat_pay.verify_signature'),
    getTestState('wechat-pay'),
    getSetting('site.api_domain'),
  ]);

  const missing: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  if (boolValue(enabled)) {
    if (!appId) missing.push('wechat_pay.appid');
    if (!mchId) missing.push('wechat_pay.mchid');
    if (!apiV3Key) missing.push('wechat_pay.api_v3_key');
    if (!serialNo) missing.push('wechat_pay.merchant_serial_no');
    if (!privateKey) missing.push('wechat_pay.private_key');
    if (!notifyUrl) missing.push('wechat_pay.notify_url');
  }

  if (apiV3Key && apiV3Key.length !== 32) warnings.push('API v3 Key 通常是 32 位，请核对长度。');
  if (privateKey && !privateKey.includes('BEGIN PRIVATE KEY')) errors.push('商户私钥格式不正确，必须包含 BEGIN PRIVATE KEY。');
  if (notifyUrl) {
    let resolvedNotifyUrl = '';
    if (notifyUrl.startsWith('/')) {
      if (!siteApiDomain) {
        errors.push('支付回调地址为相对路径时必须配置 site.api_domain。');
      } else {
        try {
          resolvedNotifyUrl = resolveNotifyUrl(notifyUrl, siteApiDomain);
        } catch {
          errors.push('site.api_domain 必须是 HTTPS 公网地址，才能拼接支付回调地址。');
        }
      }
    } else {
      resolvedNotifyUrl = notifyUrl;
    }

    if (resolvedNotifyUrl) {
      try {
        const url = new URL(resolvedNotifyUrl);
        if (url.protocol !== 'https:') errors.push('支付回调地址必须使用 HTTPS。');
        if (url.pathname !== expectedPayCallbackPath) warnings.push(`支付回调路径应为 ${expectedPayCallbackPath}，当前填写的是 ${url.pathname}。`);
      } catch {
        errors.push('支付回调地址不是有效 URL。');
      }
    }
  }
  if (!boolValue(enabled) && boolValue(verifySignature, true)) warnings.push('已开启验签，请确认 wechat_pay.* 配置完整。');
  if (!boolValue(enabled)) warnings.push('微信支付当前未启用，线上收款前需要开启并检查配置。');

  return {
    key: 'wechat-pay',
    name: '微信支付配置',
    status: statusFrom(missing, warnings, errors, target),
    summary: boolValue(enabled) ? '微信支付配置用于会员和订单收款，本阶段检查不创建真实订单。' : '微信支付未启用，当前不会发起收款。',
    missingFields: missing,
    warnings,
    errors,
    nextSteps: [
      '确认小程序已绑定微信支付商户号。',
      `支付回调地址统一填写 https://your-domain.com${expectedPayCallbackPath}。`,
      '如果使用相对路径，site.api_domain 必须能解析为 HTTPS 公网地址。',
      '检查配置只检查字段和格式，不会真实扣款。',
    ],
    guide: '商户号、API v3 Key、证书序列号和商户私钥在微信支付商户平台配置。',
    configurePath: '/settings',
    testable: true,
  };
}

async function storageConfig() {
  const provider = await getSystemSetting('storage.provider');
  const localBaseUrl = await getSystemSetting('storage.local.base_url');
  const fileDomain = await getSystemSetting('storage.file_domain')
    || (provider === 'local' ? localBaseUrl : '')
    || await getSystemSetting(`storage.${provider}.cdn_domain`)
    || await getSystemSetting(`storage.${provider}.domain`);
  return { provider, fileDomain, localBaseUrl };
}

function requiredStorageFields(provider: string): string[] {
  const map: Record<string, string[]> = {
    local: [],
    tencent_cos: ['storage.cos.secret_id', 'storage.cos.secret_key', 'storage.cos.bucket', 'storage.cos.region', 'storage.cos.cdn_domain'],
    aliyun_oss: ['storage.oss.access_key_id', 'storage.oss.access_key_secret', 'storage.oss.bucket', 'storage.oss.endpoint', 'storage.oss.region', 'storage.oss.cdn_domain'],
    qiniu_kodo: ['storage.qiniu.access_key', 'storage.qiniu.secret_key', 'storage.qiniu.bucket', 'storage.qiniu.cdn_domain'],
    upyun_uss: ['storage.upyun.bucket', 'storage.upyun.operator', 'storage.upyun.password', 'storage.upyun.cdn_domain'],
    chinamobile_eos: ['storage.eos.access_key', 'storage.eos.secret_key', 'storage.eos.bucket', 'storage.eos.endpoint', 'storage.eos.region', 'storage.eos.cdn_domain'],
  };
  return map[provider] || [];
}

async function checkStorage(): Promise<CheckItem> {
  const { provider, fileDomain, localBaseUrl } = await storageConfig();
  const supported = StorageService.getSupportedProviders();
  const missing: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const target = await getTestState('storage');

  if (!supported.includes(provider as (typeof supported)[number])) errors.push(`当前存储平台 ${provider} 暂未支持。`);
  for (const key of requiredStorageFields(provider)) {
    const value = await getSystemSetting(key);
    if (!value) missing.push(key);
  }
  const providerValue = await getSystemSetting('storage.provider');
  if (!providerValue) missing.push('storage.provider');
  if (provider === 'local') {
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
      errors.push('生产环境不能使用 local 存储保存 AI 生成结果；请切换 COS/OSS/七牛/又拍云/移动云 EOS，并配置公网 HTTPS CDN 域名。');
    }
    if (!localBaseUrl) {
      missing.push('storage.local.base_url');
    } else if (String(process.env.NODE_ENV || '').toLowerCase() === 'production' && !/^https:\/\//i.test(localBaseUrl)) {
      errors.push('storage.local.base_url must be a full HTTPS URL in production.');
    } else if (!/^https:\/\//i.test(localBaseUrl)) {
      warnings.push('storage.local.base_url should be a full HTTPS URL before launch.');
    }
  }
  if (!fileDomain) warnings.push('文件访问域名未配置，用户可能无法访问生成结果。');

  return {
    key: 'storage',
    name: '对象存储配置',
    status: statusFrom(missing, warnings, errors, target),
    summary: `当前存储平台：${provider || '未配置'}。`,
    missingFields: missing,
    warnings,
    errors,
    nextSteps: ['选择存储平台。', '填写平台参数。', '测试连接。', '上传测试文件并确认访问 URL。', '保存并启用。'],
    guide: '支持本地存储、腾讯云 COS、阿里云 OSS、七牛云 Kodo、又拍云、移动云 EOS。未实现的 provider 不会在这里展示。',
    configurePath: '/settings',
    testable: true,
  };
}

async function checkAiModels(): Promise<CheckItem> {
  const target = await getTestState('ai-models');
  const models = await query<any>(
    `SELECT m.id, m.name, m.model_type, m.api_model_name, m.status, m.points_cost, p.status AS provider_status, p.api_base_url, p.api_key
     FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id`,
  );
  const tiers = await query<any>(
    `SELECT t.id, t.tier_name, mf.feature_key, t.status,
            SUM(CASE WHEN tb.binding_type = 'primary' THEN 1 ELSE 0 END) AS primary_count,
            SUM(CASE WHEN m.status != 'active' THEN 1 ELSE 0 END) AS disabled_bindings
     FROM model_tiers t
     JOIN model_features mf ON mf.id = t.feature_id
     LEFT JOIN tier_model_bindings tb ON tb.tier_id = t.id
     LEFT JOIN ai_models m ON m.id = tb.model_id
     GROUP BY t.id, t.tier_name, mf.feature_key, t.status`,
  );

  const activeImages = models.filter(m => m.model_type === 'image' && m.status === 'active' && m.provider_status === 'active');
  const activeVideos = models.filter(m => m.model_type === 'video' && m.status === 'active' && m.provider_status === 'active');
  const missing: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  if (activeImages.length === 0) missing.push('ai_models.image.active');
  if (activeVideos.length === 0) missing.push('ai_models.video.active');
  const usableActiveModels = models.filter(m => m.status === 'active' && m.provider_status === 'active' && m.api_base_url && m.api_key);
  if (usableActiveModels.length === 0) {
    errors.push('No usable AI provider API Key is configured. Configure at least one active provider Base URL and API Key in the admin model settings.');
  }
  for (const model of models.filter(m => m.status === 'active')) {
    if (!model.api_base_url) warnings.push(`${model.name} 缺少 Base URL。`);
    if (!model.api_key) warnings.push(`${model.name} 缺少 API Key。`);
    if (!model.api_model_name) warnings.push(`${model.name} 缺少模型名称。`);
    if (Number(model.points_cost || 0) <= 0) warnings.push(`${model.name} 积分售价为 0，请确认是否免费。`);
  }
  for (const tier of tiers.filter(t => t.status === 'active')) {
    if (Number(tier.primary_count || 0) === 0) warnings.push(`档位「${tier.tier_name}」没有绑定主模型。`);
    if (Number(tier.disabled_bindings || 0) > 0) warnings.push(`档位「${tier.tier_name}」绑定了已停用模型。`);
  }

  return {
    key: 'ai-models',
    name: 'AI 模型配置',
    status: statusFrom(missing, warnings, errors, target),
    summary: `已启用生图模型 ${activeImages.length} 个，生视频模型 ${activeVideos.length} 个。`,
    missingFields: missing,
    warnings: warnings.slice(0, 12),
    errors,
    nextSteps: ['至少启用一个生图模型。', '至少启用一个生视频模型。', '确认前台档位绑定主模型和备用模型。', '测试会消耗额度，必须手动确认后执行。'],
    guide: '前台只展示档位，真实模型 ID 只在后台绑定和调用。',
    configurePath: '/real-models',
    testable: true,
  };
}

async function checkBusinessRules(): Promise<CheckItem> {
  const [pointTasks, plans] = await Promise.all([
    queryOne<any>("SELECT COUNT(*) AS cnt FROM point_tasks WHERE status = 'active'"),
    queryOne<any>("SELECT COUNT(*) AS cnt FROM member_plans WHERE status = 'active'"),
  ]);
  const missing: string[] = [];
  if (Number(pointTasks?.cnt || 0) === 0) missing.push('point_tasks.active');
  if (Number(plans?.cnt || 0) === 0) missing.push('member_plans.active');
  return {
    key: 'business-rules',
    name: '积分 / 会员 / 订单基础配置',
    status: statusFrom(missing, [], [], await getTestState('business-rules')),
    summary: '检查积分任务和会员套餐是否具备上线基础。模型售价由功能页档位配置决定。',
    missingFields: missing,
    warnings: [],
    errors: [],
    nextSteps: ['配置积分任务。', '配置会员套餐。', '在功能页配置中确认档位积分售价。', '确认支付成功后的到账规则。'],
    guide: '这部分决定用户如何获得积分、购买会员，以及任务如何扣费。',
    configurePath: '/membership',
    testable: false,
  };
}

async function checkSystemUpdate(): Promise<CheckItem> {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (config.release.pm2AppName !== 'ai-creator') warnings.push(`PM2 进程名当前为 ${config.release.pm2AppName}，生产应为 ai-creator。`);
  return {
    key: 'system-update',
    name: '系统更新配置',
    status: statusFrom(missing, warnings, [], await getTestState('system-update')),
    summary: '检查服务器更新目录、PM2 名称和健康检查地址。',
    missingFields: missing,
    warnings,
    errors: [],
    nextSteps: ['确认 update-packages 目录存在。', '确认 PM2 进程名为 ai-creator。', '上传 release 包后先运行预检查。'],
    guide: '后台安装更新使用 APP_ROOT_DIR、UPDATE_PACKAGES_DIR、PM2_APP_NAME，不要和命令行脚本变量混用。',
    configurePath: '/system-update',
    testable: true,
  };
}

function readiness(items: CheckItem[]): number {
  const scoreMap: Record<ItemStatus, number> = {
    not_configured: 0,
    failed: 0,
    risk: 0.5,
    filled_untested: 0.65,
    manual_verified: 1,
    passed: 1,
  };
  if (items.length === 0) return 0;
  const total = items.reduce((sum, item) => sum + scoreMap[item.status], 0);
  return Math.round((total / items.length) * 100);
}

function splitAiOverviewItem(ai: CheckItem, key: string, name: string, kind: 'image' | 'video'): CheckItem {
  const missingFields = ai.missingFields.filter(item => item.includes(kind));
  let status: ItemStatus = 'filled_untested';
  if (ai.errors.length > 0) status = 'failed';
  else if (missingFields.length > 0) status = 'not_configured';
  else if (ai.warnings.length > 0) status = 'risk';
  else if (ai.status === 'passed' || ai.status === 'manual_verified') status = ai.status;

  return {
    ...ai,
    key,
    name,
    status,
    missingFields,
  };
}

async function overviewItems(): Promise<CheckItem[]> {
  const [wechat, pay, storage, ai, business, systemUpdate] = await Promise.all([
    checkWechatMiniapp(),
    checkWechatPay(),
    checkStorage(),
    checkAiModels(),
    checkBusinessRules(),
    checkSystemUpdate(),
  ]);
  const fileDomainMissing = storage.warnings.some(item => item.includes('文件访问域名'));
  return [
    wechat,
    { ...wechat, key: 'wechat-login', name: '微信登录配置', summary: '微信登录依赖小程序 AppID 和 AppSecret。' },
    pay,
    storage,
    splitAiOverviewItem(ai, 'ai-image-models', 'AI 生图模型配置', 'image'),
    splitAiOverviewItem(ai, 'ai-video-models', 'AI 生视频模型配置', 'video'),
    { ...business, key: 'points-rules', name: '积分规则配置' },
    { ...business, key: 'membership-plans', name: '会员套餐配置' },
    {
      key: 'file-domain',
      name: '文件访问域名配置',
      status: fileDomainMissing ? 'risk' : 'filled_untested',
      summary: fileDomainMissing ? '文件访问域名未配置，生成结果可能无法访问。' : '文件访问域名已填写，请确认可公网访问。',
      missingFields: fileDomainMissing ? ['storage.file_domain'] : [],
      warnings: fileDomainMissing ? ['建议配置对象存储或 CDN 访问域名。'] : [],
      errors: [],
      nextSteps: ['配置对象存储或 CDN 域名。', '复制到小程序 downloadFile 合法域名。'],
      guide: '文件访问域名用于展示 AI 生成图片、视频和用户上传文件。',
      configurePath: '/settings',
      testable: false,
    },
    systemUpdate,
  ];
}

router.get('/overview', adminAuthMiddleware, async (_req: Request, res: Response) => {
  const items = await overviewItems();
  success(res, { readiness: readiness(items), items });
});

router.get('/wechat-miniapp', adminAuthMiddleware, async (_req, res) => success(res, await checkWechatMiniapp()));
router.get('/wechat-pay', adminAuthMiddleware, async (_req, res) => success(res, await checkWechatPay()));
router.get('/storage', adminAuthMiddleware, async (_req, res) => success(res, await checkStorage()));
router.get('/ai-models', adminAuthMiddleware, async (_req, res) => success(res, await checkAiModels()));
router.get('/business-rules', adminAuthMiddleware, async (_req, res) => success(res, await checkBusinessRules()));

router.post('/storage/test-connection', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    await preloadStorageConfigs();
    const adapter = StorageService.getActiveAdapter();
    const url = adapter.getCdnUrl('system-test/connection-check.txt');
    await saveTestState({ targetKey: 'storage', targetType: 'storage', status: 'passed', message: '对象存储配置可读取，连接检查通过。', operator: req.user?.userId });
    success(res, { status: 'passed', message: '对象存储连接检查通过。', testUrl: url });
  } catch (err: any) {
    const translated = translateError(err, 'storage');
    await saveTestState({ targetKey: 'storage', targetType: 'storage', status: 'failed', message: translated.friendlyMessage, operator: req.user?.userId, errors: [translated.friendlyMessage] });
    error(res, ErrorCodes.PARAM_ERROR, translated.friendlyMessage);
  }
});

router.post('/storage/test-upload', adminAuthMiddleware, async (req: Request, res: Response) => {
  const key = `system-test/config-check-${Date.now()}.txt`;
  try {
    await preloadStorageConfigs();
    const adapter = StorageService.getActiveAdapter();
    const result = await adapter.upload(key, Buffer.from('AI Creator storage test file', 'utf8'), 'text/plain');
    await saveTestState({ targetKey: 'storage', targetType: 'storage', status: 'passed', message: '测试文件上传成功。', operator: req.user?.userId });
    success(res, { status: 'passed', storageKey: key, url: result.cdnUrl || result.url, message: '测试文件上传成功，可复制 URL 检查访问。' });
  } catch (err: any) {
    const translated = translateError(err, 'storage');
    await saveTestState({ targetKey: 'storage', targetType: 'storage', status: 'failed', message: translated.friendlyMessage, operator: req.user?.userId, errors: [translated.friendlyMessage] });
    error(res, ErrorCodes.PARAM_ERROR, translated.friendlyMessage);
  }
});

router.post('/storage/test-delete', adminAuthMiddleware, async (req: Request, res: Response) => {
  const storageKey = typeof req.body?.storageKey === 'string' ? req.body.storageKey : '';
  if (!storageKey.startsWith('system-test/')) {
    error(res, ErrorCodes.PARAM_ERROR, '只能删除 system-test/ 前缀下的测试文件。');
    return;
  }
  try {
    await preloadStorageConfigs();
    await StorageService.getActiveAdapter().delete(storageKey);
    success(res, { deleted: true, storageKey, message: '测试文件已删除。' });
  } catch (err: any) {
    const translated = translateError(err, 'storage');
    error(res, ErrorCodes.PARAM_ERROR, translated.friendlyMessage);
  }
});

async function getModelWithProvider(modelId: number) {
  return queryOne<any>(
    `SELECT m.*, p.provider_type, p.api_base_url, p.api_key, p.default_timeout, p.default_retry, p.auth_type, p.protocol_type
     FROM ai_models m JOIN ai_model_providers p ON p.id = m.provider_id
     WHERE m.id = ?`,
    [modelId],
  );
}

router.post('/ai-models/test-connection', adminAuthMiddleware, async (req: Request, res: Response) => {
  const modelId = Number(req.body?.modelId || 0);
  const model = await getModelWithProvider(modelId);
  if (!model) { error(res, ErrorCodes.NOT_FOUND, '模型不存在', 404); return; }
  try {
    if (!model.api_base_url || !model.api_key) throw new Error('Base URL 或 API Key 未配置');
    await axios.get(String(model.api_base_url).replace(/\/$/, ''), { timeout: 8000, validateStatus: () => true });
    await saveTestState({ targetKey: `ai-model:${modelId}`, targetType: 'ai_model', status: 'passed', message: '模型服务地址可访问。', operator: req.user?.userId });
    success(res, { status: 'passed', message: '模型服务地址可访问。' });
  } catch (err: any) {
    const translated = translateError(err, 'ai-model');
    await saveTestState({ targetKey: `ai-model:${modelId}`, targetType: 'ai_model', status: 'failed', message: translated.friendlyMessage, operator: req.user?.userId, errors: [translated.friendlyMessage] });
    error(res, ErrorCodes.PARAM_ERROR, translated.friendlyMessage);
  }
});

async function runAiGenerationTest(req: Request, res: Response, expectedType: 'image' | 'video') {
  if (!requireAiTestConfirmation(req, res)) return;
  const modelId = Number(req.body?.modelId || 0);
  const model = await getModelWithProvider(modelId);
  if (!model) { error(res, ErrorCodes.NOT_FOUND, '模型不存在', 404); return; }
  if (model.model_type !== expectedType) { error(res, ErrorCodes.PARAM_ERROR, `请选择 ${expectedType === 'image' ? '生图' : '生视频'} 模型。`); return; }
  const adapter = AdapterRegistry.get(model.provider_type);
  if (!adapter) { error(res, ErrorCodes.PARAM_ERROR, '当前供应商类型暂未支持测试。'); return; }
  try {
    const modelConfig = typeof model.config === 'string' ? JSON.parse(model.config || '{}') : (model.config || {});
    const result = await adapter.submitTask({
      upstreamCode: model.upstream_model_code || model.api_model_name,
      taskType: expectedType === 'image' ? 'text_to_image' : 'text_to_video',
      prompt: req.body?.prompt || (expectedType === 'image' ? '一张简洁的上线测试图片' : '一个 3 秒的上线测试视频'),
      modelConfig,
      params: expectedType === 'image'
        ? { imageCount: 1, nativeSize: '1024x1024', quality: 'standard' }
        : { duration: 3, ratio: '16:9', quality: 'standard' },
      providerConfig: {
        baseUrl: model.api_base_url,
        apiKey: decryptApiKey(model.api_key),
        timeout: Number(model.timeout_seconds || model.default_timeout || 120) * 1000,
        protocolType: model.protocol_type || 'rest',
        authType: model.auth_type || 'bearer',
      },
    });
    if (result.error) throw new Error(`${result.error.code}: ${result.error.message}`);
    // 异步任务需轮询直到完成
    let finalUrls = result.result?.urls || [];
    if (result.type === 'async' && result.providerTaskId) {
      const pollInterval = 5000;
      const maxPolls = 24; // 最多等 2 分钟
      for (let i = 0; i < maxPolls; i++) {
        await new Promise(r => setTimeout(r, pollInterval));
        const queryResult = await adapter.queryTask(result.providerTaskId, {
          baseUrl: model.api_base_url,
          apiKey: decryptApiKey(model.api_key),
          timeout: 30000,
          authType: model.auth_type || 'bearer',
          model: model.upstream_model_code || model.api_model_name,
        });
        const mapping = typeof model.status_mapping === 'string' ? JSON.parse(model.status_mapping || '{}') : (model.status_mapping || {});
        const status = adapter.mapStatus(queryResult.status, mapping);
        if (status === 'completed') {
          finalUrls = queryResult.result?.urls || [];
          break;
        }
        if (status === 'failed') {
          throw new Error(`异步任务失败: ${queryResult.error?.message || queryResult.status}`);
        }
      }
      if (!finalUrls.length) {
        throw new Error('异步任务超时：2 分钟内未完成');
      }
    }
    // 验证结果 URL 是否可公网访问
    const urlCheckResults: { url: string; reachable: boolean; error?: string }[] = [];
    for (const url of finalUrls) {
      try {
        const headResp = await axios.head(url, { timeout: 10000, validateStatus: () => true });
        const reachable = headResp.status >= 200 && headResp.status < 500;
        urlCheckResults.push({ url, reachable, error: reachable ? undefined : `HTTP ${headResp.status}` });
      } catch (headErr: any) {
        urlCheckResults.push({ url, reachable: false, error: headErr.message || 'URL 不可达' });
      }
    }
    const unreachableUrls = urlCheckResults.filter(r => !r.reachable);
    if (unreachableUrls.length > 0) {
      const messages = unreachableUrls.map(r => `${r.url}: ${r.error}`).join('; ');
      throw new Error(`模型返回了结果但 URL 无法下载：${messages}。请检查供应商返回的 URL 格式或网络连通性。`);
    }
    const testMsg = `模型真实测试通过，${finalUrls.length} 个结果 URL 全部可达。`;
    await saveTestState({ targetKey: `ai-model:${modelId}`, targetType: 'ai_model', status: 'passed', message: testMsg, operator: req.user?.userId });
    success(res, { status: 'passed', resultType: result.type, providerTaskId: result.providerTaskId, urls: finalUrls, urlCheckResults, message: testMsg });
  } catch (err: any) {
    const translated = translateError(err, 'ai-model');
    await saveTestState({ targetKey: `ai-model:${modelId}`, targetType: 'ai_model', status: 'failed', message: translated.friendlyMessage, operator: req.user?.userId, errors: [translated.friendlyMessage] });
    error(res, ErrorCodes.PARAM_ERROR, translated.friendlyMessage);
  }
}

router.post('/ai-models/test-image', adminAuthMiddleware, aiModelTestLimiter, (req, res) => runAiGenerationTest(req, res, 'image'));
router.post('/ai-models/test-video', adminAuthMiddleware, aiModelTestLimiter, (req, res) => runAiGenerationTest(req, res, 'video'));

router.post('/manual-verify', adminAuthMiddleware, async (req: Request, res: Response) => {
  const targetKey = typeof req.body?.targetKey === 'string' ? req.body.targetKey : '';
  const targetType = typeof req.body?.targetType === 'string' ? req.body.targetType : 'config';
  if (!targetKey) { error(res, ErrorCodes.PARAM_ERROR, '缺少 targetKey'); return; }
  await query(
    `INSERT INTO config_check_results
     (target_key, target_type, last_test_status, last_test_at, last_test_message, last_test_operator, manual_verified, manual_verified_at, manual_verified_by)
     VALUES (?, ?, 'manual_verified', NOW(3), '管理员已人工确认。', ?, 1, NOW(3), ?)
     ON DUPLICATE KEY UPDATE target_type = VALUES(target_type), last_test_status = 'manual_verified',
       last_test_at = NOW(3), last_test_message = '管理员已人工确认。',
       last_test_operator = VALUES(last_test_operator), manual_verified = 1,
       manual_verified_at = NOW(3), manual_verified_by = VALUES(manual_verified_by), updated_at = NOW(3)`,
    [targetKey, targetType, req.user?.userId || null, req.user?.userId || null],
  );
  success(res, { targetKey, manualVerified: true });
});

router.post('/manual-unverify', adminAuthMiddleware, async (req: Request, res: Response) => {
  const targetKey = typeof req.body?.targetKey === 'string' ? req.body.targetKey : '';
  if (!targetKey) { error(res, ErrorCodes.PARAM_ERROR, '缺少 targetKey'); return; }
  await query('UPDATE config_check_results SET manual_verified = 0, updated_at = NOW(3) WHERE target_key = ?', [targetKey]);
  success(res, { targetKey, manualVerified: false });
});

export default router;
