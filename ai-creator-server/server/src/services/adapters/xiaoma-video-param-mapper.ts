import {
  XIAOMA_AUDIO_PARAM_NAMES,
  XIAOMA_IMAGE_PARAM_NAMES,
  XIAOMA_VIDEO_PARAM_NAMES,
} from '../xiaoma-media-parameters';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export function applyXiaomaVideoParams(body: Record<string, JsonValue>, input: Record<string, any>, modelName: string): void {
  const model = String(modelName || '').toLowerCase();
  const images = stringList(body.images || input.images || input.uploadKeys);
  const ratio = normalizeRatio(input.ratio || input.aspect_ratio || input.aspectRatio);
  const duration = normalizeDuration(input.durationText || input.durationRaw || input.duration);
  const resolution = trimString(input.resolution || input.quality || input.size);
  const audioMode = normalizeAudioMode(input.audioMode || input.audio_mode);
  const videoMode = String(input.videoMode || '').trim();
  const seed = input.seed ?? body.seed;
  const audioUrls = stringList(input.audioUrls || input.audio_urls || body.audioUrls || body.audio_urls || input.audioUrl || input.audio_url || body.audioUrl || body.audio_url);
  const videoUrls = stringList(input.videoUrls || input.video_urls || body.videoUrls || body.video_urls || input.videoUrl || input.video_url || body.videoUrl || body.video_url);
  const audioUrl = audioUrls[0] || trimString(input.audioUrl ?? input.audio_url ?? body.audioUrl ?? body.audio_url);
  const audioFileId = input.audioFileId ?? input.audio_file_id ?? body.audioFileId ?? body.audio_file_id;
  const preserveAudio = input.preserveAudio ?? input.preserve_audio;

  delete body.ratio;
  delete body.aspect_ratio;
  delete body.aspectRatio;
  delete body.durationText;
  delete body.durationRaw;
  delete body.durationSeconds;
  delete body.resolution;
  delete body.quality;
  delete body.audioMode;
  delete body.audio_mode;
  delete body.preserveAudio;
  delete body.preserve_audio;
  delete body.videoMode;
  delete body.audioUrl;
  delete body.audioUrls;
  delete body.audio_urls;
  delete body.videoUrl;
  delete body.videoUrls;
  delete body.video_urls;
  delete body.audioFileId;

  if (seed !== undefined && seed !== null && String(seed).trim() !== '') {
    body.seed = typeof seed === 'number' ? seed : trimString(seed);
  }
  if (audioUrl) body.audio_url = audioUrl;
  if (audioUrls.length) body.audio_urls = audioUrls;
  if (videoUrls.length) {
    body.video_url = videoUrls[0];
    body.video_urls = videoUrls;
  }
  if (audioFileId !== undefined && audioFileId !== null && String(audioFileId).trim() !== '') {
    body.audio_file_id = typeof audioFileId === 'number' ? audioFileId : trimString(audioFileId);
  }

  if (model.includes('sora-2')) {
    if (duration) body.duration = secondsValue(duration, '4');
    if (ratio) body.orientation = ratio === '9:16' ? 'portrait' : 'landscape';
    if (images.length) body.input_reference = images[0];
    body.watermark = false;
    return;
  }

  if (model.includes('grok-video-3')) {
    if (images.length) body.images = images.slice(0, 1);
    if (ratio) body.aspect_ratio = ratio;
    if (resolution) body.size = resolution;
    if (duration) body.duration = secondsValue(duration, '6');
    return;
  }

  if (model.includes('grok-imagine-video-1.5-preview')) {
    if (images.length) body.images = images.slice(0, 1);
    if (ratio) body.aspect_ratio = ratio;
    if (resolution) body.resolution = resolution;
    if (duration) body.duration = secondsValue(duration, '5');
    return;
  }

  if (model.includes('doubao-seedance-1-5-pro-251215')) {
    if (images.length) body.images = images.slice(0, 2);
    if (duration) body.audio_duration = secondsValue(duration, '4');
    if (resolution) body.resolution = resolution;
    if (ratio) body.ratio = ratio;
    if (audioMode) body.generate_audio = audioMode === 'audio';
    return;
  }

  if (model.includes('kling-v3-video') || model.includes('kling-v3-omni-cankao') || model.includes('kling-v3-omni-shouweizhen')) {
    if (images.length) body.images = model.includes('cankao') ? images.slice(0, 7) : images.slice(0, 2);
    if (duration) body.duration = secondsValue(duration, '5');
    if (ratio && !model.includes('shouweizhen')) body.aspect_ratio = ratio;
    body.mode = trimString(input.mode || input.generationMode || input.generation_mode) || 'std';
    return;
  }

  if (model.includes('veo3.1-lite')) {
    if (images.length) body.images = images.slice(0, 2);
    if (ratio) body.aspect_ratio = ratio;
    if (resolution) body.quality = resolution;
    body.enhance_prompt = boolParam(input.enhancePrompt ?? input.enhance_prompt, true);
    return;
  }

  if (model.includes('veo3.1')) {
    if (images.length) body.images = images.slice(0, 2);
    if (ratio) body.aspect_ratio = ratio;
    body.duration = '8';
    body.generation_mode = trimString(input.generationMode || input.generation_mode) || 'fast';
    body.generation_type = veoGenerationType(videoMode, images.length);
    if (resolution) body.quality = resolution;
    body.enhance_prompt = boolParam(input.enhancePrompt ?? input.enhance_prompt, true);
    body.enable_upsample = boolParam(input.enableUpsample ?? input.enable_upsample, false);
    return;
  }

  if (model.includes('omni-flash')) {
    if (images.length) body.images = images.slice(0, 3);
    if (ratio) body.aspect_ratio = ratio;
    if (duration) body.duration = secondsValue(duration, '8');
    body.enhance_prompt = boolParam(input.enhancePrompt ?? input.enhance_prompt, false);
    body.enable_upsample = boolParam(input.enableUpsample ?? input.enable_upsample, false);
    return;
  }

  if (model.includes('happyhorse-video-edit')) {
    const videoUrl = trimString(input.video || input.videoUrl || input.video_url || body.video || body.videoUrl || body.video_url);
    const audioSetting = trimString(input.audioSetting || input.audio_setting || body.audio_setting);
    delete body.videoUrl;
    delete body.video_url;
    delete body.duration;
    delete body.audio_url;
    delete body.audio_file_id;
    if (videoUrl) body.video = videoUrl;
    if (images.length) body.images = images.slice(0, 5);
    if (resolution) body.resolution = resolution;
    if (audioSetting) body.audio_setting = audioSetting;
    else if (preserveAudio !== undefined && preserveAudio !== null && preserveAudio !== '') {
      body.audio_setting = boolParam(preserveAudio, false) ? 'origin' : 'auto';
    }
    return;
  }

  if (model.includes('kwvideo-v2-quannengcankao')) {
    const mode = trimString(input.quanNengMode || input.quan_neng_mode || input._quan_neng_mode || body._quan_neng_mode);
    delete body.images;
    delete body.audio_file_id;
    if (images.length) body.image_url = images.slice(0, 9);
    if (videoUrls.length) body.video_url = videoUrls.slice(0, 3);
    if (audioUrl) body.audio_url = audioUrl;
    if (duration) body.duration = duration === 'auto' ? 'auto' : secondsValue(duration, '5');
    if (ratio) body.aspect_ratio = ratio;
    if (resolution) body.resolution = resolution;
    if (mode) body._quan_neng_mode = mode;
    return;
  }

  if (model.includes('kwvideo-v2')) {
    const usesReferenceImages = model.includes('ref') || model.includes('quannengcankao');
    if (images.length) body.images = usesReferenceImages ? images.slice(0, 9) : images.slice(0, 2);
    if (duration) body.duration = duration === 'auto' ? 'auto' : secondsValue(duration, '5');
    if (ratio) body.aspect_ratio = ratio;
    if (resolution) body.resolution = resolution;
    const version = trimString(input.version ?? body.version);
    if (version) body.version = version;
    else delete body.version;
    return;
  }

  if (images.length) body.images = images;
  if (ratio) body.aspect_ratio = ratio;
  if (duration) body.duration = duration === 'auto' ? 'auto' : secondsValue(duration, '5');
  if (resolution) body.resolution = resolution;
}

