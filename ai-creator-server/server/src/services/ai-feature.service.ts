import axios from 'axios';
import { getConnection, query, queryOne } from '../utils/db';
import { SettingsService } from './settings.service';
import { getUserMembership } from './membership.service';
import { decryptApiKey } from './openai-adapter.service';
import { getModelCapabilitySet, hasAnyCapability } from './model-capability.service';
import { resolveSystemPromptByFeature } from './system-prompt.service';
import { ErrorCodes } from '../types';

export type TextFeatureKey = 'prompt_optimize' | 'script_generate' | 'prompt_generate' | 'storyboard_generate';

export interface TextFeatureConfig {
  featureKey: TextFeatureKey;
  enabled: boolean;
  modelId: number | null;
  pointsCost: number;
}

export interface TextFeatureModelSelection {
  tierKey?: string;
  tierId?: number;
}

interface TextModelBinding {
  id: number;
  name: string;
  displayName: string;
  modelType: string;
  apiModelName: string;
  upstreamModelCode: string;
  config: Record<string, any>;
  timeoutSeconds: number;
  providerId: number;
  providerName: string;
  providerKey: string;
  providerType: string;
  providerApiBaseUrl: string;
  providerApiKey: string;
}

export interface PromptOptimizeInput {
  userId: number;
  prompt: string;
  scene?: string;
  style?: string;
  ratio?: string;
  usage?: string;
  negativePrompt?: string;
  context?: Record<string, any>;
  tierKey?: string;
  tierId?: number;
}

export interface PromptOptimizeResult {
  optimizedPrompt: string;
  negativePrompt?: string;
  styleSuggestions: string[];
  charged: boolean;
  pointsCost: number;
}

const TEXT_FEATURE_CAPABILITIES: Record<TextFeatureKey, string[]> = {
  prompt_optimize: ['text_chat', 'text_generation', 'prompt_optimize'],
  script_generate: ['text_chat', 'script_generate'],
  prompt_generate: ['text_chat', 'prompt_generate'],
  storyboard_generate: ['text_chat', 'storyboard_generate'],
};

const TEXT_FEATURE_MODEL_CACHE_TTL_MS = 60_000;
const textFeatureModelCache = new Map<string, {
  value: { config: TextFeatureConfig; model: TextModelBinding };
  expiresAt: number;
}>();

const PROMPT_OPTIMIZE_CONTEXT_KEYS = [
  'feature',
  'mode',
  'scene',
  'brand',
  'sellingPoint',
  'style',
  'sizeMode',
  'ratio',
  'resolutionPreset',
  'resolution',
  'imageCount',
  'duration',
  'audioMode',
  'preserveAudio',
  'hasReferenceImage',
  'hasReferenceVideo',
  'hasReferenceAudio',
  'hasFirstFrame',
  'hasLastFrame',
  'hasSourceVideo',
  'editTool',
  'referenceMode',
  'tierName',
  'tierDescription',
] as const;

export async function getTextFeatureConfig(featureKey: TextFeatureKey): Promise<TextFeatureConfig> {
  const enabled = await SettingsService.getBoolean(featureConfigKey(featureKey, 'enabled'), false);
  const modelIdText = await SettingsService.getString(featureConfigKey(featureKey, 'model_id'), '');
  const pointsCostText = await SettingsService.getString(featureConfigKey(featureKey, 'points_cost'), '0');
  const modelId = Number(modelIdText);
  const pointsCost = Math.max(0, Number.parseInt(pointsCostText || '0', 10) || 0);
  return {
    featureKey,
    enabled,
    modelId: Number.isFinite(modelId) && modelId > 0 ? modelId : null,
    pointsCost,
  };
}

export function featureConfigKey(featureKey: TextFeatureKey, field: 'enabled' | 'model_id' | 'points_cost'): string {
  return `ai.${featureKey}.${field}`;
}

export function clearTextFeatureModelCache(featureKey?: TextFeatureKey): void {
  if (featureKey) {
    for (const cacheKey of textFeatureModelCache.keys()) {
      if (cacheKey === featureKey || cacheKey.startsWith(`${featureKey}:`)) {
        textFeatureModelCache.delete(cacheKey);
      }
    }
    return;
  }
  textFeatureModelCache.clear();
}

