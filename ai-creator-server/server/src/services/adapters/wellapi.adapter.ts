// services/adapters/wellapi.adapter.ts
// WellAPI media relay adapter.
// Supported first wave:
// - OpenAI-compatible image API: POST /v1/images/generations
// - Unified video API: POST /v1/video/create, GET /v1/video/query?id={task_id}
// - MiniMax Hailuo: POST /minimax/v1/video_generation, GET /minimax/v1/query/video_generation?task_id={task_id}
// - Vidu: POST /ent/v2/*2video, GET /ent/v2/tasks/{task_id}/creations
// - PixVerse: POST /openapi/v2/video/*/generate, GET /openapi/v2/video/result/{task_id}

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

type JsonObject = Record<string, any>;

const IMAGE_GENERATE_PATH = '/v1/images/generations';
const UNIFIED_CREATE_PATH = '/v1/video/create';
const UNIFIED_QUERY_PATH = '/v1/video/query?id={task_id}';
const MINIMAX_CREATE_PATH = '/minimax/v1/video_generation';
const MINIMAX_RETRIEVE_PATH = '/minimax/v1/files/retrieve?file_id={file_id}';

const VIDU_MODELS = new Set(['viduq1-classic', 'viduq2', 'viduq2-turbo', 'viduq2-pro', 'vidu2.0']);
const MINIMAX_MODELS = new Set(['minimax-hailuo-02', 'minimax-hailuo-2.3']);
const PIXVERSE_MODELS = new Set(['pixverse-video']);

export class WellAPIAdapter implements IProviderAdapter {
  readonly providerType = 'wellapi';

  async submitTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    if (isImageTask(params.taskType)) return this.submitImageTask(params);

