export type MediaInputKind = 'image' | 'video' | 'audio';

export interface MediaInputParameterInspection {
  imageParam?: Record<string, any>;
  videoParam?: Record<string, any>;
  audioParam?: Record<string, any>;
  hasImageParam: boolean;
  hasVideoParam: boolean;
  hasAudioParam: boolean;
}

const MEDIA_PARAMETER_NAMES: Record<MediaInputKind, string[]> = {
  image: [
    'image', 'images', 'imageurl', 'imageurls', 'imgurl',
    'referenceurl', 'referenceurls', 'referenceimageurls', 'inputreference',
  ],
  video: [
    'video', 'videos', 'videourl', 'videourls', 'referencevideo',
    'referencevideos', 'referencevideourl', 'referencevideourls', 'clips',
  ],
  audio: [
    'audio', 'audios', 'audiourl', 'audiourls', 'audiofile',
    'audiofiles', 'soundfile', 'soundfiles',
  ],
};

const MEDIA_LIMIT_KEYS: Record<MediaInputKind, string[]> = {
  image: ['max_reference_images', 'maxReferenceImages'],
  video: ['max_video_urls', 'maxVideoUrls'],
  audio: ['max_audio_urls', 'maxAudioUrls'],
};

/**
 * Read model-declared media parameters once and use the same result for both
 * public capability responses and task-time validation.
 */
export function inspectModelMediaInputParameters(modelConfig: unknown): MediaInputParameterInspection {
  const config = normalizeObject(modelConfig);
  const paramNames = readParameterNames(config);
  const remoteParameters = extractRemoteParameterEntries(config);

  return {
    imageParam: findUploadParameter(remoteParameters, 'image'),
    videoParam: findUploadParameter(remoteParameters, 'video'),
    audioParam: findUploadParameter(remoteParameters, 'audio'),
    hasImageParam: hasUploadParameter(remoteParameters, paramNames, 'image'),
    hasVideoParam: hasUploadParameter(remoteParameters, paramNames, 'video'),
    hasAudioParam: hasUploadParameter(remoteParameters, paramNames, 'audio'),
  };
}

export function getModelMediaInputMax(modelConfig: unknown, kind: MediaInputKind): number | undefined {
  const config = normalizeObject(modelConfig);
  const inspection = inspectModelMediaInputParameters(config);
  const parameter = kind === 'image'
    ? inspection.imageParam
    : kind === 'video'
      ? inspection.videoParam
      : inspection.audioParam;
  const inferred = parameter ? inferMediaInputMaxItems(parameter) : undefined;
  if (inferred !== undefined) return inferred;
  return readNonNegativeInt(config, MEDIA_LIMIT_KEYS[kind]);
}

export function inferMediaInputMaxItems(parameter: Record<string, any>): number | undefined {
  const direct = readNonNegativeInt(parameter, [
    'maxItems', 'max_items', 'max', 'maximum',
  ]) ?? readNestedNonNegativeInt(parameter, [
    'validation', 'schema', 'items',
  ], ['maxItems', 'max_items', 'max', 'maximum']);
  if (direct !== undefined) return direct;

  const description = cleanString(parameter.description || parameter.help || parameter.hint);
  const range = description.match(/\b\d+\s*[-–]\s*(\d+)\s*(?:images?|videos?|audios?|files?|urls?)\b/i);
  if (range) return Number(range[1]);
  const chineseRange = description.match(/\d+\s*[-–~～至]\s*(\d+)\s*(?:张\s*(?:参考)?(?:图片|图像|图)?|个\s*(?:视频|音频|文件|链接|URL)?|份\s*(?:文件|文档)?)/i);
  if (chineseRange) return Number(chineseRange[1]);
  const upper = description.match(/(?:up to|maximum(?: of)?|最多)\s*(\d+)\s*(?:images?|videos?|audios?|files?|urls?)/i);
  if (upper) return Number(upper[1]);
  const chineseUpper = description.match(/最多\s*(\d+)\s*(?:张|个|份)\s*(?:图片|图像|视频|音频|文件|参考图)?/i);
  return chineseUpper ? Number(chineseUpper[1]) : undefined;
}

function extractRemoteParameterEntries(config: Record<string, any>): Record<string, any>[] {
  const result: Record<string, any>[] = [];
  const candidates = [
    config.remote_parameters,
    config.remoteParameters,
    config.tasks,
  ];
  for (const candidate of candidates) collectParameterEntries(candidate, result);
  return result;
}

function collectParameterEntries(value: unknown, result: Record<string, any>[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectParameterEntries(item, result));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const item = value as Record<string, any>;
  const hasParameterName = [item.name, item.key, item.field, item.mapsTo].some((entry) => cleanString(entry));
  if (hasParameterName) result.push(item);
  if (Array.isArray(item.parameters)) collectParameterEntries(item.parameters, result);
  if (Array.isArray(item.params)) collectParameterEntries(item.params, result);
}

function findUploadParameter(parameters: Record<string, any>[], kind: MediaInputKind): Record<string, any> | undefined {
  return parameters.find((parameter) => isUploadParameter(parameter, kind));
}

function hasUploadParameter(parameters: Record<string, any>[], names: string[], kind: MediaInputKind): boolean {
  const matchingRemoteParameters = parameters.filter((parameter) => matchesMediaParameter(parameter, kind));
  if (matchingRemoteParameters.length) return matchingRemoteParameters.some((parameter) => isUploadParameter(parameter, kind));
  const targets = new Set(names.map(normalizeParameterName));
  return MEDIA_PARAMETER_NAMES[kind].some((name) => targets.has(normalizeParameterName(name)));
}

function isUploadParameter(parameter: Record<string, any>, kind: MediaInputKind): boolean {
  if (!matchesMediaParameter(parameter, kind)) return false;
  const type = cleanString(parameter.type || parameter.valueType || parameter.value_type).toLowerCase();
  return !['switch', 'boolean', 'checkbox'].includes(type);
}

function matchesMediaParameter(parameter: Record<string, any>, kind: MediaInputKind): boolean {
  const targets = new Set(MEDIA_PARAMETER_NAMES[kind].map(normalizeParameterName));
  return [parameter.name, parameter.key, parameter.field, parameter.mapsTo]
    .map(normalizeParameterName)
    .some((value) => targets.has(value));
}

function readParameterNames(config: Record<string, any>): string[] {
  const value = config.param_names ?? config.paramNames ?? config.input_keys ?? config.inputKeys;
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') return cleanString(item.name || item.key || item.field || item.mapsTo);
    return '';
  }).filter(Boolean);
}

function readNonNegativeInt(input: Record<string, any>, keys: string[]): number | undefined {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    if (input[key] === undefined || input[key] === null || input[key] === '') continue;
    const value = Number(input[key]);
    if (Number.isFinite(value) && value >= 0) return Math.floor(value);
  }
  return undefined;
}

function readNestedNonNegativeInt(input: Record<string, any>, containers: string[], keys: string[]): number | undefined {
  for (const container of containers) {
    const value = input[container];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const result = readNonNegativeInt(value, keys);
    if (result !== undefined) return result;
  }
  return undefined;
}

function normalizeParameterName(value: unknown): string {
  return cleanString(value).toLowerCase().replace(/[_\-\s]/g, '');
}

function cleanString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}