export function normalizeTextFeatureModelSelection(selection?: { tierKey?: unknown; tierId?: unknown }): TextFeatureModelSelection {
  const tierKey = String(selection?.tierKey || '').trim();
  const tierIdValue = Number(selection?.tierId);
  return {
    ...(tierKey ? { tierKey } : {}),
    ...(Number.isInteger(tierIdValue) && tierIdValue > 0 ? { tierId: tierIdValue } : {}),
  };
}

function textFeatureModelCacheKey(featureKey: TextFeatureKey, selection: TextFeatureModelSelection): string {
  if (selection.tierId) return `${featureKey}:tier-id:${selection.tierId}`;
  if (selection.tierKey) return `${featureKey}:tier-key:${selection.tierKey}`;
  return featureKey;
}

function hasTextFeatureModelSelection(selection: TextFeatureModelSelection): boolean {
  return Boolean(selection.tierId || selection.tierKey);
}

export async function resolveTextFeatureModel(
  featureKey: TextFeatureKey,
  requestedSelection?: TextFeatureModelSelection,
): Promise<{ config: TextFeatureConfig; model: TextModelBinding }> {
  const selection = normalizeTextFeatureModelSelection(requestedSelection);
  const cacheKey = textFeatureModelCacheKey(featureKey, selection);
  const cached = textFeatureModelCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const config = await getTextFeatureConfig(featureKey);
  if (!config.enabled) throw featureError(`${featureLabel(featureKey)}未启用，请先在后台开启。`);

  let model = await resolveBoundTextFeatureModel(featureKey, selection);
  if (!model && !hasTextFeatureModelSelection(selection)) {
    model = await resolveLegacyTextFeatureModel(featureKey, config.modelId);
  }
  if (!model) {
    if (hasTextFeatureModelSelection(selection)) {
      throw featureError(`${featureLabel(featureKey)}指定的功能档位未绑定可用文本模型，请检查主模型、备用模型和供应商配置。`);
    }
    throw featureError(`${featureLabel(featureKey)}未绑定可用文本模型，请先在功能页配置中绑定模型。`);
  }

  const resolved = { config, model };
  textFeatureModelCache.set(cacheKey, { value: resolved, expiresAt: Date.now() + TEXT_FEATURE_MODEL_CACHE_TTL_MS });
  return resolved;
}

async function resolveBoundTextFeatureModel(
  featureKey: TextFeatureKey,
  selection: TextFeatureModelSelection,
): Promise<TextModelBinding | null> {
  const params: Array<string | number> = [featureKey];
  let selectionSql = '';
  if (selection.tierId) {
    selectionSql = 'AND t.id = ?';
    params.push(selection.tierId);
  } else if (selection.tierKey) {
    selectionSql = 'AND t.tier_key = ?';
    params.push(selection.tierKey);
  }
  const rows = await query<any>(
    `SELECT m.id, m.name, m.display_name, m.model_type, m.api_model_name, m.upstream_model_code,
            m.config, m.timeout_seconds, p.id AS provider_id, p.name AS provider_name, p.provider_key, p.provider_type,
            p.api_base_url AS provider_api_base_url, p.api_key AS provider_api_key,
            b.binding_type, b.fallback_order
       FROM model_features f
       JOIN model_tiers t ON t.feature_id = f.id AND t.status = 'active'
       JOIN tier_model_bindings b ON b.tier_id = t.id
       JOIN ai_models m ON m.id = b.model_id AND m.status = 'active' AND m.deleted_at IS NULL
       JOIN ai_model_providers p ON p.id = m.provider_id AND p.status = 'active' AND p.deleted_at IS NULL
      WHERE f.feature_key = ? AND f.status = 'active'
        ${selectionSql}
        AND COALESCE(p.api_base_url, '') <> ''
        AND COALESCE(p.api_key, '') <> ''
      ORDER BY t.is_default DESC, t.sort_order, t.id,
               CASE b.binding_type WHEN 'primary' THEN 0 ELSE 1 END, b.fallback_order`,
    params,
  );

  for (const row of rows) {
    const binding = mapTextModelBinding(row);
    if (!['text', 'multimodal'].includes(binding.modelType)) continue;
    const capabilitySet = await getModelCapabilitySet(binding.id);
    if (!hasAnyCapability(capabilitySet.capabilities, TEXT_FEATURE_CAPABILITIES[featureKey])) continue;
    if (!binding.providerApiBaseUrl || !binding.providerApiKey) continue;
    if (!binding.apiModelName && !binding.upstreamModelCode) continue;
    return binding;
  }
  return null;
}

