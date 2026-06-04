// services/adapters/xiaoma.adapter.ts
// 小马AI / Lingke API adapter.
// Media protocol: POST /v1/media/generate -> GET /v1/media/status?task_id={id}
// Chat protocol: OpenAI / Gemini / Anthropic compatible pass-through endpoints.

import axios from 'axios';
import {
  IProviderAdapter, SubmitTaskParams, SubmitTaskResult,
  QueryTaskConfig, QueryTaskResult, CancelTaskConfig,
  ParsedResult, CostInfo,
  applyStatusMapping, extractParsedResult, summarizeProviderResponse,
} from './adapter.interface';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = Record<string, JsonValue>;

const MEDIA_CREATE_PATH = '/v1/media/generate';
const MEDIA_STATUS_PATH = '/v1/media/status';

const TEXT_TASK_TYPES = new Set(['text_generation', 'prompt_optimize', 'script_generation', 'text_chat', 'chat']);

export class XiaomaAdapter implements IProviderAdapter {
  readonly providerType = 'xiaoma';

  async submitTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    if (TEXT_TASK_TYPES.has(String(params.taskType || '').toLowerCase())) {
      return this.submitChatTask(params);
    }
    return this.submitMediaTask(params);
  }

  private async submitMediaTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const { baseUrl, apiKey, timeout } = params.providerConfig;
    const url = joinUrl(baseUrl, MEDIA_CREATE_PATH);
    const body: JsonObject = {
      model: params.upstreamCode,
      prompt: params.prompt,
      params: normalizeMediaParams(params),
    };

    const resp = await axios.post<JsonObject>(url, body, {
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      timeout: Math.max(timeout, 60000),
    });

    const data = resp.data;
    const providerError = extractProviderError(data);
    if (providerError) {
      return {
        type: 'sync',
        status: 'failed',
        error: providerError,
        cost: this.parseCost(data),
      };
    }
    const result = this.parseResult(data, '');
    const taskId = extractString(data, ['task_id', 'id', 'data.task_id', 'data.id', 'data.taskId']);
    const status = extractString(data, ['status', 'state', 'data.status', 'data.state']) || (taskId ? 'queued' : 'success');

    if (result.urls.length > 0) {
      return {
        type: 'sync',
        providerTaskId: taskId,
        status: status || 'success',
        result,
        cost: this.parseCost(data),
      };
    }

    if (taskId) {
      return {
        type: 'async',
        providerTaskId: taskId,
        status,
        cost: this.parseCost(data),
      };
    }

    return {
      type: 'sync',
      status: 'failed',
      error: {
        code: 'NO_TASK_ID',
        message: `小马AI未返回任务 ID 或结果地址：${summarizeProviderResponse(data, 600)}`,
      },
    };
  }

  private async submitChatTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const apiFormat = String(params.params.apiFormat || 'openai').trim().toLowerCase();
    if (apiFormat === 'gemini') return this.submitGeminiChatTask(params);
    if (apiFormat === 'anthropic') return this.submitAnthropicChatTask(params);
    return this.submitOpenAIChatTask(params);
  }

  private async submitOpenAIChatTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const { baseUrl, apiKey, timeout } = params.providerConfig;
    const messages: JsonObject[] = [];
    const systemPrompt = trimString(params.params.systemPrompt);
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: params.prompt });

    const body: JsonObject = {
      model: params.upstreamCode,
      messages,
      stream: false,
    };
    copyNumberParam(body, 'temperature', params.params.temperature);
    copyNumberParam(body, 'top_p', params.params.topP ?? params.params.top_p);
    copyNumberParam(body, 'max_tokens', params.params.maxTokens ?? params.params.max_tokens);

    const resp = await axios.post<JsonObject>(joinUrl(baseUrl, '/v1/chat/completions'), body, {
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      timeout: Math.max(timeout, 30000),
    });
    const providerError = extractProviderError(resp.data);
    if (providerError) return { type: 'sync', status: 'failed', error: providerError, cost: this.parseCost(resp.data) };
    const text = extractString(resp.data, ['choices.0.message.content', 'choices.0.delta.content', 'output_text', 'text']);
    return this.buildTextResult(resp.data, text);
  }

  private async submitGeminiChatTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const { baseUrl, apiKey, timeout } = params.providerConfig;
    const generationConfig: JsonObject = {};
    copyNumberParam(generationConfig, 'temperature', params.params.temperature);
    copyNumberParam(generationConfig, 'topP', params.params.topP ?? params.params.top_p);
    copyNumberParam(generationConfig, 'maxOutputTokens', params.params.maxTokens ?? params.params.max_tokens);

    const body: JsonObject = {
      contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
    };
    if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;

    const path = `/v1beta/models/${encodeURIComponent(params.upstreamCode)}:generateContent`;
    const resp = await axios.post<JsonObject>(joinUrl(baseUrl, path), body, {
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: Math.max(timeout, 30000),
    });
    const providerError = extractProviderError(resp.data);
    if (providerError) return { type: 'sync', status: 'failed', error: providerError, cost: this.parseCost(resp.data) };
    const text = extractString(resp.data, [
      'candidates.0.content.parts.0.text',
      'candidates.0.output',
      'text',
      'output_text',
    ]);
    return this.buildTextResult(resp.data, text);
  }

  private async submitAnthropicChatTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const { baseUrl, apiKey, timeout } = params.providerConfig;
    const body: JsonObject = {
      model: params.upstreamCode,
      max_tokens: normalizeNumber(params.params.maxTokens ?? params.params.max_tokens, 1024),
      messages: [{ role: 'user', content: params.prompt }],
    };
    const systemPrompt = trimString(params.params.systemPrompt);
    if (systemPrompt) body.system = systemPrompt;

    const resp = await axios.post<JsonObject>(joinUrl(baseUrl, '/v1/messages'), body, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      timeout: Math.max(timeout, 30000),
    });
    const providerError = extractProviderError(resp.data);
    if (providerError) return { type: 'sync', status: 'failed', error: providerError, cost: this.parseCost(resp.data) };
    const text = extractString(resp.data, ['content.0.text', 'output_text', 'text']);
    return this.buildTextResult(resp.data, text);
  }

  private buildTextResult(raw: JsonObject, text: string): SubmitTaskResult {
    if (!text) {
      return {
        type: 'sync',
        status: 'failed',
        error: {
          code: 'NO_TEXT_RESULT',
          message: `小马AI未返回文本结果：${summarizeProviderResponse(raw, 600)}`,
        },
      };
    }
    return {
      type: 'sync',
      status: 'success',
      result: {
        urls: [],
        metadata: {
          text,
          requestId: extractString(raw, ['id', 'request_id', 'response_id']),
          usage: getPath(raw, 'usage') || getPath(raw, 'usageMetadata') || null,
        },
      },
      cost: this.parseCost(raw),
    };
  }

  async queryTask(providerTaskId: string, config: QueryTaskConfig): Promise<QueryTaskResult> {
    const base = config.queryTaskUrl || config.baseUrl;
    const url = joinUrl(base, `${MEDIA_STATUS_PATH}?task_id=${encodeURIComponent(providerTaskId)}`);

    const resp = await axios.get<JsonObject>(url, {
      headers: { Authorization: 'Bearer ' + config.apiKey },
      timeout: config.timeout || 30000,
    });

    const data = resp.data;
    const providerError = extractProviderError(data);
    if (providerError) {
      return {
        providerTaskId,
        status: 'failed',
        error: providerError,
        cost: this.parseCost(data),
      };
    }
    const status = extractString(data, ['state', 'status', 'data.state', 'data.status', 'status_group']) || 'running';
    const normalized = this.mapStatus(status, {});
    const result = this.parseResult(data, '');
    const errorMessage = extractString(data, ['error.message', 'error', 'data.error.message', 'data.error', 'message']);
    const isFinal = extractBoolean(data, ['is_final', 'data.is_final']) || ['completed', 'failed', 'cancelled'].includes(normalized);

    if (!isFinal && !['failed', 'cancelled'].includes(normalized)) {
      return {
        providerTaskId,
        status,
        result: result.urls.length ? result : undefined,
        cost: this.parseCost(data),
      };
    }

    if (normalized === 'completed' && result.urls.length > 0) {
      return {
        providerTaskId,
        status: 'completed',
        result,
        cost: this.parseCost(data),
      };
    }

    return {
      providerTaskId,
      status: normalized === 'failed' ? 'failed' : status,
      result: result.urls.length ? result : undefined,
      error: errorMessage ? { code: 'XIAOMA_FAILED', message: errorMessage } : undefined,
      cost: this.parseCost(data),
    };
  }

  async cancelTask(_providerTaskId: string, _config: CancelTaskConfig): Promise<boolean> {
    return false;
  }

  parseResult(raw: unknown, resultPath: string): ParsedResult {
    return extractParsedResult(raw, resultPath);
  }

  parseCost(raw: unknown): CostInfo | null {
    const value = getFirstPath(raw, [
      'cost',
      'data.cost',
      'usage.cost',
      'usage.total_cost',
      'usageMetadata.cost',
    ]);
    const cost = normalizeNumber(value, Number.NaN);
    if (!Number.isFinite(cost)) return null;
    return { apiCostCents: Math.round(cost * 100), apiCurrency: 'USD', apiRawCost: cost };
  }

  mapStatus(relayStatus: string, mapping: Record<string, string>): string {
    return applyStatusMapping(relayStatus, mapping);
  }
}

