// routes/public-config.ts
import { Router, Request, Response } from 'express';
import { queryOne, query } from '../utils/db';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { SettingsService } from '../services/settings.service';
import { normalizeTemplateTargetFeatureKey, toLegacyTemplate } from '../services/template.service';
import { getModelTierList } from '../services/model-tier-list.service';
import { getModelFeaturesList } from '../services/model-capability.service';
import { optionalUserAuthMiddleware } from '../middleware/auth';
import { sanitizeHelpHtml } from '../utils/html-sanitizer';
import { isActiveMember } from '../services/membership.service';

const router = Router();
const TEMPLATE_SAVE_USE_MEMBER_MESSAGE = '\u8be5\u6a21\u677f\u4e3a\u4f1a\u5458\u4e13\u5c5e\uff0c\u5f00\u901a\u4f1a\u5458\u540e\u53ef\u4fdd\u5b58\u7d20\u6750\u548c\u4f7f\u7528\u6a21\u677f\u3002';
const DEFAULT_CUSTOMER_SERVICE = {
  enabled: true,
  title: '联系客服',
  subtitle: '订单、会员、生成问题都可以咨询',
  icon: 'customer-service',
  showInProfile: true,
  sessionFrom: 'profile',
  showMessageCard: true,
  sendMessageTitle: 'AI创作助手客服咨询',
  sendMessagePath: '/pages/user/index',
  sendMessageImg: '',
};
const DEFAULT_HELP = {
  enabled: true,
  title: '使用帮助',
  contentHtml: '',
};
const DEFAULT_VISUAL_ASSETS = {
  homeBannerUrl: '',
  homeMemberUpsellUrl: '',
  inspirationBannerUrl: '',
  comicBannerUrl: '',
  profileMemberOfferBannerUrl: '',
};

