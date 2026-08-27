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
import { normalizePublicMediaUrl } from '../utils/public-media-url';
import { preloadStorageConfigs } from '../services/storage/storage-config-loader';
import { StorageService } from '../services/storage/storage.service';
import { getToolsConfig, loadToolsSettingsSnapshot } from '../services/tools.service';
import { buildCommerceAvailability } from '../services/commerce-availability.service';
import { normalizeFreeImageQuotaConfig } from '../services/free-image-quota.service';

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
  sendMessageTitle: 'AI艺术生成工坊客服咨询',
  sendMessagePath: '/pages/user/index',
  sendMessageImg: '',
};
const DEFAULT_HELP = {
  enabled: true,
  title: '使用帮助',
  contentHtml: '',
};
const DEFAULT_PROMPT_GUIDES = {
  enabled: true,
};
const PROMPT_GUIDE_MODE_KEYS = [
  'ai_image.text2img',
  'ai_image.img2img',
  'ai_image.edit',
  'ai_video.text2video',
  'ai_video.img2video',
  'ai_video.reference',
  'ai_video.first_last_frame',
  'ai_video.edit',
  'comic.story',
] as const;
type PublicHelpItem = {
  id: string;
  title: string;
  subtitle: string;
  contentHtml: string;
  mediaType: 'image' | 'video' | '';
  mediaUrl: string;
  mediaRatio: string;
  copyText: string;
  copyLabel: string;
};
type PromptGuideModeKey = typeof PROMPT_GUIDE_MODE_KEYS[number];
type PublicPromptGuideItem = {
  key: PromptGuideModeKey;
  enabled: boolean;
  placeholder: string;
  title: string;
  subtitle: string;
  contentHtml: string;
  copyText: string;
  copyLabel: string;
  helpId: string;
};
const DEFAULT_VISUAL_ASSETS = {
  homeBannerUrl: '',
  homeMemberUpsellUrl: '',
  inspirationBannerUrl: '',
  comicBannerUrl: '',
  profileMemberOfferBannerUrl: '',
};
const DEFAULT_TAB_BAR = [
  { text: '首页', pagePath: '/pages/home/index', icon: 'home', enabled: true },
  { text: '灵感', pagePath: '/pages/inspiration/index', icon: 'spark', enabled: true },
  { text: '工具', pagePath: '/pages/tools/index', icon: 'tools', enabled: true },
  { text: '记录', pagePath: '/pages/history/index', icon: 'record', enabled: true },
  { text: '我的', pagePath: '/pages/profile/index', icon: 'mine', enabled: true },
];
const DEFAULT_HOME_ENTRY_NOTICE = '功能维护中，请稍后再试';
const HOME_ENTRY_KEYS = ['image', 'video', 'comic'] as const;
type PublicSettingsSnapshot = Record<string, string>;

async function loadPublicSettingsSnapshot(): Promise<PublicSettingsSnapshot> {
  const rows = await query<any>(
    `SELECT config_key, config_value, is_secret, 0 AS source_order FROM system_configs
     UNION ALL
     SELECT config_key, config_value, 0 AS is_secret, 1 AS source_order FROM app_configs
     ORDER BY source_order`,
  );
  const snapshot: PublicSettingsSnapshot = {};
  for (const row of rows) {
    const key = String(row.config_key || '');
    if (!key || snapshot[key] !== undefined || Number(row.is_secret || 0)) continue;
    const value = normalizeConfigValue(row.config_value);
    if (value.trim() !== '') snapshot[key] = value;
  }
  return snapshot;
}

function settingString(settings: PublicSettingsSnapshot, key: string, defaultValue = ''): string {
  const value = settings[key];
  if (value === undefined || value === null || String(value).trim() === '') return defaultValue;
  return String(value);
}

function settingBoolean(settings: PublicSettingsSnapshot, key: string, defaultValue: boolean): boolean {
  const value = settingString(settings, key, defaultValue ? 'true' : 'false').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return defaultValue;
}

