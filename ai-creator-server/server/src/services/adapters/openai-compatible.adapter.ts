// services/adapters/openai-compatible.adapter.ts
// OpenAI-compatible API adapter (e.g., vLLM, local LLM servers)

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

export class OpenAICompatibleAdapter implements IProviderAdapter {
  readonly providerType = 'openai_compatible';

  async submitTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    if (params.taskType.includes('text') || isTextTask(params.taskType)) return this.submitTextTask(params);
    if (isAgnesModel(params.modelConfig)) return this.submitAgnesMediaTask(params);

    const { baseUrl, apiKey, timeout } = params.providerConfig;
    const isVideo = params.taskType.includes('video');
    // 解析 request_template 中的可选配置
    const template = safeParseJson(params.requestTemplate);
    const submitPath = template?.submit_path
      || (isVideo ? '/v1/video/generations' : '/v1/images/generations');
    const url = joinBasePath(baseUrl, submitPath);

    // 提取 request_template 中的 body 字段（排除元数据字段）
    const TEMPLATE_META_KEYS = new Set(['submit_path', 'response_format', 'extra_params']);
    const templateBodyFields: Record<string, any> = {};
    if (template) {
      for (const [key, value] of Object.entries(template)) {
        if (!TEMPLATE_META_KEYS.has(key) && value !== undefined && value !== null) {
          templateBodyFields[key] = value;
        }
      }
    }

    const body: any = {
      model: params.upstreamCode,
      prompt: params.prompt,
      // 合并 request_template 中的 body 字段（如 quality, style 等硬编码配置）
      ...templateBodyFields,
    };
    // 仅在 request_template 明确指定时才传 response_format（部分供应商不支持）
    if (template?.response_format) {
      body.response_format = template.response_format;
    }
    if (isVideo) {
      body.ratio = params.params.ratio;
      body.duration = params.params.duration;
      body.size = params.params.nativeSize && params.params.nativeSize !== 'auto' ? params.params.nativeSize : undefined;
      body.images = params.images || [];
      // 用户提交的参数不覆盖 template 中的硬编码值
      if (params.params.resolution && !templateBodyFields.resolution) body.resolution = params.params.resolution;
      if (params.params.quality && !templateBodyFields.quality) body.quality = params.params.quality;
      if (params.params.fps && !templateBodyFields.fps) body.fps = params.params.fps;
    } else {
      const normalized = normalizeImageParams(params.params);
      if (isGptImage2Model(params.upstreamCode)) {
        applyGptImage2Params(body, normalized);
      } else if (isNanoBananaModel(params.upstreamCode)) {
        applyNanoBananaParams(body, normalized);
      } else {
        body.size = params.params.nativeSize && params.params.nativeSize !== 'auto' ? params.params.nativeSize : '1024x1024';
        applyGenericImageParams(body, normalized);
      }
      if (params.images?.length) {
        if (templateBodyFields.extra_body && typeof templateBodyFields.extra_body === 'object' && !Array.isArray(templateBodyFields.extra_body)) {
          body.extra_body = { ...templateBodyFields.extra_body, image: params.images };
        } else {
          body.images = params.images;
        }
      }
      if (params.params.style && !templateBodyFields.style) body.style = params.params.style;
    }

    const resp = await axios.post(url, body, {
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      timeout,
    });

    const data = resp.data;
    const status = extractProviderStatus(data);
    const providerTaskId = extractProviderTaskId(data);
    if (providerTaskId && status && !isTerminalStatus(status)) {
      return { type: 'async', providerTaskId: String(providerTaskId), status };
    }

