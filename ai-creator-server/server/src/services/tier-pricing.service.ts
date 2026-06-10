import { applyFeatureDiscount, normalizeDiscountPercent } from './membership.service';

export type TierPricingMode = 'fixed' | 'matrix' | 'per_second_matrix' | 'token_preauth';

export interface TierPricingRule {
  conditions?: Record<string, any>;
  pointsCost?: number;
  unitPoints?: number;
  preauthPoints?: number;
  label?: string;
}

export interface PublicTierPricing {
  mode: TierPricingMode;
  unit: 'points';
  defaultParams: Record<string, any>;
  rules: TierPricingRule[];
  defaultPointsCost?: number;
  defaultUnitPoints?: number;
  preauthPoints?: number;
  memberDiscountPercent: number;
  memberDiscountApplied: boolean;
}

export interface ResolvedTierPricing {
  pricingMode: TierPricingMode;
  basePointsCost: number;
  pointsCost: number;
  memberDiscountPercent: number;
  memberDiscountApplied: boolean;
  unitBasePointsCost?: number;
  unitPointsCost?: number;
  matchedRule?: TierPricingRule | null;
  priceParams: Record<string, any>;
  pricing: PublicTierPricing;
  pricingSnapshot: Record<string, any>;
}

export function resolveTierPricing(input: {
  basePointsCost: number;
  pricingMode?: string | null;
  pricingRules?: any;
  params?: Record<string, any>;
  discountPercent?: number;
}): ResolvedTierPricing {
  const fallbackBase = normalizePointValue(input.basePointsCost, 0);
  const rulesConfig = parsePricingRules(input.pricingRules);
  const pricingMode = normalizePricingMode(input.pricingMode || rulesConfig.mode);
  const rawDefaultParams = rulesConfig.defaultParams && typeof rulesConfig.defaultParams === 'object' ? rulesConfig.defaultParams : {};
  const priceParams = normalizePriceParams(mergePriceParams(rawDefaultParams, input.params || {}));
  const discountPercent = normalizeDiscountPercent(input.discountPercent || 100);

  const matchedRule = findMatchedRule(rulesConfig.rules, priceParams);
  let basePointsCost = fallbackBase;
  let unitBasePointsCost: number | undefined;

  if (pricingMode === 'matrix') {
    basePointsCost = normalizePointValue(
      matchedRule?.pointsCost ?? rulesConfig.defaultPointsCost,
      fallbackBase,
    );
  } else if (pricingMode === 'per_second_matrix') {
    const durationSeconds = parseDurationSeconds(priceParams.duration ?? priceParams.durationSeconds);
    const unitPoints = normalizePointValue(
      matchedRule?.unitPoints ?? rulesConfig.defaultUnitPoints,
      0,
    );
    if (durationSeconds > 0 && unitPoints > 0) {
      unitBasePointsCost = unitPoints;
      basePointsCost = durationSeconds * unitPoints;
    }
  } else if (pricingMode === 'token_preauth') {
    basePointsCost = normalizePointValue(
      matchedRule?.preauthPoints ?? rulesConfig.preauthPoints,
      fallbackBase,
    );
  }

  const pointsCost = applyFeatureDiscount(basePointsCost, discountPercent);
  const unitPointsCost = unitBasePointsCost !== undefined
    ? applyFeatureDiscount(unitBasePointsCost, discountPercent)
    : undefined;
  const memberDiscountApplied = discountPercent < 100 && pointsCost < basePointsCost;
  const pricing = buildPublicPricing({
    mode: pricingMode,
    rulesConfig,
    discountPercent,
    memberDiscountApplied,
  });

  return {
    pricingMode,
    basePointsCost,
    pointsCost,
    memberDiscountPercent: discountPercent,
    memberDiscountApplied,
    unitBasePointsCost,
    unitPointsCost,
    matchedRule: matchedRule || null,
    priceParams,
    pricing,
    pricingSnapshot: {
      mode: pricingMode,
      priceParams,
      matchedRule: matchedRule || null,
      basePointsCost,
      pointsCost,
      unitBasePointsCost,
      unitPointsCost,
      memberDiscountPercent: discountPercent,
      memberDiscountApplied,
    },
  };
}

function parsePricingRules(value: any): any {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (typeof value === 'object') return value;
  return {};
}

function normalizePricingMode(value: any): TierPricingMode {
  const raw = String(value || 'fixed').trim();
  if (raw === 'matrix' || raw === 'per_second_matrix' || raw === 'token_preauth') return raw;
  return 'fixed';
}