// GET /public/app - all app_configs
router.get('/public/app', async (_req: Request, res: Response) => {
  try {
    const appName = await firstSetting(['public.app_name', 'app.name', 'site.name'], 'AI Creator');
    const publicKeys = [
      'compliance_tips',
      'membership.show_entry',
      'inspiration.member_gate_enabled',
      'template.member_gate_enabled',
      'template.user_share_enabled',
      'template.user_public_enabled',
      'template.require_manual_review',
      'template.require_content_check',
      'watermark_remove_enabled',
      'watermark_remove_required_plan',
    ];

    const [
      [wechatLoginEnabled, paymentEnabled, membershipEnabled],
      inviteEnabled,
      [promptOptimizeEnabled, scriptGenerateEnabled, promptGenerateEnabled, storyboardGenerateEnabled],
      [promptOptimizeMemberOnly, imageTemplateUseMemberOnly, saveToAlbumMemberOnly, templateSaveUseMemberOnly],
      [imageFeature, videoFeature],
      publicValues,
      allFeatureKeys,
      customerService,
      help,
      visualAssets,
      tabBarRaw,
    ] = await Promise.all([
      Promise.all([
        SettingsService.getBoolean('wechat.login_enabled', true),
        SettingsService.getBoolean('wechat_pay.enabled', false),
        SettingsService.getBoolean('membership.enabled', false),
      ]),
      SettingsService.getBoolean('invite.enabled', false),
      Promise.all([
        SettingsService.getBoolean('ai.prompt_optimize.enabled', false),
        SettingsService.getBoolean('ai.script_generate.enabled', false),
        SettingsService.getBoolean('ai.prompt_generate.enabled', false),
        SettingsService.getBoolean('ai.storyboard_generate.enabled', false),
      ]),
      Promise.all([
        SettingsService.getBoolean('membership.prompt_optimize_member_only', false),
        SettingsService.getBoolean('membership.image_template_use_member_only', false),
        SettingsService.getBoolean('membership.save_to_album_member_only', false),
        SettingsService.getBoolean('membership.template_save_use_member_only', false),
      ]),
      Promise.all([
        queryOne<any>("SELECT status FROM model_features WHERE feature_key = 'image_create'"),
        queryOne<any>("SELECT status FROM model_features WHERE feature_key = 'video_create'"),
      ]),
      Promise.all(publicKeys.map(async (key) => {
        const rawValue = await SettingsService.get(key, '');
        try {
          return [key, typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue] as const;
        } catch {
          return [key, rawValue] as const;
        }
      })),
      getModelFeaturesList('active'),
      getCustomerServiceConfig(),
      getHelpConfig(),
      getVisualAssetsConfig(),
      SettingsService.getString('miniapp.tab_bar', ''),
    ]);

    const result: Record<string, any> = {};
    for (const [key, value] of publicValues) {
      result[key] = value;
    }
    const featureKeys = allFeatureKeys.map((r: any) => r.feature_key);

    const modelTiers: Record<string, any[]> = {};
    const tierResults = await Promise.all(featureKeys.map(async (featureKey: string) => ({
      featureKey,
      tiers: await getModelTierList(featureKey),
    })));
    for (const { featureKey, tiers } of tierResults) {
      if (tiers?.list?.length) modelTiers[featureKey] = tiers.list;
    }

    result.appName = appName;
    result.siteName = appName;
    result.wechatLoginEnabled = wechatLoginEnabled;
    result.paymentEnabled = paymentEnabled;
    result.membershipEnabled = membershipEnabled;
    result.inviteEnabled = inviteEnabled;
    result['wechat.login_enabled'] = wechatLoginEnabled;
    result['wechat_pay.enabled'] = paymentEnabled;
    result['membership.enabled'] = membershipEnabled;
    result['membership.prompt_optimize_member_only'] = promptOptimizeMemberOnly;
    result['membership.image_template_use_member_only'] = imageTemplateUseMemberOnly;
    result['membership.save_to_album_member_only'] = saveToAlbumMemberOnly;
    result['membership.template_save_use_member_only'] = templateSaveUseMemberOnly;
    result['invite.enabled'] = inviteEnabled;
    result['feature.image_create.enabled'] = imageFeature?.status === 'active';
    result['feature.video_create.enabled'] = videoFeature?.status === 'active';
    result.features = {
      wechatLogin: wechatLoginEnabled,
      payment: paymentEnabled,
      membership: membershipEnabled,
      invite: inviteEnabled,
      imageCreate: imageFeature?.status === 'active',
      videoCreate: videoFeature?.status === 'active',
      promptOptimize: promptOptimizeEnabled,
      scriptGenerate: scriptGenerateEnabled,
      promptGenerate: promptGenerateEnabled,
      storyboardGenerate: storyboardGenerateEnabled,
    };
    result.memberOnly = {
      promptOptimize: promptOptimizeMemberOnly,
      imageTemplateUse: imageTemplateUseMemberOnly,
      saveToAlbum: saveToAlbumMemberOnly,
      templateSaveUse: templateSaveUseMemberOnly,
    };
    result.featureKeys = featureKeys;
    result.modelTiers = modelTiers;
    result.customerService = customerService;
    result.help = help;
    result.visualAssets = visualAssets;
    try { result.tabBar = tabBarRaw ? JSON.parse(tabBarRaw) : null; } catch { result.tabBar = null; }
    result.navigation = {
      tabBar: result.tabBar,
      bottom: result.tabBar,
      tabs: result.tabBar,
    };
    success(res, result);
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取公开配置失败'); }
});

// GET /public/model-tiers?feature=image_create
router.get('/public/model-tiers', optionalUserAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const feature = (req.query.feature as string) || 'image_create';
    const result = await getModelTierList(feature, req.user?.userId);
    if (!result) { error(res, ErrorCodes.NOT_FOUND, '功能不存在或已禁用', 404); return; }
    success(res, result);
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取模型档位失败'); }
});

// GET /public/templates?type=image|video&feature=text_to_image&page=1&pageSize=10
router.get('/public/templates', optionalUserAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const templateType = (req.query.type as string) || 'image';
    const feature = String(req.query.feature || '');
    const normalizedFeature = feature ? normalizeTemplateTargetFeatureKey(feature) : '';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(req.query.pageSize as string) || 10), 50);
    const rows = await query<any>(
      `SELECT t.*, c.name AS category_name
         FROM templates t
         LEFT JOIN template_categories c ON c.id = t.category_id
        WHERE t.template_type = ?
          AND t.deleted_at IS NULL
          AND t.is_enabled = 1
          AND t.visibility = 'public'
          AND t.status = 'approved'
          AND t.review_status = 'approved'
          AND t.source = 'official'
        ORDER BY t.is_recommended DESC, t.sort_order DESC, t.id DESC`,
      [templateType]
    );
    const permission = await getTemplateSaveUsePermission(req.user?.userId || 0);
    const all = await Promise.all(rows.map(async (row: any) => ({
      ...await normalizeLegacyTemplateMedia(toLegacyTemplate(row, row.category_name || '')),
      ...permission,
    })));

    // Filter by display_config feature if specified; sort pinned first
    let templates = all;
    if (normalizedFeature) {
      const featureAliases = targetFeatureLookupValues(normalizedFeature);
      templates = all
        .filter((t: any) => {
          const cfg = templateDisplayConfig(t, feature, normalizedFeature);
          if (cfg) return true;
          return featureAliases.includes(normalizeTemplateTargetFeatureKey(t.targetFeature));
        })
        .sort((a: any, b: any) => compareTemplatesForFeature(a, b, feature, normalizedFeature));
    }

    const total = templates.length;
    const start = (page - 1) * pageSize;
    success(res, { list: templates.slice(start, start + pageSize), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (err: any) {
    console.error('[public-config] templates failed:', err);
    error(res, ErrorCodes.SERVER_ERROR, '获取模板失败');
  }
});