async function resolveLegacyTextFeatureModel(featureKey: TextFeatureKey, modelId: number | null): Promise<TextModelBinding | null> {
  if (!modelId) return null;
  const row = await queryOne<any>(
    `SELECT m.id, m.name, m.display_name, m.model_type, m.api_model_name, m.upstream_model_code,
            m.config, m.timeout_seconds, p.id AS provider_id, p.name AS provider_name, p.provider_key, p.provider_type,
            p.api_base_url AS provider_api_base_url, p.api_key AS provider_api_key
       FROM ai_models m
       JOIN ai_model_providers p ON p.id = m.provider_id
      WHERE m.id = ? AND m.status = 'active' AND p.status = 'active'
      LIMIT 1`,
    [modelId],
  );
  if (!row) return null;

  const binding = mapTextModelBinding(row);
  if (!['text', 'multimodal'].includes(binding.modelType)) {
    throw featureError(`${featureLabel(featureKey)}绑定的不是文本模型，请在后台选择 text 或 multimodal 类型模型。`);
  }
  const capabilitySet = await getModelCapabilitySet(binding.id);
  if (!hasAnyCapability(capabilitySet.capabilities, TEXT_FEATURE_CAPABILITIES[featureKey])) {
    throw featureError(`${featureLabel(featureKey)}绑定的模型缺少文本能力，请勾选 text_chat 或对应功能能力。`);
  }
  if (!binding.providerApiBaseUrl) throw featureError(`${binding.providerName} 缺少 API Base URL，请先在后台配置供应商。`);
  if (!binding.providerApiKey) throw featureError(`${binding.providerName} 缺少 API Key，请先在后台配置密钥。`);
  if (!binding.apiModelName && !binding.upstreamModelCode) {
    throw featureError(`${binding.displayName} 缺少真实模型名，请先填写模型调用 code。`);
  }
  return binding;
}

function mapTextModelBinding(model: any): TextModelBinding {
  return {
    id: Number(model.id),
    name: model.name || '',
    displayName: model.display_name || model.name || '',
    modelType: model.model_type || '',
    apiModelName: model.api_model_name || '',
    upstreamModelCode: model.upstream_model_code || '',
    config: parseJsonObjectOrEmpty(model.config),
    timeoutSeconds: Number(model.timeout_seconds || 120),
    providerId: Number(model.provider_id),
    providerName: model.provider_name || '',
    providerKey: model.provider_key || '',
    providerType: model.provider_type || '',
    providerApiBaseUrl: model.provider_api_base_url || '',
    providerApiKey: decryptApiKey(model.provider_api_key || ''),
  };
}

export async function optimizePrompt(input: PromptOptimizeInput): Promise<PromptOptimizeResult> {
  const originalPrompt = String(input.prompt || '').trim();
  if (!originalPrompt) throw featureError('提示词不能为空。');

  const membership = await getUserMembership(input.userId);
  const isMember = membership.membershipLevel !== 'free' && !membership.isExpired;
  const memberOnly = await SettingsService.getBoolean('membership.prompt_optimize_member_only', false);
  if (memberOnly && !isMember) {
    throw Object.assign(new Error('智能优化为会员专属功能，请开通会员后使用。'), { code: ErrorCodes.MEMBERSHIP_REQUIRED });
  }
  const { config, model } = await resolveTextFeatureModel('prompt_optimize', {
    tierKey: input.tierKey,
    tierId: input.tierId,
  });
  const shouldCharge = !isMember && config.pointsCost > 0;
  const refId = createRefId('PROMPT_OPT');
  let charged = false;

  try {
    if (shouldCharge) {
      await chargePromptPoints(input.userId, config.pointsCost, refId);
      charged = true;
    }

    const systemPrompt = await buildPromptOptimizeSystemPrompt();
    const userPrompt = buildPromptOptimizeModelInput(originalPrompt, input);
    const content = await callTextModel(model, systemPrompt, userPrompt);
    const parsed = parsePromptOptimizeResponse(content, originalPrompt);

    return {
      ...parsed,
      charged,
      pointsCost: charged ? config.pointsCost : 0,
    };
  } catch (err: any) {
    if (charged) {
      try {
        await refundPromptPoints(input.userId, config.pointsCost, refId, '智能优化失败退还积分');
      } catch (refundErr: any) {
        throw featureError(`智能优化失败，且积分退款失败，请联系管理员：${refundErr.message || refundErr}`);
      }
    }
    throw featureError(readableModelError(err));
  }
}

