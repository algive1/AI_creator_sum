import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { getConnection, query, queryOne } from '../utils/db';
import { ErrorCodes } from '../types';
import { SettingsService } from './settings.service';
import { getUserMembership } from './membership.service';
import { applyPointChangeTx, lockPointAccountTx } from './points.service';
import { StorageService } from './storage/storage.service';
import { resolveLocalFilePath } from './storage/local-paths';
import { genFileNo } from './storage/adapter.interface';
import { publicRequestBaseUrl } from '../utils/public-base-url';
import { decryptApiKey } from './openai-adapter.service';
import { createTextWatermarkSvg, DEFAULT_WATERMARK_TEXT } from './image-postprocess.service';
import { getModelCapabilitySet, hasAnyCapability } from './model-capability.service';

export type ToolKey =
  | 'prompt_reverse'
  | 'grid_cut'
  | 'image_compress'
  | 'watermark'
  | 'compare'
  | 'cutout'
  | 'resize'
  | 'phone_frame';

export interface ToolDefinition {
  key: ToolKey;
  title: string;
  description: string;
  icon: string;
  category: 'ai' | 'image';
}

export interface ToolConfigItem extends ToolDefinition {
  enabled: boolean;
  memberDailyQuota: number;
  guestDailyQuota: number;
  adUnlockEnabled: boolean;
  pointsEnabled: boolean;
  pointsCost: number;
  message: string;
  featureKey?: string;
  modelBound?: boolean;
}

interface ToolModelBinding {
  id: number;
  tierId: number;
  tierKey: string;
  name: string;
  displayName: string;
  modelType: string;
  apiModelName: string;
  upstreamModelCode: string;
  timeoutSeconds: number;
  providerName: string;
  providerType: string;
  providerApiBaseUrl: string;
  providerApiKey: string;
}

export interface ToolModelSelection {
  tierKey?: string;
  tierId?: number;
}

export interface ToolProcessInput {
  userId: number;
  toolKey: ToolKey;
  fileIds?: number[];
  params?: Record<string, any>;
  tierKey?: string;
  tierId?: number;
  requestBaseUrl: string;
}

export interface ToolOutputFile {
  fileId: number;
  fileNo: string;
  url: string;
  width: number;
  height: number;
  mimeType: string;
  fileSize: number;
}

const AD_SESSION_EXPIRE_MINUTES = 30;
const MAX_SOURCE_BYTES = positiveInt(process.env.TOOLS_MAX_SOURCE_BYTES, 15 * 1024 * 1024);
const MAX_DIMENSION = positiveInt(process.env.TOOLS_MAX_DIMENSION, 4096);
const TOOLS_VISIBLE_KEYS_CONFIG = 'tools.visible_keys';
const TOOL_DEFINITIONS: ToolDefinition[] = [
  { key: 'prompt_reverse', title: '反推提示词', description: '上传图片，生成可复用提示词', icon: 'quote', category: 'ai' },
  { key: 'grid_cut', title: '九宫格切图', description: '把图片裁成朋友圈九宫格', icon: 'grid', category: 'image' },
  { key: 'image_compress', title: '图片压缩', description: '压缩体积，保留清晰度', icon: 'compress', category: 'image' },
  { key: 'watermark', title: '图片加水印', description: '添加文字水印保护素材', icon: 'stamp', category: 'image' },
  { key: 'compare', title: '双图对比', description: '生成左右对比展示图', icon: 'compare', category: 'image' },
  { key: 'cutout', title: '智能抠图', description: '快速移除简单背景', icon: 'cutout', category: 'ai' },
  { key: 'resize', title: '尺寸调整', description: '按比例或像素改图', icon: 'resize', category: 'image' },
  { key: 'phone_frame', title: '截图加手机壳', description: '展示在 iPhone 17 Pro Max 正面屏幕', icon: 'phone', category: 'image' },
];

export function getToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS.map(item => ({ ...item }));
}

export function isToolKey(value: unknown): value is ToolKey {
  return TOOL_DEFINITIONS.some(item => item.key === value);
}

const DEFAULT_VISIBLE_TOOL_KEYS = TOOL_DEFINITIONS.map(item => item.key);
export type ToolsSettingsSnapshot = Record<string, string>;

export async function loadToolsSettingsSnapshot(): Promise<ToolsSettingsSnapshot> {
  const group = await SettingsService.getGroup('tools');
  const snapshot: ToolsSettingsSnapshot = {};
  for (const [key, item] of Object.entries(group)) {
    const value = (item as { value?: unknown })?.value;
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      snapshot[key] = String(value);
    }
  }
  return snapshot;
}

function snapshotString(settings: ToolsSettingsSnapshot, key: string, defaultValue = ''): string {
  const value = settings[key];
  if (value === undefined || value === null || String(value).trim() === '') return defaultValue;
  return String(value);
}

function snapshotBoolean(settings: ToolsSettingsSnapshot, key: string, defaultValue: boolean): boolean {
  const value = snapshotString(settings, key, defaultValue ? 'true' : 'false').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return defaultValue;
}

function uniqueToolKeys(values: unknown): ToolKey[] {
  if (!Array.isArray(values)) return [];
  const result: ToolKey[] = [];
  for (const value of values) {
    if (isToolKey(value) && !result.includes(value)) result.push(value);
  }
  return result;
}