    const model = normalizeModel(params.upstreamCode);
    if (MINIMAX_MODELS.has(model)) return this.submitMiniMaxTask(params);
    if (VIDU_MODELS.has(model)) return this.submitViduTask(params);
    if (PIXVERSE_MODELS.has(model)) return this.submitPixVerseTask(params);
    return this.submitUnifiedTask(params);
  }

  private async submitImageTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const input = params.params || {};
    const body: JsonObject = {
      model: params.upstreamCode,
      prompt: params.prompt,
      n: normalizeImageCount(input.imageCount),
      size: normalizeImageSize(input.nativeSize || input.size || input.resolution),
      response_format: input.responseFormat || input.response_format || 'url',
    };
    copyDefined(body, 'negative_prompt', input.negativePrompt || input.negative_prompt);
    const quality = normalizeImageQuality(input.quality);
    copyDefined(body, 'quality', quality);

    return this.submitJsonTask(params, IMAGE_GENERATE_PATH, compactObject(body), [
      'id',
      'task_id',
      'data.id',
      'data.task_id',
    ]);
  }

  private async submitUnifiedTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const body: JsonObject = {
      model: params.upstreamCode,
      prompt: params.prompt,
      images: normalizeImages(params.images),
    };
    const input = params.params || {};
    copyDefined(body, 'aspect_ratio', input.ratio || input.aspect_ratio);
    copyDefined(body, 'duration', normalizeDuration(input.durationSeconds ?? input.duration));
    copyDefined(body, 'size', normalizeSize(input.size || input.resolution || input.quality));
    copyDefined(body, 'resolution', input.resolution);
    copyDefined(body, 'quality', input.quality);
    copyDefined(body, 'negative_prompt', input.negativePrompt || input.negative_prompt);
    copyDefined(body, 'audio_mode', input.audioMode || input.audio_mode);
    if (input.preserveAudio !== undefined || input.preserve_audio !== undefined) {
      body.preserve_audio = !!(input.preserveAudio ?? input.preserve_audio);
    }
    body.enhance_prompt = input.enhancePrompt ?? input.enhance_prompt ?? true;
    body.enable_upsample = input.enableUpsample ?? input.enable_upsample ?? false;
    if (input.watermark !== undefined) body.watermark = !!input.watermark;

    return this.submitJsonTask(params, UNIFIED_CREATE_PATH, compactObject(body), [
      'id',
      'task_id',
      'data.id',
      'data.task_id',
    ]);
  }

  private async submitMiniMaxTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const input = params.params || {};
    const images = normalizeImages(params.images);
    const body: JsonObject = {
      model: params.upstreamCode,
      prompt: params.prompt,
      duration: normalizeDuration(input.durationSeconds ?? input.duration) || 5,
    };
    copyDefined(body, 'resolution', normalizeUpperResolution(input.resolution || input.quality));
    copyDefined(body, 'negative_prompt', input.negativePrompt || input.negative_prompt);
    copyDefined(body, 'audio_mode', input.audioMode || input.audio_mode);
    body.prompt_optimizer = input.promptOptimizer ?? input.prompt_optimizer ?? true;
    if (images[0]) body.first_frame_image = images[0];
    if (images[1]) body.last_frame_image = images[1];

    return this.submitJsonTask(params, MINIMAX_CREATE_PATH, compactObject(body), [
      'task_id',
      'data.task_id',
      'output.task_id',
    ]);
  }

  private async submitViduTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const input = params.params || {};
    const images = normalizeImages(params.images);
    const endpoint = buildViduCreatePath(params.taskType, params.upstreamCode, images.length);
    const body: JsonObject = {
      model: params.upstreamCode,
      prompt: params.prompt,
      duration: normalizeDuration(input.durationSeconds ?? input.duration) || 5,
      images: images.length ? images : undefined,
    };
    copyDefined(body, 'resolution', normalizeLowerResolution(input.resolution || input.quality));
    copyDefined(body, 'aspect_ratio', input.ratio || input.aspect_ratio);
    copyDefined(body, 'movement_amplitude', input.movementAmplitude || input.motionStrength || 'auto');
    copyDefined(body, 'negative_prompt', input.negativePrompt || input.negative_prompt);
    copyDefined(body, 'seed', input.seed);
    copyDefined(body, 'audio_mode', input.audioMode || input.audio_mode);
    if (input.offPeak !== undefined || input.off_peak !== undefined) body.off_peak = !!(input.offPeak ?? input.off_peak);

    return this.submitJsonTask(params, endpoint, compactObject(body), [
      'task_id',
      'id',
      'data.task_id',
      'data.id',
    ]);
  }

  private async submitPixVerseTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const input = params.params || {};
    const images = normalizeImages(params.images);
    const endpoint = images.length ? '/openapi/v2/video/img/generate' : '/openapi/v2/video/text/generate';
    const body: JsonObject = {
      model: input.pixverseModel || 'v6',
      prompt: params.prompt,
      duration: normalizeDuration(input.durationSeconds ?? input.duration) || 5,
      quality: normalizeLowerResolution(input.resolution || input.quality) || '720p',
    };
    copyDefined(body, 'aspect_ratio', input.ratio || input.aspect_ratio);
    copyDefined(body, 'negative_prompt', input.negativePrompt || input.negative_prompt);
    copyDefined(body, 'seed', input.seed);
    copyDefined(body, 'motion_mode', input.motionMode || input.motion_mode);
    copyDefined(body, 'camera_movement', input.cameraMove || input.camera_movement);
    copyDefined(body, 'audio_mode', input.audioMode || input.audio_mode);
    if (images[0]) body.img_id = await this.resolvePixVerseImageId(params, images[0]);

    return this.submitJsonTask(params, endpoint, compactObject(body), [
      'Resp.video_id',
      'Resp.id',
      'video_id',
      'id',
      'data.video_id',
    ], withTraceHeader(params.providerConfig.apiKey));
  }

  private async resolvePixVerseImageId(params: SubmitTaskParams, imageUrl: string): Promise<number | string> {
    const url = joinBasePath(params.providerConfig.baseUrl, '/openapi/v2/image/upload');
    const body = { image_url: imageUrl };
    const resp = await axios.post<JsonObject>(url, body, {
      headers: withTraceHeader(params.providerConfig.apiKey),
      timeout: Math.max(params.providerConfig.timeout || 0, 60000),
    });
    const data = resp.data;
    const err = extractProviderError(data);
    if (err) throw new Error(err.message);
    return pickString(data, ['Resp.img_id', 'Resp.id', 'img_id', 'id', 'data.img_id']) || imageUrl;
  }

  private async submitJsonTask(
    params: SubmitTaskParams,
    endpointPath: string,
    body: JsonObject,
    taskIdPaths: string[],
    headers?: Record<string, string>,
  ): Promise<SubmitTaskResult> {
    const resp = await axios.post<JsonObject>(joinBasePath(params.providerConfig.baseUrl, endpointPath), body, {
      headers: headers || jsonHeaders(params.providerConfig.apiKey),
      timeout: Math.max(params.providerConfig.timeout || 0, 60000),
    });
    const data = resp.data;
    const error = extractProviderError(data);
    if (error) return { type: 'sync', status: 'failed', error, cost: this.parseCost(data) };
    const result = this.parseResult(data, '');
    if (result.urls.length > 0) {
      return { type: 'sync', status: extractStatus(data) || 'success', result, cost: this.parseCost(data) };
    }
    const providerTaskId = pickString(data, taskIdPaths);
    if (providerTaskId) {
      return {
        type: 'async',
        providerTaskId,
        status: extractStatus(data) || 'pending',
        cost: this.parseCost(data),
      };
    }
    return {
      type: 'sync',
      status: 'failed',
      error: { code: 'NO_TASK_ID', message: providerNoResultMessage(data) },
      cost: this.parseCost(data),
    };
  }

  async queryTask(providerTaskId: string, config: QueryTaskConfig): Promise<QueryTaskResult> {
    const queryTemplate = config.queryTaskUrl || UNIFIED_QUERY_PATH;
    const url = buildTemplateUrl(config.baseUrl, queryTemplate, providerTaskId);
    const headers = isPixVerseQuery(queryTemplate) ? withTraceHeader(config.apiKey) : jsonHeaders(config.apiKey);
    const resp = await axios.get<JsonObject>(url, {
      headers,
      timeout: config.timeout || 30000,
    });
    let data = resp.data;

    if (isMiniMaxQuery(queryTemplate)) {
      data = await this.enrichMiniMaxResult(data, config);
    }

    const error = extractProviderError(data);
    if (error) return { providerTaskId, status: 'failed', error, cost: this.parseCost(data) };

    const status = extractStatus(data) || 'pending';
    const mapped = normalizeWellAPIStatus(status);
    const result = this.parseResult(data, '');
    const cost = this.parseCost(data);

    if (mapped === 'completed') {
      return {
        providerTaskId,
        status,
        result,
        cost,
        error: result.urls.length ? undefined : { code: 'NO_RESULT', message: providerNoResultMessage(data) },
      };
    }
    if (mapped === 'failed' || mapped === 'cancelled') {
      return {
        providerTaskId,
        status,
        result: result.urls.length ? result : undefined,
        error: { code: 'WELLAPI_FAILED', message: pickString(data, ['ErrMsg', 'message', 'error.message', 'data.message']) || 'WellAPI task failed' },
        cost,
      };
    }
    return {
      providerTaskId,
      status,
      result: result.urls.length ? result : undefined,
      cost,
    };
  }

  private async enrichMiniMaxResult(data: JsonObject, config: QueryTaskConfig): Promise<JsonObject> {
    const result = extractParsedResult(data, '');
    if (result.urls.length > 0) return data;
    const status = normalizeWellAPIStatus(extractStatus(data));
    if (status !== 'completed') return data;
    const fileId = pickString(data, [
      'data.data.file.file_id',
      'data.file.file_id',
      'data.file_id',
      'file_id',
      'data.fail_reason',
    ]);
    if (!fileId) return data;
    const url = buildTemplateUrl(config.baseUrl, MINIMAX_RETRIEVE_PATH.replace('{file_id}', encodeURIComponent(fileId)), fileId);
    try {
      const resp = await axios.get<JsonObject>(url, {
        headers: jsonHeaders(config.apiKey),
        timeout: config.timeout || 30000,
      });
      return { ...data, result: resp.data, file_result: resp.data };
    } catch {
      return data;
    }
  }

  async cancelTask(_providerTaskId: string, _config: CancelTaskConfig): Promise<boolean> {
    return false;
  }

  parseResult(raw: any, resultPath: string): ParsedResult {
    return extractParsedResult(raw, resultPath);
  }

  parseCost(raw: any): CostInfo | null {
    const value = pickNumber(raw, [
      'credits',
      'data.credits',
      'Resp.credit',
      'Resp.credits',
      'usage.cost',
      'data.usage.cost',
    ]);
    if (value === null) return null;
    return { apiCostCents: Math.round(value * 100), apiCurrency: 'CNY', apiRawCost: value };
  }

  mapStatus(relayStatus: string, mapping: Record<string, string>): string {
    return applyStatusMapping(normalizeWellAPIStatus(relayStatus), mapping);
  }
}

