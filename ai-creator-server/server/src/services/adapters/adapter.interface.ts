// services/adapters/adapter.interface.ts
// AI Provider Adapter unified interface

export interface SubmitTaskParams {
  upstreamCode: string;       // upstream_model_code
  taskType: string;           // capability_key: text_to_image, image_to_video, etc.
  prompt: string;
  images?: string[];          // reference image URLs
  params: {
    ratio?: string;
    resolution?: string;
    duration?: number;
    imageCount?: number;
    quality?: string;
    negativePrompt?: string;
    style?: string;
    nativeSize?: string;
    sizePlan?: Record<string, any>;
    [key: string]: any;
  };
  callbackUrl?: string;
  providerConfig: ProviderConfig;
}

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  timeout: number;
  protocolType: string;   // rest
  authType: string;       // bearer/api_key/basic
  extraHeaders?: Record<string, string>;
}

export interface SubmitTaskResult {
  type: 'sync' | 'async';
  providerTaskId?: string;
  status?: string;
  result?: ParsedResult;
  cost?: CostInfo | null;
  error?: { code: string; message: string };
}

export interface QueryTaskConfig {
  baseUrl: string;
  apiKey: string;
  timeout: number;
  authType: string;
  queryTaskUrl?: string;
}

export interface QueryTaskResult {
  providerTaskId: string;
  status: string;
  result?: ParsedResult;
  cost?: CostInfo | null;
  error?: { code: string; message: string };
}

export interface CancelTaskConfig {
  baseUrl: string;
  apiKey: string;
  timeout: number;
}

export interface ParsedResult {
  urls: string[];
  revisedPrompt?: string;
  metadata?: Record<string, any>;
}

export interface CostInfo {
  apiCostCents: number;
  apiCurrency: string;
  apiRawCost: number;
}

export interface IProviderAdapter {
  readonly providerType: string;

  /** Submit task to provider (sync returns result, async returns providerTaskId) */
  submitTask(params: SubmitTaskParams): Promise<SubmitTaskResult>;

  /** Query async task status */
  queryTask(providerTaskId: string, config: QueryTaskConfig): Promise<QueryTaskResult>;

  /** Cancel async task */
  cancelTask(providerTaskId: string, config: CancelTaskConfig): Promise<boolean>;

  /** Parse result from raw response using JSONPath */
  parseResult(raw: any, resultPath: string): ParsedResult;

  /** Parse upstream cost from response */
  parseCost(raw: any): CostInfo | null;

  /** Map relay status to business status */
  mapStatus(relayStatus: string, mapping: Record<string, string>): string;
}

const STATUS_FALLBACK: Record<string, string> = {
  created: 'pending',
  pending: 'processing',
  queued: 'queued',
  running: 'processing',
  processing: 'processing',
  generating: 'processing',
  success: 'completed',
  succeeded: 'completed',
  completed: 'completed',
  done: 'completed',
  error: 'failed',
  failed: 'failed',
  timeout: 'failed',
  canceled: 'cancelled',
  cancelled: 'cancelled',
};

export function applyStatusMapping(relayStatus: string, mapping: Record<string, string>): string {
  const raw = String(relayStatus || '').trim();
  const normalized = raw.toLowerCase();
  return mapping[raw] || mapping[normalized] || STATUS_FALLBACK[normalized] || normalized || raw;
}

export function joinBasePath(baseUrl: string, endpointPath: string): string {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  const endpoint = String(endpointPath || '').trim();
  if (!base) return endpoint;
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  try {
    const basePath = new URL(base).pathname.replace(/\/+$/, '');
    if (basePath && normalizedEndpoint === basePath) return base;
    if (basePath && normalizedEndpoint.startsWith(`${basePath}/`)) {
      return base + normalizedEndpoint.slice(basePath.length);
    }
  } catch {
    // Non-standard base URLs are joined as plain strings.
  }
  return base + normalizedEndpoint;
}

const RESULT_CONTAINER_KEYS = [
  'data',
  'output',
  'result',
  'results',
  'images',
  'image_urls',
  'videos',
  'video_urls',
  'audios',
  'audio_urls',
  'urls',
];
const RESULT_VALUE_KEYS = [
  'url',
  'image_url',
  'output_url',
  'result_url',
  'download_url',
  'video_url',
  'audio_url',
  'file_url',
  'b64_json',
  'b64_video',
];

export function extractParsedResult(raw: any, resultPath = ''): ParsedResult {
  const root = resultPath ? (resolveJsonPath(raw, resultPath) ?? raw) : raw;
  const urls: string[] = [];
  const seenUrls = new Set<string>();
  let revisedPrompt: string | undefined;
  let metadata: Record<string, any> | undefined;

  const addValue = (value: any, depth: number): void => {
    if (value === null || value === undefined || depth > 8) return;
    if (typeof value === 'string') {
      const text = value.trim();
      if (text && !seenUrls.has(text)) {
        urls.push(text);
        seenUrls.add(text);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) addValue(item, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;

    revisedPrompt = revisedPrompt || value.revised_prompt || value.revisedPrompt || undefined;
    if (!metadata && value.metadata && typeof value.metadata === 'object') metadata = value.metadata;

    for (const key of RESULT_VALUE_KEYS) {
      if (value[key] !== undefined && value[key] !== null) addValue(value[key], depth + 1);
    }
    for (const key of RESULT_CONTAINER_KEYS) {
      if (value[key] !== undefined && value[key] !== null) addValue(value[key], depth + 1);
    }
  };

  addValue(root, 0);
  return { urls, revisedPrompt, metadata };
}

export function providerNoResultMessage(raw: any): string {
  return `Provider returned no usable result. Raw summary: ${summarizeProviderResponse(raw)}`;
}

export function summarizeProviderResponse(raw: any, maxLength = 1200): string {
  const seen = new WeakSet<object>();
  const summarize = (value: any, depth: number): any => {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      const text = value.trim();
      if (looksLikeBase64(text)) return `[base64:${text.length}]`;
      return text.length > 180 ? `${text.slice(0, 180)}...[${text.length}]` : text;
    }
    if (typeof value !== 'object') return value;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (depth >= 4) return Array.isArray(value) ? `[Array:${value.length}]` : '[Object]';
    if (Array.isArray(value)) return value.slice(0, 8).map(item => summarize(item, depth + 1));
    const out: Record<string, any> = {};
    for (const key of Object.keys(value).slice(0, 20)) {
      out[key] = /api[_-]?key|token|secret|password/i.test(key)
        ? '[filtered]'
        : summarize(value[key], depth + 1);
    }
    return out;
  };
  const text = JSON.stringify(summarize(raw, 0));
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function looksLikeBase64(value: string): boolean {
  return value.length > 160 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/** Simple JSONPath resolver: data.result.urls, data.data[0].url, etc. */
export function resolveJsonPath(data: any, path: string): any {
  if (!path || path === '.') return data;
  const parts = path.replace(/^\$\./, '').split('.');
  let current: any = data;
  for (const part of parts) {
    const bracketMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (bracketMatch) {
      current = current?.[bracketMatch[1]]?.[parseInt(bracketMatch[2])];
    } else {
      current = current?.[part];
    }
    if (current === undefined || current === null) return null;
  }
  return current;
}
