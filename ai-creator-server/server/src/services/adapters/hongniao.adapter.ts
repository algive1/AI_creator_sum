// Hongniao AI async video API adapter.

import axios from 'axios';
import {
  IProviderAdapter,
  SubmitTaskParams,
  SubmitTaskResult,
  QueryTaskConfig,
  QueryTaskResult,
  CancelTaskConfig,
  ParsedResult,
  CostInfo,
  applyStatusMapping,
  extractParsedResult,
  joinBasePath,
  providerNoResultMessage,
} from './adapter.interface';
import {
  applyGenericImageParams,
  applyNanoBananaParams,
  isGptImage2Model,
  isNanoBananaModel,
  normalizeImageParams,
} from './image-param-mapper';

type JsonObject = Record<string, any>;

const VIDEO_CREATE_PATH = '/v1/videos';
const IMAGE_CREATE_PATH = '/v1/images';
const QUERY_PATH = '/api/v1/videos/{id}';

export class HongniaoAdapter implements IProviderAdapter {
  readonly providerType = 'hongniao';

  async submitTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const endpoint = isVideoTask(params.taskType) ? VIDEO_CREATE_PATH : IMAGE_CREATE_PATH;
    const body = isVideoTask(params.taskType) ? buildVideoBody(params) : buildImageBody(params);
    const resp = await axios.post<JsonObject>(
      joinBasePath(normalizeCreateBaseUrl(params.providerConfig.baseUrl), endpoint),
      body,
      {
        headers: jsonHeaders(params.providerConfig.apiKey),
        timeout: Math.max(params.providerConfig.timeout || 0, 600000),
        validateStatus: () => true,
      },
    );

    const data = unwrapHongniaoBody(resp.data);
    const error = extractProviderError(data, resp.status);
    if (error) return { type: 'sync', status: 'failed', error, cost: this.parseCost(data) };

    const status = extractProviderStatus(data) || 'queued';
    const mapped = this.mapStatus(status, {});
    const taskId = extractProviderTaskId(data);
    const result = this.parseResult(data, '');
    const cost = this.parseCost(data);

    if (mapped === 'completed' && result.urls.length > 0) {
      return { type: 'sync', providerTaskId: taskId || undefined, status, result, cost };
    }
    if (taskId && !isTerminalStatus(mapped)) {
      return { type: 'async', providerTaskId: taskId, status, cost };
    }
    if (mapped === 'failed') {
      return {
        type: 'sync',
        status,
        error: { code: 'HONGNIAO_FAILED', message: extractFailureMessage(data) || 'Hongniao video task failed' },
        cost,
      };
    }
    if (taskId) return { type: 'async', providerTaskId: taskId, status, cost };

    return {
      type: 'sync',
      status: 'failed',
      error: { code: 'NO_TASK_ID', message: providerNoResultMessage(data) },
      cost,
    };
  }

  async queryTask(providerTaskId: string, config: QueryTaskConfig): Promise<QueryTaskResult> {
    const resp = await axios.get<JsonObject>(buildHongniaoQueryUrl(config.baseUrl, config.queryTaskUrl || QUERY_PATH, providerTaskId), {
      headers: jsonHeaders(config.apiKey),
      timeout: config.timeout || 30000,
      validateStatus: () => true,
    });

    const data = unwrapHongniaoBody(resp.data);
    const cost = this.parseCost(data);
    const error = extractProviderError(data, resp.status);
    if (error) return { providerTaskId, status: 'failed', error, cost };

    const status = extractProviderStatus(data) || 'processing';
    const mapped = this.mapStatus(status, {});
    const result = this.parseResult(data, '');

    if (mapped === 'completed') {
      return {
        providerTaskId: extractProviderTaskId(data) || providerTaskId,
        status,
        result,
        cost,
        error: result.urls.length ? undefined : { code: 'NO_RESULT', message: providerNoResultMessage(data) },
      };
    }
    if (mapped === 'failed' || mapped === 'cancelled') {
      return {
        providerTaskId: extractProviderTaskId(data) || providerTaskId,
        status,
        result: result.urls.length ? result : undefined,
        error: { code: 'HONGNIAO_FAILED', message: extractFailureMessage(data) || 'Hongniao video task failed' },
        cost,
      };
    }

    return {
      providerTaskId: extractProviderTaskId(data) || providerTaskId,
      status,
      result: result.urls.length ? result : undefined,
      cost,
    };
  }

  async cancelTask(_providerTaskId: string, _config: CancelTaskConfig): Promise<boolean> {
    return false;
  }

  parseResult(raw: any, resultPath: string): ParsedResult {
    return extractParsedResult(addResultAliases(raw), resultPath);
  }

  parseCost(raw: any): CostInfo | null {
    const value = pickNumber(raw, ['cost', 'data.cost', 'usage.cost', 'api_cost', 'apiCost']);
    if (value === null) return null;
    return { apiCostCents: Math.round(value * 100), apiCurrency: 'CREDIT', apiRawCost: value };
  }

  mapStatus(relayStatus: string, mapping: Record<string, string>): string {
    return applyStatusMapping(relayStatus, mapping);
  }
}