function normalizeMediaParams(params: SubmitTaskParams): JsonObject {
  const input = params.params || {};
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || key === 'apiFormat') continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    else if (Array.isArray(value)) out[key] = value.map((item) => String(item)) as JsonValue;
  }
  if (params.images?.length) out.images = params.images;

  const quality = String(input.quality || '').trim().toLowerCase();
  if (!out.resolution && ['1k', '2k', '4k'].includes(quality)) out.resolution = quality;
  if (!out.resolution && quality === 'standard') out.resolution = '1k';

  const ratio = trimString(input.aspect_ratio || input.aspectRatio || input.ratio);
  if (ratio && !out.aspect_ratio) out.aspect_ratio = ratio;
  const nativeSize = trimString(input.nativeSize || input.size || input.resolution);
  if (nativeSize && /^\d+x\d+$/i.test(nativeSize) && !out.size) out.size = nativeSize;
  if (!out.aspect_ratio && nativeSize && /^\d+x\d+$/i.test(nativeSize)) out.aspect_ratio = sizeToRatio(nativeSize);
  if (!out.aspect_ratio && !nativeSize) out.aspect_ratio = '1:1';
  if (!out.resolution) out.resolution = '1k';

  return out;
}

function joinUrl(baseUrl: string, path: string): string {
  return String(baseUrl || '').replace(/\/+$/, '') + (path.startsWith('/') ? path : `/${path}`);
}

