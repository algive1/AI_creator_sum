// routes/public-config.ts
import { Router, Request, Response } from 'express';
import { queryOne, query } from '../utils/db';
import { success, error } from '../utils/response';
import { parseJson } from '../utils/content-helpers';
import { ErrorCodes } from '../types';
import { SettingsService } from '../services/settings.service';
import { normalizeTemplateTargetFeatureKey, toLegacyTemplate } from '../services/template.service';
import { getModelTierList } from '../services/model-tier-list.service';
import { optionalUserAuthMiddleware } from '../middleware/auth';

const router = Router();
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
    const [wechatLoginEnabled, paymentEnabled, membershipEnabled] = await Promise.all([
      SettingsService.getBoolean('wechat.login_enabled', true),
      SettingsService.getBoolean('wechat_pay.enabled', false),
      SettingsService.getBoolean('membership.enabled', false),
    ]);
    const inviteEnabled = await SettingsService.getBoolean('invite.enabled', false);
    const [promptOptimizeEnabled, scriptGenerateEnabled, promptGenerateEnabled, storyboardGenerateEnabled] = await Promise.all([
      SettingsService.getBoolean('ai.prompt_optimize.enabled', false),
      SettingsService.getBoolean('ai.script_generate.enabled', false),
      SettingsService.getBoolean('ai.prompt_generate.enabled', false),
      SettingsService.getBoolean('ai.storyboard_generate.enabled', false),
    ]);
    const imageFeature = await queryOne<any>("SELECT status FROM model_features WHERE feature_key = 'image_create'");
    const videoFeature = await queryOne<any>("SELECT status FROM model_features WHERE feature_key = 'video_create'");
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
    const result: Record<string, any> = {};
    for (const key of publicKeys) {
      const rawValue = await SettingsService.get(key, '');
      try {
        result[key] = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
      } catch {
        result[key] = rawValue;
      }
    }
    const allFeatureKeys = await query<any>(
      `SELECT feature_key FROM model_features WHERE status = 'active' ORDER BY sort_order`,
    );
    const featureKeys = allFeatureKeys.map((r: any) => r.feature_key);

    const tierRows = await query<any>(
      `SELECT t.*, mf.feature_key, mf.feature_name,
              f.cdn_url AS icon_url
         FROM model_tiers t
         JOIN model_features mf ON mf.id = t.feature_id
         LEFT JOIN files f ON f.id = t.icon_file_id AND f.is_deleted = 0
        WHERE mf.status = 'active' AND t.status = 'active'
        ORDER BY mf.sort_order, t.sort_order`,
    );

    const modelTiers: Record<string, any[]> = {};
    for (const t of tierRows) {
      const cap = await queryOne<any>('SELECT * FROM tier_capabilities WHERE tier_id = ?', [t.id]);
      const item = {
        id: t.id,
        tierId: t.id,
        tierName: t.tier_name,
        tierKey: t.tier_key,
        description: t.description || '',
        tag: t.tag || '',
        iconUrl: t.icon_url || '',
        basePointsCost: t.points_cost,
        pointsCost: t.points_cost,
        memberDiscountPercent: 100,
        memberDiscountApplied: false,
        isDefault: !!t.is_default,
        isRecommended: !!t.is_recommended,
        sortOrder: t.sort_order,
        qualityMultipliers: typeof t.quality_multipliers === 'string' ? JSON.parse(t.quality_multipliers) : (t.quality_multipliers || {}),
        capabilities: cap ? {
          ratios: parseJson(cap.supported_ratios, []),
          qualities: parseJson(cap.supported_qualities, []),
          styles: parseJson(cap.supported_styles, []),
          durations: cap.supported_durations ? parseJson(cap.supported_durations, []) : null,
          cameraMoves: cap.supported_camera_moves ? parseJson(cap.supported_camera_moves, []) : null,
          audioModes: cap.supported_audio_modes ? parseJson(cap.supported_audio_modes, []) : null,
          defaultAudioMode: cap.default_audio_mode || 'silent',
          supportedSizeModes: parseJson(cap.supported_size_modes, ['auto', 'ratio']),
          allowCustomPixels: !!cap.allow_custom_pixels,
          nativeSizes: parseJson(cap.native_sizes, []),
          defaultRatio: cap.default_ratio || '1:1',
          maxWidth: cap.max_width,
          maxHeight: cap.max_height,
          maxTotalPixels: cap.max_total_pixels,
          allowPostprocess: !!cap.allow_postprocess,
          postprocessModes: parseJson(cap.postprocess_modes, []),
          maxImages: cap.max_images,
          maxReferenceImages: cap.max_reference_images || 4,
          maxDurationSeconds: cap.max_duration_seconds,
        } : null,
      };
      if (!modelTiers[t.feature_key]) modelTiers[t.feature_key] = [];
      modelTiers[t.feature_key].push(item);
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
    result.featureKeys = featureKeys;
    result.modelTiers = modelTiers;
    result.customerService = await getCustomerServiceConfig();
    result.help = await getHelpConfig();
    result.visualAssets = await getVisualAssetsConfig();
    const tabBarRaw = await SettingsService.getString('miniapp.tab_bar', '');
    try { result.tabBar = tabBarRaw ? JSON.parse(tabBarRaw) : null; } catch { result.tabBar = null; }
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
router.get('/public/templates', async (req: Request, res: Response) => {
  try {
    const templateType = (req.query.type as string) || 'image';
    const feature = (req.query.feature as string) || '';
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
    const all = rows.map((row: any) => toLegacyTemplate(row, row.category_name || ''));

    // Filter by display_config feature if specified; sort pinned first
    let templates = all;
    if (feature) {
      const normalizedFeature = normalizeTemplateTargetFeatureKey(feature);
      templates = all
        .filter((t: any) => {
          const cfg = t.displayConfig;
          if (cfg && typeof cfg === 'object' && (cfg[feature] || cfg[normalizedFeature])) return true;
          return normalizeTemplateTargetFeatureKey(t.targetFeature) === normalizedFeature;
        })
        .sort((a: any, b: any) => {
          const aPin = a.displayConfig?.[feature]?.pinOrder ?? 0;
          const bPin = b.displayConfig?.[feature]?.pinOrder ?? 0;
          if (aPin && bPin) return aPin - bPin;
          if (aPin) return -1;
          if (bPin) return 1;
          return (b.sortOrder || 0) - (a.sortOrder || 0);
        });
    }

    const total = templates.length;
    const start = (page - 1) * pageSize;
    success(res, { list: templates.slice(start, start + pageSize), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (err: any) {
    console.error('[public-config] templates failed:', err);
    error(res, ErrorCodes.SERVER_ERROR, '获取模板失败');
  }
});

export default router;

async function firstSetting(keys: string[], fallback: string): Promise<string> {
  for (const key of keys) {
    const value = await SettingsService.getString(key, '');
    if (value.trim()) return value;
  }
  return fallback;
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
    contentHtml: contentHtml || DEFAULT_HELP.contentHtml,
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
