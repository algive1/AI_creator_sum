// services/adapters/bagege.adapter.ts
// 巴格格 (www.bagege.cn) API relay adapter
// Protocol: OpenAI-compatible, async polling
// POST /openai/v1/images|videos/generations -> task -> GET /openai/v1/tasks/{id}

import axios from 'axios';
import {
  IProviderAdapter, SubmitTaskParams, SubmitTaskResult,
  QueryTaskConfig, QueryTaskResult, CancelTaskConfig,
  ParsedResult, CostInfo, applyStatusMapping, extractParsedResult,
  joinBasePath, providerNoResultMessage,
} from './adapter.interface';
import {
  applyGenericImageParams,
  applyGptImage2Params,
  applyNanoBananaParams,
  isGptImage2Model,
  isNanoBananaModel,
  normalizeImageParams,
} from './image-param-mapper';

export class BagegeAdapter implements IProviderAdapter {
  readonly providerType = 'bagege';

  async submitTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const { baseUrl, apiKey, timeout } = params.providerConfig;
    const isVideo = isVideoTask(params.taskType);
    const isImageEdit = isImageEditTask(params.taskType);
    const url = buildOpenAiUrl(baseUrl, isVideo ? '/videos/generations' : isImageEdit ? '/images/edits' : '/images/generations');
    const body = isVideo ? buildVideoBody(params) : buildImageBody(params, isImageEdit);

    const resp = await axios.post(url, body, {
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      timeout: Math.max(timeout, isVideo ? 600000 : 120000),
    });

    const data = resp.data;
    const status = extractProviderStatus(data);
    const mappedStatus = applyStatusMapping(status, {});
    const taskId = extractProviderTaskId(data);
    const result = this.parseResult(data, '');
    const cost = this.parseCost(data);

    if (result.urls.length > 0 && (!taskId || isTerminalStatus(mappedStatus))) {
      return {
        type: 'sync',
        status: status || 'success',
        result,
        cost,
      };
    }

    if (taskId && !isTerminalStatus(mappedStatus)) {
      return {
        type: 'async',
        providerTaskId: taskId,
        status: status || 'pending',
        cost,
      };
    }

    if (mappedStatus === 'failed' || data?.error) {
      return {
        type: 'sync',
        status: 'failed',
        cost,
        error: { code: 'BAGEGE_FAILED', message: extractProviderError(data) || 'Task failed' },
      };
    }

    if (taskId) {
      return { type: 'async', providerTaskId: taskId, status: status || 'pending', cost };
    }

    return { type: 'sync', status: 'failed', error: { code: 'NO_RESULT', message: providerNoResultMessage(data) }, cost };
  }

  async queryTask(providerTaskId: string, config: QueryTaskConfig): Promise<QueryTaskResult> {
    const url = buildQueryTaskUrl(config.queryTaskUrl || '', config.baseUrl, providerTaskId);

    const resp = await axios.get(url, {
      headers: { Authorization: 'Bearer ' + config.apiKey },
      timeout: config.timeout || 30000,
    });

    const data = resp.data;
    const status = extractProviderStatus(data) || 'pending';
    const mappedStatus = applyStatusMapping(status, {});
    const result = this.parseResult(data, '');
    const cost = this.parseCost(data);

    if (!isTerminalStatus(mappedStatus)) {
      return {
        providerTaskId,
        status,
        result: result.urls.length ? result : undefined,
        cost,
      };
    }

    if (mappedStatus === 'completed') {
      return {
        providerTaskId,
        status,
        result,
        cost,
        error: result.urls.length ? undefined : { code: 'NO_RESULT', message: providerNoResultMessage(data) },
      };
    }

    return { providerTaskId, status, error: { code: 'BAGEGE_FAILED', message: extractProviderError(data) || 'Task failed' }, cost };
  }

  async cancelTask(_providerTaskId: string, _config: CancelTaskConfig): Promise<boolean> {
    return false;
  }

  parseResult(raw: any, resultPath: string): ParsedResult {
    return extractParsedResult(raw, resultPath);
  }

  parseCost(raw: any): CostInfo | null {
    const value = raw?.cost ?? raw?.usage?.cost ?? raw?.data?.cost ?? raw?.result?.cost ?? raw?.task?.cost;
    if (value != null) {
      const cost = Number(value);
      if (!Number.isFinite(cost)) return null;
      return { apiCostCents: Math.round(cost), apiCurrency: 'CREDIT', apiRawCost: cost };
    }
    return null;
  }

  mapStatus(relayStatus: string, _mapping: Record<string, string>): string {
    return applyStatusMapping(relayStatus, _mapping);
  }
}

function buildImageBody(params: SubmitTaskParams, isEdit: boolean): Record<string, any> {
  const input = params.params || {};
  const normalized = normalizeImageParams(input);
  const body: Record<string, any> = {
    model: params.upstreamCode,
    prompt: params.prompt,
    response_format: 'url',
  };
  if (isGptImage2Model(params.upstreamCode)) {
    applyGptImage2Params(body, normalized);
  } else if (isNanoBananaModel(params.upstreamCode)) {
    applyNanoBananaParams(body, normalized);
  } else {
    body.size = input.nativeSize && input.nativeSize !== 'auto' ? input.nativeSize : '1024x1024';
    applyGenericImageParams(body, normalized);
  }
  if (isEdit) delete body.n;
  copyDefined(body, 'style', input.style);
  copyDefined(body, 'negative_prompt', input.negativePrompt || input.negative_prompt);
  copyDefined(body, 'mask_url', input.maskUrl || input.mask_url);
  copyDefined(body, 'background_url', input.backgroundUrl || input.background_url);

  const images = normalizeImages(params.images || input.images || input.image_urls || input.image_url);
  if (images.length > 0) {
    body.image_url = images[0];
    body.image_urls = images;
  }
  return compactObject(body);
}