export function buildDefaultPromptOptimizeSystemPrompt(): string {
  return [
    '你是一个面向 AI 生图和生视频的智能提示词深度补全引擎。',
    '目标：把用户的短提示词补全为可直接生成的完整提示词，而不是只做同义改写或增加十几个字。',
    '必须保留用户原始主体、动作、风格、限制和真实意图；不要把主题改成另一个方向。',
    '补全要完整但克制，优先补齐必要生成要素，避免堆砌无关形容词。',
    '通用补全维度：主体细节、环境背景、构图镜头、光影色彩、材质质感、氛围、质量要求。',
    '生图场景：强调画面构图、镜头焦段、视觉风格、细节密度、清晰度。',
    '生视频场景：强调主体动作、镜头运动、时间节奏、画面连续性、时长适配。',
    '图生图、图片编辑、图生视频和视频编辑场景：保持参考素材主体一致，只补充需要变化或增强的部分。',
    '不要添加敏感、侵权、真实人物仿冒、违法或与原输入冲突的内容。',
    '请严格返回 JSON，不要返回 Markdown。',
    'JSON 字段必须包含 optimized_prompt，可选 negative_prompt、style_suggestions。',
  ].join('\n');
}

async function buildPromptOptimizeSystemPrompt(): Promise<string> {
  const configuredPrompt = await resolveSystemPromptByFeature('prompt_optimize');
  return [buildDefaultPromptOptimizeSystemPrompt(), configuredPrompt].filter(Boolean).join('\n\n');
}

export function buildPromptOptimizeModelInput(originalPrompt: string, input: PromptOptimizeInput): string {
  return JSON.stringify({
    original_prompt: originalPrompt,
    scene: input.scene || 'image_create',
    style: input.style || '',
    ratio: input.ratio || '',
    usage: input.usage || 'deep_completion',
    negative_prompt: input.negativePrompt || '',
    context: normalizePromptOptimizeContext(input.context),
  }, null, 2);
}

export function normalizePromptOptimizeContext(context?: Record<string, any>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  if (!context || typeof context !== 'object' || Array.isArray(context)) return normalized;

  for (const key of PROMPT_OPTIMIZE_CONTEXT_KEYS) {
    const value = context[key];
    if (value !== undefined && value !== null && value !== '') {
      normalized[key] = value;
    }
  }

  Object.assign(normalized, summarizePromptOptimizeAssets(context.inputAssets));
  return normalized;
}

function summarizePromptOptimizeAssets(inputAssets: any): Record<string, unknown> {
  if (!Array.isArray(inputAssets) || inputAssets.length === 0) return {};

  let referenceImageCount = 0;
  let referenceVideoCount = 0;
  let referenceAudioCount = 0;
  for (const asset of inputAssets) {
    const type = String(asset?.mediaType || asset?.type || asset?.kind || asset?.mimeType || '').toLowerCase();
    if (type.includes('image')) referenceImageCount += 1;
    if (type.includes('video')) referenceVideoCount += 1;
    if (type.includes('audio')) referenceAudioCount += 1;
  }

  const summary: Record<string, unknown> = {};
  if (referenceImageCount > 0) {
    summary.hasReferenceImage = true;
    summary.referenceImageCount = referenceImageCount;
  }
  if (referenceVideoCount > 0) {
    summary.hasReferenceVideo = true;
    summary.referenceVideoCount = referenceVideoCount;
  }
  if (referenceAudioCount > 0) {
    summary.hasReferenceAudio = true;
    summary.referenceAudioCount = referenceAudioCount;
  }
  return summary;
}

