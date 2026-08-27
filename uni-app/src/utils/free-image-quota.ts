export interface FreeImageQuotaView {
  enabled?: boolean;
  eligible?: boolean;
  canUseFreeQuota?: boolean;
  dailyRemaining?: number;
  dailyLimit?: number;
  totalRemaining?: number;
  totalLimit?: number;
  remaining?: number;
  allowedTierKeys?: string[];
  showInDailyTasks?: boolean;
  exhaustedMessage?: string;
  membershipEnabled?: boolean;
  purchaseEnabled?: boolean;
}

export type FreeImageQuotaGenerationMode = 'text2img' | 'question_to_image' | 'img2img' | 'edit';

export interface FreeImageQuotaModelIdentity {
  name?: unknown;
  modelName?: unknown;
  displayName?: unknown;
  apiModelName?: unknown;
  upstreamModelCode?: unknown;
  modelCode?: unknown;
  providerType?: unknown;
  freeImageQuotaModelEligible?: unknown;
}

const DEFAULT_ALLOWED_TIER_KEYS = ['image_standard', 'image_pro'];
const FREE_IMAGE_QUOTA_GENERATION_MODES: FreeImageQuotaGenerationMode[] = ['text2img', 'question_to_image', 'img2img', 'edit'];

export function normalizeFreeImageQuotaStatus(value: unknown): FreeImageQuotaView {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const dailyLimit = readQuotaNumber(source, ['dailyLimit', 'daily_limit', 'freeImageQuota.dailyLimit', 'free_image_quota.daily_limit'], 0);
  const totalLimit = readQuotaNumber(source, ['totalLimit', 'total_limit', 'freeImageQuota.totalLimit', 'free_image_quota.total_limit'], 0);
  const remaining = readOptionalQuotaNumber(source, ['remaining']);
  const dailyRemaining = readOptionalQuotaNumber(source, ['dailyRemaining', 'daily_remaining', 'remainingToday', 'remaining_today']) ?? remaining ?? dailyLimit;
  const totalRemaining = readOptionalQuotaNumber(source, ['totalRemaining', 'total_remaining']) ?? remaining ?? totalLimit;
  const enabled = readQuotaBoolean(source, ['enabled', 'freeImageQuota.enabled', 'free_image_quota.enabled'], false);
  const eligible = readQuotaBoolean(source, ['eligible'], enabled);
  const normalizedRemaining = Math.min(
    Math.max(0, dailyRemaining),
    Math.max(0, totalRemaining),
    Math.max(0, remaining ?? Number.POSITIVE_INFINITY),
  );

  return {
    enabled,
    eligible,
    canUseFreeQuota: readQuotaBoolean(source, ['canUseFreeQuota', 'can_use_free_quota'], eligible && normalizedRemaining > 0),
    dailyRemaining,
    dailyLimit,
    totalRemaining,
    totalLimit,
    remaining: remaining ?? normalizedRemaining,
    allowedTierKeys: readTierKeys(source, ['allowedTierKeys', 'allowed_tier_keys', 'freeImageQuota.allowedTierKeys', 'free_image_quota.allowed_tier_keys']),
    showInDailyTasks: readQuotaBoolean(source, ['showInDailyTasks', 'show_in_daily_tasks', 'freeImageQuota.showInDailyTasks', 'free_image_quota.show_in_daily_tasks'], true),
    exhaustedMessage: String(readFirst(source, ['exhaustedMessage', 'exhausted_message', 'freeImageQuota.exhaustedMessage', 'free_image_quota.exhausted_message']) || ''),
    membershipEnabled: readQuotaBoolean(source, ['membershipEnabled', 'membership_enabled'], true),
    purchaseEnabled: readQuotaBoolean(source, ['purchaseEnabled', 'purchase_enabled'], true),
  };
}

export function normalizeFreeImageQuotaGenerationMode(mode?: string | null): FreeImageQuotaGenerationMode | '' {
  const value = String(mode || '').trim().toLowerCase();
  if (!value) return '';
  if (['文生图', '问生图', 'text2img', 'text_to_image', 'image_create'].includes(value)) return 'text2img';
  if (['图生图', 'img2img', 'image_to_image'].includes(value)) return 'img2img';
  if (['图片编辑', 'edit', 'image_edit', 'image_editing'].includes(value)) return 'edit';
  if (['question_to_image', 'ask_to_image'].includes(value)) return 'question_to_image';
  return '';
}

export function isFreeImageQuotaGenerationModeSupported(mode?: string | null): boolean {
  const normalized = normalizeFreeImageQuotaGenerationMode(mode);
  return !mode || Boolean(normalized && FREE_IMAGE_QUOTA_GENERATION_MODES.includes(normalized));
}

