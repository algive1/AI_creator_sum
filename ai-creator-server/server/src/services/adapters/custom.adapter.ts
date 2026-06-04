// services/adapters/custom.adapter.ts
// Custom adapter using request_template from ai_models

import axios from 'axios';
import {
  IProviderAdapter, SubmitTaskParams, SubmitTaskResult,
  QueryTaskConfig, QueryTaskResult, CancelTaskConfig,
  ParsedResult, CostInfo, applyStatusMapping, resolveJsonPath,
} from './adapter.interface';

export class CustomAdapter implements IProviderAdapter {
  readonly providerType = 'custom';

  async submitTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    const { baseUrl, apiKey, timeout, authType, extraHeaders } = params.providerConfig;
    const url = baseUrl.replace(/\/$/, '');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(extraHeaders || {}),
    };
    if (authType === 'bearer') headers['Authorization'] = 'Bearer ' + apiKey;
    else if (authType === 'api_key') headers['X-API-Key'] = apiKey;

    const body: any = {
      model: params.upstreamCode,
      prompt: params.prompt,
      params: params.params,
    };
    if (params.images?.length) body.images = params.images;

    const resp = await axios.post(url, body, { headers, timeout });
    const data = resp.data;

    return {
      type: 'sync',
      status: 'success',
      result: { urls: this.extractUrls(data) },
      cost: null,
    };
  }

  async queryTask(providerTaskId: string, config: QueryTaskConfig): Promise<QueryTaskResult> {
    const base = config.queryTaskUrl || config.baseUrl;
    const url = base.replace(/\/$/, '') + '/' + encodeURIComponent(providerTaskId);
    const resp = await axios.get(url, {
      headers: { Authorization: 'Bearer ' + config.apiKey },
      timeout: config.timeout,
    });
    const data = resp.data;
    return {
      providerTaskId: data.id || providerTaskId,
      status: data.status || 'running',
      result: data.result ? { urls: this.extractUrls(data.result) } : undefined,
      cost: null,
    };
  }

  async cancelTask(_providerTaskId: string, _config: CancelTaskConfig): Promise<boolean> { return false; }

  parseResult(raw: any, resultPath: string): ParsedResult {
    const node = resultPath ? resolveJsonPath(raw, resultPath) : raw;
    return { urls: this.extractUrls(node || raw) };
  }

  parseCost(_raw: any): CostInfo | null { return null; }

  mapStatus(relayStatus: string, mapping: Record<string, string>): string {
    return applyStatusMapping(relayStatus, mapping);
  }

  private extractUrls(data: any): string[] {
    if (!data) return [];
    if (typeof data === 'string') return [data];
    if (Array.isArray(data)) return data.map((d: any) => typeof d === 'string' ? d : (d.url || '')).filter(Boolean);
    if (data.urls) return data.urls;
    if (data.url) return [data.url];
    if (data.data) return (data.data || []).map((d: any) => d.url || '').filter(Boolean);
    return [];
  }
}
