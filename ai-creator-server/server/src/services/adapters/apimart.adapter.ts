// services/adapters/apimart.adapter.ts
// APIMart async media API adapter.

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
  applyGptImage2Params,
  applyNanoBananaParams,
  isGptImage2Model,
  isNanoBananaModel,
  normalizeImageParams,
} from './image-param-mapper';

type JsonObject = Record<string, any>;

const IMAGE_CREATE_PATH = '/v1/images/generations';
const VIDEO_CREATE_PATH = '/v1/videos/generations';
const TASK_QUERY_PATH = '/v1/tasks/{task_id}';

export class ApimartAdapter implements IProviderAdapter {
  readonly providerType = 'apimart';

  async submitTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const isVideo = isVideoTask(params.taskType);
    const endpoint = isVideo ? VIDEO_CREATE_PATH : IMAGE_CREATE_PATH;
    const body = isVideo ? buildVideoBody(params) : buildImageBody(params);

    const resp = await axios.post<JsonObject>(joinBasePath(params.providerConfig.baseUrl, endpoint), body, {
      headers: jsonHeaders(params.providerConfig.apiKey),
      timeout: Math.max(params.providerConfig.timeout || 0, isVideo ? 600000 : 180000),
      validateStatus: () => true,
    });

    const data = resp.data;
    const error = extractProviderError(data, resp.status);
    if (error) return { type: 'sync', status: 'failed', error, cost: this.parseCost(data) };

    const status = extractProviderStatus(data) || 'submitted';
    const mapped = applyStatusMapping(status, {});
    const result = this.parseResult(data, '');
    const taskId = extractProviderTaskId(data);
    const cost = this.parseCost(data);

    if (result.urls.length > 0 && (!taskId || isTerminalStatus(mapped))) {
      return { type: 'sync', status, result, cost };
    }
    if (taskId && !isTerminalStatus(mapped)) {
      return { type: 'async', providerTaskId: taskId, status, cost };
    }
    if (mapped === 'failed') {
      return {
        type: 'sync',
        status,
        error: { code: 'APIMART_FAILED', message: extractFailureMessage(data) || 'APIMart 任务失败' },
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
    const url = buildQueryTaskUrl(config.queryTaskUrl || TASK_QUERY_PATH, config.baseUrl, providerTaskId);
    const resp = await axios.get<JsonObject>(url, {
      headers: { Authorization: 'Bearer ' + config.apiKey },
      timeout: config.timeout || 30000,
      validateStatus: () => true,
    });

    const data = resp.data;
    const cost = this.parseCost(data);
    const error = extractProviderError(data, resp.status);
    if (error) return { providerTaskId, status: 'failed', error, cost };

    const status = extractProviderStatus(data) || 'processing';
    const mapped = applyStatusMapping(status, {});
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
        error: { code: 'APIMART_FAILED', message: extractFailureMessage(data) || 'APIMart 任务失败' },
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
    return extractParsedResult(raw, resultPath);
  }

  parseCost(raw: any): CostInfo | null {
    const value = pickNumber(raw, ['cost', 'data.cost', 'usage.cost', 'data.usage.cost']);
    if (value === null) return null;
    return { apiCostCents: Math.round(value * 100), apiCurrency: 'CREDIT', apiRawCost: value };
  }

  mapStatus(relayStatus: string, mapping: Record<string, string>): string {
    return applyStatusMapping(relayStatus, mapping);
  }
}

function buildImageBody(params: SubmitTaskParams): JsonObject {
  const input = params.params || {};
  const normalized = normalizeImageParams(input);
  const body: JsonObject = {
    model: params.upstreamCode,
    prompt: params.prompt,
  };
  if (isGptImage2Model(params.upstreamCode)) {
    applyGptImage2Params(body, normalized);
  } else if (isNanoBananaModel(params.upstreamCode)) {
    applyNanoBananaParams(body, normalized);
  } else {
    body.size = resolveImageSize(input);
    applyGenericImageParams(body, normalized);
    body.resolution = normalizeImageResolution(body.resolution || input.resolution || input.quality, params.upstreamCode);
    body.n = normalizeImageCount(input.imageCount);
  }
  const images = normalizeImages(params.images || input.images || input.image_urls || input.image_url);
  if (images.length > 0) body.image_urls = images;
  copyDefined(body, 'mask_url', input.maskUrl || input.mask_url);
  return compactObject(body);
}

function buildVideoBody(params: SubmitTaskParams): JsonObject {
  const input = params.params || {};
  const model = String(params.upstreamCode || '');
  const images = normalizeImages(params.images || input.images || input.image_urls || input.image_url);
  const videoUrl = String(input.videoUrl || input.video_url || '').trim();
  const body: JsonObject = {
    model,
    prompt: params.prompt,
    size: input.size || input.ratio || input.aspect_ratio,
    resolution: normalizeVideoResolution(input.resolution || input.quality, model),
    duration: normalizeDuration(input.durationSeconds ?? input.duration),
  };
  copyDefined(body, 'negative_prompt', input.negativePrompt || input.negative_prompt);
  copyDefined(body, 'seed', input.seed);
  copyDefined(body, 'audio_mode', input.audioMode || input.audio_mode);
  if (input.preserveAudio !== undefined || input.preserve_audio !== undefined) {
    body.preserve_audio = !!(input.preserveAudio ?? input.preserve_audio);
  }
  if (input.watermark !== undefined) body.watermark = !!input.watermark;

  if (params.taskType === 'video_edit') {
    if (videoUsesArrayVideoInput(model)) body.video_urls = videoUrl ? [videoUrl] : undefined;
    else copyDefined(body, 'video_url', videoUrl);
  } else if (params.taskType === 'first_last_frame_video') {
    if (videoUsesImageUrlArray(model)) {
      body.image_urls = images.slice(0, 2);
    } else {
      copyDefined(body, 'first_frame_image', images[0]);
      copyDefined(body, 'last_frame_image', images[1]);
      if (videoKeepsImageUrlsForTransition(model)) body.image_urls = images.slice(0, 2);
      if (videoUsesEndFrameImage(model)) copyDefined(body, 'end_frame_image', images[1]);
    }
  } else if (params.taskType === 'image_to_video') {
    if (images.length > 0) body.image_urls = images;
    if (videoUsesFirstFrameImage(model)) copyDefined(body, 'first_frame_image', images[0]);
  }

  return compactObject(body);
}

function buildQueryTaskUrl(queryTaskUrl: string, baseUrl: string, providerTaskId: string): string {
  const encoded = encodeURIComponent(providerTaskId);
  const template = String(queryTaskUrl || TASK_QUERY_PATH).trim();
  const replaced = template
    .replace(/\{task_id\}/g, encoded)
    .replace(/:task_id/g, encoded)
    .replace(/\{id\}/g, encoded)
    .replace(/:id/g, encoded);
  if (/^https?:\/\//i.test(replaced)) return replaced;
  return joinBasePath(baseUrl, replaced);
}

function jsonHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
  };
}

