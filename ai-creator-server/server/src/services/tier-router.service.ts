import { queryOne, query } from '../utils/db';
import { parseJson } from '../utils/content-helpers';
import { decryptApiKey } from './openai-adapter.service';
import { getModelCapabilitySet, hasAnyCapability } from './model-capability.service';
import { applyFeatureDiscount, resolveMemberFeatureDiscount } from './membership.service';

export interface TierCapabilities {
  ratios: string[];
  qualities: string[];
  styles: string[];
  durations: string[] | null;
  cameraMoves: string[] | null;
  audioModes: string[] | null;
  defaultAudioMode: string;
  supportedSizeModes: string[];
  allowCustomPixels: boolean;
  nativeSizes: string[];
  defaultRatio: string;
  maxWidth: number;
  maxHeight: number;
  minWidth: number;
  minHeight: number;
  maxTotalPixels: number;
  maxAspectRatio: number;
  allowPostprocess: boolean;
  postprocessModes: string[];
  allowUpscale: boolean;
  maxImages: number;
  maxReferenceImages: number;
  maxDurationSeconds: number;
}

export interface TierModelResult {
  tierId: number;
  tierName: string;
  tierKey: string;
  featureKey: string;
  basePointsCost: number;
  pointsCost: number;
  memberDiscountPercent: number;
  memberDiscountApplied: boolean;
  capabilities: TierCapabilities;
  primaryModel: RealModelInfo;
  fallbackModels: RealModelInfo[];
}

export interface RealModelInfo {
  id: number;
  providerId: number;
  name: string;
  modelType: string;
  subType: string;
  apiModelName: string;
  upstreamModelCode: string;
  isAsync: boolean;
  queryTaskUrl: string;
  requestTemplate: any;
  resultPath: string;
  statusMapping: any;
  errorMapping: any;
  priority: number;
  maxConcurrency: number;
  retryTimes: number;
  retryDelayMs: number;
  timeoutSeconds: number;
  providerType: string;
  providerApiBaseUrl: string;
  providerApiKey: string;
}

type CandidateModel = RealModelInfo & {
  bindingType: string;
  fallbackOrder: number;
};

export async function selectTierModel(
  featureKey: string,
  tierKeyOrId: string | number,
  userId: number,
  params: {
    ratio?: string;
    quality?: string;
    style?: string;
    duration?: string;
    cameraMove?: string;
    imageCount?: number;
    sizeMode?: string;
    targetWidth?: number;
    targetHeight?: number;
    fromCustomPixels?: boolean;
    postprocessMode?: string;
    audioMode?: string;
    referenceImageCount?: number;
  } = {},
): Promise<TierModelResult> {
  const feature = await queryOne<any>(
    'SELECT id, feature_key, feature_name FROM model_features WHERE feature_key = ? AND status = ?',
    [featureKey, 'active'],
  );
  if (!feature) throw paramError('功能未启用：' + featureKey);

  const tier = typeof tierKeyOrId === 'number'
    ? await queryOne<any>('SELECT * FROM model_tiers WHERE id = ? AND feature_id = ? AND status = ?', [tierKeyOrId, feature.id, 'active'])
    : await queryOne<any>('SELECT * FROM model_tiers WHERE tier_key = ? AND feature_id = ? AND status = ?', [tierKeyOrId, feature.id, 'active']);
  if (!tier) throw paramError('档位不存在或已禁用：' + tierKeyOrId);

  const capsRow = await queryOne<any>('SELECT * FROM tier_capabilities WHERE tier_id = ?', [tier.id]);
  if (!capsRow) throw paramError('档位能力未配置：' + tier.tier_name);
  const capabilities = mapCapabilities(capsRow);
  validateCapabilities(tier.tier_name, capabilities, params);

  const bindings = await query<any>(
    `SELECT tb.binding_type, tb.fallback_order,
            m.id as model_id, m.provider_id, m.name, m.model_type, m.sub_type, m.api_model_name,
            m.upstream_model_code, m.is_async, m.query_task_url, m.request_template, m.result_path,
            m.status_mapping, m.error_mapping, m.priority, m.max_concurrency, m.retry_times,
            m.retry_delay_ms, m.timeout_seconds,
            p.provider_type, p.api_base_url as provider_api_base_url, p.api_key as provider_api_key
       FROM tier_model_bindings tb
       JOIN ai_models m ON m.id = tb.model_id AND m.status = 'active'
       JOIN ai_model_providers p ON p.id = m.provider_id AND p.status = 'active'
      WHERE tb.tier_id = ?
      ORDER BY CASE tb.binding_type WHEN 'primary' THEN 0 ELSE 1 END, tb.fallback_order`,
    [tier.id],
  );
  const models: CandidateModel[] = bindings.map((binding: any) => ({
    ...mapModel(binding),
    bindingType: binding.binding_type,
    fallbackOrder: Number(binding.fallback_order || 0),
  }));
  const usableModels = models.filter(model => model.providerApiBaseUrl && model.providerApiKey);
  const primaryModel = usableModels.find(model => model.bindingType === 'primary') || usableModels[0];
  if (!primaryModel) throw paramError('No usable model is configured for tier: ' + tier.tier_name);

  for (const model of usableModels) {
    await validateModelForFeature(feature.feature_key, model);
  }

  const basePointsCost = Math.max(0, Number(tier.points_cost || 0));
  const discount = await resolveMemberFeatureDiscount(userId, feature.feature_key);
  const pointsCost = applyFeatureDiscount(basePointsCost, discount.discountPercent);

  return {
    tierId: tier.id,
    tierName: tier.tier_name,
    tierKey: tier.tier_key,
    featureKey: feature.feature_key,
    basePointsCost,
    pointsCost,
    memberDiscountPercent: discount.discountPercent,
    memberDiscountApplied: discount.memberDiscountApplied,
    capabilities,
    primaryModel,
    fallbackModels: usableModels.filter(model => model.id !== primaryModel.id),
  };
}