export function isXiaomaVideoTaskType(taskType: unknown): boolean {
  return ['text_to_video', 'image_to_video', 'first_last_frame_video', 'video_edit'].includes(String(taskType || '').trim());
}

export function applyXiaomaRemoteMediaParams(
  body: Record<string, JsonValue>,
  modelConfig: Record<string, any> | undefined,
): void {
  const configuredRemoteParams = modelConfig?.remote_parameters || modelConfig?.remoteParameters;
  const remoteParams = Array.isArray(configuredRemoteParams) && configuredRemoteParams.length
    ? configuredRemoteParams
    : (Array.isArray(modelConfig?.param_names)
      ? modelConfig.param_names.map((name: unknown) => ({ name, maxItems: fallbackMediaMaxItems(name, modelConfig) }))
      : []);
  if (!remoteParams.length) return;

  remapDeclaredMediaParam(body, remoteParams, [...XIAOMA_IMAGE_PARAM_NAMES]);
  remapDeclaredMediaParam(body, remoteParams, [...XIAOMA_VIDEO_PARAM_NAMES]);
  remapDeclaredMediaParam(body, remoteParams, [...XIAOMA_AUDIO_PARAM_NAMES]);
}

/**
 * The mini-program normalizes quality labels for display (for example 720P
 * becomes 720p), while Xiaoma model configs can require the original enum
 * spelling. Restore the value declared by the provider before sending it.
 */
