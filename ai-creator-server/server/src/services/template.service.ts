export interface TemplateStatusPatch {
  status: string;
  reviewStatus: string;
  isEnabled: number;
  visibility: string;
}

export function parseTemplateJson<T>(value: any, fallback: T): T {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

export function normalizeTemplateType(value: any): string {
  const text = String(value || '').trim();
  if (text === 'video' || text === 'manga' || text === 'inspiration') return text;
  return 'image';
}

const TEMPLATE_USAGE_TARGET_FEATURES: Record<string, Record<string, string>> = {
  image: {
    generate: 'text_to_image',
    reference: 'image_to_image',
    edit: 'image_edit',
  },
  video: {
    generate: 'text_to_video',
    reference: 'image_to_video',
    first_last_frame: 'first_last_frame_video',
    video_edit: 'video_edit',
  },
  inspiration: {
    generate: 'inspiration',
  },
};

const TEMPLATE_USAGE_ALIASES: Record<string, string> = {
  text_to_image: 'generate',
  image_to_image: 'reference',
  image_edit: 'edit',
  text_to_video: 'generate',
  image_to_video: 'reference',
  first_last_frame_video: 'first_last_frame',
};

const DISPLAY_FEATURE_ORDER: Record<string, string[]> = {
  image: ['text_to_image', 'image_to_image', 'image_edit', 'inspiration'],
  video: ['text_to_video', 'image_to_video', 'first_last_frame_video', 'video_edit', 'inspiration'],
  inspiration: ['inspiration'],
};

export function targetFeatureForTemplateType(templateType: string): string {
  if (templateType === 'video') return 'text_to_video';
  if (templateType === 'manga') return 'comic_create';
  if (templateType === 'inspiration') return 'inspiration';
  return 'text_to_image';
}

export function normalizeTemplateUsageType(templateType: string, value: any): string {
  const type = normalizeTemplateType(templateType);
  const raw = String(value || '').trim();
  const usageType = TEMPLATE_USAGE_ALIASES[raw] || raw;
  const usageMap = TEMPLATE_USAGE_TARGET_FEATURES[type] || TEMPLATE_USAGE_TARGET_FEATURES.image;
  return usageType && usageMap[usageType] ? usageType : 'generate';
}

export function normalizeTemplateTargetFeatureKey(value: any): string {
  const text = String(value || '').trim();
  if (text === 'image_create') return 'text_to_image';
  if (text === 'video_create') return 'text_to_video';
  return text;
}

export function targetFeatureForTemplateUsage(templateType: string, usageType: any, displayConfig?: any): string {
  const type = normalizeTemplateType(templateType);
  const config = parseTemplateJson<Record<string, any> | null>(displayConfig, null);
  const displayOrder = DISPLAY_FEATURE_ORDER[type] || [];
  const selectedFeature = displayOrder.find(key => key !== 'inspiration' && !!config?.[key]);
  if (selectedFeature) return selectedFeature;

  const normalizedUsageType = normalizeTemplateUsageType(type, usageType);
  const usageMap = TEMPLATE_USAGE_TARGET_FEATURES[type] || TEMPLATE_USAGE_TARGET_FEATURES.image;
  return usageMap[normalizedUsageType] || targetFeatureForTemplateType(type);
}

function usageTypeFromTemplateFeature(templateType: string, targetFeature: any, displayConfig: any): string {
  const type = normalizeTemplateType(templateType);
  const config = parseTemplateJson<Record<string, any> | null>(displayConfig, null);
  const displayOrder = DISPLAY_FEATURE_ORDER[type] || [];
  const selectedFeature = displayOrder.find(key => key !== 'inspiration' && !!config?.[key]);
  const feature = normalizeTemplateTargetFeatureKey(selectedFeature || targetFeature);
  const usageMap = TEMPLATE_USAGE_TARGET_FEATURES[type] || TEMPLATE_USAGE_TARGET_FEATURES.image;
  const matched = Object.entries(usageMap).find(([, target]) => target === feature);
  return matched?.[0] || '';
}

export function resolveTemplateUsageType(templateType: string, usageType: any, targetFeature: any, displayConfig: any): string {
  const normalizedUsageType = normalizeTemplateUsageType(templateType, usageType);
  if (normalizedUsageType !== 'generate') return normalizedUsageType;
  return usageTypeFromTemplateFeature(templateType, targetFeature, displayConfig) || normalizedUsageType;
}

export function normalizeTemplateStatus(value: any): TemplateStatusPatch {
  const status = String(value || 'active').trim();
  if (status === 'active' || status === 'approved') {
    return { status: 'approved', reviewStatus: 'approved', isEnabled: 1, visibility: 'public' };
  }
  if (status === 'draft' || status === 'pending') {
    return { status: 'draft', reviewStatus: 'pending', isEnabled: 0, visibility: 'public' };
  }
  if (status === 'rejected') {
    return { status: 'rejected', reviewStatus: 'rejected', isEnabled: 0, visibility: 'public' };
  }
  return { status: 'offline', reviewStatus: 'approved', isEnabled: 0, visibility: 'public' };
}

export function legacyStatusFromTemplate(row: any): string {
  if (row.deleted_at) return 'deleted';
  if (row.is_enabled !== 0 && row.visibility === 'public' && row.status === 'approved' && row.review_status === 'approved') {
    return 'active';
  }
  if (row.status === 'draft' || row.review_status === 'pending') return 'draft';
  return 'inactive';
}

export function normalizeTemplateTags(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }
  if (value && typeof value === 'object') {
    return [];
  }
  return String(value || '')
    .split(/[,\uFF0C\s]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

export function tagsToCsv(value: any): string {
  return normalizeTemplateTags(parseTemplateJson(value, value)).join(',');
}

export function durationToSeconds(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).match(/\d+/);
  if (!match) return null;
  const seconds = Number(match[0]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export function durationToDisplay(value: any): string {
  const seconds = durationToSeconds(value);
  return seconds ? `${seconds}s` : '';
}

export function mergeQualityIntoParams(paramsValue: any, quality: any): Record<string, any> {
  const params = parseTemplateJson<Record<string, any>>(paramsValue, {});
  if (quality !== undefined) {
    const text = String(quality || '').trim();
    if (text) params.quality = text;
    else delete params.quality;
  }
  return params;
}

export function toLegacyTemplate(row: any, categoryName = '') {
  const params = parseTemplateJson<Record<string, any>>(row.params_json, {});
  const tags = normalizeTemplateTags(parseTemplateJson(row.tags_json, []));
  const displayConfig = parseTemplateJson(row.display_config, null);
  const targetFeature = normalizeTemplateTargetFeatureKey(row.target_feature);
  const usageType = resolveTemplateUsageType(row.template_type, row.usage_type, targetFeature, displayConfig);
  const ratio = row.ratio || params.ratio || '';
  const style = row.style || params.style || '';
  const duration = row.duration || params.duration || params.durationSeconds || '';
  return {
    id: row.id,
    templateId: row.id,
    categoryId: row.category_id,
    name: row.title,
    title: row.title,
    author: row.source === 'user' ? 'user' : 'official',
    description: row.description || '',
    templateType: row.template_type,
    targetFeature,
    usageType,
    displayConfig,
    source: row.source,
    prompt: row.prompt,
    promptTemplate: row.prompt,
    negativePrompt: row.negative_prompt || '',
    defaultParams: params,
    paramsJson: params,
    coverUrl: row.cover_url || '',
    previewUrl: row.preview_url || row.cover_url || '',
    ratio,
    style,
    quality: params.quality || params.resolution || '',
    resolution: params.resolution || '',
    duration: durationToDisplay(duration),
    scene: row.scene || '',
    category: categoryName,
    tags: tags.join(','),
    tagsJson: tags,
    likesCount: 0,
    favoritesCount: row.favorite_count || 0,
    favoriteCount: row.favorite_count || 0,
    usageCount: row.usage_count || 0,
    viewCount: row.view_count || 0,
    isHot: !!row.is_hot,
    isRecommended: !!row.is_recommended,
    status: legacyStatusFromTemplate(row),
    sortOrder: row.sort_order || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