export function mapCapabilities(row: any): TierCapabilities {
  return {
    ratios: parseJson(row.supported_ratios, []),
    qualities: parseJson(row.supported_qualities, []),
    styles: parseJson(row.supported_styles, []),
    durations: row.supported_durations ? parseJson(row.supported_durations, []) : null,
    cameraMoves: row.supported_camera_moves ? parseJson(row.supported_camera_moves, []) : null,
    audioModes: row.supported_audio_modes ? parseJson(row.supported_audio_modes, []) : null,
    defaultAudioMode: row.default_audio_mode || 'silent',
    supportedSizeModes: parseJson(row.supported_size_modes, ['auto', 'ratio']),
    allowCustomPixels: !!row.allow_custom_pixels,
    nativeSizes: parseJson(row.native_sizes, []),
    defaultRatio: row.default_ratio || '1:1',
    maxWidth: row.max_width || 2048,
    maxHeight: row.max_height || 2048,
    minWidth: row.min_width || 64,
    minHeight: row.min_height || 64,
    maxTotalPixels: row.max_total_pixels || 4194304,
    maxAspectRatio: Number(row.max_aspect_ratio || 4),
    allowPostprocess: row.allow_postprocess !== 0,
    postprocessModes: parseJson(row.postprocess_modes, ['cover', 'contain', 'resize']),
    allowUpscale: !!row.allow_upscale,
    maxImages: row.max_images || 1,
    maxReferenceImages: row.max_reference_images || 4,
    maxDurationSeconds: row.max_duration_seconds || 30,
  };
}

function validateCapabilities(tierName: string, caps: TierCapabilities, params: any) {
  if (params.sizeMode && !caps.supportedSizeModes.includes(params.sizeMode)) {
    throw paramError(`当前档位不支持 ${params.sizeMode} 尺寸模式`);
  }
  if (params.fromCustomPixels && !caps.allowCustomPixels) {
    throw paramError(`当前档位不支持 ${params.targetWidth}x${params.targetHeight} 自定义尺寸`);
  }
  if (params.targetWidth && params.targetHeight) {
    if (params.targetWidth < caps.minWidth || params.targetHeight < caps.minHeight) {
      throw paramError(`当前档位最小支持 ${caps.minWidth}x${caps.minHeight}`);
    }
    if (params.targetWidth > caps.maxWidth || params.targetHeight > caps.maxHeight) {
      throw paramError(`当前档位最大支持 ${caps.maxWidth}x${caps.maxHeight}`);
    }
    if (params.targetWidth * params.targetHeight > caps.maxTotalPixels) {
      throw paramError(`当前档位最大支持 ${caps.maxTotalPixels} 总像素`);
    }
    const aspect = Math.max(params.targetWidth / params.targetHeight, params.targetHeight / params.targetWidth);
    if (aspect > caps.maxAspectRatio) throw paramError(`当前档位不支持过大的宽高比`);
  }
  if (params.ratio && !params.fromCustomPixels && caps.ratios.length > 0 && !caps.ratios.includes(params.ratio)) {
    throw paramError(`当前档位不支持 ${params.ratio} 比例`);
  }
  if (params.quality && caps.qualities.length > 0 && !caps.qualities.includes(params.quality)) {
    throw paramError(`当前档位不支持 ${params.quality} 画质`);
  }
  if (params.style && caps.styles.length > 0 && !caps.styles.includes(params.style)) {
    throw paramError(`当前档位不支持 ${params.style} 风格`);
  }
  if (params.duration && caps.durations && caps.durations.length > 0 && !caps.durations.includes(params.duration)) {
    throw paramError(`当前档位不支持 ${params.duration} 时长`);
  }
  if (params.audioMode && caps.audioModes && caps.audioModes.length > 0 && !caps.audioModes.includes(params.audioMode)) {
    throw paramError('Unsupported audio mode: ' + params.audioMode);
  }
  if (params.cameraMove && caps.cameraMoves && caps.cameraMoves.length > 0 && !caps.cameraMoves.includes(params.cameraMove)) {
    throw paramError(`当前档位不支持 ${params.cameraMove} 运镜`);
  }
  if (params.postprocessMode && !caps.postprocessModes.includes(params.postprocessMode)) {
    throw paramError(`当前档位不支持 ${params.postprocessMode} 后处理方式`);
  }
  if (params.referenceImageCount && params.referenceImageCount > caps.maxReferenceImages) {
    throw paramError(`当前档位最多支持 ${caps.maxReferenceImages} 张参考图`);
  }
  if (!tierName) throw paramError('档位配置异常');
}