export function applyXiaomaDeclaredValueFormats(
  body: Record<string, JsonValue>,
  modelConfig: Record<string, any> | undefined,
): void {
  const configuredValues = [
    ...(Array.isArray(modelConfig?.supported_qualities) ? modelConfig.supported_qualities : []),
    ...(Array.isArray(modelConfig?.supportedQualities) ? modelConfig.supportedQualities : []),
    ...declaredQualityValues(modelConfig?.remote_parameters || modelConfig?.remoteParameters),
  ].map((item) => trimString(item)).filter(Boolean);
  if (!configuredValues.length) return;

  for (const key of ['size', 'imageSize', 'resolution', 'quality']) {
    const current = trimString(body[key]);
    if (!current) continue;
    const declared = configuredValues.find((item) => item.toLowerCase() === current.toLowerCase());
    if (declared) body[key] = declared;
  }
}

function declaredQualityValues(remoteParams: any): string[] {
  if (!Array.isArray(remoteParams)) return [];
  const values: string[] = [];
  const visit = (item: any) => {
    if (!item || typeof item !== 'object') return;
    const name = normalizeParamKey(item.name || item.key || item.field || item.mapsTo);
    if (['size', 'imagesize', 'quality', 'resolution'].includes(name)) {
      const options = item.options || item.values || item.enum || item.allowedValues;
      if (Array.isArray(options)) {
        values.push(...options.map((option: any) => trimString(option?.value ?? option?.label ?? option)));
      } else if (typeof options === 'string') {
        values.push(...options.split(','));
      }
    }
    if (Array.isArray(item.parameters)) item.parameters.forEach(visit);
  };
  remoteParams.forEach(visit);
  return values;
}

/**
 * Convert the mini-program's canonical fields to the exact scalar names and
 * value types declared by the current Xiaoma model. Xiaoma's catalog uses
 * several equivalent names (for example size/imageSize/quality and
 * aspect_ratio/aspectRatio), so copying the canonical field verbatim can
 * silently leave a required upstream field unset.
 */
export function applyXiaomaDeclaredScalarParams(
  body: Record<string, JsonValue>,
  input: Record<string, any>,
  modelConfig: Record<string, any> | undefined,
): void {
  const declaredParams = getDeclaredParameterEntries(modelConfig);
  if (!declaredParams.length) return;

  const ratioTarget = findDeclaredParameterName(declaredParams, ['ratio', 'aspect_ratio', 'aspectRatio']);
  const ratio = normalizeRatio(firstDefined([
    input.ratio,
    input.aspect_ratio,
    input.aspectRatio,
    input.sizeOption?.ratio,
    body.ratio,
    body.aspect_ratio,
    body.aspectRatio,
  ]));
  applyDeclaredAliasValue(body, ratioTarget, ['ratio', 'aspect_ratio', 'aspectRatio'], ratio || undefined);

  const sizeTarget = findDeclaredParameterName(declaredParams, ['size', 'imageSize', 'resolution', 'quality']);
  const selectedPreset = trimString(input.resolutionPreset || input.resolution_preset);
  const selectedQuality = trimString(input.quality);
  const nativeSize = trimString(input.sizeOption?.upstreamSize || input.nativeSize || input.native_size);
  const requestedResolution = trimString(input.resolution || input.resolutionPreset || input.resolution_preset || input.quality || input.size);
  const sizeValue = chooseDeclaredSizeValue({
    targetName: sizeTarget,
    declaredParams,
    body,
    ratio,
    selectedPreset,
    selectedQuality,
    nativeSize,
    requestedResolution,
  });
  applyDeclaredAliasValue(body, sizeTarget, ['size', 'imageSize', 'resolution', 'quality'], sizeValue || undefined);

  const durationTarget = findDeclaredParameterName(declaredParams, ['duration', 'seconds', 'audio_duration']);
  const duration = normalizeProviderDuration(firstDefined([
    input.durationText,
    input.durationRaw,
    input.durationSeconds,
    input.duration,
    body.duration,
    body.seconds,
    body.audio_duration,
  ]));
  applyDeclaredAliasValue(body, durationTarget, ['duration', 'seconds', 'audio_duration'], duration || undefined);

  const audioTarget = findDeclaredParameterName(declaredParams, ['generate_audio', 'audio']);
  const audioMode = normalizeAudioMode(input.audioMode || input.audio_mode);
  if (audioTarget && audioMode) body[audioTarget] = audioMode === 'audio';
  clearUndeclaredAliases(body, ['generate_audio', 'audio'], audioTarget);

  const generationTypeTarget = findDeclaredParameterName(declaredParams, ['generation_type']);
  if (generationTypeTarget) {
    const images = stringList(body.images || input.images || input.uploadKeys);
    body[generationTypeTarget] = veoGenerationType(trimString(input.videoMode), images.length);
  }

  const imageCountTarget = findDeclaredParameterName(declaredParams, ['n', 'count', 'imageCount', 'numImages', 'numberOfImages', 'outputCount']);
  if (imageCountTarget) {
    const imageCount = Number(input.imageCount);
    if (Number.isInteger(imageCount) && imageCount > 0) body[imageCountTarget] = imageCount;
  }
  clearUndeclaredAliases(body, ['n', 'count', 'imageCount', 'numImages', 'numberOfImages', 'outputCount'], imageCountTarget);
}

