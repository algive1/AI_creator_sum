import { getModelMediaInputMax, inspectModelMediaInputParameters } from './media-input-limits.service';

export interface VideoCapabilityInput {
  featureKey?: string;
  modelName?: string;
  apiModelName?: string;
  upstreamModelCode?: string;
  providerType?: string;
  modelConfig?: any;
  ratios?: string[];
  qualities?: string[];
  durations?: string[] | null;
  audioModes?: string[] | null;
  defaultAudioMode?: string;
  supportedSizeModes?: string[];
  nativeSizes?: string[];
  maxReferenceImages?: number;
  maxVideoUrls?: number;
  maxAudioUrls?: number;
  inputMode?: string | null;
  minReferenceImages?: number | null;
  referenceUploadMode?: string | null;
  requiredReference?: boolean | null;
  advancedParams?: string[] | null;
}

export interface VideoCapabilityResult {
  ratios: string[];
  qualities: string[];
  durations: string[] | null;
  audioModes: string[] | null;
  defaultAudioMode: string;
  supportedSizeModes: string[];
  nativeSizes: string[];
  inputMode: string;
  inputMediaTypes: Array<'image' | 'video' | 'audio'>;
  minReferenceImages: number;
  maxReferenceImages: number;
  maxVideoUrls: number;
  maxAudioUrls: number;
  referenceUploadMode: 'none' | 'first_frame' | 'first_last' | 'reference_images' | 'source_video';
  requiredReference: boolean;
  advancedParams: string[];
}