    const result = this.parseResult(data, '');
    if (!result.urls.length) {
      return {
        type: 'sync',
        status: status || 'success',
        result,
        error: { code: 'NO_RESULT', message: providerNoResultMessage(data) },
      };
    }
    return {
      type: 'sync',
      status: status || 'success',
      result,
    };
  }

  private async submitAgnesMediaTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    return params.taskType.includes('video')
      ? this.submitAgnesVideoTask(params)
      : this.submitAgnesImageTask(params);
  }

  private async submitAgnesImageTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const { baseUrl, apiKey, timeout } = params.providerConfig;
    const config = params.modelConfig || {};
    const template = safeParseJson(params.requestTemplate) || {};
    const body: Record<string, any> = {
      model: params.upstreamCode,
      prompt: params.prompt,
      ...copyObject(template),
    };
    const supportedParams = new Set<string>(Array.isArray(config.param_names) ? config.param_names.map(String) : []);
    const requestedSize = params.params.nativeSize || params.params.size || params.params.resolution;
    if (requestedSize) body.size = requestedSize;
    else if (!body.size) body.size = '1024x1024';
    if (supportedParams.has('ratio') && params.params.ratio) body.ratio = params.params.ratio;
    if (params.params.returnBase64 !== undefined || params.params.return_base64 !== undefined) {
      body.return_base64 = params.params.returnBase64 ?? params.params.return_base64;
    }
    if (params.images?.length) {
      const extraBody = body.extra_body && typeof body.extra_body === 'object' && !Array.isArray(body.extra_body)
        ? body.extra_body
        : {};
      body.extra_body = { ...extraBody, image: params.images };
    }
    const submitPath = config.endpoints?.create || '/v1/images/generations';
    const resp = await axios.post(joinBasePath(baseUrl, submitPath), body, {
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      timeout,
      validateStatus: () => true,
    });
    const data = resp.data || {};
    const error = extractProviderError(data, resp.status);
    if (error) return { type: 'sync', status: 'failed', error, result: { urls: [], metadata: { raw: data } } };
    const result = this.parseResult(data, '');
    if (!result.urls.length) {
      return { type: 'sync', status: extractProviderStatus(data) || 'completed', result, error: { code: 'NO_RESULT', message: providerNoResultMessage(data) } };
    }
    return { type: 'sync', status: extractProviderStatus(data) || 'completed', result };
  }

  private async submitAgnesVideoTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const { baseUrl, apiKey, timeout } = params.providerConfig;
    const config = params.modelConfig || {};
    const images = normalizeStringArray(params.images || params.params.images || params.params.imageUrls || params.params.image_urls);
    const audios = normalizeStringArray(params.params.audios || params.params.audioUrls || params.params.audio_urls || params.params.audioUrl || params.params.audio_url);
    const videos = normalizeStringArray(params.params.videos || params.params.videoUrls || params.params.video_urls || params.params.videoUrl || params.params.video_url);
    const isV25 = params.upstreamCode.includes('2.5');
    const isKeyframe = params.taskType.includes('first_last_frame') || String(params.params.videoMode || '').includes('first_last');
    const hasReference = images.length > 0 || audios.length > 0 || videos.length > 0;
    const body: Record<string, any> = {
      model: params.upstreamCode,
      prompt: params.prompt,
    };
    if (isV25) {
      body.mode = isKeyframe ? 'keyframe' : hasReference ? 'reference' : 'text';
      body.seconds = String(params.params.duration || params.params.durationText || '5').replace(/s$/i, '');
      body.size = resolveAgnesVideoSize(params.params, config);
      body.aspect_ratio = params.params.ratio || params.params.aspectRatio || '16:9';
      if (isKeyframe) {
        if (images[0]) body.first_frame = images[0];
        if (images[1]) body.last_frame = images[1];
      } else if (images.length) body.images = images;
      if (audios.length) body.audios = audios;
      if (videos.length && !hasUnsupportedInput(config, 'videos')) body.videos = videos.map((url) => ({ url }));
    } else if (images.length) {
      if (isKeyframe) {
        body.extra_body = { image: images, mode: 'keyframes' };
      } else {
        body.image = images[0];
      }
    }
    if (!isV25) {
      const defaults = config.default_params || config.defaultParams || {};
      body.width = positiveNumber(params.params.width) || positiveNumber(defaults.width) || 1152;
      body.height = positiveNumber(params.params.height) || positiveNumber(defaults.height) || 768;
      const frameRate = positiveNumber(params.params.fps || params.params.frame_rate)
        || positiveNumber(defaults.frame_rate || defaults.frameRate)
        || 24;
      body.frame_rate = frameRate;
      body.num_frames = positiveInteger(params.params.num_frames)
        || positiveInteger(defaults.num_frames || defaults.numFrames)
        || resolveAgnesV20FrameCount(params.params, frameRate);
    }
    const submitPath = config.endpoints?.create || '/v1/videos';
    const resp = await axios.post(joinBasePath(baseUrl, submitPath), body, {
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      timeout,
      validateStatus: () => true,
    });
    const data = resp.data || {};
    const error = extractProviderError(data, resp.status);
    if (error) return { type: 'sync', status: 'failed', error };
    const providerTaskId = extractProviderTaskId(data);
    const status = extractProviderStatus(data) || (providerTaskId ? 'queued' : 'completed');
    if (providerTaskId && !isTerminalStatus(status)) return { type: 'async', providerTaskId, status };
    const result = this.parseResult(data, '');
    return result.urls.length
      ? { type: 'sync', status, result }
      : { type: 'sync', status: 'failed', result, error: { code: 'NO_RESULT', message: providerNoResultMessage(data) } };
  }

  private async submitTextTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const { baseUrl, apiKey, timeout } = params.providerConfig;
    const template = safeParseJson(params.requestTemplate);
    const body: any = {
      model: params.upstreamCode,
      messages: [
        ...(params.params.systemPrompt || params.params.system_prompt
          ? [{ role: 'system', content: String(params.params.systemPrompt || params.params.system_prompt) }]
          : []),
        { role: 'user', content: params.prompt },
      ],
      temperature: numberOrDefault(params.params.temperature, template?.temperature ?? 0.4),
      stream: false,
    };
    copyDefined(body, 'max_tokens', params.params.maxTokens ?? params.params.max_tokens ?? template?.max_tokens ?? template?.maxTokens);
    copyDefined(body, 'top_p', params.params.topP ?? params.params.top_p ?? template?.top_p ?? template?.topP);
    copyDefined(body, 'response_format', params.params.responseFormat ?? params.params.response_format ?? template?.response_format ?? template?.responseFormat);

    const resp = await axios.post(buildChatCompletionUrl(baseUrl), body, {
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      timeout,
    });
    const data = resp.data || {};
    const text = extractTextContent(data);
    if (!text) {
      return {
        type: 'sync',
        status: 'failed',
        result: { urls: [], metadata: { raw: data } },
        error: { code: 'NO_TEXT', message: providerNoResultMessage(data) },
      };
    }
    return {
      type: 'sync',
      status: 'completed',
      result: {
        urls: [],
        metadata: {
          text,
          content: text,
          requestId: data.id || data.request_id || data.requestId || '',
          raw: data,
        },
      },
    };
  }

  async queryTask(providerTaskId: string, config: QueryTaskConfig): Promise<QueryTaskResult> {
    const url = buildQueryTaskUrl(config.queryTaskUrl || '', config.baseUrl, providerTaskId, config.model);
    const resp = await axios.get(url, {
      headers: { Authorization: 'Bearer ' + config.apiKey },
      timeout: config.timeout,
      validateStatus: () => true,
    });
    const data = resp.data;
    const result = this.parseResult(data, '');
    const error = extractProviderError(data, resp.status);
    const status = extractProviderStatus(data);
    return {
      providerTaskId: extractProviderTaskId(data) || providerTaskId,
      status: status || 'running',
      result,
      cost: null,
      error: error || (result.urls.length || !['completed', 'success', 'done'].includes(status.toLowerCase())
        ? undefined
        : { code: 'NO_RESULT', message: providerNoResultMessage(data) }),
    };
  }

  async cancelTask(_providerTaskId: string, _config: CancelTaskConfig): Promise<boolean> { return false; }

  parseResult(raw: any, _resultPath: string): ParsedResult {
    return extractParsedResult(raw);
  }

  parseCost(_raw: any): CostInfo | null { return null; }

  mapStatus(relayStatus: string, mapping: Record<string, string>): string {
    return applyStatusMapping(relayStatus, mapping);
  }
}