async function getTemplateSaveUsePermission(userId: number) {
  const membershipEnabled = await SettingsService.getBoolean('membership.enabled', false);
  const templateSaveUseMemberOnly = membershipEnabled
    && await SettingsService.getBoolean('membership.template_save_use_member_only', false);
  if (!templateSaveUseMemberOnly || await isActiveMember(userId)) {
    return { canView: true, canUse: true, canSave: true, lockReason: '' };
  }
  return { canView: true, canUse: false, canSave: false, lockReason: TEMPLATE_SAVE_USE_MEMBER_MESSAGE };
}

export default router;

async function firstSetting(keys: string[], fallback: string): Promise<string> {
  for (const key of keys) {
    const value = await SettingsService.getString(key, '');
    if (value.trim()) return value;
  }
  return fallback;
}

function targetFeatureLookupValues(feature: string) {
  const normalized = normalizeTemplateTargetFeatureKey(feature);
  const values = new Set<string>([normalized]);
  if (normalized === 'text_to_image') values.add('image_create');
  if (normalized === 'text_to_video') values.add('video_create');
  if (normalized === 'image_edit') values.add('image_editing');
  return Array.from(values).filter(Boolean);
}

function templateDisplayConfig(template: any, rawFeature: string, normalizedFeature: string) {
  const displayConfig = template.displayConfig;
  if (!displayConfig || typeof displayConfig !== 'object') return null;
  return displayConfig[normalizedFeature] || displayConfig[rawFeature] || null;
}

function compareTemplatesForFeature(a: any, b: any, rawFeature: string, normalizedFeature: string) {
  const aPin = templatePinMeta(a, rawFeature, normalizedFeature);
  const bPin = templatePinMeta(b, rawFeature, normalizedFeature);
  if (aPin.pinned !== bPin.pinned) return bPin.pinned - aPin.pinned;
  if (aPin.pinOrder !== bPin.pinOrder) return bPin.pinOrder - aPin.pinOrder;
  if (Number(a.sortOrder || 0) !== Number(b.sortOrder || 0)) return Number(b.sortOrder || 0) - Number(a.sortOrder || 0);
  return Number(b.id || b.templateId || 0) - Number(a.id || a.templateId || 0);
}

function templatePinMeta(template: any, rawFeature: string, normalizedFeature: string) {
  const cfg = templateDisplayConfig(template, rawFeature, normalizedFeature);
  return {
    pinned: cfg?.pinned ? 1 : 0,
    pinOrder: Number(cfg?.pinOrder || 0),
  };
}

async function normalizeLegacyTemplateMedia(template: any) {
  return {
    ...template,
    coverUrl: await normalizePublicMediaUrl(template.coverUrl),
    previewUrl: await normalizePublicMediaUrl(template.previewUrl),
  };
}

