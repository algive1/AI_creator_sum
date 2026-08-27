export type ImageSizeSource = 'custom' | 'prompt_pixel' | 'prompt_ratio' | 'ui_ratio' | 'default';

export interface ImageSizePlan {
  width: number;
  height: number;
  ratio: string;
  source: ImageSizeSource;
  warnings: string[];
  sizeMode: 'auto' | 'ratio' | 'custom_pixels';
  targetWidth: number;
  targetHeight: number;
  targetRatio: string;
  frontendRatio: string | null;
  promptRatio: string | null;
  promptPixels: { width: number; height: number } | null;
  conflict: boolean;
  conflictType: string | null;
  nativeSize: string;
  needPostprocess: boolean;
  postprocessMode: string;
}

export interface ResolveImageSizeInput {
  prompt: string;
  sizeMode?: string;
  ratio?: string;
  customWidth?: number | null;
  customHeight?: number | null;
  postprocessMode?: string;
  tierDefaultRatio?: string;
  nativeSizes?: string[];
  allowPostprocess?: boolean;
}

const SYSTEM_DEFAULT_RATIO = '1:1';
const DEFAULT_NATIVE_SIZES = ['1024x1024', '1536x1024', '1024x1536', 'auto'];

export function resolveImageSize(input: ResolveImageSizeInput): ImageSizePlan {
  const sizeMode = normalizeSizeMode(input.sizeMode);
  const uiRatio = normalizeRatio(input.ratio);
  const promptPixels = extractPromptPixels(input.prompt);
  const promptRatio = extractPromptRatio(input.prompt);
  const defaultRatio = normalizeRatio(input.tierDefaultRatio) || SYSTEM_DEFAULT_RATIO;
  const warnings: string[] = [];

  let source: ImageSizeSource;
  let width: number;
  let height: number;
  let conflict = false;
  let conflictType: string | null = null;

  const customWidth = toPositiveInt(input.customWidth);
  const customHeight = toPositiveInt(input.customHeight);

  if (customWidth && customHeight) {
    source = 'custom';
    width = customWidth;
    height = customHeight;
    if (promptPixels || promptRatio || uiRatio) {
      conflict = true;
      conflictType = 'custom_overrides_other_size';
      warnings.push('已优先使用手动填写的宽高，提示词或页面选择的比例仅作为参考。');
    }
  } else if (uiRatio) {
    source = 'ui_ratio';
    [width, height] = sizeFromRatio(uiRatio);
    if (promptPixels && ratioFromSize(promptPixels.width, promptPixels.height) !== uiRatio) {
      conflict = true;
      conflictType = 'ui_ratio_overrides_prompt_pixel';
      warnings.push('页面选择的比例和提示词中的像素尺寸不一致，已优先按页面比例生成。');
    } else if (promptRatio && promptRatio !== uiRatio) {
      conflict = true;
      conflictType = 'ui_ratio_overrides_prompt_ratio';
      warnings.push(`页面选择的比例和提示词中的 ${promptRatio} 不一致，已优先按页面比例生成。`);
    }
  } else if (promptPixels) {
    source = 'prompt_pixel';
    width = promptPixels.width;
    height = promptPixels.height;
    warnings.push(`检测到提示词包含 ${width}x${height}，已优先按该像素尺寸生成最终成品。`);
    if (uiRatio && ratioFromSize(width, height) !== uiRatio) {
      conflict = true;
      conflictType = 'prompt_pixel_overrides_ui_ratio';
      warnings.push('提示词中的像素尺寸和页面选择比例不一致，已按提示词像素尺寸处理。');
    }
  } else if (promptRatio) {
    source = 'prompt_ratio';
    [width, height] = sizeFromRatio(promptRatio);
    if (uiRatio && uiRatio !== promptRatio) {
      conflict = true;
      conflictType = 'prompt_ratio_overrides_ui_ratio';
      warnings.push(`检测到提示词指定 ${promptRatio}，已优先按提示词比例处理。`);
    }
  } else {
    source = 'default';
    [width, height] = sizeFromRatio(defaultRatio);
  }

  const ratio = ratioFromSize(width, height);
  const nativeSize = chooseNativeSize(width, height, input.nativeSizes);
  const needPostprocess = nativeSize !== 'auto' && nativeSize !== `${width}x${height}`;
  const postprocessMode = input.postprocessMode || 'cover';

  if (needPostprocess && input.allowPostprocess === false) {
    warnings.push('当前档位未开启后处理，需要模型原生支持目标尺寸，否则会返回不支持。');
  }

  return {
    width,
    height,
    ratio,
    source,
    warnings,
    sizeMode,
    targetWidth: width,
    targetHeight: height,
    targetRatio: ratio,
    frontendRatio: uiRatio,
    promptRatio,
    promptPixels,
    conflict,
    conflictType,
    nativeSize,
    needPostprocess,
    postprocessMode,
  };
}