export function isGptImage2FreeQuotaModel(model?: FreeImageQuotaModelIdentity | null): boolean {
  if (!model) return false;
  const explicit = readQuotaBoolean(model as Record<string, unknown>, ['freeImageQuotaModelEligible', 'free_image_quota_model_eligible'], false);
  if (explicit) return true;
  const text = [
    model.name,
    model.modelName,
    model.displayName,
    model.apiModelName,
    model.upstreamModelCode,
    model.modelCode,
    model.providerType,
    readFirst(model as Record<string, unknown>, ['api_model_name']),
    readFirst(model as Record<string, unknown>, ['upstream_model_code']),
    readFirst(model as Record<string, unknown>, ['model_code']),
    readFirst(model as Record<string, unknown>, ['provider_type']),
  ].map((item) => String(item || '').trim().toLowerCase()).filter(Boolean).join(' ');
  if (!text) return false;
  return text.replace(/[^a-z0-9]+/g, '').includes('gptimage2');
}

export function isFreeImageQuotaTierAllowed(status: FreeImageQuotaView | null | undefined, tierKey?: string): boolean {
  if (!status) return false;
  const normalized = normalizeFreeImageQuotaStatus(status);
  const allowed = Array.isArray(normalized.allowedTierKeys)
    ? normalized.allowedTierKeys.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
    : [];
  if (!tierKey) return allowed.length > 0;
  return allowed.includes(String(tierKey || '').trim().toLowerCase());
}

export function getFreeImageQuotaRemainingImages(status: FreeImageQuotaView | null | undefined): number {
  if (!status) return 0;
  const normalized = normalizeFreeImageQuotaStatus(status);
  const dailyRemaining = Math.max(0, Math.floor(Number(normalized.dailyRemaining) || 0));
  const totalRemaining = Math.max(0, Math.floor(Number(normalized.totalRemaining) || 0));
  const explicitRemaining = normalized.remaining === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Math.floor(Number(normalized.remaining) || 0));
  return Math.min(dailyRemaining, totalRemaining, explicitRemaining);
}

export function resolveFreeQuotaReductionCount(status: FreeImageQuotaView | null | undefined, currentImageCount: number): number {
  const current = Math.max(1, Math.floor(Number(currentImageCount) || 1));
  const remaining = getFreeImageQuotaRemainingImages(status);
  if (remaining <= 0) return 0;
  return Math.min(current, remaining);
}

export function canUseFreeImageQuotaForSelection(
  status: FreeImageQuotaView | null | undefined,
  imageCount: number,
  tierKey?: string,
  mode?: string,
  model?: FreeImageQuotaModelIdentity | null,
): boolean {
  const normalized = normalizeFreeImageQuotaStatus(status);
  if (!normalized.enabled || !normalized.eligible) return false;
  if (!isFreeImageQuotaGenerationModeSupported(mode)) return false;
  if (model !== undefined && !isGptImage2FreeQuotaModel(model)) return false;
  if (!isFreeImageQuotaTierAllowed(normalized, tierKey)) return false;
  const count = Math.max(1, Math.floor(Number(imageCount) || 1));
  return count <= getFreeImageQuotaRemainingImages(normalized);
}

export function buildFreeImageQuotaCostText(
  status: FreeImageQuotaView | null | undefined,
  imageCount: number,
  fallback: string,
  tierKey?: string,
  mode?: string,
  model?: FreeImageQuotaModelIdentity | null,
): string {
  if (!canUseFreeImageQuotaForSelection(status, imageCount, tierKey, mode, model)) return fallback;
  const normalized = normalizeFreeImageQuotaStatus(status);
  return `免费生成 · 今日剩余 ${Math.max(0, Math.floor(Number(normalized.dailyRemaining) || 0))} 张`;
}

export function shouldShowFreeImageQuotaTask(status: FreeImageQuotaView | null | undefined, hasActiveMembership = false): boolean {
  const normalized = normalizeFreeImageQuotaStatus(status);
  return Boolean(
    normalized.enabled
    && normalized.showInDailyTasks !== false
    && normalized.eligible
    && normalized.canUseFreeQuota !== false
    && !hasActiveMembership
    && isFreeImageQuotaTierAllowed(normalized)
    && getFreeImageQuotaRemainingImages(normalized) > 0
  );
}

function readFirst(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
    const nested = readNestedValue(source, key);
    if (nested !== undefined && nested !== null && nested !== '') return nested;
  }
  return undefined;
}

function readNestedValue(source: Record<string, unknown>, key: string) {
  if (!key.includes('.')) return undefined;
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[part];
  }, source);
}

function readQuotaNumber(source: Record<string, unknown>, keys: string[], fallback: number) {
  const value = readOptionalQuotaNumber(source, keys);
  return value === undefined ? fallback : value;
}

function readOptionalQuotaNumber(source: Record<string, unknown>, keys: string[]) {
  const value = readFirst(source, keys);
  if (value === undefined) return undefined;
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.max(0, number) : undefined;
}

function readQuotaBoolean(source: Record<string, unknown>, keys: string[], fallback: boolean) {
  const value = readFirst(source, keys);
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(text)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(text)) return false;
  return fallback;
}

function readTierKeys(source: Record<string, unknown>, keys: string[]) {
  const value = readFirst(source, keys);
  const list = Array.isArray(value)
    ? value
    : String(value || '').split(/[,，、\s]+/);
  const normalized = list.map((item) => String(item || '').trim()).filter(Boolean);
  return normalized.length ? normalized : DEFAULT_ALLOWED_TIER_KEYS;
}