async function normalizePublicMediaUrl(url: string): Promise<string> {
  const value = String(url || '').trim();
  if (!value || /^https?:\/\//i.test(value) || !value.startsWith('/')) return value;

  const apiDomain = String(process.env.APP_PUBLIC_URL || process.env.PUBLIC_API_DOMAIN || process.env.SITE_API_DOMAIN || '').trim().replace(/\/+$/, '')
    || String(await SettingsService.getString('site.api_domain', '')).trim().replace(/\/+$/, '');
  if (apiDomain) return `${apiDomain}${value}`;

  if (value.startsWith('/static/')) {
    const localBaseUrl = String(process.env.LOCAL_BASE_URL || '').trim().replace(/\/+$/, '')
      || String(await SettingsService.getString('storage.local.base_url', '')).trim().replace(/\/+$/, '');
    try {
      const parsed = new URL(localBaseUrl);
      return `${parsed.origin}${value}`;
    } catch {
      return value;
    }
  }

  return value;
}

async function getCustomerServiceConfig() {
  const [
    enabled,
    title,
    subtitle,
    icon,
    showInProfile,
    sessionFrom,
    showMessageCard,
    sendMessageTitle,
    sendMessagePath,
    sendMessageImg,
  ] = await Promise.all([
    SettingsService.getBoolean('customer_service.enabled', DEFAULT_CUSTOMER_SERVICE.enabled),
    SettingsService.getString('customer_service.title', DEFAULT_CUSTOMER_SERVICE.title),
    SettingsService.getString('customer_service.subtitle', DEFAULT_CUSTOMER_SERVICE.subtitle),
    SettingsService.getString('customer_service.icon', DEFAULT_CUSTOMER_SERVICE.icon),
    SettingsService.getBoolean('customer_service.show_in_profile', DEFAULT_CUSTOMER_SERVICE.showInProfile),
    SettingsService.getString('customer_service.session_from', DEFAULT_CUSTOMER_SERVICE.sessionFrom),
    SettingsService.getBoolean('customer_service.show_message_card', DEFAULT_CUSTOMER_SERVICE.showMessageCard),
    SettingsService.getString('customer_service.send_message_title', DEFAULT_CUSTOMER_SERVICE.sendMessageTitle),
    SettingsService.getString('customer_service.send_message_path', DEFAULT_CUSTOMER_SERVICE.sendMessagePath),
    SettingsService.getString('customer_service.send_message_img', DEFAULT_CUSTOMER_SERVICE.sendMessageImg),
  ]);

  return {
    enabled,
    title: title || DEFAULT_CUSTOMER_SERVICE.title,
    subtitle: subtitle || DEFAULT_CUSTOMER_SERVICE.subtitle,
    icon: icon || DEFAULT_CUSTOMER_SERVICE.icon,
    showInProfile,
    sessionFrom: sessionFrom || DEFAULT_CUSTOMER_SERVICE.sessionFrom,
    showMessageCard,
    sendMessageTitle: sendMessageTitle || DEFAULT_CUSTOMER_SERVICE.sendMessageTitle,
    sendMessagePath: sendMessagePath || DEFAULT_CUSTOMER_SERVICE.sendMessagePath,
    sendMessageImg: sendMessageImg || DEFAULT_CUSTOMER_SERVICE.sendMessageImg,
  };
}

async function getHelpConfig() {
  const [enabled, title, contentHtml] = await Promise.all([
    SettingsService.getBoolean('miniapp_help.enabled', DEFAULT_HELP.enabled),
    SettingsService.getString('miniapp_help.title', DEFAULT_HELP.title),
    SettingsService.getString('miniapp_help.content_html', DEFAULT_HELP.contentHtml),
  ]);

  return {
    enabled,
    title: title || DEFAULT_HELP.title,
    contentHtml: sanitizeHelpHtml(contentHtml || DEFAULT_HELP.contentHtml),
  };
}

async function getVisualAssetsConfig() {
  const [
    homeBannerUrl,
    homeMemberUpsellUrl,
    inspirationBannerUrl,
    comicBannerUrl,
    profileMemberOfferBannerUrl,
  ] = await Promise.all([
    SettingsService.getString('miniapp_visual_assets.home_banner_url', DEFAULT_VISUAL_ASSETS.homeBannerUrl),
    SettingsService.getString('miniapp_visual_assets.home_member_upsell_url', DEFAULT_VISUAL_ASSETS.homeMemberUpsellUrl),
    SettingsService.getString('miniapp_visual_assets.inspiration_banner_url', DEFAULT_VISUAL_ASSETS.inspirationBannerUrl),
    SettingsService.getString('miniapp_visual_assets.comic_banner_url', DEFAULT_VISUAL_ASSETS.comicBannerUrl),
    SettingsService.getString('miniapp_visual_assets.profile_member_offer_banner_url', DEFAULT_VISUAL_ASSETS.profileMemberOfferBannerUrl),
  ]);

  return {
    homeBannerUrl,
    homeMemberUpsellUrl,
    inspirationBannerUrl,
    comicBannerUrl,
    profileMemberOfferBannerUrl,
  };
}