function normalizePointValue(value: any, fallback: number): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return Math.max(0, Math.trunc(fallback || 0));
  return Math.max(0, Math.trunc(raw));
}

function mergePriceParams(defaultParams: Record<string, any>, params: Record<string, any>): Record<string, any> {
  const merged = { ...(defaultParams || {}) };
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    merged[key] = value;
  }
  return merged;
}

function findMatchedRule(rules: any, params: Record<string, any>): TierPricingRule | null {
  if (!Array.isArray(rules)) return null;
  let best: TierPricingRule | null = null;
  let bestScore = -1;
  for (const source of rules) {
    if (!source || typeof source !== 'object') continue;
    const rule: TierPricingRule = {
      ...source,
      conditions: normalizePriceParams(source.conditions || {}),
    };
    const entries = Object.entries(rule.conditions || {});
    if (!entries.length) continue;
    const matched = entries.every(([key, value]) => normalizeConditionValue(key, params[key]) === normalizeConditionValue(key, value));
    if (matched && entries.length > bestScore) {
      best = rule;
      bestScore = entries.length;
    }
  }
  return best;
}

function normalizePriceParams(params: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    out[key] = normalizeConditionValue(key, value);
  }
  if (!out.quality && out.resolution) out.quality = out.resolution;
  if (!out.resolution && out.quality) out.resolution = out.quality;
  if (!out.duration && out.durationSeconds) out.duration = normalizeDuration(out.durationSeconds);
  return out;
}

function normalizeConditionValue(key: string, value: any): any {
  if (value === undefined || value === null) return '';
  if (key === 'duration' || key === 'durationRaw' || key === 'durationText') return normalizeDuration(value);
  if (key === 'durationSeconds') return parseDurationSeconds(value);
  if (key === 'audioMode') return normalizeAudioMode(value);
  if (['quality', 'resolution', 'mode', 'generationMode', 'generation_mode', 'version'].includes(key)) {
    return String(value || '').trim().toLowerCase();
  }
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value).trim();
}

function normalizeDuration(value: any): string {
  const seconds = parseDurationSeconds(value);
  return seconds > 0 ? `${seconds}s` : String(value || '').trim();
}

function parseDurationSeconds(value: any): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.trunc(value));
  const text = String(value || '').trim().toLowerCase();
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  return Math.max(0, Math.trunc(Number(match[1]) || 0));
}

function normalizeAudioMode(value: any): string {
  if (typeof value === 'boolean') return value ? 'audio' : 'silent';
  const text = String(value || '').trim().toLowerCase();
  if (['audio', 'sound', 'with_audio', 'with-audio', 'on', '有声', '声音', '音频'].includes(text)) return 'audio';
  if (['silent', 'mute', 'muted', 'no_audio', 'no-audio', 'off', '无声', '静音'].includes(text)) return 'silent';
  return text;
}

function buildPublicPricing(input: {
  mode: TierPricingMode;
  rulesConfig: any;
  discountPercent: number;
  memberDiscountApplied: boolean;
}): PublicTierPricing {
  const rules = Array.isArray(input.rulesConfig.rules)
    ? input.rulesConfig.rules.map((rule: any) => ({
        label: typeof rule?.label === 'string' ? rule.label : undefined,
        conditions: normalizePriceParams(rule?.conditions || {}),
        pointsCost: rule?.pointsCost !== undefined ? normalizePointValue(rule.pointsCost, 0) : undefined,
        unitPoints: rule?.unitPoints !== undefined ? normalizePointValue(rule.unitPoints, 0) : undefined,
        preauthPoints: rule?.preauthPoints !== undefined ? normalizePointValue(rule.preauthPoints, 0) : undefined,
      }))
    : [];
  return {
    mode: input.mode,
    unit: 'points',
    defaultParams: normalizePriceParams(input.rulesConfig.defaultParams || {}),
    rules,
    defaultPointsCost: input.rulesConfig.defaultPointsCost !== undefined ? normalizePointValue(input.rulesConfig.defaultPointsCost, 0) : undefined,
    defaultUnitPoints: input.rulesConfig.defaultUnitPoints !== undefined ? normalizePointValue(input.rulesConfig.defaultUnitPoints, 0) : undefined,
    preauthPoints: input.rulesConfig.preauthPoints !== undefined ? normalizePointValue(input.rulesConfig.preauthPoints, 0) : undefined,
    memberDiscountPercent: input.discountPercent,
    memberDiscountApplied: input.memberDiscountApplied,
  };
}