export async function getVisibleToolKeys(settings?: ToolsSettingsSnapshot): Promise<ToolKey[]> {
  const raw = settings
    ? snapshotString(settings, TOOLS_VISIBLE_KEYS_CONFIG, '')
    : await SettingsService.getString(TOOLS_VISIBLE_KEYS_CONFIG, '');
  if (!raw) return [...DEFAULT_VISIBLE_TOOL_KEYS];
  try {
    return uniqueToolKeys(JSON.parse(raw));
  } catch {
    return [...DEFAULT_VISIBLE_TOOL_KEYS];
  }
}

export async function assertToolVisible(toolKey: ToolKey): Promise<void> {
  const visibleKeys = await getVisibleToolKeys();
  if (!visibleKeys.includes(toolKey)) {
    throw toolError('该工具已从工具箱移出，请在后台「微信配置 → 工具页配置」重新添加后使用');
  }
}

export async function getAdminToolsConfig(): Promise<{
  enabled: boolean;
  bannerAdUnitId: string;
  visibleKeys: ToolKey[];
  tools: ToolConfigItem[];
  hiddenTools: ToolConfigItem[];
}> {
  const settings = await loadToolsSettingsSnapshot();
  const enabled = snapshotBoolean(settings, 'tools.enabled', true);
  const bannerAdUnitId = snapshotString(settings, 'tools.banner_ad_unit_id', '');
  const visibleKeys = await getVisibleToolKeys(settings);
  const configs = await Promise.all(TOOL_DEFINITIONS.map(item => resolveToolConfig(item, settings)));
  const byKey = new Map(configs.map(item => [item.key, item]));
  return {
    enabled,
    bannerAdUnitId,
    visibleKeys,
    tools: visibleKeys.map(key => byKey.get(key)).filter(Boolean) as ToolConfigItem[],
    hiddenTools: configs.filter(item => !visibleKeys.includes(item.key)),
  };
}

export async function updateAdminToolsConfig(input: {
  enabled?: boolean;
  bannerAdUnitId?: unknown;
  visibleKeys?: unknown;
  tools?: Array<Partial<ToolConfigItem> & { key?: unknown }>;
}, adminUserId: number): Promise<{
  enabled: boolean;
  bannerAdUnitId: string;
  visibleKeys: ToolKey[];
  tools: ToolConfigItem[];
  hiddenTools: ToolConfigItem[];
}> {
  const values: Record<string, string> = {};
  if (input.enabled !== undefined) values['tools.enabled'] = String(Boolean(input.enabled));
  if (input.bannerAdUnitId !== undefined) values['tools.banner_ad_unit_id'] = String(input.bannerAdUnitId || '').trim();
  if (input.visibleKeys !== undefined) values[TOOLS_VISIBLE_KEYS_CONFIG] = JSON.stringify(uniqueToolKeys(input.visibleKeys));

  for (const item of input.tools || []) {
    if (!isToolKey(item.key)) continue;
    const prefix = `tools.${item.key}`;
    if (item.enabled !== undefined) values[`${prefix}.enabled`] = String(Boolean(item.enabled));
    if (item.memberDailyQuota !== undefined) values[`${prefix}.member_daily_quota`] = String(nonNegativeInt(item.memberDailyQuota));
    if (item.guestDailyQuota !== undefined) values[`${prefix}.guest_daily_quota`] = String(nonNegativeInt(item.guestDailyQuota));
    if (item.adUnlockEnabled !== undefined) values[`${prefix}.ad_unlock_enabled`] = String(Boolean(item.adUnlockEnabled));
    if (item.pointsEnabled !== undefined) values[`${prefix}.points_enabled`] = String(Boolean(item.pointsEnabled));
    if (item.pointsCost !== undefined) values[`${prefix}.points_cost`] = String(nonNegativeInt(item.pointsCost));
    if (item.message !== undefined) {
      const message = String(item.message || '').trim();
      values[`${prefix}.message`] = message || `${toolTitle(item.key)}功能维护中，请稍后再试`;
    }
  }

  if (Object.keys(values).length) await SettingsService.setGroup('tools', values, false, adminUserId);
  return getAdminToolsConfig();
}

export async function getToolsConfig(userId = 0, settings?: ToolsSettingsSnapshot): Promise<{
  enabled: boolean;
  tools: ToolConfigItem[];
  usage: Record<string, { usedToday: number; freeQuota: number; remainingFree: number; unlocked: boolean }>;
  adUnitId: string;
  bannerAdUnitId: string;
}> {
  const [toolsSettings, adUnitId] = await Promise.all([
    settings ? Promise.resolve(settings) : loadToolsSettingsSnapshot(),
    SettingsService.getString('ad.reward.ad_unit_id', ''),
  ]);
  const enabled = snapshotBoolean(toolsSettings, 'tools.enabled', true);
  const bannerAdUnitId = snapshotString(toolsSettings, 'tools.banner_ad_unit_id', '');
  const visibleKeys = await getVisibleToolKeys(toolsSettings);
  const definitionByKey = new Map(TOOL_DEFINITIONS.map(item => [item.key, item]));
  const visibleDefinitions = visibleKeys.map(key => definitionByKey.get(key)).filter(Boolean) as ToolDefinition[];
  const configs = await Promise.all(visibleDefinitions.map(item => resolveToolConfig(item, toolsSettings)));
  const membership = userId ? await getUserMembership(userId) : null;
  const isMember = Boolean(membership && membership.membershipLevel !== 'free' && !membership.isExpired);
  const usage: Record<string, { usedToday: number; freeQuota: number; remainingFree: number; unlocked: boolean }> = {};
  if (userId) {
    await Promise.all(configs.map(async (item) => {
      const usedToday = await countUsedToday(userId, item.key);
      const freeQuota = isMember ? item.memberDailyQuota : item.guestDailyQuota;
      usage[item.key] = {
        usedToday,
        freeQuota,
        remainingFree: Math.max(0, freeQuota - usedToday),
        unlocked: await hasAvailableAdUnlock(userId, item.key),
      };
    }));
  }
  return {
    enabled,
    tools: configs.filter(item => item.enabled),
    usage,
    adUnitId,
    bannerAdUnitId,
  };
}

