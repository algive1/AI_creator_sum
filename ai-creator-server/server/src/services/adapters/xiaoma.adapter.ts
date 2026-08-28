// services/adapters/xiaoma.adapter.ts
// 小马AI / Lingke API adapter.
// Media protocol: POST /v1/media/generate -> GET /v1/skills/task-status?task_id={id}
// Chat protocol: OpenAI / Gemini / Anthropic compatible pass-through endpoints.

import axios from 'axios';
import {
  IProviderAdapter, SubmitTaskParams, SubmitTaskResult,
  QueryTaskConfig, QueryTaskResult, CancelTaskConfig,
  ParsedResult, CostInfo,
  applyStatusMapping, extractParsedResult, summarizeProviderResponse,
  joinBasePath,
} from './adapter.interface';
import {
  applyGenericImageParams,
  applyGptImage2Params,
  applyNanoBananaParams,
  isGptImage2Model,
  isNanoBananaModel,
  normalizeImageParams,
} from './image-param-mapper';
import {
  applyXiaomaRemoteMediaParams,
  applyXiaomaDeclaredScalarParams,
  applyXiaomaDeclaredValueFormats,
  applyXiaomaVideoParams,
  isXiaomaVideoTaskType,
} from './xiaoma-video-param-mapper';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = Record<string, JsonValue>;

const MEDIA_CREATE_PATH = '/v1/media/generate';
const MEDIA_STATUS_PATH = '/v1/skills/task-status';
const CIRCUIT_FAILURE_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 30_000;

const TEXT_TASK_TYPES = new Set(['text_generation', 'prompt_optimize', 'script_generation', 'text_chat', 'chat']);

type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  openedAt: number;
  halfOpenInFlight: boolean;
}

const circuitByBaseUrl = new Map<string, CircuitBreakerState>();

export class XiaomaAdapter implements IProviderAdapter {
  readonly providerType = 'xiaoma';