export function buildVideoCapabilities(input: VideoCapabilityInput): VideoCapabilityResult {
  const config = normalizeObject(input.modelConfig);
  const defaultParams = normalizeObject(config.default_params || config.defaultParams);
  const modelName = [input.modelName, input.apiModelName, input.upstreamModelCode].map((item) => String(item || '')).join(' ');
  const feature = String(input.featureKey || '').trim().toLowerCase();

  const ratios = chooseConfigStringList(
    config,
    ['supported_ratios', 'supportedRatios', 'ratios', 'aspect_ratios', 'aspectRatios'],
    input.ratios,
    defaultParams.aspect_ratio || defaultParams.aspectRatio || defaultParams.ratio || defaultParams.size,
  ).map(normalizeVideoRatio).filter(Boolean);
  const qualities = chooseConfigStringList(
    config,
    ['supported_qualities', 'supportedQualities', 'supported_resolutions', 'supportedResolutions', 'resolutions', 'qualities'],
    input.qualities,
    defaultParams.resolution || defaultParams.quality,
  ).map(normalizeVideoQuality);
  const durations = chooseConfigStringList(
    config,
    ['supported_durations', 'supportedDurations', 'durations'],
    input.durations || [],
    defaultParams.duration,
  ).map(normalizeDurationLabel);
  const audioModes = chooseConfigStringList(
    config,
    ['supported_audio_modes', 'supportedAudioModes', 'audioModes'],
    input.audioModes || [],
    config.default_audio_mode || config.defaultAudioMode || defaultParams.audioMode || defaultParams.audio_mode,
  ).map(normalizeAudioMode).filter(Boolean);
  const advancedParams = normalizeAdvancedParams(config, input.advancedParams);
  const supportedSizeModes = chooseConfigStringList(
    config,
    ['supported_size_modes', 'supportedSizeModes'],
    input.supportedSizeModes,
  );
  const nativeSizes = chooseConfigStringList(
    config,
    ['native_sizes', 'nativeSizes'],
    input.nativeSizes,
  );
  const inputModeOverride = cleanString(input.inputMode);
  const referenceUploadModeOverride = cleanString(input.referenceUploadMode);
  const mediaInputParameters = inspectModelMediaInputParameters(config);
  const inputMode = normalizeInputMode(
    input.featureKey,
    config.input_mode || config.inputMode || config.reference_upload_mode || config.referenceUploadMode || inputModeOverride,
    modelName,
  );
  let referenceUploadMode = normalizeReferenceUploadMode(
    input.featureKey,
    config.reference_upload_mode || config.referenceUploadMode || referenceUploadModeOverride,
    inputMode,
  );
  let minReferenceImages = normalizeNullableNonNegativeInt(config.min_reference_images ?? config.minReferenceImages)
    ?? normalizeNullableNonNegativeInt(input.minReferenceImages)
    ?? defaultMinReferenceImages(inputMode);
  const modelMaxReferenceImages = getModelMediaInputMax(config, 'image');
  let maxReferenceImages = resolveModelMediaLimit(
    input.maxReferenceImages,
    modelMaxReferenceImages,
    defaultMaxReferenceImages(inputMode),
  );
  const requiredReferenceOverride = normalizeNullableBoolean(
    config.required_reference ?? config.requiredReference,
  ) ?? normalizeNullableBoolean(input.requiredReference);
  const hasImageParam = mediaInputParameters.hasImageParam;
  const hasVideoParam = mediaInputParameters.hasVideoParam;
  const hasAudioParam = mediaInputParameters.hasAudioParam;
  if (
    feature === 'image_to_video'
    && referenceUploadMode === 'first_frame'
    && maxReferenceImages > 1
    && !referenceUploadModeOverride
    && !config.reference_upload_mode
    && !config.referenceUploadMode
  ) {
    referenceUploadMode = 'reference_images';
  }
  if (feature === 'image_to_video' && referenceUploadMode === 'first_frame') {
    minReferenceImages = 1;
    maxReferenceImages = 1;
  } else if (feature === 'image_to_video' && referenceUploadMode === 'reference_images') {
    minReferenceImages = Math.max(1, minReferenceImages);
  } else if (feature === 'first_last_frame_video') {
    minReferenceImages = 2;
    maxReferenceImages = 2;
  } else if (feature === 'video_create') {
    minReferenceImages = 0;
    maxReferenceImages = 1;
  }
  const defaultAudioMode = normalizeAudioMode(config.default_audio_mode || config.defaultAudioMode || input.defaultAudioMode || audioModes[0]) || 'silent';
  const maxVideoUrls = resolveModelMediaLimit(
    input.maxVideoUrls,
    getModelMediaInputMax(config, 'video'),
    referenceUploadMode === 'source_video' || hasVideoParam ? 1 : 0,
  );
  const maxAudioUrls = resolveModelMediaLimit(
    input.maxAudioUrls,
    getModelMediaInputMax(config, 'audio'),
    hasAudioParam ? 1 : 0,
  );
  const imageMediaSupported = (feature !== 'video_create' && referenceUploadMode !== 'none' && maxReferenceImages > 0)
    || (hasImageParam && maxReferenceImages > 0);
  const videoMediaSupported = maxVideoUrls > 0;
  const audioMediaSupported = maxAudioUrls > 0;
  const inputMediaTypes: Array<'image' | 'video' | 'audio'> = [];
  if (imageMediaSupported) inputMediaTypes.push('image');
  if (videoMediaSupported) inputMediaTypes.push('video');
  if (audioMediaSupported) inputMediaTypes.push('audio');

  return {
    ratios: uniqueStrings(ratios),
    qualities: uniqueStrings(qualities),
    durations: durations.length ? uniqueStrings(durations) : null,
    audioModes: audioModes.length ? uniqueStrings(audioModes) : null,
    defaultAudioMode,
    supportedSizeModes: supportedSizeModes.length ? uniqueStrings(supportedSizeModes) : ['ratio'],
    nativeSizes: uniqueStrings(nativeSizes),
    inputMode,
    inputMediaTypes,
    minReferenceImages,
    maxReferenceImages,
    maxVideoUrls,
    maxAudioUrls,
    referenceUploadMode,
    requiredReference: requiredReferenceOverride ?? minReferenceImages > 0,
    advancedParams,
  };
}

