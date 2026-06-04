// services/adapters/openai.adapter.ts
// OpenAI official API adapter (DALL-E)

import axios from 'axios';
import { decryptApiKey } from '../openai-adapter.service';
import {
  IProviderAdapter, SubmitTaskParams, SubmitTaskResult,
  QueryTaskConfig, QueryTaskResult, CancelTaskConfig,
  ParsedResult, CostInfo, applyStatusMapping,
} from './adapter.interface';

export class OpenAIAdapter implements IProviderAdapter {
  readonly providerType = 'openai';

  async submitTask(params: SubmitTaskParams): Promise<SubmitTaskResult> {
    if (params.taskType.includes('video')) {
      throw new Error('OpenAI 官方适配器当前只支持生图；生视频请使用 relay、custom 或 openai_compatible 视频接口。');
    }
    const { baseUrl, apiKey, timeout } = params.providerConfig;
    const decryptedKey = decryptApiKey(apiKey);
    const url = baseUrl.replace(/\/$/, '') + '/images/generations';

    const size = resolveOpenAISize(params.params.nativeSize, params.params.ratio);
    const quality = params.params.quality === '超清' || params.params.quality === 'hd' ? 'hd' : 'standard';

    const resp = await axios.post(url, {
      model: params.upstreamCode,
      prompt: params.prompt,
      n: params.params.imageCount || 3,
      size,
      quality,
      response_format: 'url',
    }, {
      headers: { Authorization: 'Bearer ' + decryptedKey, 'Content-Type': 'application/json' },
      timeout,
    });

    const data = resp.data;
    const urls: string[] = (data.data || []).map((d: any) => d.url);
    return {
      type: 'sync',
      status: 'success',
      result: {
        urls,
        revisedPrompt: data.data?.[0]?.revised_prompt || undefined,
      },
      cost: null, // OpenAI cost not returned in response
    };
  }

  async queryTask(_providerTaskId: string, _config: QueryTaskConfig): Promise<QueryTaskResult> {
    throw new Error('OpenAI adapter does not support async query');
  }

  async cancelTask(_providerTaskId: string, _config: CancelTaskConfig): Promise<boolean> {
    return false; // DALL-E does not support cancellation
  }

  parseResult(raw: any, _resultPath: string): ParsedResult {
    const urls: string[] = (raw.data || []).map((d: any) => d.url || '');
    return {
      urls,
      revisedPrompt: raw.data?.[0]?.revised_prompt || undefined,
    };
  }

  parseCost(_raw: any): CostInfo | null { return null; }

  mapStatus(relayStatus: string, mapping: Record<string, string>): string {
    return applyStatusMapping(relayStatus, mapping);
  }
}

function resolveOpenAISize(nativeSize?: string, ratio?: string): string {
  if (nativeSize && nativeSize !== 'auto') return nativeSize;
  const ratioMap: Record<string, string> = {
    '1:1': '1024x1024',
    '16:9': '1536x1024',
    '3:2': '1536x1024',
    '9:16': '1024x1536',
    '2:3': '1024x1536',
  };
  return ratioMap[ratio || ''] || '1024x1024';
}