function getDeclaredParameterEntries(modelConfig: Record<string, any> | undefined): Record<string, any>[] {
  const remoteParams = modelConfig?.remote_parameters || modelConfig?.remoteParameters;
  if (Array.isArray(remoteParams) && remoteParams.length) {
    const entries: Record<string, any>[] = [];
    const visit = (item: any): void => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return;
      if ([item.name, item.key, item.field, item.mapsTo].some((value) => trimString(value))) entries.push(item);
      if (Array.isArray(item.parameters)) item.parameters.forEach(visit);
      if (Array.isArray(item.params)) item.params.forEach(visit);
    };
    remoteParams.forEach(visit);
    if (entries.length) return entries;
  }
  return Array.isArray(modelConfig?.param_names)
    ? modelConfig.param_names.map((name: unknown) => ({ name }))
    : [];
}

function findDeclaredParameterName(params: Record<string, any>[], aliases: string[]): string {
  const targets = new Set(aliases.map(normalizeParamKey));
  for (const param of params) {
    const name = trimString(param.name || param.key || param.field || param.mapsTo);
    if (targets.has(normalizeParamKey(name))) return name;
  }
  return '';
}

function applyDeclaredAliasValue(
  body: Record<string, JsonValue>,
  targetName: string,
  aliases: string[],
  value: JsonValue | undefined,
): void {
  if (!targetName) {
    clearUndeclaredAliases(body, aliases, '');
    return;
  }
  if (value !== undefined && value !== null && value !== '') body[targetName] = value;
  clearUndeclaredAliases(body, aliases, targetName);
}

function clearUndeclaredAliases(body: Record<string, JsonValue>, aliases: string[], targetName: string): void {
  const target = normalizeParamKey(targetName);
  for (const alias of aliases) {
    if (normalizeParamKey(alias) !== target) delete body[alias];
  }
}

function chooseDeclaredSizeValue(input: {
  targetName: string;
  declaredParams: Record<string, any>[];
  body: Record<string, JsonValue>;
  ratio: string;
  selectedPreset: string;
  selectedQuality: string;
  nativeSize: string;
  requestedResolution: string;
}): string {
  const target = normalizeParamKey(input.targetName);
  if (!target) return '';
  const declared = input.declaredParams.find((param) => normalizeParamKey(param.name || param.key || param.field || param.mapsTo) === target);
  const options = declaredValues(declared);
  const existing = trimString(input.body[input.targetName]);
  const candidates = target === 'imagesize'
    ? [input.selectedPreset, existing]
    : target === 'size'
      ? [input.nativeSize, input.ratio, input.selectedPreset, input.requestedResolution, existing]
      : [input.selectedQuality, input.requestedResolution, input.selectedPreset, existing];
  for (const candidate of candidates) {
    const value = trimString(candidate);
    if (!value || value.toLowerCase() === 'auto' && target !== 'size' && target !== 'imagesize') continue;
    const declaredValue = options.find((item) => item.toLowerCase() === value.toLowerCase());
    if (declaredValue) return declaredValue;
    if (!options.length) return value;
  }
  return existing;
}

function declaredValues(param: Record<string, any> | undefined): string[] {
  const options = param?.options || param?.values || param?.enum || param?.allowedValues;
  if (Array.isArray(options)) return options
    .filter((item: any) => !(item && typeof item === 'object' && (item.currently_unavailable === true || item.available === false)))
    .map((item: any) => trimString(item?.value ?? item?.label ?? item))
    .filter(Boolean);
  if (typeof options === 'string') return options.split(',').map((item: string) => item.trim()).filter(Boolean);
  return [];
}