function cleanString(value: unknown): string {
  return String(value ?? '').trim();
}

function chooseConfigStringList(config: Record<string, any>, keys: string[], fallback?: string[] | null, extra?: any): string[] {
  const fromConfig = readConfigStringList(config, keys);
  if (fromConfig.present) return fromConfig.values;
  const base = fromConfig.present ? fromConfig.values : stringArray(fallback);
  const extraValue = typeof extra === 'number' ? String(extra) : String(extra || '').trim();
  return extraValue && !base.length ? [extraValue] : base;
}

function readConfigStringList(config: Record<string, any>, keys: string[]): { present: boolean; values: string[] } {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(config, key)) {
      return { present: true, values: stringArray(config[key]) };
    }
  }
  return { present: false, values: [] };
}

function stringArray(value: any): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function normalizeVideoQuality(value: string): string {
  const text = String(value || '').trim();
  const lower = text.toLowerCase();
  if (!text) return '';
  if (/^\d+p$/i.test(text)) return lower;
  if (lower === 'standard') return '720p';
  if (lower === 'hd') return '1080p';
  return text;
}

function normalizeVideoRatio(value: string): string {
  const text = String(value || '').trim();
  if (!text) return '';
  if (['auto', 'adaptive'].includes(text.toLowerCase())) return text.toLowerCase();
  const match = text.match(/^(\d{1,4})\s*:\s*(\d{1,4})$/);
  const sizeMatch = text.match(/^(\d{1,5})\s*[xX×]\s*(\d{1,5})$/);
  if (match) return `${Number(match[1])}:${Number(match[2])}`;
  const width = Number(sizeMatch?.[1]);
  const height = Number(sizeMatch?.[2]);
  if (!width || !height) return '';
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right) [left, right] = [right, left % right];
  return left || 1;
}

function normalizeAdvancedParams(config: Record<string, any>, fallback?: string[] | null): string[] {
  const explicit = readConfigStringList(config, [
    'advanced_params',
    'advancedParams',
    'supported_advanced_params',
    'supportedAdvancedParams',
  ]);
  const fromParams = readConfigStringList(config, [
    'param_names',
    'paramNames',
    'input_keys',
    'inputKeys',
  ]);
  const source = explicit.present ? explicit.values : fromParams.present ? fromParams.values : stringArray(fallback);
  const found = new Set<string>();
  for (const item of source) {
    const normalized = normalizeAdvancedParamKey(item);
    if (normalized) found.add(normalized);
  }
  const order = ['seed', 'fps', 'audioUrl'];
  return order.filter((item) => found.has(item));
}

function normalizeAdvancedParamKey(value: unknown): string {
  const key = String(value || '').trim();
  if (!key) return '';
  const compact = key.replace(/[-_\s]/g, '').toLowerCase();
  if (compact === 'seed') return 'seed';
  if (compact === 'fps' || compact === 'framerate') return 'fps';
  if (compact === 'audiourl' || compact === 'audiourls') return 'audioUrl';
  return '';
}

function normalizeDurationLabel(value: string): string {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.toLowerCase() === 'auto') return 'auto';
  if (/^\d+$/.test(text)) return `${text}s`;
  const match = text.match(/^(\d+)\s*(s|秒)$/i);
  return match ? `${match[1]}s` : text;
}

function normalizeAudioMode(value: unknown): string {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  if (['none', 'off', 'mute', 'muted', 'silent'].includes(text)) return 'silent';
  if (['audio', 'sound', 'with_audio', 'generate_audio', 'with-sound'].includes(text)) return 'audio';
  return text;
}