function trimString(value: unknown): string {
  return String(value || '').trim();
}

function normalizeNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function copyNumberParam(target: JsonObject, key: string, value: unknown): void {
  const numberValue = normalizeNumber(value, Number.NaN);
  if (Number.isFinite(numberValue)) target[key] = numberValue;
}

function getFirstPath(value: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const item = getPath(value, path);
    if (item !== undefined && item !== null && item !== '') return item;
  }
  return undefined;
}

function extractString(value: unknown, paths: string[]): string {
  const item = getFirstPath(value, paths);
  if (item === undefined || item === null) return '';
  if (typeof item === 'string') return item.trim();
  if (typeof item === 'number' || typeof item === 'boolean') return String(item);
  return '';
}

function extractBoolean(value: unknown, paths: string[]): boolean {
  const item = getFirstPath(value, paths);
  if (typeof item === 'boolean') return item;
  if (typeof item === 'number') return item === 1;
  if (typeof item === 'string') return ['true', '1', 'yes'].includes(item.toLowerCase());
  return false;
}

function getPath(value: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = value;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (/^\d+$/.test(part)) {
      if (!Array.isArray(current)) return undefined;
      current = current[Number(part)];
      continue;
    }
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function extractProviderError(data: unknown): { code: string; message: string } | null {
  const numericCode = getFirstPath(data, ['code', 'error.code', 'data.code']);
  const codeText = String(numericCode ?? '').trim();
  const isErrorCode = codeText !== '' && !['0', '200', 'success', 'ok'].includes(codeText.toLowerCase());
  const message = extractString(data, ['msg', 'message', 'error.message', 'error', 'data.msg', 'data.message', 'data.error.message']);
  const explicitFailure = ['false', 'failed', 'error'].includes(String(getFirstPath(data, ['success', 'status', 'state']) ?? '').toLowerCase());
  if (!isErrorCode && !explicitFailure) return null;
  return {
    code: codeText || 'XIAOMA_ERROR',
    message: message || `小马AI返回业务错误：${summarizeProviderResponse(data, 600)}`,
  };
}

function sizeToRatio(size: string): string {
  const match = size.toLowerCase().match(/^(\d+)x(\d+)$/);
  if (!match) return '1:1';
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return '1:1';
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