function buildViduCreatePath(taskType: string, upstreamCode: string, imageCount: number): string {
  const mode = String(taskType || '').toLowerCase();
  const model = normalizeModel(upstreamCode);
  if (mode.includes('first_last') || imageCount >= 2 && ['viduq1-classic', 'viduq2-turbo', 'vidu2.0'].includes(model)) {
    return '/ent/v2/start-end2video';
  }
  if (imageCount > 1 || ['viduq2', 'viduq2-pro'].includes(model)) return '/ent/v2/reference2video';
  if (imageCount > 0) return '/ent/v2/img2video';
  return '/ent/v2/text2video';
}

function buildTemplateUrl(baseUrl: string, template: string, taskId: string): string {
  const encoded = encodeURIComponent(taskId);
  const path = String(template || '')
    .replace(/\{task_id\}/g, encoded)
    .replace(/\{id\}/g, encoded)
    .replace(/:task_id/g, encoded)
    .replace(/:id/g, encoded);
  if (/^https?:\/\//i.test(path)) return path;
  if (path.includes('{')) return joinBasePath(baseUrl, path.replace(/\{[^}]+\}/g, encoded));
  return joinBasePath(baseUrl, path);
}

function isImageTask(taskType: string): boolean {
  const normalized = String(taskType || '').toLowerCase();
  return normalized.includes('image') && !normalized.includes('video');
}