function firstDefined(values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && trimString(value) !== '');
}

function normalizeProviderDuration(value: unknown): string {
  const text = trimString(value);
  if (!text) return '';
  if (text.toLowerCase() === 'auto') return 'auto';
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(?:s|秒)?$/i);
  return match ? match[1] : text;
}

function remapDeclaredMediaParam(
  body: Record<string, JsonValue>,
  remoteParams: Record<string, any>[],
  aliases: string[],
): void {
  const normalizedAliases = new Set(aliases.map(normalizeParamKey));
  const target = remoteParams.find((item) => (
    item && typeof item === 'object'
    && [item.name, item.key, item.field, item.mapsTo].some((value) => normalizedAliases.has(normalizeParamKey(value)))
  ));
  if (!target) return;

  const targetName = trimString(target.name || target.key || target.field || target.mapsTo);
  if (!targetName) return;
  const values = uniqueStrings(aliases.flatMap((key) => stringList(body[key])));
  if (!values.length) return;

  for (const key of aliases) delete body[key];
  body[targetName] = mediaParamExpectsArray(targetName, target) ? values : values[0];
}

function mediaParamExpectsArray(name: string, param: Record<string, any>): boolean {
  const normalizedName = normalizeParamKey(name);
  if (['images', 'imageurls', 'referenceurls', 'videos', 'videourls', 'referencevideos', 'referencevideourls', 'clips', 'audios', 'audiourls', 'audiofiles', 'soundfiles'].includes(normalizedName)) {
    return true;
  }
  if (Number(param.maxItems ?? param.max_items ?? 0) > 1) return true;
  return /array|list/i.test(String(param.type || param.valueType || param.value_type || ''));
}

function fallbackMediaMaxItems(name: unknown, modelConfig: Record<string, any> | undefined): number | undefined {
  const normalized = normalizeParamKey(name);
  if (['image', 'images', 'imageurl', 'imageurls', 'referenceurl', 'referenceurls', 'inputreference'].includes(normalized)) {
    return positiveConfigNumber(modelConfig?.max_reference_images || modelConfig?.maxReferenceImages);
  }
  if (['video', 'videos', 'videourl', 'videourls', 'referencevideo', 'referencevideos', 'clips'].includes(normalized)) {
    return positiveConfigNumber(modelConfig?.max_video_urls || modelConfig?.maxVideoUrls);
  }
  if (['audio', 'audios', 'audiourl', 'audiourls', 'audiofile', 'audiofiles', 'soundfile', 'soundfiles'].includes(normalized)) {
    return positiveConfigNumber(modelConfig?.max_audio_urls || modelConfig?.maxAudioUrls);
  }
  return undefined;
}

function positiveConfigNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function normalizeParamKey(value: unknown): string {
  return trimString(value).toLowerCase().replace(/[-_\s]/g, '');
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((item) => trimString(item)).filter(Boolean))];
}

function veoGenerationType(videoMode: string, imageCount: number): string {
  if (videoMode === 'first_last_frame_video' || imageCount >= 2) return 'FIRST&LAST';
  if (videoMode === 'image_to_video' || imageCount >= 1) return 'REFERENCE';
  return 'TEXT';
}

function normalizeRatio(value: unknown): string {
  const text = trimString(value);
  if (!text) return '';
  if (text.toLowerCase() === 'auto') return '';
  if (text.toLowerCase() === 'adaptive') return 'adaptive';
  return text;
}

function normalizeDuration(value: unknown): string {
  const text = trimString(value);
  if (!text) return '';
  if (text.toLowerCase() === 'auto') return 'auto';
  const match = text.match(/^(\d+)\s*(?:s|秒)?$/i);
  return match ? match[1] : text;
}

function secondsValue(value: string, fallback: string): string {
  const normalized = normalizeDuration(value);
  if (!normalized || normalized === 'auto') return fallback;
  return normalized;
}

function normalizeAudioMode(value: unknown): string {
  const text = trimString(value).toLowerCase();
  if (['audio', 'sound', 'with_audio', 'with-audio', 'on'].includes(text)) return 'audio';
  if (['silent', 'mute', 'muted', 'no_audio', 'no-audio', 'off'].includes(text)) return 'silent';
  return '';
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return value ? [String(value)] : [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function boolParam(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on', 'enabled'].includes(String(value).trim().toLowerCase());
}

function trimString(value: unknown): string {
  return String(value || '').trim();
}
