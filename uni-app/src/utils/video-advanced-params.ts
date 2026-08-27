export type VideoAdvancedParamKey = 'seed' | 'fps' | 'audioUrl';

const ADVANCED_PARAM_ORDER: VideoAdvancedParamKey[] = ['seed', 'fps', 'audioUrl'];

export function normalizeVideoAdvancedParams(value: unknown): VideoAdvancedParamKey[] {
  const values = Array.isArray(value) ? value : [];
  const found = new Set<VideoAdvancedParamKey>();
  values.forEach((item) => {
    const key = normalizeAdvancedParamKey(item);
    if (key) found.add(key);
  });
  return ADVANCED_PARAM_ORDER.filter((item) => found.has(item));
}

export function hasVisibleVideoAdvancedParams(value: unknown): boolean {
  return normalizeVideoAdvancedParams(value).length > 0;
}

export function buildSupportedAdvancedVideoParams(
  allowed: unknown,
  input: { seed?: unknown; fps?: unknown; audioUrl?: unknown },
): Record<string, string | number> {
  const keys = normalizeVideoAdvancedParams(allowed);
  const params: Record<string, string | number> = {};
  if (keys.includes('seed')) {
    const seed = normalizeSeedParam(input.seed);
    if (seed !== undefined) params.seed = seed;
  }
  if (keys.includes('fps')) {
    const fps = normalizePositiveInteger(input.fps, 1, 120);
    if (fps !== undefined) params.fps = fps;
  }
  if (keys.includes('audioUrl')) {
    const audioUrl = String(input.audioUrl || '').trim().slice(0, 500);
    if (audioUrl) params.audioUrl = audioUrl;
  }
  return params;
}

function normalizeAdvancedParamKey(value: unknown): VideoAdvancedParamKey | '' {
  const key = String(value || '').trim();
  if (!key) return '';
  const compact = key.replace(/[-_\s]/g, '').toLowerCase();
  if (compact === 'seed') return 'seed';
  if (compact === 'fps' || compact === 'framerate') return 'fps';
  if (compact === 'audiourl') return 'audioUrl';
  return '';
}

function normalizeSeedParam(value: unknown): string | number | undefined {
  const text = String(value || '').trim();
  if (!text) return undefined;
  const numberValue = Number(text);
  if (Number.isSafeInteger(numberValue)) return numberValue;
  return text.slice(0, 64);
}

function normalizePositiveInteger(value: unknown, min: number, max: number): number | undefined {
  const numberValue = Number(String(value || '').trim());
  if (!Number.isFinite(numberValue)) return undefined;
  const integer = Math.trunc(numberValue);
  if (integer < min || integer > max) return undefined;
  return integer;
}