export function buildHongniaoQueryUrl(baseUrl: string, queryTaskUrl: string, providerTaskId: string): string {
  const encoded = encodeURIComponent(providerTaskId);
  const template = String(queryTaskUrl || QUERY_PATH).trim() || QUERY_PATH;
  const replaced = template
    .replace(/\{task_id\}/g, encoded)
    .replace(/:task_id/g, encoded)
    .replace(/\{id\}/g, encoded)
    .replace(/:id/g, encoded);
  const literalIdReplaced = replaced === template ? replaceLiteralIdSegment(template, encoded) : replaced;
  const path = literalIdReplaced === template && !template.endsWith(`/${encoded}`) ? joinBasePath(template, `/${encoded}`) : literalIdReplaced;
  if (/^https?:\/\//i.test(path)) return path;
  return joinBasePath(normalizeApiBaseUrl(baseUrl), path);
}

function replaceLiteralIdSegment(value: string, encoded: string): string {
  return value.replace(/(^|\/)id(?=$|[?#])/i, `$1${encoded}`);
}

function buildVideoBody(params: SubmitTaskParams): JsonObject {
  const input = params.params || {};
  const images = normalizeStringArray(params.images || input.images || input.imageUrls || input.image_urls || input.imageUrl || input.image_url);
  const audioUrls = normalizeStringArray(input.audioUrls || input.audio_urls || input.audioUrl || input.audio_url);
  const videoUrls = normalizeStringArray(input.videoUrls || input.video_urls || input.videoUrl || input.video_url);
  const aspectRatio = normalizeHongniaoAspectRatio(
    params.upstreamCode,
    input.aspectRatio || input.aspect_ratio || input.ratio,
    input.nativeSize || input.native_size,
  );
  const body: JsonObject = {
    model: params.upstreamCode,
    prompt: params.prompt,
    aspectRatio,
    seconds: normalizeSeconds(input.seconds || input.duration || input.durationSeconds || input.durationRaw),
  };
  if (images.length > 0) body.images = images;
  if (audioUrls.length > 0) body.audioUrls = audioUrls;
  if (videoUrls.length > 0) body.videoUrls = videoUrls;
  copyDefined(body, 'resolution', input.resolution || input.resolutionPreset || input.quality);
  copyDefined(body, 'negativePrompt', input.negativePrompt || input.negative_prompt);
  copyDefined(body, 'seed', input.seed);
  mergeDeclaredHongniaoParameters(body, params.modelConfig, input);
  applyHongniaoDeclaredDefaults(body, params.modelConfig);
  applyHongniaoDeclaredValueFormats(body, params.modelConfig);
  return compactObject(body);
}

function buildImageBody(params: SubmitTaskParams): JsonObject {
  const input = params.params || {};
  const normalized = normalizeImageParams(input);
  const body: JsonObject = {
    model: params.upstreamCode,
    prompt: params.prompt,
  };

  if (isGptImage2Model(params.upstreamCode)) {
    // HongNiao gpt-image-2 requires aspect_ratio + parameters.quality format (not OpenAI size/n)
    body.aspect_ratio = normalized.ratio || 'auto';
    body.parameters = { quality: normalizeGptImage2Quality(normalized.quality) };
  } else if (isNanoBananaModel(params.upstreamCode)) {
    applyNanoBananaParams(body, normalized, params.upstreamCode);
  } else {
    applyHongniaoGenericImageParams(body, normalized, input, params.modelConfig);
  }

  const images = normalizeStringArray(params.images || input.images || input.imageUrls || input.image_urls || input.imageUrl || input.image_url);
  if (images.length > 0) body.images = images;
  copyDefined(body, 'maskUrl', input.maskUrl || input.mask_url);
  copyDefined(body, 'seed', input.seed);
  mergeDeclaredHongniaoParameters(body, params.modelConfig, input);
  applyHongniaoDeclaredDefaults(body, params.modelConfig);
  applyHongniaoDeclaredValueFormats(body, params.modelConfig);
  return compactObject(body);
}

function applyHongniaoDeclaredDefaults(body: JsonObject, modelConfig: any): void {
  const defaults = modelConfig?.default_params || modelConfig?.defaultParams;
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) return;
  const declared = collectHongniaoParameterNames(modelConfig);
  const aliases: Record<string, string[]> = {
    aspectratio: ['aspectRatio', 'aspect_ratio', 'ratio'],
    seconds: ['seconds', 'duration'],
    resolution: ['resolution', 'quality'],
    quality: ['quality', 'resolution'],
    size: ['size', 'nativeSize', 'native_size'],
  };
  const targets: Record<string, string> = {
    aspectratio: 'aspectRatio',
    seconds: 'seconds',
    resolution: 'resolution',
    quality: 'quality',
    size: 'size',
  };

  for (const [normalizedName, target] of Object.entries(targets)) {
    if (!declared.has(normalizedName) || body[target] !== undefined) continue;
    const value = aliases[normalizedName]
      .map((key) => defaults[key])
      .find((item) => item !== undefined && item !== null && item !== '');
    if (value !== undefined && value !== null && value !== '') body[target] = value;
  }
}

function applyHongniaoDeclaredValueFormats(body: JsonObject, modelConfig: any): void {
  const declaredValues = readHongniaoDeclaredValues(modelConfig);
  if (!declaredValues.length) return;
  for (const key of ['resolution', 'quality']) {
    const current = String(body[key] || '').trim();
    if (!current) continue;
    const declared = declaredValues.find((item) => item.toLowerCase() === current.toLowerCase());
    if (declared) body[key] = declared;
  }
}

function applyHongniaoGenericImageParams(
  body: JsonObject,
  normalized: ReturnType<typeof normalizeImageParams>,
  input: JsonObject,
  modelConfig: any,
): void {
  applyGenericImageParams(body, normalized);
  const parameterNames = collectHongniaoParameterNames(modelConfig);
  if (!parameterNames.size) {
    copyDefined(body, 'aspectRatio', input.aspectRatio || input.aspect_ratio || input.ratio);
    copyDefined(body, 'resolution', input.resolution || input.resolutionPreset || input.quality);
    return;
  }

  const hasAspectRatio = parameterNames.has('aspectratio') || parameterNames.has('ratio');
  const hasSize = parameterNames.has('size');
  const hasResolution = parameterNames.has('resolution');
  const hasQuality = parameterNames.has('quality');
  const hasImageCount = ['n', 'count', 'imagecount', 'numimages', 'numberofimages', 'outputcount'].some((name) => parameterNames.has(name));

  if (hasAspectRatio) {
    const ratio = String(normalized.ratio || input.aspectRatio || input.aspect_ratio || input.ratio || '').trim();
    if (ratio) body.aspectRatio = ratio;
  } else {
    delete body.aspectRatio;
  }
  if (!hasSize) delete body.size;
  if (!hasImageCount) delete body.n;
  if (!hasResolution) delete body.resolution;
  if (!hasQuality) delete body.quality;

  if (hasResolution && !body.resolution) {
    const resolution = String(normalized.resolutionPreset || '').trim();
    if (resolution && resolution !== 'auto') body.resolution = resolution;
  }
  if (hasQuality && !body.quality) {
    const requestedQuality = String(normalized.quality || '').trim();
    const resolution = String(normalized.resolutionPreset || '').trim();
    const availableQualities = readHongniaoDeclaredValues(modelConfig);
    const mappedResolution = availableQualities.find((item) => item.toLowerCase() === resolution.toLowerCase());
    if (requestedQuality && !isResolutionPresetValue(requestedQuality)) body.quality = requestedQuality;
    else if (mappedResolution) body.quality = mappedResolution;
  }
  applyHongniaoDeclaredValueFormats(body, modelConfig);
}

function collectHongniaoParameterNames(modelConfig: any): Set<string> {
  const names = [
    ...(Array.isArray(modelConfig?.param_names) ? modelConfig.param_names : []),
    ...(Array.isArray(modelConfig?.paramNames) ? modelConfig.paramNames : []),
    ...flattenRemoteParameterEntries(modelConfig).flatMap((param) => [param?.name, param?.key, param?.field, param?.mapsTo]),
  ];
  return new Set(names.map((item) => normalizeParameterName(item)).filter(Boolean));
}

function readHongniaoDeclaredValues(modelConfig: any): string[] {
  const values = [
    ...(Array.isArray(modelConfig?.supported_qualities) ? modelConfig.supported_qualities : []),
    ...(Array.isArray(modelConfig?.supportedQualities) ? modelConfig.supportedQualities : []),
    ...flattenRemoteParameterEntries(modelConfig).flatMap((param) => {
      const name = normalizeParameterName(param?.name || param?.key || param?.field || param?.mapsTo);
      if (!['resolution', 'quality', 'size'].includes(name)) return [];
      const options = param?.values || param?.options || param?.enum || param?.allowedValues;
      if (Array.isArray(options)) return options.map((item: any) => item?.value ?? item?.label ?? item);
      if (typeof options === 'string') return options.split(',');
      return [];
    }),
  ];
  return values.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function isResolutionPresetValue(value: string): boolean {
  return /^(?:auto|\d+(?:\.\d+)?k)$/i.test(value);
}

function normalizeParameterName(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[-_\s]/g, '');
}

function normalizeGptImage2Quality(value: unknown): string {
  const quality = String(value || '').trim().toLowerCase();
  return ['high', 'medium', 'low'].includes(quality) ? quality : 'high';
}

function mergeDeclaredHongniaoParameters(body: JsonObject, modelConfig: any, input: JsonObject): void {
  const declared = flattenRemoteParameterEntries(modelConfig);
  if (!declared.length) return;
  const defaults = modelConfig && typeof modelConfig === 'object' && !Array.isArray(modelConfig)
    ? (modelConfig.default_params || modelConfig.defaultParams || {})
    : {};
  const parameters: JsonObject = { ...(body.parameters && typeof body.parameters === 'object' ? body.parameters : {}) };

  for (const param of declared) {
    const name = String(param?.name || param?.key || param?.field || '').trim();
    if (!name || isTopLevelHongniaoField(name) || isTopLevelHongniaoField(param?.mapsTo)) continue;
    const value = firstDefinedValue(input, defaults, param, [name, param?.mapsTo]);
    if (value === undefined || value === null || value === '') continue;
    parameters[name] = value;
  }

  if (Object.keys(parameters).length) body.parameters = parameters;
}

function flattenRemoteParameterEntries(modelConfig: any): JsonObject[] {
  const remote = modelConfig?.remote_parameters || modelConfig?.remoteParameters || [];
  if (!Array.isArray(remote)) return [];
  return remote.flatMap((task: any) => Array.isArray(task?.parameters) ? task.parameters : [])
    .filter((item: any) => item && typeof item === 'object');
}

function firstDefinedValue(input: JsonObject, defaults: JsonObject, param: JsonObject, names: any[]): any {
  const keys = names.map((item) => String(item || '').trim()).filter(Boolean);
  for (const source of [input, defaults]) {
    if (!source || typeof source !== 'object') continue;
    for (const key of keys) {
      if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
      const camel = snakeToCamel(key);
      if (source[camel] !== undefined && source[camel] !== null && source[camel] !== '') return source[camel];
      const snake = camelToSnake(key);
      if (source[snake] !== undefined && source[snake] !== null && source[snake] !== '') return source[snake];
    }
  }
  return param.defaultValue ?? param.default_value ?? param.default;
}

function isTopLevelHongniaoField(value: unknown): boolean {
  const normalized = String(value || '').trim().toLowerCase().replace(/[_\-\s]/g, '');
  return new Set([
    'prompt',
    'model',
    'aspectratio',
    'ratio',
    'seconds',
    'duration',
    'resolution',
    'size',
    'quality',
    'images',
    'imageurls',
    'imageurl',
    'videos',
    'videourls',
    'videourl',
    'audios',
    'audiourls',
    'audiourl',
    'maskurl',
    'negativeprompt',
    'seed',
    'metadata',
  ]).has(normalized);
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function isVideoTask(taskType: string): boolean {
  return String(taskType || '').toLowerCase().includes('video');
}

function normalizeCreateBaseUrl(baseUrl: string): string {
  return String(baseUrl || '').trim().replace(/\/api\/v1\/?$/i, '').replace(/\/+$/, '');
}

function normalizeApiBaseUrl(baseUrl: string): string {
  return String(baseUrl || '').trim().replace(/\/v1\/?$/i, '').replace(/\/+$/, '');
}

function jsonHeaders(apiKey: string): Record<string, string> {
  return {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };
}

function unwrapHongniaoBody(data: any): any {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  if (typeof data.body !== 'string') return data.body && typeof data.body === 'object' ? data.body : data;
  try {
    return JSON.parse(data.body);
  } catch {
    return data;
  }
}

function addResultAliases(value: any, depth = 0): any {
  if (value === null || value === undefined || depth > 8) return value;
  if (Array.isArray(value)) return value.map(item => addResultAliases(item, depth + 1));
  if (typeof value !== 'object') return value;

  const out: JsonObject = {};
  for (const [key, item] of Object.entries(value)) out[key] = addResultAliases(item, depth + 1);
  copyAlias(out, 'videoUrl', 'video_url');
  copyAlias(out, 'videoUrls', 'video_urls');
  copyAlias(out, 'imageUrl', 'image_url');
  copyAlias(out, 'imageUrls', 'image_urls');
  copyAlias(out, 'audioUrl', 'audio_url');
  copyAlias(out, 'audioUrls', 'audio_urls');
  copyAlias(out, 'outputUrl', 'output_url');
  copyAlias(out, 'resultUrl', 'result_url');
  copyAlias(out, 'downloadUrl', 'download_url');
  copyAlias(out, 'fileUrl', 'file_url');
  return out;
}

function copyAlias(target: JsonObject, from: string, to: string): void {
  if (target[to] === undefined && target[from] !== undefined) target[to] = target[from];
}

function normalizeSeconds(value: any): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const match = String(value).match(/\d+/);
  if (!match) return undefined;
  return match[0];
}

function normalizeHongniaoAspectRatio(model: string, value: any, nativeSize: any): string | undefined {
  const explicitSize = String(nativeSize || '').trim();
  if (/^\d+x\d+$/i.test(explicitSize)) return explicitSize.toLowerCase();

  const ratio = String(value || '').trim();
  if (!ratio) return undefined;
  const sizeRatioModels = new Set(['zh-grok-video-1.5', 'veo_3_1-xs']);
  if (!sizeRatioModels.has(String(model || '').trim())) return ratio;
  if (ratio === '16:9') return '1280x720';
  if (ratio === '9:16') return '720x1280';
  return ratio;
}

function normalizeStringArray(value: any): string[] {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  const found = new Set<string>();
  for (const item of items) {
    const text = typeof item === 'string'
      ? item
      : item?.url || item?.audioUrl || item?.audio_url || item?.videoUrl || item?.video_url || item?.imageUrl || item?.image_url || '';
    const normalized = String(text || '').trim();
    if (normalized) found.add(normalized);
  }
  return Array.from(found);
}

function isTerminalStatus(status: string): boolean {
  return ['completed', 'failed', 'cancelled', 'canceled'].includes(String(status || '').toLowerCase());
}

function extractProviderStatus(data: any): string {
  for (const item of providerResponseCandidates(data)) {
    const status = item?.status || item?.state || item?.status_group || item?.statusGroup;
    if (status !== undefined && status !== null && String(status).trim()) return String(status).trim();
  }
  return '';
}

function extractProviderTaskId(data: any): string {
  for (const item of providerResponseCandidates(data)) {
    const taskId = item?.id || item?.task_id || item?.taskId;
    if (taskId !== undefined && taskId !== null && String(taskId).trim()) return String(taskId).trim();
  }
  return '';
}

function extractProviderError(data: any, statusCode = 200): { code: string; message: string } | null {
  const candidates = providerResponseCandidates(data);
  const apiCode = candidates.map((item) => item?.code ?? item?.status_code ?? item?.statusCode).find((value) => value !== undefined && value !== null && value !== '');
  const hasApiErrorCode = apiCode !== undefined
    && !['0', '200', '201', '202', '204', 'success', 'ok', 'accepted', 'created', 'queued', 'pending', 'processing', 'completed'].includes(String(apiCode).trim().toLowerCase());
  const status = extractProviderStatus(data).toLowerCase();
  const error = candidates.map((item) => item?.error).find((value) => value !== undefined && value !== null && value !== '')
    || (hasApiErrorCode || statusCode >= 400 ? data : null);
  if (!error && status !== 'failed' && statusCode < 400) return null;
  return {
    code: String(error?.code || apiCode || statusCode || 'HONGNIAO_ERROR'),
    message: extractFailureMessage(data) || String(error?.message || data?.message || data?.msg || 'Hongniao API request failed'),
  };
}

function extractFailureMessage(data: any): string {
  for (const item of providerResponseCandidates(data)) {
    const value = item?.error?.message
      || (typeof item?.error === 'string' ? item.error : '')
      || item?.fail_reason
      || item?.failure_reason
      || item?.message
      || item?.msg;
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function providerResponseCandidates(data: any): any[] {
  const result: any[] = [];
  const queue: Array<{ value: any; depth: number }> = [{ value: data, depth: 0 }];
  const seen = new Set<any>();
  while (queue.length) {
    const current = queue.shift()!;
    if (!current.value || typeof current.value !== 'object' || seen.has(current.value)) continue;
    seen.add(current.value);
    result.push(current.value);
    if (current.depth >= 4) continue;
    for (const key of ['data', 'task', 'result', 'output', 'response', 'payload']) {
      const nested = current.value[key];
      if (nested && typeof nested === 'object') queue.push({ value: nested, depth: current.depth + 1 });
    }
  }
  return result;
}

function pickNumber(data: any, paths: string[]): number | null {
  for (const path of paths) {
    const value = pickAny(data, path);
    if (value === undefined || value === null || value === '') continue;
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

function pickAny(data: any, path: string): any {
  let current = data;
  for (const part of path.split('.')) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

function copyDefined(target: JsonObject, key: string, value: any): void {
  if (value !== undefined && value !== null && value !== '') target[key] = value;
}

function compactObject<T extends JsonObject>(obj: T): T {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined || obj[key] === null || obj[key] === '') delete obj[key];
    else if (Array.isArray(obj[key]) && obj[key].length === 0) delete obj[key];
  }
  return obj;
}