export async function createToolAdSession(userId: number, toolKey: ToolKey): Promise<{ sessionId: string; adUnitId: string; expiresAt: string | null }> {
  await assertToolVisible(toolKey);
  const cfg = await resolveToolConfig(toolKey);
  if (!cfg.enabled) throw toolError(cfg.message || '工具维护中');
  if (!cfg.adUnlockEnabled) throw toolError('当前工具未开启广告解锁');
  const adUnitId = await SettingsService.getString('ad.reward.ad_unit_id', '');
  if (!adUnitId) throw toolError('请先在后台配置微信激励视频广告位');
  const sessionId = `tool_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const conn = await getConnection();
  try {
    await conn.execute(
      `INSERT INTO tool_ad_unlocks
       (user_id, tool_key, session_id, ad_date, status, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, CURDATE(), 'pending', DATE_ADD(NOW(3), INTERVAL ${AD_SESSION_EXPIRE_MINUTES} MINUTE), NOW(3), NOW(3))`,
      [userId, toolKey, sessionId],
    );
  } finally {
    conn.release();
  }
  const row = await queryOne<any>('SELECT expires_at FROM tool_ad_unlocks WHERE session_id = ?', [sessionId]);
  return { sessionId, adUnitId, expiresAt: row?.expires_at || null };
}

export async function claimToolAdUnlock(userId: number, toolKey: ToolKey, sessionId: string, completed: boolean): Promise<{ unlocked: boolean; status: string; message: string }> {
  await assertToolVisible(toolKey);
  if (!sessionId) throw toolError('缺少广告会话');
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      'SELECT id, status, expires_at FROM tool_ad_unlocks WHERE user_id = ? AND tool_key = ? AND session_id = ? FOR UPDATE',
      [userId, toolKey, sessionId],
    ) as any;
    const row = rows?.[0];
    if (!row) throw toolError('广告会话无效');
    if (row.status === 'claimed') {
      await conn.commit();
      return { unlocked: true, status: 'claimed', message: '已解锁' };
    }
    if (!completed) {
      await conn.execute("UPDATE tool_ad_unlocks SET status = 'cancelled', updated_at = NOW(3) WHERE id = ?", [row.id]);
      await conn.commit();
      return { unlocked: false, status: 'cancelled', message: '广告未完整观看' };
    }
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      await conn.execute("UPDATE tool_ad_unlocks SET status = 'expired', updated_at = NOW(3) WHERE id = ?", [row.id]);
      await conn.commit();
      return { unlocked: false, status: 'expired', message: '广告会话已过期' };
    }
    await conn.execute("UPDATE tool_ad_unlocks SET status = 'claimed', updated_at = NOW(3) WHERE id = ?", [row.id]);
    await conn.commit();
    return { unlocked: true, status: 'claimed', message: '已解锁一次使用' };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function processTool(input: ToolProcessInput): Promise<{ toolKey: ToolKey; outputs: ToolOutputFile[]; prompt?: string; usageSource: string; pointsCost: number }> {
  await assertToolVisible(input.toolKey);
  const cfg = await resolveToolConfig(input.toolKey);
  if (!cfg.enabled) throw toolError(cfg.message || '工具维护中');
  const access = await consumeAccess(input.userId, cfg);
  const params = input.params || {};
  let outputs: ToolOutputFile[] = [];
  let prompt = '';

  try {
    if (input.toolKey === 'prompt_reverse') {
      const file = await loadUserImage(input.userId, Number(input.fileIds?.[0] || 0), input.requestBaseUrl);
      const metadata = await sharp(file.buffer).metadata();
      prompt = await reversePromptWithModel(file, metadata, params, {
        tierKey: input.tierKey,
        tierId: input.tierId,
      });
    } else if (input.toolKey === 'grid_cut') {
      outputs = await processGridCut(input);
    } else if (input.toolKey === 'image_compress') {
      outputs = [await processCompress(input)];
    } else if (input.toolKey === 'watermark') {
      outputs = [await processWatermark(input)];
    } else if (input.toolKey === 'compare') {
      outputs = [await processCompare(input)];
    } else if (input.toolKey === 'cutout') {
      outputs = [await processCutout(input)];
    } else if (input.toolKey === 'resize') {
      outputs = [await processResize(input)];
    } else if (input.toolKey === 'phone_frame') {
      outputs = [await processPhoneFrame(input)];
    }
    await logUsage(input.userId, input.toolKey, access.usageSource, input.fileIds || [], outputs.map(item => item.fileId), { promptReturned: Boolean(prompt), pointsCost: access.pointsCost });
  } catch (err) {
    if (access.pointsCost > 0) {
      try {
        await refundToolPoints(input.userId, access.pointsCost, access.refId, `${cfg.title}处理失败退还积分`);
      } catch (refundErr: any) {
        throw toolError(`工具处理失败，且积分退款失败，请联系管理员：${refundErr?.message || refundErr}`);
      }
    }
    throw err;
  }

  return { toolKey: input.toolKey, outputs, prompt, usageSource: access.usageSource, pointsCost: access.pointsCost };
}

export function requestBaseUrlFrom(req: { protocol: string; get(name: string): string | undefined }): string {
  return publicRequestBaseUrl(req as any);
}

async function resolveToolConfig(input: ToolKey | ToolDefinition, settings?: ToolsSettingsSnapshot): Promise<ToolConfigItem> {
  const definition = typeof input === 'string' ? TOOL_DEFINITIONS.find(item => item.key === input) : input;
  if (!definition) throw toolError('未知工具');
  const snapshot = settings || await loadToolsSettingsSnapshot();
  const prefix = `tools.${definition.key}`;
  const enabled = snapshotBoolean(snapshot, `${prefix}.enabled`, true);
  const memberDailyQuota = snapshotString(snapshot, `${prefix}.member_daily_quota`, defaultMemberQuota(definition.key));
  const guestDailyQuota = snapshotString(snapshot, `${prefix}.guest_daily_quota`, '0');
  const adUnlockEnabled = snapshotBoolean(snapshot, `${prefix}.ad_unlock_enabled`, true);
  const pointsEnabled = snapshotBoolean(snapshot, `${prefix}.points_enabled`, false);
  const pointsCost = snapshotString(snapshot, `${prefix}.points_cost`, '0');
  const message = snapshotString(snapshot, `${prefix}.message`, `${definition.title}功能维护中，请稍后再试`);
  const featureKey = toolFeatureKey(definition.key);
  const modelBound = featureKey ? Boolean(await resolveToolModel(featureKey).catch(() => null)) : false;
  return {
    ...definition,
    enabled,
    memberDailyQuota: Math.max(0, parseInteger(memberDailyQuota, Number(defaultMemberQuota(definition.key)))),
    guestDailyQuota: Math.max(0, parseInteger(guestDailyQuota, 0)),
    adUnlockEnabled,
    pointsEnabled,
    pointsCost: Math.max(0, parseInteger(pointsCost, 0)),
    message,
    featureKey,
    modelBound,
  };
}

function toolFeatureKey(key: ToolKey): string {
  if (key === 'prompt_reverse') return 'tool_prompt_reverse';
  if (key === 'cutout') return 'tool_cutout';
  return '';
}

async function resolveToolModel(featureKey: string, requestedSelection: ToolModelSelection = {}): Promise<ToolModelBinding | null> {
  const tierKey = String(requestedSelection.tierKey || '').trim();
  const tierId = Number(requestedSelection.tierId);
  const normalizedTierId = Number.isInteger(tierId) && tierId > 0 ? tierId : undefined;
  const tierSelectionSql = normalizedTierId
    ? 'AND t.id = ?'
    : tierKey
      ? 'AND t.tier_key = ?'
      : '';
  const params: Array<string | number> = [featureKey];
  if (normalizedTierId) params.push(normalizedTierId);
  else if (tierKey) params.push(tierKey);
  const row = await queryOne<any>(
    `SELECT t.id AS tier_id, t.tier_key,
            m.id, m.name, m.display_name, m.model_type, m.api_model_name, m.upstream_model_code, m.timeout_seconds,
            p.name AS provider_name, p.provider_type, p.api_base_url AS provider_api_base_url, p.api_key AS provider_api_key
       FROM model_features f
       JOIN model_tiers t ON t.feature_id = f.id AND t.status = 'active'
       JOIN tier_model_bindings b ON b.tier_id = t.id
       JOIN ai_models m ON m.id = b.model_id AND m.status = 'active' AND m.deleted_at IS NULL
       JOIN ai_model_providers p ON p.id = m.provider_id AND p.status = 'active' AND p.deleted_at IS NULL
      WHERE f.feature_key = ? AND f.status = 'active'
        ${tierSelectionSql}
        AND COALESCE(p.api_base_url, '') <> ''
        AND COALESCE(p.api_key, '') <> ''
      ORDER BY t.is_default DESC, t.sort_order, CASE b.binding_type WHEN 'primary' THEN 0 ELSE 1 END, b.fallback_order
      LIMIT 1`,
    params,
  );
  if (!row) return null;
  if (!['text', 'multimodal'].includes(String(row.model_type || ''))) return null;
  const capabilitySet = await getModelCapabilitySet(Number(row.id));
  if (!hasAnyCapability(capabilitySet.capabilities, ['vision_chat', 'image_understanding', 'text_chat', 'text_generation'])) return null;
  return {
    id: Number(row.id),
    tierId: Number(row.tier_id),
    tierKey: row.tier_key || '',
    name: row.name || '',
    displayName: row.display_name || row.name || '',
    modelType: row.model_type || '',
    apiModelName: row.api_model_name || '',
    upstreamModelCode: row.upstream_model_code || '',
    timeoutSeconds: Number(row.timeout_seconds || 120),
    providerName: row.provider_name || '',
    providerType: row.provider_type || '',
    providerApiBaseUrl: row.provider_api_base_url || '',
    providerApiKey: decryptApiKey(row.provider_api_key || ''),
  };
}

function defaultMemberQuota(key: ToolKey): string {
  return key === 'prompt_reverse' || key === 'cutout' ? '20' : '50';
}

function nonNegativeInt(value: unknown): number {
  return Math.max(0, parseInteger(value, 0));
}

function toolTitle(key: ToolKey): string {
  return TOOL_DEFINITIONS.find(item => item.key === key)?.title || '工具';
}

async function consumeAccess(userId: number, cfg: ToolConfigItem): Promise<{ usageSource: string; pointsCost: number; refId: string }> {
  const membership = await getUserMembership(userId);
  const isMember = membership.membershipLevel !== 'free' && !membership.isExpired;
  const usedToday = await countUsedToday(userId, cfg.key);
  const freeQuota = isMember ? cfg.memberDailyQuota : cfg.guestDailyQuota;
  if (usedToday < freeQuota) return { usageSource: isMember ? 'member_quota' : 'guest_quota', pointsCost: 0, refId: '' };
  const unlock = await consumeAdUnlock(userId, cfg.key);
  if (unlock) return { usageSource: 'ad_unlock', pointsCost: 0, refId: '' };
  if (cfg.pointsEnabled && cfg.pointsCost > 0) {
    const refId = `tool_${cfg.key}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await chargeToolPoints(userId, cfg.pointsCost, refId, `${cfg.title}消耗积分`);
    return { usageSource: 'points', pointsCost: cfg.pointsCost, refId };
  }
  if (!isMember && cfg.adUnlockEnabled) {
    throw Object.assign(new Error('请先完整观看广告后使用该工具'), { code: ErrorCodes.LIMIT_EXCEEDED, needAd: true });
  }
  throw Object.assign(new Error('今日免费次数已用完'), { code: ErrorCodes.LIMIT_EXCEEDED });
}