async function callTextModel(model: TextModelBinding, systemPrompt: string, userPrompt: string): Promise<string> {
  const url = resolveChatCompletionUrl(model.providerApiBaseUrl, model.providerType);
  const modelCode = model.upstreamModelCode || model.apiModelName || model.name;
  const defaultParams = parseJsonObjectOrEmpty(model.config?.default_params || model.config?.defaultParams);
  const body: Record<string, any> = {
    model: modelCode,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: numericOrDefault(defaultParams.temperature, 0.6),
    stream: false,
  };
  copyDefined(body, 'max_tokens', defaultParams.max_tokens ?? defaultParams.maxTokens ?? 700);
  copyDefined(body, 'top_p', defaultParams.top_p ?? defaultParams.topP);
  copyDefined(body, 'response_format', defaultParams.response_format ?? defaultParams.responseFormat);
  const response = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${model.providerApiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: (model.timeoutSeconds || 120) * 1000,
  });

  const data = response.data || {};
  const content = data.choices?.[0]?.message?.content
    || data.choices?.[0]?.text
    || data.output_text
    || data.output?.[0]?.content?.[0]?.text
    || '';
  if (!content) throw new Error('文本模型未返回内容。');
  return String(content).trim();
}

function resolveChatCompletionUrl(baseUrl: string, providerType: string): string {
  const base = String(baseUrl || '').replace(/\/$/, '');
  if (/\/chat\/completions$/i.test(base)) return base;
  if (providerType === 'xiaoma' && !/\/v1$/i.test(base)) {
    return `${base}/v1/chat/completions`;
  }
  if (providerType === 'dashscope' && !/compatible-mode\/v1$/i.test(base)) {
    return `${base}/compatible-mode/v1/chat/completions`;
  }
  return `${base}/chat/completions`;
}

function parsePromptOptimizeResponse(content: string, originalPrompt: string): Pick<PromptOptimizeResult, 'optimizedPrompt' | 'negativePrompt' | 'styleSuggestions'> {
  const parsed = parseJsonObject(content);
  if (!parsed) {
    return { optimizedPrompt: content.trim() || originalPrompt, styleSuggestions: [] };
  }
  const styleSuggestions = Array.isArray(parsed.style_suggestions)
    ? parsed.style_suggestions.map((item: any) => String(item)).filter(Boolean)
    : parsed.style_suggestions
      ? [String(parsed.style_suggestions)]
      : [];
  return {
    optimizedPrompt: String(parsed.optimized_prompt || parsed.optimizedPrompt || parsed.prompt || content || originalPrompt).trim(),
    negativePrompt: parsed.negative_prompt || parsed.negativePrompt ? String(parsed.negative_prompt || parsed.negativePrompt).trim() : undefined,
    styleSuggestions,
  };
}

function parseJsonObject(content: string): any | null {
  const text = content.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
    }
    return null;
  }
}