  async submitTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const circuitKey = circuitKeyFor(params.providerConfig.baseUrl);
    const circuit = beforeCircuitRequest(circuitKey);
    if (!circuit.allowed) {
      return {
        type: 'sync',
        status: 'failed',
        error: {
          code: 'CIRCUIT_OPEN',
          message: '小马AI接口暂时不可用，熔断器已打开，请稍后重试',
        },
      };
    }
    if (TEXT_TASK_TYPES.has(String(params.taskType || '').toLowerCase())) {
      return this.withCircuit(circuitKey, () => this.submitChatTask(params));
    }
    return this.withCircuit(circuitKey, () => this.submitMediaTask(params));
  }

  private async withCircuit<T>(key: string, fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      const maybeError = (result as any)?.error;
      if (maybeError) {
        recordCircuitFailure(key);
      } else {
        recordCircuitSuccess(key);
      }
      return result;
    } catch (err) {
      recordCircuitFailure(key);
      throw err;
    }
  }

  private async submitMediaTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const { baseUrl, apiKey, timeout } = params.providerConfig;
    const url = joinUrl(baseUrl, MEDIA_CREATE_PATH);
    const body: JsonObject = {
      model: params.upstreamCode,
      prompt: params.prompt,
      params: buildXiaomaMediaParams(params),
    };

    const resp = await axios.post<JsonObject>(url, body, {
      headers: {
        Authorization: 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      timeout: Math.max(timeout, 60000),
    });

    const data = unwrapXiaomaBody(resp.data);
    const providerError = extractProviderError(data, { requireSuccessCode: true });
    if (providerError) {
      return {
        type: 'sync',
        status: 'failed',
        error: providerError,
        cost: this.parseCost(data),
      };
    }
    const result = this.parseResult(data, '');
    const taskId = extractString(data, [
      'task_id', 'id', 'data.task_id', 'data.id', 'data.taskId', 'data.task.id', 'data.task.task_id', 'data.result.id', 'data.result.task_id', 'task.id', 'task.task_id', 'result.id', 'result.task_id',
    ]);
    const status = extractString(data, [
      'status', 'state', 'status_group', 'data.status', 'data.state', 'data.status_group', 'data.task.status', 'data.task.state', 'data.result.status', 'data.result.state', 'task.status', 'task.state', 'result.status', 'result.state',
    ]) || (taskId ? 'queued' : 'success');

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
    const circuitKey = circuitKeyFor(config.baseUrl || config.queryTaskUrl || '');
    const circuit = beforeCircuitRequest(circuitKey);
    if (!circuit.allowed) {
      return {
        providerTaskId,
        status: 'failed',
        error: {
          code: 'CIRCUIT_OPEN',
          message: '小马AI接口暂时不可用，熔断器已打开，请稍后重试',
        },
      };
    }
    const url = buildXiaomaTaskStatusUrl(config, providerTaskId);

    try {
      const resp = await axios.get<JsonObject>(url, {
        headers: { Authorization: 'Bearer ' + config.apiKey },
        timeout: config.timeout || 30000,
      });

      const data = unwrapXiaomaBody(resp.data);
      const providerError = extractProviderError(data);
      if (providerError) {
        recordCircuitFailure(circuitKey);
        return {
          providerTaskId,
          status: 'failed',
          error: providerError,
          cost: this.parseCost(data),
        };
      }
      recordCircuitSuccess(circuitKey);
      const status = extractString(data, [
        'state', 'status', 'status_group', 'data.state', 'data.status', 'data.status_group', 'data.task.state', 'data.task.status', 'data.result.status', 'data.result.state', 'task.status', 'task.state', 'result.status', 'result.state',
      ]) || 'running';
      const normalized = this.mapStatus(status, {});
      const result = this.parseResult(data, '');
      const errorMessage = extractString(data, [
        'error.message', 'error', 'data.error.message', 'data.error', 'data.task.error.message', 'data.task.error', 'data.result.error.message', 'data.result.error', 'task.error.message', 'result.error.message', 'message', 'msg', 'data.message', 'data.msg',
      ]);
      const isFinal = extractBoolean(data, ['is_final', 'data.is_final']) || ['completed', 'failed', 'cancelled'].includes(normalized);

      if (!isFinal && !['failed', 'cancelled'].includes(normalized)) {
        return {
          providerTaskId,
          status,
          result: result.urls.length ? result : undefined,
          cost: this.parseCost(data),
        };
      }

      return {
        providerTaskId,
        status: normalized === 'completed' && result.urls.length > 0 ? 'completed' : normalized === 'failed' ? 'failed' : status,
        result: result.urls.length ? result : undefined,
        error: normalized === 'completed' && result.urls.length > 0 ? undefined : errorMessage ? { code: 'XIAOMA_FAILED', message: errorMessage } : undefined,
        cost: this.parseCost(data),
      };
    } catch (err) {
      recordCircuitFailure(circuitKey);
      throw err;
    }
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
    return { apiCostCents: Math.round(cost * 100), apiCurrency: 'CNY', apiRawCost: cost };
  }

  mapStatus(relayStatus: string, mapping: Record<string, string>): string {
    return applyStatusMapping(relayStatus, mapping);
  }
}