async function chargeToolPoints(userId: number, amount: number, refId: string, title: string): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const account = await lockPointAccountTx(conn, userId);
    await applyPointChangeTx(conn, account, {
      userId,
      amount: -Math.abs(amount),
      source: 'tool_usage',
      refType: 'tool_process',
      refId,
      title,
    });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function refundToolPoints(userId: number, amount: number, refId: string, title: string): Promise<void> {
  if (!amount || !refId) return;
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const account = await lockPointAccountTx(conn, userId);
    const refundAmount = Math.abs(amount);
    const balanceAfter = account.balance + refundAmount;
    await conn.execute(
      `UPDATE point_accounts
       SET balance = ?, total_refunded = total_refunded + ?, version = version + 1, updated_at = NOW(3)
       WHERE user_id = ? AND version = ?`,
      [balanceAfter, refundAmount, userId, account.version],
    );
    await conn.execute(
      `INSERT INTO point_logs
       (user_id, type, amount, balance_before, balance_after, frozen_before, frozen_after,
        source, ref_type, ref_id, title, created_at)
       VALUES (?, 'refund', ?, ?, ?, ?, ?, 'tool_usage_refund', 'tool_process_refund', ?, ?, NOW(3))`,
      [userId, refundAmount, account.balance, balanceAfter, account.frozen_balance || 0, account.frozen_balance || 0, refId, title],
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

async function countUsedToday(userId: number, toolKey: ToolKey): Promise<number> {
  const row = await queryOne<any>(
    'SELECT COUNT(*) AS cnt FROM tool_usage_logs WHERE user_id = ? AND tool_key = ? AND usage_date = CURDATE()',
    [userId, toolKey],
  );
  return Number(row?.cnt || 0);
}

async function hasAvailableAdUnlock(userId: number, toolKey: ToolKey): Promise<boolean> {
  const row = await queryOne<any>(
    "SELECT id FROM tool_ad_unlocks WHERE user_id = ? AND tool_key = ? AND status = 'claimed' AND used_at IS NULL AND (expires_at IS NULL OR expires_at > NOW(3)) ORDER BY id LIMIT 1",
    [userId, toolKey],
  );
  return !!row;
}

async function consumeAdUnlock(userId: number, toolKey: ToolKey): Promise<boolean> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      "SELECT id FROM tool_ad_unlocks WHERE user_id = ? AND tool_key = ? AND status = 'claimed' AND used_at IS NULL AND (expires_at IS NULL OR expires_at > NOW(3)) ORDER BY id LIMIT 1 FOR UPDATE",
      [userId, toolKey],
    ) as any;
    const row = rows?.[0];
    if (!row) {
      await conn.rollback();
      return false;
    }
    await conn.execute("UPDATE tool_ad_unlocks SET used_at = NOW(3), updated_at = NOW(3) WHERE id = ?", [row.id]);
    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function logUsage(userId: number, toolKey: ToolKey, source: string, inputFileIds: number[], outputFileIds: number[], metadata: Record<string, any>): Promise<void> {
  await query(
    `INSERT INTO tool_usage_logs
     (user_id, tool_key, usage_date, usage_source, input_file_ids, output_file_ids, metadata_json, created_at)
     VALUES (?, ?, CURDATE(), ?, ?, ?, ?, NOW(3))`,
    [userId, toolKey, source, JSON.stringify(inputFileIds), JSON.stringify(outputFileIds), JSON.stringify(metadata || {})],
  );
}

async function processGridCut(input: ToolProcessInput): Promise<ToolOutputFile[]> {
  const source = await loadUserImage(input.userId, Number(input.fileIds?.[0] || 0), input.requestBaseUrl);
  const meta = await sharp(source.buffer).metadata();
  const side = Math.min(Number(meta.width || 0), Number(meta.height || 0), MAX_DIMENSION);
  const left = Math.max(0, Math.floor(((meta.width || side) - side) / 2));
  const top = Math.max(0, Math.floor(((meta.height || side) - side) / 2));
  const outputs: ToolOutputFile[] = [];
  const cell = Math.floor(side / 3);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const buffer = await sharp(source.buffer)
        .rotate()
        .extract({ left: left + x * cell, top: top + y * cell, width: cell, height: cell })
        .png()
        .toBuffer();
      outputs.push(await storeOutput(input.userId, buffer, `grid-${y + 1}-${x + 1}.png`, 'image/png', input.requestBaseUrl, source.fileId));
    }
  }
  return outputs;
}

