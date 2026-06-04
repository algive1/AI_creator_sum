import { query, queryOne } from '../utils/db';
import { parseJson } from '../utils/content-helpers';
import { applyFeatureDiscount, resolveMemberFeatureDiscount } from './membership.service';

export async function getModelTierList(featureKey: string, userId?: number) {
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
            JOIN ai_models m ON m.id = b.model_id AND m.status = 'active'
            JOIN ai_model_providers p ON p.id = m.provider_id AND p.status = 'active'
           WHERE b.tier_id = t.id
             AND COALESCE(p.api_base_url, '') <> ''
             AND COALESCE(p.api_key, '') <> ''
        )
      ORDER BY t.sort_order`,
    [feature.id],
  );

  // 批量加载所有层级的 capabilities，避免 N+1 查询
  const tierIds = tiers.map(t => t.id);
  const capabilities = tierIds.length > 0
    ? await query<any>(
        `SELECT * FROM tier_capabilities WHERE tier_id IN (${tierIds.map(() => '?').join(',')})`,
        tierIds,
      )
    : [];
  const capByTierId = new Map<number, any>();
  for (const cap of capabilities) {
    capByTierId.set(cap.tier_id, cap);
  }

  const list = [];
  for (const tier of tiers) {
    const cap = capByTierId.get(tier.id);
    const basePointsCost = Math.max(0, Number(tier.points_cost || 0));
    const discountPercent = Number((discount as any).discountPercent || 100);
    list.push({
      id: tier.id,
      tierId: tier.id,
      tierName: tier.tier_name,
      tierKey: tier.tier_key,
      description: tier.description || '',
      tag: tier.tag || '',
      iconUrl: tier.icon_url || tier.icon_fallback_url || '',
      basePointsCost,
      pointsCost: applyFeatureDiscount(basePointsCost, discountPercent),
      memberDiscountPercent: discountPercent,
      memberDiscountApplied: Boolean((discount as any).memberDiscountApplied),
      isDefault: !!tier.is_default,
      isRecommended: !!tier.is_recommended,
      sortOrder: tier.sort_order,
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
