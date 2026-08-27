import { query, queryOne } from '../utils/db';
import { parseJson } from '../utils/content-helpers';
import { resolveMemberFeatureDiscount } from './membership.service';
import { modelSupportsFeature } from './model-capability.service';
import { buildImageSizeCapabilities } from './image-size-options.service';
import { buildVideoCapabilities } from './video-capabilities.service';
import { resolveTierPricing } from './tier-pricing.service';
import { isGptImage2FreeQuotaModel } from './free-image-quota.service';

type ModelTierListOptions = {
  clientType?: string;
};

export async function getModelTierList(featureKey: string, userId?: number, options: ModelTierListOptions = {}) {
  const clientType = String(options.clientType || '').trim().toLowerCase();
  const webClient = clientType === 'web';
  const feature = await queryOne<any>(
    'SELECT id, feature_key, feature_name FROM model_features WHERE feature_key = ? AND status = ?',
    [featureKey, 'active'],
  );
  if (!feature) return null;

  const discount = userId ? await resolveMemberFeatureDiscount(userId, feature.feature_key) : {
    discountPercent: 100,
    memberDiscountApplied: false,
  };

  const tiers = await query<any>(
    `SELECT t.*, f.cdn_url as icon_url, f.access_url as icon_fallback_url
      FROM model_tiers t
       LEFT JOIN files f ON f.id = t.icon_file_id AND f.is_deleted = 0
      WHERE t.feature_id = ? AND t.status = 'active'
        AND EXISTS (
          SELECT 1
            FROM tier_model_bindings b
            JOIN ai_models m ON m.id = b.model_id AND m.status = 'active' AND m.deleted_at IS NULL
            JOIN ai_model_providers p ON p.id = m.provider_id AND p.status = 'active' AND p.deleted_at IS NULL
           WHERE b.tier_id = t.id
             AND COALESCE(p.api_base_url, '') <> ''
             AND COALESCE(p.api_key, '') <> ''
        )
      ORDER BY t.sort_order`,
    [feature.id],
  );

  const tierIds = tiers.map(t => t.id);
  const visibleTierIds = new Set<number>();
  const modelByTierId = new Map<number, any>();
  if (tierIds.length > 0) {
    const bindings = await query<any>(
      `SELECT b.tier_id, m.id AS model_id, m.model_type, m.name, m.display_name, m.api_model_name,
              m.upstream_model_code, m.config, p.provider_type
         FROM tier_model_bindings b
         JOIN ai_models m ON m.id = b.model_id AND m.status = 'active' AND m.deleted_at IS NULL
         JOIN ai_model_providers p ON p.id = m.provider_id AND p.status = 'active' AND p.deleted_at IS NULL
        WHERE b.tier_id IN (${tierIds.map(() => '?').join(',')})
          AND COALESCE(p.api_base_url, '') <> ''
          AND COALESCE(p.api_key, '') <> ''
        ORDER BY CASE b.binding_type WHEN 'primary' THEN 0 ELSE 1 END, b.fallback_order`,
      tierIds,
    );
    for (const binding of bindings) {
      if (await modelSupportsFeature(Number(binding.model_id), feature.feature_key, binding.model_type).catch(() => false)) {
        visibleTierIds.add(Number(binding.tier_id));
        if (!modelByTierId.has(Number(binding.tier_id))) modelByTierId.set(Number(binding.tier_id), binding);
      }
    }
  }
  const visibleTiers = tiers
    .filter(t => visibleTierIds.has(Number(t.id)))
    .filter(t => !webClient || webVisibleOf(t))
    .sort((a, b) => {
      if (!webClient) return Number(a.sort_order || 0) - Number(b.sort_order || 0);
      return webSortOrderOf(a) - webSortOrderOf(b)
        || Number(a.sort_order || 0) - Number(b.sort_order || 0)
        || Number(a.id || 0) - Number(b.id || 0);
    });

  // 批量加载所有层级的 capabilities，避免 N+1 查询
  const visibleIds = visibleTiers.map(t => t.id);
  const capabilities = visibleIds.length > 0
    ? await query<any>(
        `SELECT * FROM tier_capabilities WHERE tier_id IN (${visibleIds.map(() => '?').join(',')})`,
        visibleIds,
      )
    : [];
  const capByTierId = new Map<number, any>();
  for (const cap of capabilities) {
    capByTierId.set(cap.tier_id, cap);
  }

  const list = [];
  for (const tier of visibleTiers) {
    const cap = capByTierId.get(tier.id);
    const webDisplayName = String(tier.web_display_name || '').trim();
    const discountPercent = Number((discount as any).discountPercent || 100);
    const pricingResult = resolveTierPricing({
      basePointsCost: Math.max(0, Number(tier.points_cost || 0)),
      pricingMode: tier.pricing_mode,
      pricingRules: tier.pricing_rules,
      discountPercent,
    });
    const baseCapabilities = cap ? {
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
      maxVideoUrls: cap.max_video_urls === null || cap.max_video_urls === undefined ? undefined : Number(cap.max_video_urls),
      maxAudioUrls: cap.max_audio_urls === null || cap.max_audio_urls === undefined ? undefined : Number(cap.max_audio_urls),
      inputMode: cap.input_mode || null,
      minReferenceImages: cap.min_reference_images ?? null,
      referenceUploadMode: cap.reference_upload_mode || null,
      requiredReference: cap.required_reference === null || cap.required_reference === undefined ? null : !!cap.required_reference,
      maxDurationSeconds: cap.max_duration_seconds,
      advancedParams: [],
    } : null;
    const model = modelByTierId.get(Number(tier.id));
    const sizeCaps = baseCapabilities && isImageFeature(feature.feature_key)
      ? buildImageSizeCapabilities({
          tierKey: tier.tier_key,
          modelName: model?.name,
          apiModelName: model?.api_model_name,
          upstreamModelCode: model?.upstream_model_code,
          providerType: model?.provider_type,
          modelConfig: parseJson(model?.config, {}),
          ratios: baseCapabilities.ratios,
          qualities: baseCapabilities.qualities,
          maxImages: baseCapabilities.maxImages,
        })
      : null;
    const videoCaps = baseCapabilities && isVideoFeature(feature.feature_key)
      ? buildVideoCapabilities({
          featureKey: feature.feature_key,
          modelName: model?.name,
          apiModelName: model?.api_model_name,
          upstreamModelCode: model?.upstream_model_code,
          providerType: model?.provider_type,
          modelConfig: parseJson(model?.config, {}),
          ratios: baseCapabilities.ratios,
          qualities: baseCapabilities.qualities,
          durations: baseCapabilities.durations,
          audioModes: baseCapabilities.audioModes,
          defaultAudioMode: baseCapabilities.defaultAudioMode,
          supportedSizeModes: baseCapabilities.supportedSizeModes,
          nativeSizes: baseCapabilities.nativeSizes,
          maxReferenceImages: baseCapabilities.maxReferenceImages,
          maxVideoUrls: baseCapabilities.maxVideoUrls,
          maxAudioUrls: baseCapabilities.maxAudioUrls,
          inputMode: baseCapabilities.inputMode,
          minReferenceImages: baseCapabilities.minReferenceImages,
          referenceUploadMode: baseCapabilities.referenceUploadMode,
          requiredReference: baseCapabilities.requiredReference,
          advancedParams: baseCapabilities.advancedParams,
        })
      : null;
    list.push({
      id: tier.id,
      tierId: tier.id,
      tierName: tier.tier_name,
      tierKey: tier.tier_key,
      modelId: model?.model_id || null,
      modelName: model?.display_name || model?.name || model?.api_model_name || '',
      freeImageQuotaModelEligible: isGptImage2FreeQuotaModel({
        name: model?.name,
        displayName: model?.display_name,
        apiModelName: model?.api_model_name,
        upstreamModelCode: model?.upstream_model_code,
        providerType: model?.provider_type,
      }),
      webDisplayName: webDisplayName,
      webVisible: webVisibleOf(tier),
      webSortOrder: webSortOrderOf(tier),
      apiModelName: model?.api_model_name || '',
      upstreamModelCode: model?.upstream_model_code || '',
      providerType: model?.provider_type || '',
      description: tier.description || '',
      tag: tier.tag || '',
      iconUrl: tier.icon_url || tier.icon_fallback_url || '',
      basePointsCost: pricingResult.basePointsCost,
      pointsCost: pricingResult.pointsCost,
      memberDiscountPercent: pricingResult.memberDiscountPercent,
      memberDiscountApplied: pricingResult.memberDiscountApplied,
      pricing: pricingResult.pricing,
      isDefault: !!tier.is_default,
      isRecommended: !!tier.is_recommended,
      sortOrder: tier.sort_order,
      capabilities: baseCapabilities ? {
        ...baseCapabilities,
        ...(sizeCaps ? {
          ratios: sizeCaps.ratios,
          qualities: sizeCaps.resolutionPresets,
          resolutionPresets: sizeCaps.resolutionPresets,
          sizeOptions: sizeCaps.sizeOptions,
          defaultSizeKey: sizeCaps.defaultSizeKey,
          maxImages: sizeCaps.maxImages,
        } : {}),
        ...(videoCaps ? {
          ratios: videoCaps.ratios,
          qualities: videoCaps.qualities,
          durations: videoCaps.durations,
          audioModes: videoCaps.audioModes,
          defaultAudioMode: videoCaps.defaultAudioMode,
          supportedSizeModes: videoCaps.supportedSizeModes,
          nativeSizes: videoCaps.nativeSizes,
          inputMediaTypes: videoCaps.inputMediaTypes,
          maxReferenceImages: videoCaps.maxReferenceImages,
          maxVideoUrls: videoCaps.maxVideoUrls,
          maxAudioUrls: videoCaps.maxAudioUrls,
          inputMode: videoCaps.inputMode,
          minReferenceImages: videoCaps.minReferenceImages,
          referenceUploadMode: videoCaps.referenceUploadMode,
          requiredReference: videoCaps.requiredReference,
          advancedParams: videoCaps.advancedParams,
        } : {}),
      } : null,
    });
  }

  return {
    featureKey: feature.feature_key,
    featureName: feature.feature_name,
    memberDiscountPercent: Number((discount as any).discountPercent || 100),
    memberDiscountApplied: Boolean((discount as any).memberDiscountApplied),
    list,
  };
}

function isImageFeature(featureKey: string): boolean {
  return ['image_create', 'image_to_image', 'image_edit'].includes(featureKey);
}

function isVideoFeature(featureKey: string): boolean {
  return ['video_create', 'image_to_video', 'first_last_frame_video', 'video_edit'].includes(featureKey);
}

function webVisibleOf(tier: any): boolean {
  if (tier?.web_visible === undefined || tier?.web_visible === null) return true;
  return Number(tier.web_visible) !== 0;
}

function webSortOrderOf(tier: any): number {
  const explicit = Number(tier?.web_sort_order || 0);
  return Number.isFinite(explicit) && explicit > 0 ? explicit : Number(tier?.sort_order || 0);
}