function isVideoTask(taskType: string): boolean {
  return String(taskType || '').toLowerCase().includes('video');
}

function isTerminalStatus(status: string): boolean {
  return ['completed', 'failed', 'cancelled', 'canceled'].includes(String(status || '').toLowerCase());
}

function resolveImageSize(input: JsonObject): string {
  const sizePlan = input.sizePlan || {};
  const nativeSize = String(input.nativeSize || input.size || '').trim();
  const isCustomPixels = ['custom', 'prompt_pixel'].includes(String(sizePlan.source || ''))
    || String(sizePlan.sizeMode || input.sizeMode || '') === 'custom_pixels';
  if (isCustomPixels && /^\d+x\d+$/i.test(nativeSize)) return nativeSize.toLowerCase();
  return String(input.ratio || input.aspect_ratio || input.size || sizePlan.targetRatio || '1:1').trim();
}

function normalizeImageResolution(value: any, model: string): string {
  const raw = String(value || '').trim().toLowerCase();
  const tier = raw === 'hd' || raw === 'high' || raw === '2k' ? '2K'
    : raw === 'ultra' || raw === 'top' || raw === '4k' ? '4K'
      : raw === '0.5k' || raw === '512' ? '0.5K'
        : '1K';
  return String(model || '').toLowerCase().startsWith('gpt-image-2') ? tier.toLowerCase() : tier;
}

function normalizeVideoResolution(value: any, model: string): string | undefined {
  const raw = String(value || '').trim();
  const lower = raw.toLowerCase();
  if (!raw || lower === 'standard') return defaultVideoResolution(model);
  if (/^\d+p$/i.test(raw)) return prefersUppercaseVideoResolution(model) ? raw.toUpperCase() : raw.toLowerCase();
  if (lower === 'hd') return '720p';
  if (lower === 'full_hd' || lower === '1080') return '1080p';
  return raw;
}

function defaultVideoResolution(model: string): string {
  const normalized = String(model || '').toLowerCase();
  if (prefersUppercaseVideoResolution(model)) return '720P';
  if (normalized.includes('minimax') || normalized.includes('hailuo')) return '768p';
  return '720p';
}

function prefersUppercaseVideoResolution(model: string): boolean {
  const normalized = String(model || '').toLowerCase();
  return normalized.includes('wan') || normalized.includes('kling') || normalized.includes('veo');
}