export function normalizeRatio(value: any): string | null {
  if (!value || typeof value !== 'string') return null;
  const text = value.trim();
  if (['正方形', '方图', '正方'].includes(text)) return '1:1';
  if (['横版', '横图', '宽屏'].includes(text)) return '16:9';
  if (['竖版', '竖图', '竖屏'].includes(text)) return '9:16';

  const match = text.match(/^(\d{1,4})\s*:\s*(\d{1,4})$/);
  if (!match) return null;
  const a = parseInt(match[1], 10);
  const b = parseInt(match[2], 10);
  if (!a || !b) return null;
  const divisor = gcd(a, b);
  return `${a / divisor}:${b / divisor}`;
}

export function extractPromptPixels(prompt: string): { width: number; height: number } | null {
  const text = prompt || '';
  const patterns = [
    /(\d{2,5})\s*[xX×*]\s*(\d{2,5})\s*(?:像素|px)?/,
    /宽\s*(\d{2,5})\s*(?:像素|px)?\s*高\s*(\d{2,5})/,
    /(\d{2,5})\s*px\s*(?:by|x|×|\*)\s*(\d{2,5})\s*px/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
  }
  return null;
}

export function extractPromptRatio(prompt: string): string | null {
  const text = prompt || '';
  const wordRatio = ['正方形', '方图', '正方', '横版', '横图', '宽屏', '竖版', '竖图', '竖屏']
    .find(word => text.includes(word));
  if (wordRatio) return normalizeRatio(wordRatio);

  const match = text.match(/(\d{1,3})\s*:\s*(\d{1,3})/);
  return match ? normalizeRatio(`${match[1]}:${match[2]}`) : null;
}

function normalizeSizeMode(value: any): 'auto' | 'ratio' | 'custom_pixels' {
  if (value === 'ratio' || value === 'custom_pixels') return value;
  return 'auto';
}

function sizeFromRatio(ratio: string): [number, number] {
  const normalized = normalizeRatio(ratio) || SYSTEM_DEFAULT_RATIO;
  const [w, h] = normalized.split(':').map(n => parseInt(n, 10));
  if (w === h) return [1024, 1024];
  if (w > h) return [1536, Math.round(1536 * h / w)];
  return [Math.round(1536 * w / h), 1536];
}

function chooseNativeSize(width: number, height: number, nativeSizes?: string[]): string {
  const candidates = (nativeSizes && nativeSizes.length ? nativeSizes : DEFAULT_NATIVE_SIZES).filter(Boolean);
  if (candidates.includes('auto')) return 'auto';

  const exact = candidates.find(size => size === `${width}x${height}`);
  if (exact) return exact;

  let best = candidates[0] || '1024x1024';
  let bestScore = Number.MAX_SAFE_INTEGER;
  for (const candidate of candidates) {
    const match = candidate.match(/^(\d+)x(\d+)$/);
    if (!match) continue;
    const cw = parseInt(match[1], 10);
    const ch = parseInt(match[2], 10);
    const ratioScore = Math.abs(cw / ch - width / height) * 10000;
    const pixelScore = Math.abs(cw * ch - width * height) / 1000;
    const score = ratioScore + pixelScore;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function ratioFromSize(width: number, height: number): string {
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return Math.abs(a || 1);
}

function toPositiveInt(value: any): number | null {
  const number = typeof value === 'number' ? value : parseInt(String(value || ''), 10);
  return Number.isInteger(number) && number > 0 ? number : null;
}
