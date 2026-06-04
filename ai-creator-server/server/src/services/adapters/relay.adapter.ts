// services/adapters/relay.adapter.ts
// Relay adapter for self-built model relay station

import axios from 'axios';
import {
  IProviderAdapter, SubmitTaskParams, SubmitTaskResult,
  QueryTaskConfig, QueryTaskResult, CancelTaskConfig,
  ParsedResult, CostInfo, applyStatusMapping, extractParsedResult,
  joinBasePath, providerNoResultMessage,
} from './adapter.interface';

export class RelayAdapter implements IProviderAdapter {
  readonly providerType = 'relay';

  async submitTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const { baseUrl, apiKey, timeout } = params.providerConfig;
    const url = joinBasePath(baseUrl, '/v1/tasks');

    const body: any = {
      model: params.upstreamCode,
      task_type: params.taskType,
      prompt: params.prompt,
      params: params.params,
    };
    if (params.images && params.images.length > 0) body.images = params.images;
    if (params.callbackUrl) body.callback_url = params.callbackUrl;

    const resp = await axios.post(url, body, {
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      timeout,
    });

    const data = resp.data;
    if (data.code !== undefined && data.code !== null && String(data.code) !== '0') {
      return {
        type: 'sync',
        status: 'failed',
        error: { code: String(data.code), message: data.message || 'Unknown relay error' },
      };
    }

    const status = extractProviderStatus(data);
    const providerTaskId = extractProviderTaskId(data);
    const mapped = applyStatusMapping(status, {});

    if (providerTaskId && status && !isTerminalStatus(mapped)) {
      return {
        type: 'async',
        providerTaskId: String(providerTaskId),
        status,
        cost: data.cost ? this.parseCost(data) : null,
      };
    }

    const result = this.parseResult(data, '');
    return {
      type: 'sync',
      providerTaskId: providerTaskId ? String(providerTaskId) : undefined,
      status: status || 'success',
      result,
      cost: data.cost ? this.parseCost(data) : null,
      error: data.error || (result.urls.length ? undefined : { code: 'NO_RESULT', message: providerNoResultMessage(data) }),
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
      cost: data.cost ? this.parseCost(data) : null,
      error: data.error || (result.urls.length ? undefined : { code: 'NO_RESULT', message: providerNoResultMessage(data) }),
    };
  }

  async cancelTask(providerTaskId: string, config: CancelTaskConfig): Promise<boolean> {
    const url = joinBasePath(config.baseUrl, '/v1/tasks/' + encodeURIComponent(providerTaskId) + '/cancel');
    try {
      await axios.post(url, {}, {
        headers: { Authorization: 'Bearer ' + config.apiKey },
        timeout: config.timeout,
      });
      return true;
    } catch { return false; }
  }

  parseResult(raw: any, resultPath: string): ParsedResult {
    return extractParsedResult(raw, resultPath);
  }

  parseCost(raw: any): CostInfo | null {
    if (!raw.cost) return null;
    return {
      apiCostCents: raw.cost.api_cost_cents || raw.cost.apiCostCents || 0,
      apiCurrency: raw.cost.currency || raw.cost.api_currency || 'USD',
      apiRawCost: raw.cost.raw_cost || raw.cost.api_raw_cost || 0,
    };
  }

  mapStatus(relayStatus: string, mapping: Record<string, string>): string {
    return applyStatusMapping(relayStatus, mapping);
  }
}

function isTerminalStatus(mappedStatus: string): boolean {
  return ['completed', 'failed', 'cancelled'].includes(String(mappedStatus || '').toLowerCase());
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