function buildVideoBody(params: SubmitTaskParams): Record<string, any> {
  const input = params.params || {};
  const images = normalizeImages(params.images || input.images || input.image_urls || input.image_url || input.referenceImages);
  const body: Record<string, any> = {
    model: params.upstreamCode,
    prompt: params.prompt,
  };
  copyDefined(body, 'duration', normalizeDurationValue(input.durationSeconds ?? input.duration));
  copyDefined(body, 'aspect_ratio', input.ratio || input.aspect_ratio);
  copyDefined(body, 'resolution', input.resolution || resolutionFromQuality(input.quality));
  copyDefined(body, 'quality', nonResolutionQuality(input.quality));
  copyDefined(body, 'fps', input.fps);
  copyDefined(body, 'style', input.style);
  copyDefined(body, 'seed', input.seed);
  copyDefined(body, 'negative_prompt', input.negativePrompt || input.negative_prompt);
  copyDefined(body, 'video_url', input.videoUrl || input.video_url);
  copyDefined(body, 'edit_tool', input.editTool || input.edit_tool);
  copyDefined(body, 'audio_url', input.audioUrl || input.audio_url);
  copyDefined(body, 'audio_mode', input.audioMode || input.audio_mode);
  if (input.preserveAudio !== undefined || input.preserve_audio !== undefined) {
    body.preserve_audio = !!(input.preserveAudio ?? input.preserve_audio);
  }

  if (images.length > 0) {
    body.image_url = images[0];
    body.image_urls = images;
    if (params.taskType === 'first_last_frame_video') {
      body.start_image_url = images[0];
      body.end_image_url = images[1];
    }
  }
  return compactObject(body);
}

function buildOpenAiUrl(baseUrl: string, endpointPath: string): string {
  const endpoint = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  return joinBasePath(baseUrl, `/openai/v1${endpoint}`);
}

function buildQueryTaskUrl(queryTaskUrl: string, baseUrl: string, providerTaskId: string): string {
  const encoded = encodeURIComponent(providerTaskId);
  const template = String(queryTaskUrl || '').trim();
  if (template) {
    const replaced = template
      .replace(/\{task_id\}/g, encoded)
      .replace(/:task_id/g, encoded);
    if (/^https?:\/\//i.test(replaced)) return replaced;
    if (replaced !== template) return joinBasePath(baseUrl, replaced);
    return joinBasePath(replaced, '/' + encoded);
  }
  return buildOpenAiUrl(baseUrl, `/tasks/${encoded}`);
}

function isVideoTask(taskType: string): boolean {
  return String(taskType || '').toLowerCase().includes('video');
}

function isImageEditTask(taskType: string): boolean {
  const normalized = String(taskType || '').toLowerCase();
  return ['image_to_image', 'image_edit', 'img2img', 'edit'].includes(normalized);
}

function isTerminalStatus(status: string): boolean {
  return ['completed', 'failed', 'cancelled', 'canceled'].includes(String(status || '').toLowerCase());
}

function extractProviderStatus(data: any): string {
  return String(
    data?.status
    || data?.state
    || data?.task?.status
    || data?.task?.state
    || data?.data?.status
    || data?.data?.state
    || data?.result?.status
    || data?.result?.state
    || data?.output?.status
    || data?.output?.state
    || '',
  ).trim();
}

function extractProviderTaskId(data: any): string {
  const value = data?.id
    || data?.task_id
    || data?.taskId
    || data?.task?.id
    || data?.task?.task_id
    || data?.data?.id
    || data?.data?.task_id
    || data?.result?.id
    || data?.result?.task_id
    || data?.output?.id
    || data?.output?.task_id
    || '';
  return String(value || '').trim();
}

function extractProviderError(data: any): string {
  const value = data?.error?.message
    || data?.error?.msg
    || data?.message
    || data?.msg
    || data?.task?.error?.message
    || data?.data?.error?.message
    || data?.result?.error?.message
    || '';
  return String(value || '').trim();
}

function normalizeImages(value: any): string[] {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.map(item => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object') return String(item.url || item.cdnUrl || item.cdn_url || item.accessUrl || item.access_url || '').trim();
    return '';
  }).filter(Boolean).slice(0, 8);
}

function normalizeDurationValue(value: any): number | string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value).trim();
  const match = text.match(/^(\d+)(?:\s*s)?$/i);
  if (match) return Number(match[1]);
  return text;
}

function resolutionFromQuality(value: any): string | undefined {
  const text = String(value || '').trim();
  return /^(?:[0-9]+p|[0-9]+k)$/i.test(text) ? text : undefined;
}

function nonResolutionQuality(value: any): string | undefined {
  const text = String(value || '').trim();
  if (!text || /^(?:standard|auto)$/i.test(text) || /^(?:[0-9]+p|[0-9]+k)$/i.test(text)) return undefined;
  return text;
}

function copyDefined(target: Record<string, any>, key: string, value: any): void {
  if (value === undefined || value === null || value === '') return;
  target[key] = value;
}

function compactObject<T extends Record<string, any>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (value[key] === undefined || value[key] === null || value[key] === '') delete value[key];
  }
  return value;
}