function parseSetting(settings: PublicSettingsSnapshot, key: string, defaultValue: any = '') {
  const rawValue = settingString(settings, key, defaultValue);
  try {
    return typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
  } catch {
    return rawValue;
  }
}

function normalizeConfigValue(value: any): string {
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

// GET /public/app - all app_configs
router.get('/public/app', async (req: Request, res: Response) => {
  try {
    const [settings, toolsSettings] = await Promise.all([
      loadPublicSettingsSnapshot(),
      loadToolsSettingsSnapshot(),
    ]);
        const appName = firstSetting(settings, ['public.app_name', 'app.name', 'site.name'], 'AI艺术生成工坊');
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
      [wechatLoginEnabled, rawPaymentEnabled, rawMembershipEnabled, reviewModeEnabled, rawPurchaseEnabled],
      inviteEnabled,
      [promptOptimizeEnabled, scriptGenerateEnabled, promptGenerateEnabled, storyboardGenerateEnabled],
      [promptOptimizeMemberOnly, imageTemplateUseMemberOnly, saveToAlbumMemberOnly, templateSaveUseMemberOnly],
      [imageFeature, videoFeature],
      publicValues,
      allFeatureKeys,
      customerService,
      help,
      promptGuides,
      visualAssets,
      profileWorkbenchEnabled,
      profilePointsTasksEnabled,
      profileMemberEntryEnabled,
      homeEntrySwitches,
      tabBarRaw,
      mediaDownload,
      toolsConfig,
    ] = await Promise.all([
      Promise.all([
        settingBoolean(settings, 'wechat.login_enabled', true),
        settingBoolean(settings, 'wechat_pay.enabled', false),
        settingBoolean(settings, 'membership.enabled', false),
        settingBoolean(settings, 'miniapp.review_mode_enabled', false),
        settingBoolean(settings, 'miniapp.purchase_enabled', true),
      ]),
      settingBoolean(settings, 'invite.enabled', false),
      Promise.all([
        settingBoolean(settings, 'ai.prompt_optimize.enabled', false),
        settingBoolean(settings, 'ai.script_generate.enabled', false),
        settingBoolean(settings, 'ai.prompt_generate.enabled', false),
        settingBoolean(settings, 'ai.storyboard_generate.enabled', false),
      ]),
      Promise.all([
        settingBoolean(settings, 'membership.prompt_optimize_member_only', false),
        settingBoolean(settings, 'membership.image_template_use_member_only', false),
        settingBoolean(settings, 'membership.save_to_album_member_only', false),
        settingBoolean(settings, 'membership.template_save_use_member_only', false),
      ]),
      Promise.all([
        queryOne<any>("SELECT status FROM model_features WHERE feature_key = 'image_create'"),
        queryOne<any>("SELECT status FROM model_features WHERE feature_key = 'video_create'"),
      ]),
      publicKeys.map(key => [key, parseSetting(settings, key, '')] as const),
      getModelFeaturesList('active'),
      getCustomerServiceConfig(settings),
      getHelpConfig(settings),
      getPromptGuidesConfig(settings),
      getVisualAssetsConfig(settings),
      settingBoolean(settings, 'miniapp.profile_workbench_enabled', true),
      settingBoolean(settings, 'miniapp.profile_points_tasks_enabled', true),
      settingBoolean(settings, 'miniapp.profile_member_entry_enabled', true),
      getHomeEntrySwitchesConfig(settings),
      settingString(settings, 'miniapp.tab_bar', ''),
      getMediaDownloadConfig(req, settings),
      getToolsConfig(0, toolsSettings),
    ]);

    const result: Record<string, any> = {};
    for (const [key, value] of publicValues) {
      result[key] = value;
    }
    const featureKeys = allFeatureKeys.map((r: any) => r.feature_key);
    const commerce = buildCommerceAvailability({
      reviewModeEnabled,
      purchaseEnabled: rawPurchaseEnabled,
      paymentEnabled: rawPaymentEnabled,
      membershipEnabled: rawMembershipEnabled,
    });
    const freeImageQuota = normalizeFreeImageQuotaConfig(settings);

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
    result.reviewModeEnabled = commerce.reviewModeEnabled;
    result.purchaseEnabled = commerce.purchaseEnabled;
    result.purchaseMessage = commerce.message;
    result.paymentEnabled = commerce.paymentEnabled;
    result.membershipEnabled = commerce.membershipEnabled;
    result.inviteEnabled = inviteEnabled;
    result['wechat.login_enabled'] = wechatLoginEnabled;
    result['miniapp.review_mode_enabled'] = commerce.reviewModeEnabled;
    result['miniapp.purchase_enabled'] = commerce.purchaseEnabled;
    result['wechat_pay.enabled'] = commerce.paymentEnabled;
    result['membership.enabled'] = commerce.membershipEnabled;
    result['membership.prompt_optimize_member_only'] = promptOptimizeMemberOnly;
    result['membership.image_template_use_member_only'] = imageTemplateUseMemberOnly;
    result['membership.save_to_album_member_only'] = saveToAlbumMemberOnly;
    result['membership.template_save_use_member_only'] = templateSaveUseMemberOnly;
    result['invite.enabled'] = inviteEnabled;
    result['feature.image_create.enabled'] = imageFeature?.status === 'active';
    result['feature.video_create.enabled'] = videoFeature?.status === 'active';
    result.features = {
      wechatLogin: wechatLoginEnabled,
      payment: commerce.paymentEnabled,
      purchase: commerce.purchaseEnabled,
      membership: commerce.membershipEnabled,
      invite: inviteEnabled,
      imageCreate: imageFeature?.status === 'active',
      videoCreate: videoFeature?.status === 'active',
      promptOptimize: promptOptimizeEnabled,
      scriptGenerate: scriptGenerateEnabled,
      promptGenerate: promptGenerateEnabled,
      storyboardGenerate: storyboardGenerateEnabled,
      tools: Boolean(toolsConfig.enabled),
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
    result.promptGuides = promptGuides;
    result.visualAssets = visualAssets;
    result.profileWorkbenchEnabled = profileWorkbenchEnabled;
    result.profilePointsTasksEnabled = profilePointsTasksEnabled;
    result.profileMemberEntryEnabled = profileMemberEntryEnabled;
    result.freeImageQuota = {
      enabled: freeImageQuota.enabled,
      showInDailyTasks: freeImageQuota.showInDailyTasks,
      dailyLimit: freeImageQuota.dailyLimit,
      totalLimit: freeImageQuota.totalLimit,
      allowedTierKeys: freeImageQuota.allowedTierKeys,
      exhaustedMessage: freeImageQuota.exhaustedMessage,
    };
    result['free_image_quota.enabled'] = freeImageQuota.enabled;
    result['free_image_quota.show_in_daily_tasks'] = freeImageQuota.showInDailyTasks;
    result['free_image_quota.daily_limit'] = freeImageQuota.dailyLimit;
    result['free_image_quota.total_limit'] = freeImageQuota.totalLimit;
    result['free_image_quota.allowed_tier_keys'] = freeImageQuota.allowedTierKeys.join(',');
    result['free_image_quota.exhausted_message'] = freeImageQuota.exhaustedMessage;
    result.homeEntrySwitches = homeEntrySwitches;
    result['miniapp.profile_workbench_enabled'] = profileWorkbenchEnabled;
    result['miniapp.profile_points_tasks_enabled'] = profilePointsTasksEnabled;
    result['miniapp.profile_member_entry_enabled'] = profileMemberEntryEnabled;
    result.mediaDownload = mediaDownload;
    result.toolsConfig = toolsConfig;
    try { result.tabBar = normalizeTabBarConfig(parseTabBarConfig(tabBarRaw)); } catch { result.tabBar = DEFAULT_TAB_BAR; }
    result.navigation = {
      tabBar: result.tabBar,
      bottom: result.tabBar,
      tabs: result.tabBar,
    };
    success(res, result);
  } catch (err: any) {
    console.error('[public-config] app config failed:', {
      message: err?.message,
      code: err?.code,
      sqlState: err?.sqlState,
    });
    error(res, ErrorCodes.SERVER_ERROR, '获取公开配置失败');
  }
});

function parseTabBarConfig(raw: string) {
  if (!raw) return DEFAULT_TAB_BAR;
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_TAB_BAR;
}

function normalizeTabBarConfig(items: any[]) {
  return items.map((item) => {
    if (item?.pagePath === '/pages/history/index' && item.text === '资产') {
      return { ...item, text: '记录' };
    }
    return item;
  });
}

// GET /public/model-tiers?feature=image_create
router.get('/public/model-tiers', optionalUserAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const feature = (req.query.feature as string) || 'image_create';
    const clientType = String(req.query.clientType || req.query.client || '').trim().toLowerCase();
    const result = await getModelTierList(feature, req.user?.userId, { clientType });
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
    const publicUserTemplatesEnabled = await SettingsService.getBoolean('template.user_public_enabled', false);
    const sourceFilter = publicUserTemplatesEnabled ? '' : "AND t.source = 'official'";
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
          ${sourceFilter}
        ORDER BY t.is_recommended DESC, t.created_at DESC, t.id DESC`,
      [templateType]
    );
    const permission = await getTemplateSaveUsePermission(req.user?.userId || 0);
    const all = await Promise.all(rows.map(async (row: any) => ({
      ...await normalizeLegacyTemplateMedia(req, toLegacyTemplate(row, row.category_name || '')),
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

function firstSetting(settings: PublicSettingsSnapshot, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = settingString(settings, key, '');
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
  const createdDiff = templateCreatedValue(b) - templateCreatedValue(a);
  return createdDiff || Number(b.id || b.templateId || 0) - Number(a.id || a.templateId || 0);
}

function templatePinMeta(template: any, rawFeature: string, normalizedFeature: string) {
  const cfg = templateDisplayConfig(template, rawFeature, normalizedFeature);
  return {
    pinned: cfg?.pinned ? 1 : 0,
    pinOrder: Number(cfg?.pinOrder || 0),
  };
}

function templateCreatedValue(template: any) {
  const value = template.createdAt || template.created_at || template.updatedAt || template.updated_at || '';
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

async function normalizeLegacyTemplateMedia(req: Request, template: any) {
  return {
    ...template,
    coverUrl: await normalizePublicMediaUrl(req, template.coverUrl),
    previewUrl: await normalizePublicMediaUrl(req, template.previewUrl),
  };
}

function getCustomerServiceConfig(settings: PublicSettingsSnapshot) {
  const enabled = settingBoolean(settings, 'customer_service.enabled', DEFAULT_CUSTOMER_SERVICE.enabled);
  const title = settingString(settings, 'customer_service.title', DEFAULT_CUSTOMER_SERVICE.title);
  const subtitle = settingString(settings, 'customer_service.subtitle', DEFAULT_CUSTOMER_SERVICE.subtitle);
  const icon = settingString(settings, 'customer_service.icon', DEFAULT_CUSTOMER_SERVICE.icon);
  const showInProfile = settingBoolean(settings, 'customer_service.show_in_profile', DEFAULT_CUSTOMER_SERVICE.showInProfile);
  const sessionFrom = settingString(settings, 'customer_service.session_from', DEFAULT_CUSTOMER_SERVICE.sessionFrom);
  const showMessageCard = settingBoolean(settings, 'customer_service.show_message_card', DEFAULT_CUSTOMER_SERVICE.showMessageCard);
  const sendMessageTitle = settingString(settings, 'customer_service.send_message_title', DEFAULT_CUSTOMER_SERVICE.sendMessageTitle);
  const sendMessagePath = settingString(settings, 'customer_service.send_message_path', DEFAULT_CUSTOMER_SERVICE.sendMessagePath);
  const sendMessageImg = settingString(settings, 'customer_service.send_message_img', DEFAULT_CUSTOMER_SERVICE.sendMessageImg);

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

function getHelpConfig(settings: PublicSettingsSnapshot) {
  const enabled = settingBoolean(settings, 'miniapp_help.enabled', DEFAULT_HELP.enabled);
  const title = settingString(settings, 'miniapp_help.title', DEFAULT_HELP.title);
  const contentHtml = settingString(settings, 'miniapp_help.content_html', DEFAULT_HELP.contentHtml);

  return {
    enabled,
    title: title || DEFAULT_HELP.title,
    contentHtml: sanitizeHelpHtml(contentHtml || DEFAULT_HELP.contentHtml),
    items: getHelpItemsConfig(settings, contentHtml),
  };
}

function getHelpItemsConfig(settings: PublicSettingsSnapshot, contentHtml: string): PublicHelpItem[] {
  const rawItems = parseSetting(settings, 'miniapp_help.items_json', []);
  const items = Array.isArray(rawItems)
    ? rawItems.map((item, index) => sanitizeHelpItem(item, index)).filter(hasHelpItemContent)
    : [];
  if (items.length) return items;

  const legacyContent = sanitizeHelpHtml(contentHtml || DEFAULT_HELP.contentHtml);
  return legacyContent
    ? [sanitizeHelpItem({ id: 'legacy_help', title: DEFAULT_HELP.title, contentHtml: legacyContent }, 0)]
    : [];
}

function sanitizeHelpItem(input: any, index: number): PublicHelpItem {
  const row = input && typeof input === 'object' ? input : {};
  const mediaUrl = safeHelpMediaUrl(row.mediaUrl || row.media_url);
  const mediaType = normalizeHelpMediaType(row.mediaType || row.media_type, mediaUrl);
  return {
    id: safeHelpText(row.id, `help_${index + 1}`, 80),
    title: safeHelpText(row.title, `帮助 ${index + 1}`, 80),
    subtitle: safeHelpText(row.subtitle || row.subTitle || row.description, '', 120),
    contentHtml: sanitizeHelpHtml(String(row.contentHtml || row.content_html || row.content || '')),
    mediaType: mediaUrl ? mediaType : '',
    mediaUrl,
    mediaRatio: normalizeHelpRatio(row.mediaRatio || row.media_ratio || '16:9'),
    copyText: safeHelpText(row.copyText || row.copy_text, '', 2000),
    copyLabel: safeHelpText(row.copyLabel || row.copy_label, '复制', 20),
  };
}

function hasHelpItemContent(item: PublicHelpItem) {
  return Boolean(item.subtitle || item.contentHtml || item.mediaUrl || item.copyText);
}

function getPromptGuidesConfig(settings: PublicSettingsSnapshot) {
  const enabled = settingBoolean(settings, 'miniapp_prompt_guides.enabled', DEFAULT_PROMPT_GUIDES.enabled);
  const rawItems = parseSetting(settings, 'miniapp_prompt_guides.items_json', {});
  const sourceItems = rawItems && typeof rawItems === 'object' && !Array.isArray(rawItems)
    ? rawItems as Record<string, unknown>
    : {};
  const items: Record<string, PublicPromptGuideItem> = {};
  for (const key of PROMPT_GUIDE_MODE_KEYS) {
    const item = sanitizePromptGuideItem(key, sourceItems[key]);
    if (hasPromptGuideContent(item)) items[key] = item;
  }
  return { enabled, items };
}

function sanitizePromptGuideItem(key: PromptGuideModeKey, input: unknown): PublicPromptGuideItem {
  const row = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return {
    key,
    enabled: normalizeHelpBoolean(row.enabled, true),
    placeholder: safeHelpText(row.placeholder, '', 220),
    title: safeHelpText(row.title, '提示词写作帮助', 60),
    subtitle: safeHelpText(row.subtitle, '', 120),
    contentHtml: sanitizeHelpHtml(String(row.contentHtml || row.content_html || row.content || '')),
    copyText: safeHelpText(row.copyText || row.copy_text, '', 2000),
    copyLabel: safeHelpText(row.copyLabel || row.copy_label, '复制示例', 20),
    helpId: safeHelpText(row.helpId || row.help_id, '', 80),
  };
}

function hasPromptGuideContent(item: PublicPromptGuideItem) {
  return Boolean(item.placeholder || item.subtitle || item.contentHtml || item.copyText || item.helpId);
}

function normalizeHelpBoolean(value: unknown, fallback: boolean) {
  const text = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function normalizeHelpMediaType(value: unknown, mediaUrl: string): PublicHelpItem['mediaType'] {
  const type = String(value || '').toLowerCase();
  if (type === 'image' || type === 'video') return type;
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(mediaUrl) ? 'video' : mediaUrl ? 'image' : '';
}

function normalizeHelpRatio(value: unknown) {
  const text = String(value || '').trim();
  return /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(text) ? text : '16:9';
}

function safeHelpMediaUrl(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.startsWith('/') && !text.startsWith('//')) return text.slice(0, 1000);
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) ? text.slice(0, 1000) : '';
  } catch {
    return '';
  }
}

function safeHelpText(value: unknown, fallback: string, maxLength: number) {
  const text = String(value || '').trim();
  return (text || fallback).slice(0, maxLength);
}

function getVisualAssetsConfig(settings: PublicSettingsSnapshot) {
  const homeBannerUrl = settingString(settings, 'miniapp_visual_assets.home_banner_url', DEFAULT_VISUAL_ASSETS.homeBannerUrl);
  const homeMemberUpsellUrl = settingString(settings, 'miniapp_visual_assets.home_member_upsell_url', DEFAULT_VISUAL_ASSETS.homeMemberUpsellUrl);
  const inspirationBannerUrl = settingString(settings, 'miniapp_visual_assets.inspiration_banner_url', DEFAULT_VISUAL_ASSETS.inspirationBannerUrl);
  const comicBannerUrl = settingString(settings, 'miniapp_visual_assets.comic_banner_url', DEFAULT_VISUAL_ASSETS.comicBannerUrl);
  const profileMemberOfferBannerUrl = settingString(settings, 'miniapp_visual_assets.profile_member_offer_banner_url', DEFAULT_VISUAL_ASSETS.profileMemberOfferBannerUrl);

  return {
    homeBannerUrl,
    homeMemberUpsellUrl,
    inspirationBannerUrl,
    comicBannerUrl,
    profileMemberOfferBannerUrl,
  };
}

function getHomeEntrySwitchesConfig(settings: PublicSettingsSnapshot) {
  const entries = HOME_ENTRY_KEYS.map((key) => {
    const enabled = settingBoolean(settings, `miniapp.home_entry.${key}.enabled`, true);
    const message = settingString(settings, `miniapp.home_entry.${key}.message`, DEFAULT_HOME_ENTRY_NOTICE);
    return [
      key,
      {
        enabled,
        message: message.trim() || DEFAULT_HOME_ENTRY_NOTICE,
      },
    ] as const;
  });

  return Object.fromEntries(entries);
}

async function getMediaDownloadConfig(_req: Request, settings: PublicSettingsSnapshot) {
  const storageOrigins = new Set<string>();
  const fileProxyOrigins = new Set<string>();
  addOrigin(fileProxyOrigins, settingString(settings, 'site.api_domain', ''));
  addOrigin(storageOrigins, settingString(settings, 'storage.file_domain', ''));

  try {
    await preloadStorageConfigs();
    const adapter = StorageService.getActiveAdapter();
    addOrigin(storageOrigins, adapter.getCdnUrl('download-domain-check.txt'));
  } catch {
    // Storage may be incomplete during installation; return explicit admin configured domains only.
  }

  const origins = new Set([...storageOrigins]);
  return {
    origins: Array.from(origins),
    fileProxyOrigins: Array.from(fileProxyOrigins),
    storageOrigins: Array.from(storageOrigins),
  };
}

function addOrigin(origins: Set<string>, url: unknown) {
  const value = String(url || '').trim();
  if (!value) return;
  if (value.startsWith('/')) return;
  try {
    origins.add(new URL(value).origin);
  } catch {
    try {
      origins.add(new URL(`https://${value.replace(/^\/+/, '')}`).origin);
    } catch {
      // ignore invalid admin input
    }
  }
}
