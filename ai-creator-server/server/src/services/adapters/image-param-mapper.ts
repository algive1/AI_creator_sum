import {
  isResolutionPreset,
  normalizeRatioPreset,
  normalizeResolutionPreset,
  resolveGptImage2UpstreamSize,
} from '../image-size-options.service';

export interface NormalizedImageParams {
  ratio: string;
  resolutionPreset: string;
  nativeSize: string;
  quality: string;
  imageCount: number;
  sizeOption: {
    ratio?: string;
    resolutionPreset?: string;
    upstreamSize?: string;
    isAuto?: boolean;
  } | null;
}

export function normalizeImageParams(input: Record<string, any> = {}): NormalizedImageParams {
  const sizeOption = normalizeSizeOption(input.sizeOption);
  const resolutionPreset = normalizeResolutionPreset(input.resolutionPreset || sizeOption?.resolutionPreset || input.resolution);
  const ratio = normalizeRatioPreset(
    input.aspect_ratio
      || input.aspectRatio
      || input.ratio
      || sizeOption?.ratio,
  );
  return {
    ratio,
    resolutionPreset,
    nativeSize: trimString(input.nativeSize || input.size || input.resolution),
    quality: trimString(input.quality),
    imageCount: normalizePositiveInt(input.imageCount, 1),
    sizeOption,
  };
}

export function isGptImage2Model(model: string, providerType?: string): boolean {
  const normalized = String(model || '').toLowerCase();
  return normalized.includes('gpt-image-2')
    || (String(providerType || '').toLowerCase() === 'xiaoma' && normalized.includes('tt-image-2'));
}

export function isNanoBananaModel(model: string): boolean {
  const normalized = String(model || '').toLowerCase();
  return normalized.includes('nano-banana')
    || (normalized.includes('gemini') && normalized.includes('image-preview'))
    || hasCurrentXiaomaBananaModelToken(normalized);
}

export function applyGptImage2Params(body: Record<string, any>, normalized: NormalizedImageParams): void {
  const size = resolveGptImage2Size(normalized);
  if (size) body.size = size;
  if (normalized.imageCount > 0) body.n = normalized.imageCount;
  delete body.aspect_ratio;
  delete body.aspectRatio;
  delete body.resolution;
  delete body.quality;
}

export function applyNanoBananaParams(body: Record<string, any>, normalized: NormalizedImageParams, model?: string): void {
  body.aspectRatio = normalized.ratio || 'auto';
  if (normalized.resolutionPreset && normalized.resolutionPreset !== 'auto') body.imageSize = normalized.resolutionPreset;
  if (isNanoBanana2Model(model)) body.thinkingLevel = 'high';
  if (normalized.quality && !isResolutionPreset(normalized.quality)) body.quality = normalized.quality;
  delete body.n;
  delete body.aspect_ratio;
  delete body.resolution;
  delete body.size;
}

function isNanoBanana2Model(model: unknown): boolean {
  const normalized = String(model || '').toLowerCase();
  return normalized.includes('gemini-3.1-flash-image-preview')
    || hasCurrentXiaomaBananaModelToken(normalized, 'banana-2');
}

function hasCurrentXiaomaBananaModelToken(value: string, expected?: 'banana-2'): boolean {
  const models = new Set(['banana-pro', 'banana-pro-token', 'banana-2', 'banana-2-token']);
  return value.split(/\s+/).some((token) => models.has(token) && (!expected || token.startsWith(expected)));
}

export function applyGenericImageParams(body: Record<string, any>, normalized: NormalizedImageParams): void {
  // 通用参数：仅设置 n、size、quality 等标准字段
  // aspect_ratio 和 resolution 不是标准 OpenAI 字段，仅对已知支持它们的供应商启用
  if (normalized.nativeSize && /^\d+x\d+$/i.test(normalized.nativeSize) && !body.size) {
    body.size = normalized.nativeSize.toLowerCase();
  }
  if (normalized.quality && !isResolutionPreset(normalized.quality)) body.quality = normalized.quality;
  if (normalized.imageCount > 0 && !body.n) body.n = normalized.imageCount;
}

export function resolveGptImage2Size(normalized: NormalizedImageParams): string {
  const { sizeOption, ratio, resolutionPreset, nativeSize } = normalized;
  if (sizeOption?.isAuto || ratio === 'auto' && resolutionPreset === 'auto') return 'auto';
  if (sizeOption?.upstreamSize) return sizeOption.upstreamSize;
  if (nativeSize && /^\d+x\d+$/i.test(nativeSize)) return nativeSize.toLowerCase();
  return gptSizeFromRatioResolution(ratio, resolutionPreset);
}

export function normalizeImageCount(value: any, fallback = 1): number {
  return normalizePositiveInt(value, fallback);
}

function normalizeSizeOption(value: unknown): NormalizedImageParams['sizeOption'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  return {
    ratio: normalizeRatioPreset(source.ratio),
    resolutionPreset: normalizeResolutionPreset(source.resolutionPreset),
    upstreamSize: trimString(source.upstreamSize || source.size),
    isAuto: Boolean(source.isAuto),
  };
}

function gptSizeFromRatioResolution(ratio: string, resolutionPreset: string): string {
  const resolution = normalizeResolutionPreset(resolutionPreset || '1K');
  const normalizedRatio = normalizeRatioPreset(ratio || '1:1');
  const gptImage2Size = resolveGptImage2UpstreamSize(normalizedRatio, resolution);
  if (gptImage2Size) return gptImage2Size;
  const map: Record<string, Record<string, string>> = {
    '1K': {
      '1:1': '1024x1024',
      '2:3': '1024x1536',
      '3:2': '1536x1024',
      '3:4': '960x1280',
      '4:3': '1280x960',
      '9:16': '1088x1920',
      '16:9': '1920x1088',
    },
    '2K': {
      '1:1': '2048x2048',
      '2:3': '2048x3072',
      '3:2': '3072x2048',
      '3:4': '1920x2560',
      '4:3': '2560x1920',
      '9:16': '1440x2560',
      '16:9': '2560x1440',
    },
    '4K': {
      '1:1': '2880x2880',
      '2:3': '2304x3456',
      '3:2': '3456x2304',
      '3:4': '2400x3200',
      '4:3': '3200x2400',
      '9:16': '2160x3840',
      '16:9': '3840x2160',
    },
  };
  return map[resolution]?.[normalizedRatio] || map['1K']['1:1'];
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

function normalizePositiveInt(value: unknown, fallback: number): number {
  const numberValue = Number(value || fallback);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function trimString(value: unknown): string {
  return String(value || '').trim();
}