export function buildXiaomaTaskStatusUrl(config: Pick<QueryTaskConfig, 'baseUrl' | 'queryTaskUrl'>, providerTaskId: string): string {
  const taskId = encodeURIComponent(providerTaskId);
  const template = String(config.queryTaskUrl || '').trim();
  if (template) {
    const resolved = template.includes('{task_id}')
      ? template.replace(/\{task_id\}/g, taskId)
      : appendTaskId(template, taskId);
    if (/^https?:\/\//i.test(resolved)) return resolved;
    return joinBasePath(config.baseUrl, resolved);
  }
  return joinBasePath(config.baseUrl, `${MEDIA_STATUS_PATH}?task_id=${taskId}`);
}

function appendTaskId(value: string, taskId: string): string {
  if (/[?&]task_id=/.test(value)) return value;
  return `${value}${value.includes('?') ? '&' : '?'}task_id=${taskId}`;
}

function circuitKeyFor(baseUrl: string): string {
  return String(baseUrl || 'xiaoma').replace(/\/+$/, '').toLowerCase() || 'xiaoma';
}

function getCircuit(key: string): CircuitBreakerState {
  let circuit = circuitByBaseUrl.get(key);
  if (!circuit) {
    circuit = { state: 'closed', failures: 0, openedAt: 0, halfOpenInFlight: false };
    circuitByBaseUrl.set(key, circuit);
  }
  return circuit;
}

function beforeCircuitRequest(key: string): { allowed: boolean } {
  const circuit = getCircuit(key);
  if (circuit.state === 'closed') return { allowed: true };
  if (circuit.state === 'open') {
    if (Date.now() - circuit.openedAt < CIRCUIT_COOLDOWN_MS) return { allowed: false };
    circuit.state = 'half_open';
    circuit.halfOpenInFlight = false;
  }
  if (circuit.halfOpenInFlight) return { allowed: false };
  circuit.halfOpenInFlight = true;
  return { allowed: true };
}

function recordCircuitSuccess(key: string): void {
  const circuit = getCircuit(key);
  circuit.state = 'closed';
  circuit.failures = 0;
  circuit.openedAt = 0;
  circuit.halfOpenInFlight = false;
}

function recordCircuitFailure(key: string): void {
  const circuit = getCircuit(key);
  circuit.halfOpenInFlight = false;
  circuit.failures += 1;
  if (circuit.failures >= CIRCUIT_FAILURE_THRESHOLD || circuit.state === 'half_open') {
    circuit.state = 'open';
    circuit.openedAt = Date.now();
    console.warn(`[XiaomaAdapter] circuit opened for ${key}, failures=${circuit.failures}`);
  }
}

export function buildXiaomaMediaParams(params: SubmitTaskParams): JsonObject {
  const input = params.params || {};
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || isInternalParamKey(key)) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    else if (Array.isArray(value)) out[key] = value.map((item) => String(item)) as JsonValue;
  }
  if (params.images?.length) out.images = params.images;

  const model = String(params.upstreamCode || '').toLowerCase();
  if (isXiaomaVideoTaskType(params.taskType)) {
    applyXiaomaDefaultParams(out, params.modelConfig);
    applyXiaomaVideoParams(out, input, model);
  } else {
    applyXiaomaDefaultParams(out, params.modelConfig);
    const normalized = normalizeImageParams(input);
    if (isGptImage2Model(model, 'xiaoma')) {
      applyGptImage2Params(out, normalized);
    } else if (isNanoBananaModel(model)) {
      applyNanoBananaParams(out, normalized, model);
    } else {
      applyGenericImageParams(out, normalized);
      applyXiaomaGenericImageParams(out, normalized, params.modelConfig);
    }
  }
  applyXiaomaDeclaredScalarParams(out, input, params.modelConfig);
  applyXiaomaDeclaredValueFormats(out, params.modelConfig);
  applyXiaomaRemoteMediaParams(out, params.modelConfig);
  return out;
}

function applyXiaomaGenericImageParams(
  out: JsonObject,
  normalized: ReturnType<typeof normalizeImageParams>,
  modelConfig?: Record<string, any>,
): void {
  const ratio = String(normalized.ratio || '').trim();
  const resolution = String(normalized.resolutionPreset || '').trim();
  const parameterNames = new Set<string>([
    ...(Array.isArray(modelConfig?.param_names) ? modelConfig.param_names : []),
    ...(Array.isArray(modelConfig?.paramNames) ? modelConfig.paramNames : []),
    ...collectDeclaredParameterNames(modelConfig?.remote_parameters || modelConfig?.remoteParameters),
  ].map((item) => String(item || '').trim().toLowerCase().replace(/[-_\s]/g, '')));
  const hasDeclaredParameters = parameterNames.size > 0;
  const hasAspectRatioParam = parameterNames.has('aspectratio') || parameterNames.has('ratio');
  const hasSizeParam = parameterNames.has('size');
  const hasResolutionParam = parameterNames.has('resolution');
  const hasQualityParam = parameterNames.has('quality');
  const hasImageCountParam = ['n', 'count', 'imagecount', 'numimages', 'numberofimages', 'outputcount'].some((name) => parameterNames.has(name));
  const upstreamSize = String(normalized.sizeOption?.upstreamSize || '').trim();

  if (hasDeclaredParameters && !hasAspectRatioParam) delete out.aspect_ratio;
  else if (ratio && ratio !== 'auto') out.aspect_ratio = ratio;

  if (hasSizeParam) {
    if (upstreamSize && upstreamSize !== 'auto') out.size = upstreamSize;
  } else if (hasDeclaredParameters) {
    delete out.size;
  }

  if (hasResolutionParam) {
    if (resolution && resolution !== 'auto') out.resolution = resolution;
  } else if (hasDeclaredParameters) {
    delete out.resolution;
  }

  if (hasDeclaredParameters && !hasQualityParam) delete out.quality;
  if (hasDeclaredParameters && !hasImageCountParam) delete out.n;

  if (!hasDeclaredParameters && resolution && resolution !== 'auto') {
    out.resolution = resolution;
  }
}