function safeParseJson(value: any): Record<string, any> | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function isTerminalStatus(status: string): boolean {
  const mapped = applyStatusMapping(status, {});
  return ['completed', 'failed', 'cancelled'].includes(mapped);
}

function buildQueryTaskUrl(queryTaskUrl: string, baseUrl: string, providerTaskId: string, model?: string): string {
  const encoded = encodeURIComponent(providerTaskId);
  const encodedModel = encodeURIComponent(String(model || ''));
  const template = String(queryTaskUrl || '').trim();
  if (template) {
    const replaced = template
      .replace(/\{task_id\}/g, encoded)
      .replace(/:task_id/g, encoded)
      .replace(/\{model\}/g, encodedModel)
      .replace(/:model/g, encodedModel);
    return /^https?:\/\//i.test(replaced) ? replaced : joinBasePath(baseUrl, replaced);
  }
  // 默认用视频端点查询，兼容通用 OpenAI-compatible 视频接口。
  return joinBasePath(baseUrl, '/v1/video/generations/' + encoded);
}

function buildChatCompletionUrl(baseUrl: string): string {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(base)) return base;
  return joinBasePath(base, '/chat/completions');
}

function isTextTask(taskType: string): boolean {
  return String(taskType || '').toLowerCase().includes('text')
    || ['prompt_optimize', 'script_generation', 'prompt_generate', 'storyboard_generate'].includes(String(taskType || '').toLowerCase());
}

