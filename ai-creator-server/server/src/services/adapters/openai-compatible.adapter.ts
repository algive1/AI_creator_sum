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

  async queryTask(providerTaskId: string, config: QueryTaskConfig): Promise<QueryTaskResult> {
    const url = buildQueryTaskUrl(config.queryTaskUrl || '', config.baseUrl, providerTaskId);
    const resp = await axios.get(url, {
      headers: { Authorization: 'Bearer ' + config.apiKey },
      timeout: config.timeout,
    });
    const data = resp.data;
    const result = this.parseResult(data, '');
    return {
      providerTaskId: extractProviderTaskId(data) || providerTaskId,
      status: extractProviderStatus(data) || 'running',
      result,
      cost: null,
      error: result.urls.length ? undefined : { code: 'NO_RESULT', message: providerNoResultMessage(data) },
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

function buildQueryTaskUrl(queryTaskUrl: string, baseUrl: string, providerTaskId: string): string {
  const encoded = encodeURIComponent(providerTaskId);
  const template = String(queryTaskUrl || '').trim();
  if (template) {
    if (template.includes('{task_id}')) return template.replace(/\{task_id\}/g, encoded);
    if (template.includes(':task_id')) return template.replace(/:task_id/g, encoded);
    return joinBasePath(template, '/' + encoded);
  }
  // 默认用视频端点查询（兼容 Agnes AI /v1/video/generations/{id}）
  return joinBasePath(baseUrl, '/v1/video/generations/' + encoded);
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

function extractProviderTaskId(data: any): string {
  const value = data?.task_id
    || data?.taskId
    || data?.id
    || data?.result?.task_id
    || data?.result?.taskId
    || data?.result?.id
    || data?.data?.task_id
    || data?.data?.taskId
    || data?.data?.id
    || data?.output?.task_id
    || data?.output?.taskId
    || data?.output?.id
    || '';
  return String(value || '').trim();
}
