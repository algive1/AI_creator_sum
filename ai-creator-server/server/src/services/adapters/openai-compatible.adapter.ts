// services/adapters/openai-compatible.adapter.ts
// OpenAI-compatible API adapter (e.g., vLLM, local LLM servers)

import axios from 'axios';
import {
  IProviderAdapter, SubmitTaskParams, SubmitTaskResult,
  QueryTaskConfig, QueryTaskResult, CancelTaskConfig,
  ParsedResult, CostInfo, applyStatusMapping, extractParsedResult,
  joinBasePath, providerNoResultMessage,
} from './adapter.interface';

export class OpenAICompatibleAdapter implements IProviderAdapter {
  readonly providerType = 'openai_compatible';

  async submitTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const { baseUrl, apiKey, timeout } = params.providerConfig;
    const isVideo = params.taskType.includes('video');
    const url = joinBasePath(baseUrl, isVideo ? '/v1/videos/generations' : '/v1/images/generations');

    const body: any = {
      model: params.upstreamCode,
      prompt: params.prompt,
      response_format: 'url',
    };
    if (isVideo) {
      body.ratio = params.params.ratio;
      body.duration = params.params.duration;
      body.size = params.params.nativeSize && params.params.nativeSize !== 'auto' ? params.params.nativeSize : undefined;
      body.images = params.images || [];
    } else {
      body.n = params.params.imageCount || 1;
      body.size = params.params.nativeSize && params.params.nativeSize !== 'auto' ? params.params.nativeSize : '1024x1024';
      if (params.images?.length) body.images = params.images;
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
  return joinBasePath(baseUrl, '/v1/tasks/' + encoded);
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