function normalizeImageCount(value: any): number {
  const count = Number(value || 1);
  if (!Number.isFinite(count)) return 1;
  return Math.min(Math.max(Math.floor(count), 1), 4);
}

function normalizeDuration(value: any): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const match = String(value).match(/\d+/);
  if (!match) return undefined;
  const duration = Number(match[0]);
  return Number.isFinite(duration) && duration > 0 ? duration : undefined;
}

function normalizeImages(value: any): string[] {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  const urls = new Set<string>();
  for (const item of items) {
    const url = typeof item === 'string'
      ? item
      : item?.url || item?.image_url || item?.cdnUrl || item?.accessUrl || item?.storageKey || item?.storage_key || '';
    const text = String(url || '').trim();
    if (text) urls.add(text);
  }
  return Array.from(urls);
}

function videoUsesImageUrlArray(model: string): boolean {
  const normalized = String(model || '').toLowerCase();
  return normalized.startsWith('wan') || normalized.startsWith('vidu');
}

function videoUsesArrayVideoInput(model: string): boolean {
  return String(model || '').toLowerCase().startsWith('wan');
}

function videoUsesFirstFrameImage(model: string): boolean {
  const normalized = String(model || '').toLowerCase();
  return normalized.includes('happyhorse')
    || normalized.includes('minimax')
    || normalized.includes('hailuo')
    || normalized.includes('kling')
    || normalized.includes('veo')
    || normalized.includes('skyreels');
}

function videoKeepsImageUrlsForTransition(model: string): boolean {
  const normalized = String(model || '').toLowerCase();
  return normalized.includes('happyhorse') || normalized.includes('omni');
}

function videoUsesEndFrameImage(model: string): boolean {
  return String(model || '').toLowerCase().includes('skyreels');
}

function compactObject<T extends JsonObject>(obj: T): T {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined || obj[key] === null || obj[key] === '') delete obj[key];
    else if (Array.isArray(obj[key]) && obj[key].length === 0) delete obj[key];
  }
  return obj;
}

function copyDefined(target: JsonObject, key: string, value: any): void {
  if (value !== undefined && value !== null && value !== '') target[key] = value;
}

function extractProviderStatus(data: any): string {
  return String(
    data?.status
    || data?.state
    || data?.data?.status
    || data?.data?.state
    || data?.data?.[0]?.status
    || data?.data?.[0]?.state
    || data?.result?.status
    || data?.result?.state
    || '',
  ).trim();
}

function extractProviderTaskId(data: any): string {
  const value = data?.task_id
    || data?.taskId
    || data?.id
    || data?.data?.task_id
    || data?.data?.taskId
    || data?.data?.id
    || data?.data?.[0]?.task_id
    || data?.data?.[0]?.taskId
    || data?.data?.[0]?.id
    || data?.result?.task_id
    || data?.result?.taskId
    || data?.result?.id
    || '';
  return String(value || '').trim();
}

function extractProviderError(data: any, statusCode = 200): { code: string; message: string } | null {
  const apiCode = data?.code ?? data?.status_code ?? data?.statusCode;
  const hasApiErrorCode = apiCode !== undefined
    && !['0', '200', 'success', 'submitted', 'completed'].includes(String(apiCode).trim().toLowerCase());
  const error = data?.error || (hasApiErrorCode || statusCode >= 400 ? data : null);
  if (!error && statusCode < 400) return null;
  const code = String(error?.code || apiCode || statusCode || 'APIMART_ERROR');
  const type = String(error?.type || '').trim();
  const message = translateProviderError(code, String(error?.message || data?.message || data?.msg || 'APIMart 请求失败'), type);
  return { code, message };
}

function extractFailureMessage(data: any): string {
  return String(
    data?.error?.message
    || data?.data?.error?.message
    || data?.data?.[0]?.error?.message
    || data?.data?.message
    || data?.message
    || '',
  ).trim();
}

function translateProviderError(code: string, message: string, type = ''): string {
  const text = `${code} ${type} ${message}`.toLowerCase();
  if (text.includes('auth') || code === '401') return 'APIMart 鉴权失败，请检查 API Key';
  if (text.includes('balance') || text.includes('quota') || code === '402' || code === '403') return 'APIMart 余额或额度不足，请充值后重试';
  if (text.includes('rate') || code === '429') return 'APIMart 请求过于频繁，请稍后重试';
  if (text.includes('invalid') || code === '400') return `APIMart 参数错误：${message}`;
  if (code === '500' || code === '502' || code === '503') return 'APIMart 上游服务暂时不可用，请稍后重试';
  return message || 'APIMart 请求失败';
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