async function processCompress(input: ToolProcessInput): Promise<ToolOutputFile> {
  const source = await loadUserImage(input.userId, Number(input.fileIds?.[0] || 0), input.requestBaseUrl);
  const quality = clamp(parseInteger(input.params?.quality, 75), 30, 95);
  const buffer = await sharp(source.buffer).rotate().jpeg({ quality, mozjpeg: true }).toBuffer();
  return storeOutput(input.userId, buffer, 'compressed.jpg', 'image/jpeg', input.requestBaseUrl, source.fileId);
}

async function processWatermark(input: ToolProcessInput): Promise<ToolOutputFile> {
  const source = await loadUserImage(input.userId, Number(input.fileIds?.[0] || 0), input.requestBaseUrl);
  const meta = await sharp(source.buffer).metadata();
  const text = String(input.params?.text || DEFAULT_WATERMARK_TEXT).slice(0, 40);
  const opacity = Math.min(0.95, Math.max(0.15, Number(input.params?.opacity || 0.36)));
  const fontSize = Math.max(22, Math.round(Math.min(Number(meta.width || 800), Number(meta.height || 800)) / 18));
  const svg = createTextWatermarkSvg({ width: Number(meta.width || 800), height: Number(meta.height || 800), text, opacity, fontSize });
  const buffer = await sharp(source.buffer).rotate().composite([{ input: svg, gravity: 'center' }]).png().toBuffer();
  return storeOutput(input.userId, buffer, 'watermark.png', 'image/png', input.requestBaseUrl, source.fileId);
}

