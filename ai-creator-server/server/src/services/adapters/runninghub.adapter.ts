// services/adapters/runninghub.adapter.ts
// RunningHub ComfyUI workflow API adapter.
// RunningHub 不是模型级 API，而是工作流执行平台。
// 每个 "模型" 实际是一个 ComfyUI 工作流，通过 workflow_id 标识。
//
// API 协议：
//   提交: POST /rh/execute  {workflow_id, params}
//   查询: POST /rh/query_task  {task_id}
//   状态: running → completed/failed
//   认证: X-API-Key 或 Authorization Bearer

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
  joinBasePath,
  providerNoResultMessage,
} from './adapter.interface';

type JsonObject = Record<string, any>;

const SUBMIT_PATH = '/rh/execute';
const QUERY_PATH = '/rh/query_task';

export class RunningHubAdapter implements IProviderAdapter {
  readonly providerType = 'runninghub';

  async submitTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const { baseUrl, apiKey, timeout, authType, extraHeaders } = params.providerConfig;
    const url = joinBasePath(baseUrl, SUBMIT_PATH);

    // upstreamCode = workflow_id（RunningHub 工作流 ID）
    const body: JsonObject = {
      workflow_id: params.upstreamCode,
      params: buildWorkflowParams(params),
    };

    const headers: JsonObject = buildAuthHeaders(authType, apiKey, extraHeaders);
    headers['Content-Type'] = 'application/json';

    const resp = await axios.post(url, body, { headers, timeout });

    const data = resp.data;
    const taskId = extractTaskId(data);
    const status = extractStatus(data);

    if (!taskId) {
      return {
        type: 'sync',
        status: 'failed',
        result: { urls: [], revisedPrompt: undefined, metadata: undefined },
        error: { code: 'NO_TASK_ID', message: providerNoResultMessage(data) },
      };
    }

    // RunningHub 始终是异步的（工作流执行需要时间）
    if (status && isTerminalStatus(status)) {
      return {
        type: 'sync',
        status,
        result: extractUrls(data),
      };
    }

    return { type: 'async', providerTaskId: String(taskId), status: status || 'running' };
  }

  async queryTask(providerTaskId: string, config: QueryTaskConfig): Promise<QueryTaskResult> {
    const { baseUrl, apiKey, timeout, authType } = config;
    const url = joinBasePath(baseUrl, QUERY_PATH);

    const headers: JsonObject = buildAuthHeaders(authType, apiKey);
    headers['Content-Type'] = 'application/json';

    const resp = await axios.post(url, { task_id: providerTaskId }, { headers, timeout });

    const data = resp.data;
    const status = extractStatus(data) || 'running';

    return {
      providerTaskId,
      status,
      result: extractUrls(data),
      cost: null,
      error: isTerminalStatus(status) ? undefined : undefined,
    };
  }

  async cancelTask(_providerTaskId: string, _config: CancelTaskConfig): Promise<boolean> {
    return false;
  }

  parseResult(raw: any, _resultPath: string): ParsedResult {
    return extractUrls(raw);
  }

  parseCost(_raw: any): CostInfo | null {
    return null;
  }

  mapStatus(relayStatus: string, mapping: Record<string, string>): string {
    return applyStatusMapping(relayStatus, mapping);
  }
}

// ---- helpers ----

function buildWorkflowParams(params: SubmitTaskParams): JsonObject {
  const input = params.params || {};
  const result: JsonObject = {};

  if (params.prompt) result.prompt = params.prompt;
  if (params.images?.length) result.images = params.images;
  if (input.ratio) result.ratio = input.ratio;
  if (input.duration !== undefined) result.duration = input.duration;
  if (input.quality) result.quality = input.quality;
  if (input.negativePrompt) result.negative_prompt = input.negativePrompt;
  if (input.style) result.style = input.style;
  if (input.resolution) result.resolution = input.resolution;
  if (input.seed !== undefined) result.seed = input.seed;

  // 透传 request_template 中的额外参数（用于特定工作流需要的字段）
  const template = safeParseJson(params.requestTemplate);
  if (template?.extra_params) {
    Object.assign(result, template.extra_params);
  }

  return result;
}

function extractTaskId(data: any): string {
  return String(
    data?.task_id
    || data?.taskId
    || data?.data?.task_id
    || data?.data?.taskId
    || data?.id
    || data?.data?.id
    || '',
  ).trim();
}

function extractStatus(data: any): string {
  return String(
    data?.status
    || data?.state
    || data?.data?.status
    || data?.data?.state
    || data?.result?.status
    || '',
  ).trim();
}

function isTerminalStatus(status: string): boolean {
  const lower = status.toLowerCase();
  return ['completed', 'success', 'succeeded', 'done', 'failed', 'error', 'cancelled'].includes(lower);
}

function extractUrls(data: any): ParsedResult {
  const urls: string[] = [];
  const seen = new Set<string>();

  // RunningHub 可能返回多种 URL 字段
  const urlKeys = [
    'output_url', 'output_urls', 'result_url', 'result_urls',
    'download_url', 'file_url', 'video_url', 'image_url',
    'url', 'urls',
  ];

  function collect(v: any): void {
    if (!v || seen.size > 50) return;
    if (typeof v === 'string') {
      const t = v.trim();
      if ((t.startsWith('http://') || t.startsWith('https://')) && !seen.has(t)) {
        urls.push(t);
        seen.add(t);
      }
    } else if (Array.isArray(v)) {
      for (const item of v) collect(item);
    } else if (typeof v === 'object') {
      for (const key of urlKeys) {
        if (v[key] !== undefined) collect(v[key]);
      }
      // 递归搜索子对象
      for (const val of Object.values(v)) {
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          collect(val);
        }
      }
    }
  }

  collect(data);
  return { urls, revisedPrompt: undefined, metadata: undefined };
}

function buildAuthHeaders(
  authType: string,
  apiKey: string,
  extraHeaders: Record<string, string> = {},
): JsonObject {
  const headers: JsonObject = { ...(extraHeaders || {}) };
  if (authType === 'api_key') {
    headers['X-API-Key'] = apiKey;
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

function safeParseJson(value: any): JsonObject | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}