function normalizeWellAPIStatus(status: any): string {
  const raw = String(status ?? '').trim();
  const normalized = raw.toLowerCase();
  if (normalized === '1') return 'completed';
  if (normalized === '5' || normalized === '0') return 'processing';
  if (normalized === '7' || normalized === '8') return 'failed';
  if (['created', 'queueing', 'queued', 'pending', 'processing', 'submitted', 'running', 'in_queue'].includes(normalized)) return 'processing';
  if (['success', 'succeeded', 'completed', 'complete', 'done'].includes(normalized)) return 'completed';
  if (['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(normalized)) return normalized === 'cancelled' || normalized === 'canceled' ? 'cancelled' : 'failed';
  return normalized || raw;
}

function extractStatus(data: any): string {
  return String(pickAny(data, [
    'status',
    'state',
    'data.status',
    'data.state',
    'data.task_status',
    'output.task_status',
    'Resp.status',
    'Resp.state',
    'Resp.task_status',
  ]) ?? '');
}

function extractProviderError(data: any): { code: string; message: string } | null {
  const errCode = pickAny(data, ['ErrCode', 'code', 'base_resp.status_code', 'data.err_code', 'err_code']);
  const errMsg = pickString(data, ['ErrMsg', 'message', 'error.message', 'base_resp.status_msg', 'data.err_msg', 'err_msg']);
  if (errCode !== undefined && errCode !== null && String(errCode) !== '0' && String(errCode).toLowerCase() !== 'success') {
    return { code: String(errCode), message: errMsg || 'WellAPI returned an error' };
  }
  if (data?.error) {
    return { code: String(data.error.code || 'WELLAPI_ERROR'), message: String(data.error.message || data.error) };
  }
  return null;
}

function pickString(data: any, paths: string[]): string {
  for (const path of paths) {
    const value = pickAny(data, path);
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return '';
}

function pickNumber(data: any, paths: string[]): number | null {
  for (const path of paths) {
    const value = pickAny(data, path);
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pickAny(data: any, pathOrPaths: string | string[]): any {
  const paths = Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths];
  for (const path of paths) {
    const parts = path.split('.');
    let current = data;
    for (const part of parts) {
      if (current === undefined || current === null) break;
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
      current = arrayMatch ? current?.[arrayMatch[1]]?.[Number(arrayMatch[2])] : current?.[part];
    }
    if (current !== undefined && current !== null) return current;
  }
  return undefined;
}

function normalizeImages(value: any): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map(item => String(item || '').trim()).filter(Boolean);
}

function normalizeDuration(value: any): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value).trim().toLowerCase();
  const match = text.match(/\d+/);
  const n = Number(match ? match[0] : value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function normalizeImageCount(value: any): number {
  const n = Number(value || 1);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.min(4, Math.floor(n)));
}

function normalizeImageSize(value: any): string {
  const explicit = normalizeSize(value);
  if (explicit && explicit.toLowerCase() !== 'auto') return explicit;
  return '1024x1024';
}

function normalizeImageQuality(value: any): string | undefined {
  const text = String(value || '').trim();
  if (!text || ['standard', '1k', '2k', '4k'].includes(text.toLowerCase())) return undefined;
  return text;
}

function normalizeSize(value: any): string | undefined {
  if (!value) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  if (/^\d+p$/i.test(text)) return text.toUpperCase();
  return text;
}

function normalizeUpperResolution(value: any): string | undefined {
  const text = normalizeSize(value);
  return text ? text.toUpperCase() : undefined;
}

function normalizeLowerResolution(value: any): string | undefined {
  const text = normalizeSize(value);
  return text ? text.toLowerCase() : undefined;
}

function normalizeModel(value: any): string {
  return String(value || '').trim().toLowerCase();
}

function compactObject<T extends JsonObject>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined || value[key] === null || value[key] === '') delete value[key];
    if (Array.isArray(value[key]) && value[key].length === 0) delete value[key];
  }
  return value;
}

function copyDefined(target: JsonObject, key: string, value: any): void {
  if (value !== undefined && value !== null && value !== '') target[key] = value;
}

function jsonHeaders(apiKey: string): Record<string, string> {
  return {
    Accept: 'application/json',
    Authorization: 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
  };
}

function withTraceHeader(apiKey: string): Record<string, string> {
  return {
    ...jsonHeaders(apiKey),
    'Ai-trace-id': newTraceId(),
  };
}

function newTraceId(): string {
  return `ai-creator-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isMiniMaxQuery(template: string): boolean {
  return String(template || '').includes('/minimax/');
}

function isPixVerseQuery(template: string): boolean {
  return String(template || '').includes('/openapi/v2/video/result');
}