function applyXiaomaDefaultParams(out: JsonObject, modelConfig?: Record<string, any>): void {
  const defaults = modelConfig?.default_params || modelConfig?.defaultParams;
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) return;
  const declared = collectDeclaredParameterNames(modelConfig?.remote_parameters || modelConfig?.remoteParameters)
    .concat(Array.isArray(modelConfig?.param_names) ? modelConfig.param_names : [])
    .concat(Array.isArray(modelConfig?.paramNames) ? modelConfig.paramNames : [])
    .map((item) => String(item || '').trim().toLowerCase().replace(/[-_\s]/g, ''))
    .filter(Boolean);
  const declaredNames = new Set(declared);
  for (const [key, value] of Object.entries(defaults)) {
    if (value === undefined || value === null || out[key] !== undefined) continue;
    if (declaredNames.size && !declaredNames.has(String(key).trim().toLowerCase().replace(/[-_\s]/g, ''))) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    else if (Array.isArray(value)) out[key] = value.map((item) => String(item)) as JsonValue;
  }
}

function isInternalParamKey(key: string): boolean {
  return [
    'apiFormat',
    'ratio',
    'aspect_ratio',
    'aspectRatio',
    'resolution',
    'nativeSize',
    'size',
    'quality',
    'sizePlan',
    'sizeWarnings',
    'sizeOption',
    'sizeKey',
    'width',
    'height',
    'resolutionPreset',
    'resolutionLabel',
    'qualityPreset',
    'qualityLabel',
    'imageCount',
  ].includes(key);
}

function collectDeclaredParameterNames(remoteParams: unknown): string[] {
  if (!Array.isArray(remoteParams)) return [];
  const names: string[] = [];
  const visit = (item: any): void => {
    if (!item || typeof item !== 'object') return;
    for (const key of ['name', 'key', 'field', 'mapsTo']) {
      const value = trimString(item[key]);
      if (value) names.push(value);
    }
    if (Array.isArray(item.parameters)) item.parameters.forEach(visit);
  };
  remoteParams.forEach(visit);
  return names;
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

function extractProviderError(data: unknown, options: { requireSuccessCode?: boolean } = {}): { code: string; message: string } | null {
  const numericCode = getFirstPath(data, ['code', 'error.code', 'data.code', 'data.error.code', 'data.task.code', 'data.result.code']);
  const codeText = String(numericCode ?? '').trim();
  const allowedCodes = options.requireSuccessCode
    ? ['200']
    : ['0', '200', '201', '202', '204', 'success', 'ok', 'accepted', 'created', 'queued', 'pending', 'processing', 'completed'];
  const isErrorCode = codeText !== '' && !allowedCodes.includes(codeText.toLowerCase());
  const missingRequiredCode = Boolean(options.requireSuccessCode && !codeText);
  const message = extractString(data, [
    'msg', 'message', 'error.message', 'error', 'data.msg', 'data.message', 'data.error.message', 'data.task.message', 'data.task.msg', 'data.task.error.message', 'data.result.message', 'data.result.msg', 'data.result.error.message', 'task.message', 'task.msg', 'task.error.message', 'result.message', 'result.msg', 'result.error.message',
  ]);
  const statusValues = [
    'success', 'status', 'state', 'status_group',
    'data.success', 'data.status', 'data.state', 'data.status_group',
    'data.task.success', 'data.task.status', 'data.task.state',
    'data.result.success', 'data.result.status', 'data.result.state',
    'task.success', 'task.status', 'task.state',
    'result.success', 'result.status', 'result.state',
  ].map((path) => getPath(data, path));
  const explicitFailure = statusValues.some((value) => ['false', 'failed', 'error', 'cancelled', 'canceled'].includes(String(value ?? '').toLowerCase()));
  if (!isErrorCode && !missingRequiredCode && !explicitFailure) return null;
  return {
    code: codeText || 'XIAOMA_ERROR',
    message: message || `小马AI返回业务错误：${summarizeProviderResponse(data, 600)}`,
  };
}

function unwrapXiaomaBody(data: any): any {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}