function normalizeInputMode(featureKey: unknown, value: unknown, modelName: string): string {
  const feature = String(featureKey || '').trim().toLowerCase();
  if (feature === 'video_create') return 'text';
  if (feature === 'first_last_frame_video') return 'first_last';
  if (feature === 'video_edit') return 'source_video';

  const text = String(value || '').trim().toLowerCase();
  if (['text', 'text_to_video'].includes(text)) return 'text';
  if (['first_frame', 'single_image', 'image_to_video'].includes(text)) return 'first_frame';
  if (['first_last', 'first_last_frame', 'first_last_frame_video'].includes(text)) return 'first_last';
  if (['reference', 'reference_images', 'reference_to_video'].includes(text)) return 'reference_images';
  if (['video', 'source_video', 'video_edit'].includes(text)) return 'source_video';

  const normalized = String(modelName || '').toLowerCase();
  if (feature === 'image_to_video') {
    if (normalized.includes('omni-flash')) return 'reference_images';
    if (normalized.includes('kwvideo-v2-ref') || normalized.includes('cankao') || normalized.includes('reference')) return 'reference_images';
    return 'first_frame';
  }
  if (normalized.includes('omni-flash')) return 'reference_images';
  if (normalized.includes('kwvideo-v2-ref') || normalized.includes('cankao') || normalized.includes('reference')) return 'reference_images';
  if (normalized.includes('grok-imagine') || normalized.includes('grok-video') || normalized.includes('sora-2')) return 'first_frame';
  if (normalized.includes('shouweizhen') || normalized.includes('first/last')) return 'first_last';
  return 'default';
}

function normalizeReferenceUploadMode(featureKey: unknown, value: unknown, inputMode: string): VideoCapabilityResult['referenceUploadMode'] {
  const feature = String(featureKey || '').trim().toLowerCase();
  if (feature === 'video_create') return 'none';
  if (feature === 'first_last_frame_video') return 'first_last';
  if (feature === 'video_edit') return 'source_video';

  const text = String(value || '').trim().toLowerCase();
  if (['none', 'text'].includes(text)) return 'none';
  if (['first_frame', 'single_image', 'image_to_video'].includes(text)) return 'first_frame';
  if (['first_last', 'first_last_frame', 'first_last_frame_video'].includes(text)) return 'first_last';
  if (['reference', 'reference_images', 'reference_to_video'].includes(text)) return 'reference_images';
  if (['video', 'source_video', 'video_edit'].includes(text)) return 'source_video';
  if (inputMode === 'first_frame') return 'first_frame';
  if (inputMode === 'first_last') return 'first_last';
  if (inputMode === 'reference_images') return 'reference_images';
  if (inputMode === 'source_video') return 'source_video';
  if (feature === 'image_to_video') return inputMode === 'reference_images' ? 'reference_images' : 'first_frame';
  return 'none';
}

function defaultMinReferenceImages(inputMode: string): number {
  if (inputMode === 'reference_images') return 1;
  return 0;
}

function defaultMaxReferenceImages(inputMode: string): number {
  if (inputMode === 'reference_images') return 4;
  if (inputMode === 'first_last') return 2;
  if (inputMode === 'first_frame') return 1;
  return 4;
}

function normalizeNonNegativeInt(value: unknown, fallback: number): number {
  const numberValue = Math.floor(Number(value));
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : fallback;
}

function resolveModelMediaLimit(inputValue: unknown, modelValue: number | undefined, fallback: number): number {
  // An explicit zero from the caller is a deliberate disable override. For
  // normal tier values, the bound model's declared limit is authoritative.
  if (inputValue !== undefined && inputValue !== null && Number(inputValue) === 0) return 0;
  if (modelValue !== undefined) return normalizeNonNegativeInt(modelValue, fallback);
  return normalizeNonNegativeInt(inputValue, fallback);
}

function normalizeNullableNonNegativeInt(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const numberValue = Math.floor(Number(value));
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function normalizeNullableBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (['1', 'true', 'yes', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'off'].includes(text)) return false;
  return null;
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((item, index) => Boolean(item) && values.indexOf(item) === index);
}

function normalizeObject(value: any): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
