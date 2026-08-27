export type TierPricingMode = 'fixed' | 'matrix' | 'per_second_matrix' | 'token_preauth';

export type TierPricingRule = {
  conditions?: Record<string, unknown>;
  pointsCost?: number;
  unitPoints?: number;
  preauthPoints?: number;
  label?: string;
};

export type TierPricing = {
  mode?: TierPricingMode;
  unit?: 'points';
  defaultParams?: Record<string, unknown>;
  rules?: TierPricingRule[];
  defaultPointsCost?: number;
  defaultUnitPoints?: number;
  preauthPoints?: number;
  memberDiscountPercent?: number;
  memberDiscountApplied?: boolean;
};

export type TierPricingSource = {
  basePointsCost?: number;
  pointsCost?: number;
  memberDiscountPercent?: number;
  pricing?: TierPricing | null;
};

export type TierPriceEstimate = {
  basePointsCost: number;
  pointsCost: number;
};

export function normalizeTierPricing(value: unknown): TierPricing | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const mode = String(source.mode || 'fixed') as TierPricingMode;
  return {
    mode: ['fixed', 'matrix', 'per_second_matrix', 'token_preauth'].includes(mode) ? mode : 'fixed',
    unit: 'points',
    defaultParams: source.defaultParams && typeof source.defaultParams === 'object' ? source.defaultParams as Record<string, unknown> : {},
    rules: Array.isArray(source.rules) ? source.rules as TierPricingRule[] : [],
    defaultPointsCost: numberOrUndefined(source.defaultPointsCost),
    defaultUnitPoints: numberOrUndefined(source.defaultUnitPoints),
    preauthPoints: numberOrUndefined(source.preauthPoints),
    memberDiscountPercent: numberOrUndefined(source.memberDiscountPercent),
    memberDiscountApplied: Boolean(source.memberDiscountApplied),
  };
}

export function estimateTierPointsCost(model?: TierPricingSource | null, params: Record<string, unknown> = {}) {
  return resolveTierPriceEstimate(model, params).pointsCost;
}

export function resolveTierPriceEstimate(model?: TierPricingSource | null, params: Record<string, unknown> = {}): TierPriceEstimate {
  if (!model) return { basePointsCost: 0, pointsCost: 0 };
  const pricing = model.pricing;
  const fallbackBase = Math.max(0, Number(model.basePointsCost || model.pointsCost || 0));
  const fallbackPoints = Math.max(0, Number(model.pointsCost || 0));
  if (!pricing || pricing.mode === 'fixed') {
    return { basePointsCost: fallbackBase, pointsCost: fallbackPoints };
  }

  const priceParams = normalizePricingParams(mergePricingParams(pricing.defaultParams || {}, params));
  const rule = findPricingRule(pricing.rules || [], priceParams);
  const discountPercent = Number(pricing.memberDiscountPercent ?? model.memberDiscountPercent ?? 100);
  let basePointsCost = fallbackBase;

  if (pricing.mode === 'matrix') {
    basePointsCost = numberOrFallback(rule?.pointsCost ?? pricing.defaultPointsCost, fallbackBase);
  } else if (pricing.mode === 'per_second_matrix') {
    const seconds = parseDurationSeconds(priceParams.duration);
    const unit = numberOrFallback(rule?.unitPoints ?? pricing.defaultUnitPoints, 0);
    if (seconds > 0 && unit > 0) basePointsCost = seconds * unit;
  } else if (pricing.mode === 'token_preauth') {
    basePointsCost = numberOrFallback(rule?.preauthPoints ?? pricing.preauthPoints, fallbackBase);
  }

  return {
    basePointsCost,
    pointsCost: applyMemberDiscount(basePointsCost, discountPercent),
  };
}

function mergePricingParams(defaultParams: Record<string, unknown>, params: Record<string, unknown>) {
  const merged: Record<string, unknown> = { ...(defaultParams || {}) };
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    merged[key] = value;
  });
  return merged;
}

function normalizePricingParams(params: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    out[key] = normalizePricingValue(key, value);
  });
  if (!out.quality && out.resolution) out.quality = out.resolution;
  if (!out.resolution && out.quality) out.resolution = out.quality;
  const resolutionPreset = out.resolutionPreset || out.resolution_preset;
  if (resolutionPreset && resolutionPreset !== 'auto') {
    out.quality = resolutionPreset;
    out.resolution = resolutionPreset;
  }
  if (!out.duration && out.durationSeconds) out.duration = `${parseDurationSeconds(out.durationSeconds)}s`;
  return out;
}

function findPricingRule(rules: TierPricingRule[], params: Record<string, unknown>): TierPricingRule | null {
  let best: TierPricingRule | null = null;
  let bestScore = -1;
  for (const source of rules) {
    const conditions = normalizePricingParams(source.conditions || {});
    const entries = Object.entries(conditions);
    if (!entries.length) continue;
    const matched = entries.every(([key, value]) => normalizePricingValue(key, params[key]) === normalizePricingValue(key, value));
    if (matched && entries.length > bestScore) {
      best = source;
      bestScore = entries.length;
    }
  }
  return best;
}

function normalizePricingValue(key: string, value: unknown): unknown {
  if (key === 'duration' || key === 'durationRaw' || key === 'durationText') return `${parseDurationSeconds(value)}s`;
  if (key === 'durationSeconds') return parseDurationSeconds(value);
  if (key === 'audioMode') return normalizeAudioMode(String(value || ''));
  if (['quality', 'resolution', 'resolutionPreset', 'resolution_preset', 'mode', 'generationMode', 'generation_mode', 'version'].includes(key)) return String(value || '').trim().toLowerCase();
  if (typeof value === 'string') return value.trim();
  return value;
}

function normalizeAudioMode(value: string) {
  const text = String(value || '').trim().toLowerCase();
  if (['audio', 'sound', 'with_audio', 'with-audio', 'on', '有声', '声音', '音频'].includes(text)) return 'audio';
  if (['silent', 'mute', 'muted', 'no_audio', 'no-audio', 'off', '无声', '静音'].includes(text)) return 'silent';
  return text;
}

function parseDurationSeconds(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  const text = String(value || '').trim().toLowerCase();
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  return Math.max(0, Math.trunc(Number(match[1]) || 0));
}

function numberOrFallback(value: unknown, fallback: unknown): number {
  const numberValue = Number(value);
  if (Number.isFinite(numberValue)) return Math.max(0, Math.trunc(numberValue));
  return Math.max(0, Math.trunc(Number(fallback) || 0));
}

function numberOrUndefined(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.trunc(numberValue)) : undefined;
}

function applyMemberDiscount(basePoints: number, discountPercent: number) {
  const base = Math.max(0, Math.trunc(Number(basePoints) || 0));
  if (base <= 0) return 0;
  const percent = Math.min(100, Math.max(1, Number(discountPercent) || 100));
  return Math.max(1, Math.round(base * percent / 100));
}