function extractTextContent(data: any): string {
  const value = data?.choices?.[0]?.message?.content
    || data?.choices?.[0]?.text
    || data?.output_text
    || data?.output?.[0]?.content?.[0]?.text
    || data?.text
    || data?.content
    || '';
  return typeof value === 'string' ? value.trim() : '';
}

function numberOrDefault(value: any, fallback: any): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  const fallbackNumber = Number(fallback);
  return Number.isFinite(fallbackNumber) ? fallbackNumber : 0.4;
}

function copyDefined(target: Record<string, any>, key: string, value: any): void {
  if (value !== undefined && value !== null && value !== '') target[key] = value;
}

function copyObject(value: any): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function normalizeStringArray(value: any): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return [String(value).trim()].filter(Boolean);
}

function isAgnesModel(config: any): boolean {
  return String(config?.sync_provider_type || '').toLowerCase() === 'agnes_ai';
}

function resolveAgnesVideoSize(params: Record<string, any>, config: Record<string, any>): string {
  const supported = Array.isArray(config.supported_sizes) ? config.supported_sizes.map(String) : [];
  const requested = String(params.nativeSize || params.size || params.resolution || '').trim();
  if (requested && (!supported.length || supported.includes(requested))) return requested;
  return supported[0] || '720P';
}

function hasUnsupportedInput(config: Record<string, any>, inputName: string): boolean {
  const unsupported = config.unsupported_inputs || config.unsupportedInputs;
  return Array.isArray(unsupported) && unsupported.map(String).some((item) => item === inputName);
}

function positiveNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const numberValue = positiveNumber(value);
  return numberValue === undefined ? undefined : Math.floor(numberValue);
}

function resolveAgnesV20FrameCount(params: Record<string, any>, frameRate: number): number {
  const duration = positiveNumber(params.durationSeconds)
    || positiveNumber(params.duration)
    || positiveNumber(String(params.durationText || '').replace(/s$/i, ''))
    || 5;
  const estimated = Math.max(1, Math.min(441, Math.round(duration * frameRate)));
  return Math.max(1, Math.min(441, Math.round((estimated - 1) / 8) * 8 + 1));
}

function extractProviderStatus(data: any): string {
  return String(
    data?.status
    || data?.state
    || data?.result?.status
    || data?.result?.state
    || data?.data?.status
    || data?.data?.state
    || data?.output?.status
    || data?.output?.state
    || '',
  ).trim();
}

function extractProviderError(data: any, status?: number): { code: string; message: string } | undefined {
  const error = data?.error;
  const message = typeof error === 'string'
    ? error
    : error?.message || data?.message || data?.error_message || data?.detail || '';
  if (status !== undefined && status >= 400) return { code: `HTTP_${status}`, message: String(message || `Provider returned HTTP ${status}`) };
  return message ? { code: String(error?.code || data?.code || 'PROVIDER_ERROR'), message: String(message) } : undefined;
}

function extractProviderTaskId(data: any): string {
  const value = data?.video_id
    || data?.videoId
    || data?.task_id
    || data?.taskId
    || data?.id
    || data?.result?.task_id
    || data?.result?.taskId
    || data?.result?.id
    || data?.result?.video_id
    || data?.result?.videoId
    || data?.data?.task_id
    || data?.data?.taskId
    || data?.data?.id
    || data?.data?.video_id
    || data?.data?.videoId
    || data?.output?.task_id
    || data?.output?.taskId
    || data?.output?.id
    || '';
  return String(value || '').trim();
}