async function processCompare(input: ToolProcessInput): Promise<ToolOutputFile> {
  const first = await loadUserImage(input.userId, Number(input.fileIds?.[0] || 0), input.requestBaseUrl);
  const second = await loadUserImage(input.userId, Number(input.fileIds?.[1] || 0), input.requestBaseUrl);
  const width = clamp(parseInteger(input.params?.width, 1200), 480, 2400);
  const height = clamp(parseInteger(input.params?.height, 900), 360, 2400);
  const half = Math.floor(width / 2);
  const left = await sharp(first.buffer).rotate().resize(half, height, { fit: 'cover' }).png().toBuffer();
  const right = await sharp(second.buffer).rotate().resize(width - half, height, { fit: 'cover' }).png().toBuffer();
  const divider = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="${half - 2}" y="0" width="4" height="${height}" fill="#ffffff"/><circle cx="${half}" cy="${Math.floor(height / 2)}" r="28" fill="#ffffff"/><path d="M${half - 8} ${Math.floor(height / 2)}h16" stroke="#7258ff" stroke-width="4" stroke-linecap="round"/></svg>`);
  const buffer = await sharp({
    create: { width, height, channels: 4, background: '#ffffff' },
  }).composite([{ input: left, left: 0, top: 0 }, { input: right, left: half, top: 0 }, { input: divider, left: 0, top: 0 }]).png().toBuffer();
  return storeOutput(input.userId, buffer, 'compare.png', 'image/png', input.requestBaseUrl, first.fileId);
}

async function processCutout(input: ToolProcessInput): Promise<ToolOutputFile> {
  const source = await loadUserImage(input.userId, Number(input.fileIds?.[0] || 0), input.requestBaseUrl);
  const image = sharp(source.buffer).rotate().ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const sample = [
    [0, 0],
    [info.width - 1, 0],
    [0, info.height - 1],
    [info.width - 1, info.height - 1],
  ].map(([x, y]) => pixelAt(data, info.width, x, y));
  const bg = averageRgb(sample);
  const tolerance = clamp(parseInteger(input.params?.tolerance, 38), 12, 96);
  for (let i = 0; i < data.length; i += 4) {
    const dist = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
    if (dist < tolerance * 3) data[i + 3] = 0;
  }
  const buffer = await sharp(data, { raw: info }).png().toBuffer();
  return storeOutput(input.userId, buffer, 'cutout.png', 'image/png', input.requestBaseUrl, source.fileId);
}

async function processResize(input: ToolProcessInput): Promise<ToolOutputFile> {
  const source = await loadUserImage(input.userId, Number(input.fileIds?.[0] || 0), input.requestBaseUrl);
  const width = clamp(parseInteger(input.params?.width, 1080), 64, MAX_DIMENSION);
  const height = clamp(parseInteger(input.params?.height, 1080), 64, MAX_DIMENSION);
  const fit = ['cover', 'contain', 'fill', 'inside', 'outside'].includes(String(input.params?.fit)) ? String(input.params?.fit) : 'cover';
  const buffer = await sharp(source.buffer)
    .rotate()
    .resize(width, height, { fit: fit as keyof typeof sharp.fit, background: '#ffffff' })
    .png()
    .toBuffer();
  return storeOutput(input.userId, buffer, 'resize.png', 'image/png', input.requestBaseUrl, source.fileId);
}

async function processPhoneFrame(input: ToolProcessInput): Promise<ToolOutputFile> {
  const source = await loadUserImage(input.userId, Number(input.fileIds?.[0] || 0), input.requestBaseUrl);
  // iPhone 17 Pro Max front frame: uploaded image is composited on the front display.
  const width = 1440;
  const height = 3040;
  const screenX = 60;
  const screenY = 86;
  const screenW = 1320;
  const screenH = 2868;
  const outerRadius = 228;
  const screenRadius = 198;
  const screen = await sharp(source.buffer)
    .rotate()
    .resize(screenW, screenH, { fit: 'cover', position: 'center' })
    .composite([{ input: roundedMask(screenW, screenH, screenRadius), blend: 'dest-in' }])
    .png()
    .toBuffer();
  const sideButton = `
    <rect x="0" y="410" width="20" height="230" rx="10" fill="#343434"/>
    <rect x="0" y="730" width="20" height="360" rx="10" fill="#343434"/>
    <rect x="${width - 20}" y="900" width="20" height="390" rx="10" fill="#363636"/>
  `;
  const dynamicIsland = `
    <g>
      <rect x="${width / 2 - 170}" y="102" width="284" height="70" rx="35" fill="#030303"/>
      <rect x="${width / 2 - 154}" y="112" width="238" height="50" rx="25" fill="#070707"/>
      <circle cx="${width / 2 + 142}" cy="136" r="10" fill="#18d263"/>
      <circle cx="${width / 2 + 188}" cy="136" r="16" fill="#071537"/>
      <circle cx="${width / 2 + 188}" cy="136" r="7" fill="#102b6f"/>
    </g>
  `;
  const frameSvg = Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#5a5a5a"/>
        <stop offset="18%" stop-color="#121212"/>
        <stop offset="50%" stop-color="#050505"/>
        <stop offset="82%" stop-color="#222222"/>
        <stop offset="100%" stop-color="#656565"/>
      </linearGradient>
      <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#000000"/>
        <stop offset="8%" stop-color="#222222"/>
        <stop offset="50%" stop-color="#020202"/>
        <stop offset="92%" stop-color="#242424"/>
        <stop offset="100%" stop-color="#000000"/>
      </linearGradient>
      <filter id="drop" x="-15%" y="-8%" width="130%" height="116%">
        <feDropShadow dx="0" dy="22" stdDeviation="24" flood-color="#0f172a" flood-opacity="0.22"/>
      </filter>
    </defs>
    ${sideButton}
    <rect x="10" y="10" width="${width - 20}" height="${height - 20}" rx="${outerRadius}" fill="url(#edge)" filter="url(#drop)"/>
    <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="${outerRadius - 18}" fill="#060606"/>
    <rect x="42" y="46" width="${width - 84}" height="${height - 92}" rx="${outerRadius - 34}" fill="url(#glass)"/>
    <rect x="${screenX}" y="${screenY}" width="${screenW}" height="${screenH}" rx="${screenRadius}" fill="#010101"/>
  </svg>`);
  const overlaySvg = Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${screenX + 8}" y="${screenY + 8}" width="${screenW - 16}" height="${screenH - 16}" rx="${screenRadius - 8}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3"/>
    ${dynamicIsland}
  </svg>`);
  const buffer = await sharp(frameSvg)
    .composite([
      { input: screen, left: screenX, top: screenY },
      { input: overlaySvg, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
  return storeOutput(input.userId, buffer, 'iphone-17-pro-max-front-frame.png', 'image/png', input.requestBaseUrl, source.fileId);
}

async function reversePromptWithModel(
  file: { buffer: Buffer; mimeType: string },
  metadata: sharp.Metadata,
  params: Record<string, any>,
  requestedSelection: ToolModelSelection = {},
): Promise<string> {
  const model = await resolveToolModel('tool_prompt_reverse', requestedSelection);
  const hasSelection = Boolean(String(requestedSelection.tierKey || '').trim() || requestedSelection.tierId);
  if (!model) {
    throw toolError(hasSelection
      ? '所选反推提示词功能档位未绑定可用模型，请检查主模型、备用模型和供应商配置。'
      : '反推提示词尚未绑定可用模型，请在“微信配置 → 工具页配置 → 工具模型绑定”中配置。');
  }
  const modelCode = model.upstreamModelCode || model.apiModelName || model.name;
  if (!modelCode || !model.providerApiBaseUrl || !model.providerApiKey) {
    throw toolError('反推提示词绑定的模型配置不完整，请检查模型 code、Base URL 和 API Key。');
  }
  const scene = String(params.scene || '图片主体').slice(0, 40);
  const ratio = metadata.width && metadata.height ? `${metadata.width}:${metadata.height}` : '原图比例';
  const response = await axios.post(resolveChatCompletionUrl(model.providerApiBaseUrl, model.providerType), {
    model: modelCode,
    messages: [
      {
        role: 'system',
        content: '你是图片提示词反推助手。根据用户上传图片生成一段可直接用于 AI 生图的中文提示词，只输出提示词正文，不要解释。',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: `请反推这张图片的提示词。用户补充主体：${scene}。图片比例：${ratio}。` },
          { type: 'image_url', image_url: { url: imageDataUrl(file.buffer, file.mimeType) } },
        ],
      },
    ],
    temperature: 0.35,
    stream: false,
  }, {
    headers: {
      Authorization: `Bearer ${model.providerApiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: Math.max(30000, model.timeoutSeconds * 1000),
  });
  const content = extractTextContent(response.data);
  if (!content) throw new Error('反推提示词模型未返回内容。');
  return content.trim();
}

function imageDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType || 'image/png'};base64,${buffer.toString('base64')}`;
}

function resolveChatCompletionUrl(baseUrl: string, providerType: string): string {
  const base = String(baseUrl || '').replace(/\/$/, '');
  if (/\/chat\/completions$/i.test(base)) return base;
  if (providerType === 'xiaoma' && !/\/v1$/i.test(base)) return `${base}/v1/chat/completions`;
  if (providerType === 'dashscope' && !/compatible-mode\/v1$/i.test(base)) return `${base}/compatible-mode/v1/chat/completions`;
  return `${base}/chat/completions`;
}

function extractTextContent(data: any): string {
  const content = data?.choices?.[0]?.message?.content
    || data?.choices?.[0]?.text
    || data?.output_text
    || data?.output?.[0]?.content?.[0]?.text
    || '';
  if (Array.isArray(content)) {
    return content.map((item: any) => item?.text || item?.content || '').filter(Boolean).join('\n').trim();
  }
  return String(content || '').trim();
}

async function loadUserImage(userId: number, fileId: number, requestBaseUrl: string): Promise<{ fileId: number; buffer: Buffer; mimeType: string; originalName: string }> {
  if (!fileId) throw toolError('请先上传图片');
  const file = await queryOne<any>('SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0', [fileId, userId]);
  if (!file) throw Object.assign(new Error('图片不存在或无权访问'), { code: ErrorCodes.FILE_PERMISSION_DENIED });
  const mimeType = String(file.mime_type || '');
  if (!mimeType.startsWith('image/')) throw toolError('仅支持图片文件');
  const buffer = String(file.provider || '') === 'local' && file.storage_key
    ? await fs.promises.readFile(resolveLocalFilePath(file.storage_key))
    : await readImageBuffer(file.access_url || file.cdn_url || `${requestBaseUrl}/api/v1/files/${encodeURIComponent(file.file_no)}/content`);
  if (buffer.length > MAX_SOURCE_BYTES) throw Object.assign(new Error('图片文件过大'), { code: ErrorCodes.FILE_SIZE_EXCEEDED });
  return { fileId: file.id, buffer, mimeType, originalName: file.original_name || 'image.png' };
}

async function readImageBuffer(url: string): Promise<Buffer> {
  if (!/^https?:\/\//i.test(url)) {
    throw toolError('图片地址无效');
  }
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000, maxContentLength: MAX_SOURCE_BYTES });
  return Buffer.from(response.data);
}

async function storeOutput(userId: number, buffer: Buffer, name: string, mimeType: string, requestBaseUrl: string, refFileId: number): Promise<ToolOutputFile> {
  const meta = await sharp(buffer).metadata();
  const adapter = StorageService.getActiveAdapter();
  const storageKey = StorageService.genStorageKey('general', name);
  const tempDir = path.join(os.tmpdir(), 'ai-creator-tools');
  await fs.promises.mkdir(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${name}`);
  try {
    await fs.promises.writeFile(tempPath, buffer);
    const uploadResult = await adapter.uploadLarge(storageKey, fs.createReadStream(tempPath), mimeType, buffer.length);
    const fileNo = genFileNo();
    const conn = await getConnection();
    try {
      const [result] = await conn.execute(
        `INSERT INTO files
         (file_no, user_id, provider, storage_key, original_name, mime_type, file_size, width, height, duration, md5_hash, etag, access_url, cdn_url, file_category, visibility, ref_type, ref_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'general', 'private', 'tool_output', ?, NOW(3))`,
        [
          fileNo,
          userId,
          adapter.provider,
          storageKey,
          name,
          mimeType,
          buffer.length,
          Number(meta.width || 0),
          Number(meta.height || 0),
          crypto.createHash('md5').update(buffer).digest('hex'),
          uploadResult.etag || '',
          uploadResult.url,
          uploadResult.cdnUrl,
          String(refFileId || ''),
        ],
      ) as any;
      const fileId = Number(result?.insertId || 0);
      return {
        fileId,
        fileNo,
        url: `${requestBaseUrl}/api/v1/files/${encodeURIComponent(fileNo)}/content`,
        width: Number(meta.width || 0),
        height: Number(meta.height || 0),
        mimeType,
        fileSize: buffer.length,
      };
    } finally {
      conn.release();
    }
  } finally {
    fs.promises.unlink(tempPath).catch(() => undefined);
  }
}

function pixelAt(data: Buffer, width: number, x: number, y: number): [number, number, number] {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

function averageRgb(items: Array<[number, number, number]>): [number, number, number] {
  const sum = items.reduce((acc, item) => [acc[0] + item[0], acc[1] + item[1], acc[2] + item[2]], [0, 0, 0]);
  return [Math.round(sum[0] / items.length), Math.round(sum[1] / items.length), Math.round(sum[2] / items.length)];
}

function roundedMask(width: number, height: number, radius: number): Buffer {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/></svg>`);
}

function parseInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toolError(message: string) {
  return Object.assign(new Error(message), { code: ErrorCodes.PARAM_ERROR });
}