function parseJsonObjectOrEmpty(value: any): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function numericOrDefault(value: any, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function copyDefined(target: Record<string, any>, key: string, value: any): void {
  if (value !== undefined && value !== null && value !== '') target[key] = value;
}

async function chargePromptPoints(userId: number, amount: number, refId: string) {
  if (amount <= 0) return;
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT balance, frozen_balance, version FROM point_accounts WHERE user_id = ? FOR UPDATE', [userId]) as any;
    const account = rows?.[0];
    if (!account) throw Object.assign(new Error('积分账户不存在'), { code: 1005 });
    if (account.balance < amount) throw Object.assign(new Error('积分不足，无法使用智能优化。'), { code: 1002 });
    const balanceAfter = account.balance - amount;
    await conn.execute(
      `UPDATE point_accounts
          SET balance = ?, total_spent = total_spent + ?, version = version + 1, updated_at = NOW(3)
        WHERE user_id = ? AND version = ?`,
      [balanceAfter, amount, userId, account.version],
    );
    await conn.execute(
      `INSERT INTO point_logs
       (user_id, type, amount, balance_before, balance_after, frozen_before, frozen_after, source, ref_type, ref_id, title, created_at)
       VALUES (?, 'spend', ?, ?, ?, ?, ?, 'ai_prompt_optimize', 'prompt_optimize_spend', ?, '智能优化消耗积分', NOW(3))`,
      [userId, -amount, account.balance, balanceAfter, account.frozen_balance || 0, account.frozen_balance || 0, refId],
    );
    await conn.execute('UPDATE user_assets SET points_balance = ?, updated_at = NOW(3) WHERE user_id = ?', [balanceAfter, userId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function refundPromptPoints(userId: number, amount: number, refId: string, title: string) {
  if (amount <= 0) return;
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT balance, frozen_balance, version FROM point_accounts WHERE user_id = ? FOR UPDATE', [userId]) as any;
    const account = rows?.[0];
    if (!account) throw Object.assign(new Error('积分账户不存在'), { code: 1005 });
    const balanceAfter = account.balance + amount;
    await conn.execute(
      `UPDATE point_accounts
          SET balance = ?, total_refunded = total_refunded + ?, version = version + 1, updated_at = NOW(3)
        WHERE user_id = ? AND version = ?`,
      [balanceAfter, amount, userId, account.version],
    );
    await conn.execute(
      `INSERT INTO point_logs
       (user_id, type, amount, balance_before, balance_after, frozen_before, frozen_after, source, ref_type, ref_id, title, created_at)
       VALUES (?, 'refund', ?, ?, ?, ?, ?, 'ai_prompt_optimize', 'prompt_optimize_refund', ?, ?, NOW(3))`,
      [userId, amount, account.balance, balanceAfter, account.frozen_balance || 0, account.frozen_balance || 0, refId, title],
    );
    await conn.execute('UPDATE user_assets SET points_balance = ?, updated_at = NOW(3) WHERE user_id = ?', [balanceAfter, userId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function createRefId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function featureLabel(featureKey: TextFeatureKey): string {
  const labels: Record<TextFeatureKey, string> = {
    prompt_optimize: '智能优化',
    script_generate: '脚本生成',
    prompt_generate: '提示词生成',
    storyboard_generate: '分镜生成',
  };
  return labels[featureKey];
}

function readableModelError(err: any): string {
  const message = String(err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || err || '智能优化失败').trim();
  return message.replace(/(api[_-]?key|token|secret|password)["'=:\s]+[^,\s}]+/ig, '$1=[filtered]').slice(0, 500);
}

function featureError(message: string) {
  return Object.assign(new Error(message), { code: 4000 });
}

// ====== 脚本生成 ======

export interface ScriptGenerateInput {
  userId: number;
  topic: string;
  style?: string;
  duration?: number;
  characters?: string;
}

export interface ScriptGenerateResult {
  title: string;
  scenes: { number: number; description: string; dialogue: string; duration: number; camera: string }[];
  charged: boolean;
  pointsCost: number;
}

export async function generateScript(input: ScriptGenerateInput): Promise<ScriptGenerateResult> {
  const topic = String(input.topic || '').trim();
  if (!topic) throw featureError('请提供脚本主题。');

  const { config, model } = await resolveTextFeatureModel('script_generate');
  const membership = await getUserMembership(input.userId);
  const isMember = membership.membershipLevel !== 'free' && !membership.isExpired;
  const shouldCharge = !isMember && config.pointsCost > 0;
  const refId = createRefId('SCRIPT');
  let charged = false;

  try {
    if (shouldCharge) {
      await chargePromptPoints(input.userId, config.pointsCost, refId);
      charged = true;
    }

    const systemPrompt = buildFeatureSystemPrompt([
      '你是一个视频脚本创作引擎。',
      '根据用户提供的主题和信息，生成完整的视频脚本。',
      '每个场景包含：镜头编号、画面描述、台词、时长（秒）、运镜方式。',
      '严格返回 JSON，不要返回 Markdown。',
    ]);
    const userPrompt = JSON.stringify({
      topic,
      style: input.style || '',
      duration: input.duration || 60,
      characters: input.characters || '',
    }, null, 2);
    const content = await callTextModel(model, systemPrompt, userPrompt);
    const parsed = parseScriptResponse(content);

    return { ...parsed, charged, pointsCost: charged ? config.pointsCost : 0 };
  } catch (err: any) {
    if (charged) {
      try {
        await refundPromptPoints(input.userId, config.pointsCost, refId, '脚本生成失败退还积分');
      } catch (refundErr: any) {
        throw featureError(`脚本生成失败，且积分退款失败，请联系管理员：${refundErr.message || refundErr}`);
      }
    }
    throw featureError(readableModelError(err));
  }
}

function parseScriptResponse(content: string): Pick<ScriptGenerateResult, 'title' | 'scenes'> {
  const parsed = parseJsonObject(content);
  if (!parsed) {
    return { title: '', scenes: [{ number: 1, description: content.trim(), dialogue: '', duration: 10, camera: '固定' }] };
  }
  const scenes = Array.isArray(parsed.scenes)
    ? parsed.scenes.map((s: any, i: number) => ({
        number: s.number || s.scene_number || i + 1,
        description: String(s.description || s.scene_description || s.visual || '').trim(),
        dialogue: String(s.dialogue || s.lines || '').trim(),
        duration: Number(s.duration || s.duration_seconds || 10),
        camera: String(s.camera || s.camera_movement || '固定').trim(),
      }))
    : [];
  return {
    title: String(parsed.title || '').trim(),
    scenes,
  };
}

// ====== 提示词生成 ======

export interface PromptGenerateInput {
  userId: number;
  idea: string;
  scene?: string;
  style?: string;
  count?: number;
}

export interface PromptGenerateResult {
  prompts: string[];
  charged: boolean;
  pointsCost: number;
}

export async function generatePrompt(input: PromptGenerateInput): Promise<PromptGenerateResult> {
  const idea = String(input.idea || '').trim();
  if (!idea) throw featureError('请提供创意想法。');

  const { config, model } = await resolveTextFeatureModel('prompt_generate');
  const membership = await getUserMembership(input.userId);
  const isMember = membership.membershipLevel !== 'free' && !membership.isExpired;
  const shouldCharge = !isMember && config.pointsCost > 0;
  const refId = createRefId('PROMPT_GEN');
  let charged = false;

  try {
    if (shouldCharge) {
      await chargePromptPoints(input.userId, config.pointsCost, refId);
      charged = true;
    }

    const systemPrompt = buildFeatureSystemPrompt([
      '你是一个创意提示词生成引擎。',
      '根据用户的想法发散出高质量的 AI 生图/生视频提示词。',
      '提示词应包含主体描述、风格、光影、构图、氛围等要素，每条不超过 200 字。',
      `严格返回 JSON，格式为 {"prompts": ["提示词1", "提示词2", ...]}，不要返回 Markdown。`,
    ]);
    const count = Math.min(Math.max(input.count || 3, 1), 10);
    const userPrompt = JSON.stringify({
      idea,
      scene: input.scene || 'image_create',
      style: input.style || '',
      count,
    }, null, 2);
    const content = await callTextModel(model, systemPrompt, userPrompt);
    const parsed = parsePromptGenerateResponse(content);

    return { ...parsed, charged, pointsCost: charged ? config.pointsCost : 0 };
  } catch (err: any) {
    if (charged) {
      try {
        await refundPromptPoints(input.userId, config.pointsCost, refId, '提示词生成失败退还积分');
      } catch (refundErr: any) {
        throw featureError(`提示词生成失败，且积分退款失败，请联系管理员：${refundErr.message || refundErr}`);
      }
    }
    throw featureError(readableModelError(err));
  }
}

function parsePromptGenerateResponse(content: string): Pick<PromptGenerateResult, 'prompts'> {
  const parsed = parseJsonObject(content);
  if (!parsed) {
    return { prompts: content.split(/\n{2,}/).filter(Boolean).map(s => s.trim()).slice(0, 10) };
  }
  const prompts = Array.isArray(parsed.prompts)
    ? parsed.prompts.map((p: any) => String(p).trim()).filter(Boolean).slice(0, 10)
    : [];
  return { prompts: prompts.length > 0 ? prompts : [content.trim()] };
}

// ====== 分镜生成 ======

export interface StoryboardInput {
  userId: number;
  script: string;
  style?: string;
  ratio?: string;
}

export interface StoryboardResult {
  storyboards: {
    number: number;
    description: string;
    shotType: string;
    cameraMovement: string;
    lighting: string;
    colorPalette: string;
  }[];
  charged: boolean;
  pointsCost: number;
}

export async function generateStoryboard(input: StoryboardInput): Promise<StoryboardResult> {
  const script = String(input.script || '').trim();
  if (!script) throw featureError('请提供脚本内容。');

  const { config, model } = await resolveTextFeatureModel('storyboard_generate');
  const membership = await getUserMembership(input.userId);
  const isMember = membership.membershipLevel !== 'free' && !membership.isExpired;
  const shouldCharge = !isMember && config.pointsCost > 0;
  const refId = createRefId('STORYBOARD');
  let charged = false;

  try {
    if (shouldCharge) {
      await chargePromptPoints(input.userId, config.pointsCost, refId);
      charged = true;
    }

    const systemPrompt = buildFeatureSystemPrompt([
      '你是一个分镜生成引擎。',
      '根据视频脚本为每个场景生成详细的分镜描述。',
      '每个分镜包含：编号、画面描述、镜头类型（特写/中景/远景等）、运镜方式、光影描述、色彩基调。',
      '严格返回 JSON，不要返回 Markdown。',
    ]);
    const userPrompt = JSON.stringify({
      script,
      style: input.style || '',
      ratio: input.ratio || '16:9',
    }, null, 2);
    const content = await callTextModel(model, systemPrompt, userPrompt);
    const parsed = parseStoryboardResponse(content);

    return { ...parsed, charged, pointsCost: charged ? config.pointsCost : 0 };
  } catch (err: any) {
    if (charged) {
      try {
        await refundPromptPoints(input.userId, config.pointsCost, refId, '分镜生成失败退还积分');
      } catch (refundErr: any) {
        throw featureError(`分镜生成失败，且积分退款失败，请联系管理员：${refundErr.message || refundErr}`);
      }
    }
    throw featureError(readableModelError(err));
  }
}

function parseStoryboardResponse(content: string): Pick<StoryboardResult, 'storyboards'> {
  const parsed = parseJsonObject(content);
  if (!parsed) {
    return { storyboards: [{ number: 1, description: content.trim(), shotType: '中景', cameraMovement: '固定', lighting: '自然光', colorPalette: '暖色调' }] };
  }
  const items = Array.isArray(parsed.storyboards)
    ? parsed.storyboards
    : Array.isArray(parsed.shots)
      ? parsed.shots
      : [];
  const storyboards = items.map((s: any, i: number) => ({
    number: s.number || s.shot_number || i + 1,
    description: String(s.description || s.scene_description || '').trim(),
    shotType: String(s.shot_type || s.shotType || '中景').trim(),
    cameraMovement: String(s.camera_movement || s.cameraMovement || '固定').trim(),
    lighting: String(s.lighting || '自然光').trim(),
    colorPalette: String(s.color_palette || s.colorPalette || '暖色调').trim(),
  }));
  return { storyboards };
}

function buildFeatureSystemPrompt(lines: string[]): string {
  // Custom system prompts are deliberately scoped to prompt optimization.
  // Other text features keep their built-in instructions and do not read the
  // admin-managed system_prompts table.
  return lines.filter(Boolean).join('\n\n');
}

/**
 * 启动时恢复：查找超过 5 分钟的孤立文字功能扣费（已扣费但无退款记录），自动退款。
 * 这些扣费发生在 AI 调用之前，如果服务器在扣费后、AI 调用前崩溃，积分会丢失。
 */
export async function recoverOrphanedTextCharges(): Promise<{ refunded: number; failed: number }> {
  // 查找超过 5 分钟的文字功能扣费，且没有对应退款记录
  const orphaned = await query<{ id: number; user_id: number; amount: number; ref_id: string }>(
    `SELECT pl.id, pl.user_id, ABS(pl.amount) AS amount, pl.ref_id
       FROM point_logs pl
      WHERE pl.source = 'ai_prompt_optimize'
        AND pl.type = 'spend'
        AND pl.created_at < DATE_SUB(NOW(3), INTERVAL 5 MINUTE)
        AND NOT EXISTS (
          SELECT 1 FROM point_logs r
           WHERE r.source = 'ai_prompt_optimize'
             AND r.type = 'refund'
             AND r.ref_id = pl.ref_id
        )`,
  );

  let refunded = 0;
  let failed = 0;
  for (const row of orphaned) {
    try {
      await refundPromptPoints(row.user_id, row.amount, row.ref_id, '系统恢复：孤立扣费自动退还');
      refunded++;
    } catch (err: any) {
      failed++;
      console.error(`[TextChargeRecovery] ref_id=${row.ref_id} 退款失败:`, err?.message || err);
    }
  }
  if (refunded > 0 || failed > 0) {
    console.log(`[TextChargeRecovery] 启动恢复完成: ${refunded} 笔退款成功, ${failed} 笔失败`);
  }
  return { refunded, failed };
}