function mapModel(b: any): RealModelInfo {
  return {
    id: b.model_id,
    providerId: b.provider_id,
    name: b.name,
    modelType: b.model_type,
    subType: b.sub_type,
    apiModelName: b.api_model_name,
    upstreamModelCode: b.upstream_model_code || '',
    isAsync: !!b.is_async,
    queryTaskUrl: b.query_task_url || '',
    requestTemplate: parseJson(b.request_template, {}),
    resultPath: b.result_path || '',
    statusMapping: parseJson(b.status_mapping, {}),
    errorMapping: parseJson(b.error_mapping, {}),
    priority: b.priority || 0,
    maxConcurrency: b.max_concurrency || 5,
    retryTimes: b.retry_times || 3,
    retryDelayMs: b.retry_delay_ms || 1000,
    timeoutSeconds: b.timeout_seconds || 120,
    providerType: b.provider_type,
    providerApiBaseUrl: b.provider_api_base_url,
    providerApiKey: decryptApiKey(b.provider_api_key),
  };
}

async function validateModelForFeature(featureKey: string, model: RealModelInfo) {
  const capabilityState = await getModelCapabilitySet(model.id);
  const capabilities = capabilityState.capabilities;
  const expectedMap: Record<string, { capabilities: string[]; types: string[]; label: string }> = {
    image_create: { capabilities: ['text_to_image'], types: ['image', 'multimodal'], label: '文生图' },
    image_to_image: { capabilities: ['image_to_image'], types: ['image', 'multimodal'], label: '图生图' },
    image_edit: { capabilities: ['image_edit'], types: ['image', 'multimodal'], label: '图片编辑' },
    video_create: { capabilities: ['text_to_video'], types: ['video', 'multimodal'], label: '文生视频' },
    image_to_video: { capabilities: ['image_to_video'], types: ['video', 'multimodal'], label: '图生视频' },
    first_last_frame_video: { capabilities: ['first_last_frame_video'], types: ['video', 'multimodal'], label: '首尾帧视频' },
    video_edit: { capabilities: ['video_edit'], types: ['video', 'multimodal'], label: '视频编辑' },
    prompt_optimize: { capabilities: ['prompt_optimize', 'text_generation', 'text_chat'], types: ['text', 'multimodal'], label: '提示词优化' },
  };
  const expected = expectedMap[featureKey];

  if (expected) {
    if (!expected.types.includes(String(model.modelType || ''))) {
      throw paramError(`档位绑定的模型 ${model.name} 不是${expected.label}可用模型，请在后台重新绑定。`);
    }
    if (!hasAnyCapability(capabilities, expected.capabilities)) {
      const source = capabilityState.explicit ? '已配置能力' : '模型类型/子类型推断能力';
      throw paramError(`档位绑定的模型 ${model.name} 缺少${expected.label}能力（${source}不匹配），请在后台重新绑定。`);
    }
  }

  if (!model.providerApiBaseUrl) {
    throw paramError(`模型 ${model.name} 缺少 Base URL，请先在后台配置模型供应商。`);
  }
  if (!model.providerApiKey) {
    throw paramError(`模型 ${model.name} 缺少 API Key，请先在后台配置密钥。`);
  }
  if (!model.apiModelName && !model.upstreamModelCode) {
    throw paramError(`模型 ${model.name} 缺少真实模型名，请先在后台填写模型 ID。`);
  }
}

function paramError(message: string) {
  return Object.assign(new Error(message), { code: 4000 });
}
