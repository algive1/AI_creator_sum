import type { PoolConnection } from 'mysql2/promise';
import { getConnection, query, queryOne } from '../utils/db';
import { getCommerceAvailability } from './commerce-availability.service';
import { isActiveMember } from './membership.service';
import { SettingsService } from './settings.service';

export const FREE_IMAGE_QUOTA_BILLING_SOURCE = 'free_quota';
export const POINTS_BILLING_SOURCE = 'points';
const FREE_QUOTA_INSUFFICIENT_CODE = 4606;
const SERVER_ERROR_CODE = 5000;

export const FREE_IMAGE_QUOTA_CONFIG_KEYS = {
  enabled: 'free_image_quota.enabled',
  dailyLimit: 'free_image_quota.daily_limit',
  totalLimit: 'free_image_quota.total_limit',
  allowedTierKeys: 'free_image_quota.allowed_tier_keys',
  showInDailyTasks: 'free_image_quota.show_in_daily_tasks',
  exhaustedMessage: 'free_image_quota.exhausted_message',
} as const;

export const DEFAULT_FREE_IMAGE_QUOTA_ALLOWED_TIER_KEYS = ['image_standard', 'image_pro'];
export const DEFAULT_FREE_IMAGE_QUOTA_EXHAUSTED_MESSAGE =
  '今日免费生图额度已用完，可以开通会员获得积分，或使用已有积分继续生成。';

export interface FreeImageQuotaConfig {
  enabled: boolean;
  dailyLimit: number;
  totalLimit: number;
  allowedTierKeys: string[];
  showInDailyTasks: boolean;
  exhaustedMessage: string;
}

export interface FreeImageQuotaDecisionInput extends FreeImageQuotaConfig {
  isMember?: boolean;
  usedToday?: number;
  reservedToday?: number;
  usedTotal?: number;
  reservedTotal?: number;
  requestedImages?: number;
  tierKey?: string;
}

export interface FreeImageQuotaDecision {
  enabled: boolean;
  eligible: boolean;
  dailyLimit: number;
  totalLimit: number;
  dailyRemaining: number;
  totalRemaining: number;
  remaining: number;
  requestedImages: number;
  canReserve: boolean;
  reason: 'available' | 'disabled' | 'member' | 'no_limit' | 'tier_not_allowed' | 'insufficient';
}

export interface FreeImageQuotaStatus extends FreeImageQuotaConfig {
  eligible: boolean;
  canUseFreeQuota: boolean;
  dailyRemaining: number;
  totalRemaining: number;
  remaining: number;
  membershipEnabled: boolean;
  purchaseEnabled: boolean;
}

export interface FreeImageQuotaModelIdentity {
  name?: unknown;
  displayName?: unknown;
  modelName?: unknown;
  apiModelName?: unknown;
  upstreamModelCode?: unknown;
  providerType?: unknown;
}

export function normalizeFreeImageQuotaConfig(raw: Record<string, unknown> = {}): FreeImageQuotaConfig {
  return {
    enabled: toBoolean(readRaw(raw, FREE_IMAGE_QUOTA_CONFIG_KEYS.enabled), false),
    dailyLimit: toNonNegativeInt(readRaw(raw, FREE_IMAGE_QUOTA_CONFIG_KEYS.dailyLimit), 1),
    totalLimit: toNonNegativeInt(readRaw(raw, FREE_IMAGE_QUOTA_CONFIG_KEYS.totalLimit), 3),
    allowedTierKeys: normalizeTierKeyList(
      readRaw(raw, FREE_IMAGE_QUOTA_CONFIG_KEYS.allowedTierKeys),
      DEFAULT_FREE_IMAGE_QUOTA_ALLOWED_TIER_KEYS,
    ),
    showInDailyTasks: toBoolean(readRaw(raw, FREE_IMAGE_QUOTA_CONFIG_KEYS.showInDailyTasks), true),
    exhaustedMessage: String(readRaw(raw, FREE_IMAGE_QUOTA_CONFIG_KEYS.exhaustedMessage) || DEFAULT_FREE_IMAGE_QUOTA_EXHAUSTED_MESSAGE).trim()
      || DEFAULT_FREE_IMAGE_QUOTA_EXHAUSTED_MESSAGE,
  };
}

export function buildFreeImageQuotaDecision(input: FreeImageQuotaDecisionInput): FreeImageQuotaDecision {
  const dailyLimit = toNonNegativeInt(input.dailyLimit, 0);
  const totalLimit = toNonNegativeInt(input.totalLimit, 0);
  const requestedImages = toNonNegativeInt(input.requestedImages, 0);
  const enabled = Boolean(input.enabled);
  const hasLimit = dailyLimit > 0 && totalLimit > 0;
  const allowedTierKeys = normalizeTierKeyList(input.allowedTierKeys, DEFAULT_FREE_IMAGE_QUOTA_ALLOWED_TIER_KEYS);
  const tierAllowed = input.tierKey
    ? isFreeImageQuotaTierAllowed(allowedTierKeys, input.tierKey)
    : allowedTierKeys.length > 0;
  const dailyRemaining = enabled && hasLimit
    ? Math.max(0, dailyLimit - toNonNegativeInt(input.usedToday, 0) - toNonNegativeInt(input.reservedToday, 0))
    : 0;
  const totalRemaining = enabled && hasLimit
    ? Math.max(0, totalLimit - toNonNegativeInt(input.usedTotal, 0) - toNonNegativeInt(input.reservedTotal, 0))
    : 0;
  const remaining = Math.min(dailyRemaining, totalRemaining);
  const eligible = enabled && hasLimit && !input.isMember && tierAllowed;

  let reason: FreeImageQuotaDecision['reason'] = 'available';
  if (!enabled) reason = 'disabled';
  else if (input.isMember) reason = 'member';
  else if (!hasLimit) reason = 'no_limit';
  else if (!tierAllowed) reason = 'tier_not_allowed';
  else if (requestedImages > 0 && requestedImages > remaining) reason = 'insufficient';

  return {
    enabled,
    eligible,
    dailyLimit,
    totalLimit,
    dailyRemaining,
    totalRemaining,
    remaining,
    requestedImages,
    canReserve: eligible && requestedImages > 0 && requestedImages <= remaining,
    reason,
  };
}

export function isFreeImageQuotaTierAllowed(allowedTierKeys: unknown, tierKey?: string | null): boolean {
  const allowed = normalizeTierKeyList(allowedTierKeys, []);
  if (!allowed.length) return false;
  const normalizedTierKey = normalizeTierKey(tierKey);
  return Boolean(normalizedTierKey && allowed.includes(normalizedTierKey));
}

export function isGptImage2FreeQuotaModel(model?: FreeImageQuotaModelIdentity | null): boolean {
  if (!model) return false;
  const text = [
    model.name,
    model.displayName,
    model.modelName,
    model.apiModelName,
    model.upstreamModelCode,
    model.providerType,
  ].map((item) => String(item || '').trim().toLowerCase()).filter(Boolean).join(' ');
  if (!text) return false;
  return text.replace(/[^a-z0-9]+/g, '').includes('gptimage2');
}

export function planFreeImageQuotaSettlement(input: { reservedImages: number; actualImages: number }) {
  const reservedImages = toNonNegativeInt(input.reservedImages, 0);
  const actualImages = toNonNegativeInt(input.actualImages, 0);
  const consumeImages = Math.min(reservedImages, actualImages);
  return {
    consumeImages,
    releaseImages: Math.max(0, reservedImages - consumeImages),
  };
}

export function planRecoveredFreeQuotaConsumption(input: {
  reservedImages: number;
  releasedImages: number;
  consumedImages: number;
  actualImages: number;
}) {
  const reservedImages = toNonNegativeInt(input.reservedImages, 0);
  const releasedImages = Math.min(reservedImages, toNonNegativeInt(input.releasedImages, 0));
  const consumedImages = Math.min(reservedImages, toNonNegativeInt(input.consumedImages, 0));
  if (reservedImages <= 0 || consumedImages > 0) {
    return { consumeImages: 0, reservedImagesToClear: 0 };
  }
  return {
    consumeImages: Math.min(reservedImages, toNonNegativeInt(input.actualImages, 0)),
    reservedImagesToClear: Math.max(0, reservedImages - releasedImages - consumedImages),
  };
}

export function buildFreeQuotaInsufficientResponseData(input: {
  requestedImages: number;
  dailyRemaining: number;
  totalRemaining: number;
  pointsCost: number;
  insufficientData?: Record<string, unknown>;
}) {
  const pointsCost = Math.max(0, toNonNegativeInt(input.pointsCost, 0));
  return {
    ...(input.insufficientData || {}),
    requestedImages: toNonNegativeInt(input.requestedImages, 0),
    dailyRemaining: Math.max(0, toNonNegativeInt(input.dailyRemaining, 0)),
    totalRemaining: Math.max(0, toNonNegativeInt(input.totalRemaining, 0)),
    estimatedPointsCost: pointsCost,
    pointsCost,
  };
}

export async function getFreeImageQuotaConfig(): Promise<FreeImageQuotaConfig> {
  const [enabled, dailyLimit, totalLimit, allowedTierKeys, showInDailyTasks, exhaustedMessage] = await Promise.all([
    SettingsService.getBoolean(FREE_IMAGE_QUOTA_CONFIG_KEYS.enabled, false),
    SettingsService.getString(FREE_IMAGE_QUOTA_CONFIG_KEYS.dailyLimit, '1'),
    SettingsService.getString(FREE_IMAGE_QUOTA_CONFIG_KEYS.totalLimit, '3'),
    SettingsService.getString(FREE_IMAGE_QUOTA_CONFIG_KEYS.allowedTierKeys, DEFAULT_FREE_IMAGE_QUOTA_ALLOWED_TIER_KEYS.join(',')),
    SettingsService.getBoolean(FREE_IMAGE_QUOTA_CONFIG_KEYS.showInDailyTasks, true),
    SettingsService.getString(FREE_IMAGE_QUOTA_CONFIG_KEYS.exhaustedMessage, DEFAULT_FREE_IMAGE_QUOTA_EXHAUSTED_MESSAGE),
  ]);
  return normalizeFreeImageQuotaConfig({
    [FREE_IMAGE_QUOTA_CONFIG_KEYS.enabled]: enabled,
    [FREE_IMAGE_QUOTA_CONFIG_KEYS.dailyLimit]: dailyLimit,
    [FREE_IMAGE_QUOTA_CONFIG_KEYS.totalLimit]: totalLimit,
    [FREE_IMAGE_QUOTA_CONFIG_KEYS.allowedTierKeys]: allowedTierKeys,
    [FREE_IMAGE_QUOTA_CONFIG_KEYS.showInDailyTasks]: showInDailyTasks,
    [FREE_IMAGE_QUOTA_CONFIG_KEYS.exhaustedMessage]: exhaustedMessage,
  });
}

export async function getFreeImageQuotaStatus(userId: number): Promise<FreeImageQuotaStatus> {
  const [config, quota, member, commerce] = await Promise.all([
    getFreeImageQuotaConfig(),
    queryOne<any>(
      `SELECT used_total, reserved_total,
              CASE WHEN quota_date = CURDATE() THEN used_today ELSE 0 END AS used_today,
              CASE WHEN quota_date = CURDATE() THEN reserved_today ELSE 0 END AS reserved_today
         FROM user_free_image_quotas
        WHERE user_id = ?`,
      [userId],
    ).catch(() => null),
    isActiveMember(userId),
    getCommerceAvailability(),
  ]);

  const decision = buildFreeImageQuotaDecision({
    ...config,
    isMember: member,
    usedToday: quota?.used_today || 0,
    reservedToday: quota?.reserved_today || 0,
    usedTotal: quota?.used_total || 0,
    reservedTotal: quota?.reserved_total || 0,
  });

  return {
    ...config,
    eligible: decision.eligible,
    canUseFreeQuota: decision.eligible && decision.remaining > 0,
    dailyRemaining: decision.dailyRemaining,
    totalRemaining: decision.totalRemaining,
    remaining: decision.remaining,
    membershipEnabled: commerce.membershipEnabled,
    purchaseEnabled: commerce.purchaseEnabled,
  };
}

export async function buildFreeQuotaInsufficientData(input: {
  userId: number;
  requestedImages: number;
  dailyRemaining: number;
  totalRemaining: number;
  pointsCost: number;
}) {
  const [account, commerce] = await Promise.all([
    queryOne<any>('SELECT balance FROM point_accounts WHERE user_id = ?', [input.userId]).catch(() => null),
    getCommerceAvailability(),
  ]);
  const balance = Number(account?.balance || 0);
  return {
    requestedImages: input.requestedImages,
    dailyRemaining: Math.max(0, input.dailyRemaining),
    totalRemaining: Math.max(0, input.totalRemaining),
    estimatedPointsCost: Math.max(0, input.pointsCost),
    pointsCost: Math.max(0, input.pointsCost),
    canUsePoints: balance >= Math.max(0, input.pointsCost),
    pointsBalance: balance,
    membershipEnabled: commerce.membershipEnabled,
    purchaseEnabled: commerce.purchaseEnabled,
  };
}

export async function reserveFreeImageQuotaForTaskTx(conn: PoolConnection, input: {
  userId: number;
  taskId: number;
  requestedImages: number;
  pointsCost: number;
  config: FreeImageQuotaConfig;
  insufficientData?: Record<string, unknown>;
}): Promise<void> {
  const requestedImages = toNonNegativeInt(input.requestedImages, 0);
  if (requestedImages <= 0) return;
  const config = normalizeFreeImageQuotaConfig(input.config as any);
  const today = await readDbToday(conn);

  await conn.execute(
    `INSERT INTO user_free_image_quotas
       (user_id, quota_date, daily_limit_snapshot, total_limit_snapshot, created_at, updated_at)
     VALUES (?, CURDATE(), ?, ?, NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE updated_at = updated_at`,
    [input.userId, config.dailyLimit, config.totalLimit],
  );

  const row = await lockQuotaRow(conn, input.userId);
  if (!row) throw Object.assign(new Error('免费额度账本不存在'), { code: SERVER_ERROR_CODE });

  const quotaDate = formatQuotaDateKey(row.quota_date);
  if (quotaDate !== today) {
    await conn.execute(
      `UPDATE user_free_image_quotas
          SET quota_date = CURDATE(), used_today = 0, reserved_today = 0,
              daily_limit_snapshot = ?, total_limit_snapshot = ?, version = version + 1, updated_at = NOW(3)
        WHERE user_id = ?`,
      [config.dailyLimit, config.totalLimit, input.userId],
    );
    row.quota_date = today;
    row.used_today = 0;
    row.reserved_today = 0;
  }

  const decision = buildFreeImageQuotaDecision({
    ...config,
    isMember: false,
    usedToday: row.used_today,
    reservedToday: row.reserved_today,
    usedTotal: row.used_total,
    reservedTotal: row.reserved_total,
    requestedImages,
  });

  if (!decision.canReserve) {
    throw Object.assign(new Error(config.exhaustedMessage), {
      code: FREE_QUOTA_INSUFFICIENT_CODE,
      data: buildFreeQuotaInsufficientResponseData({
        requestedImages,
        dailyRemaining: decision.dailyRemaining,
        totalRemaining: decision.totalRemaining,
        pointsCost: input.pointsCost,
        insufficientData: input.insufficientData,
      }),
    });
  }

  await conn.execute(
    `UPDATE user_free_image_quotas
        SET reserved_today = reserved_today + ?,
            reserved_total = reserved_total + ?,
            daily_limit_snapshot = ?,
            total_limit_snapshot = ?,
            version = version + 1,
            updated_at = NOW(3)
      WHERE user_id = ?`,
    [requestedImages, requestedImages, config.dailyLimit, config.totalLimit, input.userId],
  );
  await conn.execute(
    `INSERT IGNORE INTO free_image_quota_logs
       (user_id, task_id, event_type, image_count, quota_date, daily_limit_snapshot, total_limit_snapshot,
        daily_remaining_after, total_remaining_after, remark, created_at)
     VALUES (?, ?, 'reserve', ?, CURDATE(), ?, ?, ?, ?, ?, NOW(3))`,
    [
      input.userId,
      input.taskId,
      requestedImages,
      config.dailyLimit,
      config.totalLimit,
      decision.dailyRemaining - requestedImages,
      decision.totalRemaining - requestedImages,
      'Task quota reserved',
    ],
  );
}

export async function settleFreeImageQuotaForTaskTx(conn: PoolConnection, taskId: number, actualImages: number): Promise<void> {
  await settleFreeImageQuotaTaskTx(conn, taskId, toNonNegativeInt(actualImages, 0), 'Task completed');
}

export async function releaseFreeImageQuotaForTaskTx(conn: PoolConnection, taskId: number, reason = 'Task quota released'): Promise<void> {
  await settleFreeImageQuotaTaskTx(conn, taskId, 0, reason);
}

export async function releaseFreeImageQuotaForTask(taskId: number, reason = 'Task quota released'): Promise<void> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await releaseFreeImageQuotaForTaskTx(conn, taskId, reason);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function consumeRecoveredFreeImageQuotaForTaskTx(conn: PoolConnection, taskId: number, actualImages: number, remark = 'Recovered timeout task completed'): Promise<void> {
  await lockQuotaLogRows(conn, taskId);
  const logs = await readQuotaLogSummary(conn, taskId);
  const userId = Number(logs?.user_id || 0);
  if (!userId) return;

  const plan = planRecoveredFreeQuotaConsumption({
    reservedImages: logs.reserved_images,
    releasedImages: logs.released_images,
    consumedImages: logs.consumed_images,
    actualImages,
  });
  if (plan.consumeImages <= 0 && plan.reservedImagesToClear <= 0) return;

  const quota = await lockQuotaRow(conn, userId);
  if (!quota) return;
  const sameQuotaDate = formatQuotaDateKey(quota.quota_date) === formatQuotaDateKey(logs.quota_date);
  const todayConsumeDelta = sameQuotaDate ? plan.consumeImages : 0;
  const todayReserveDelta = sameQuotaDate ? plan.reservedImagesToClear : 0;

  await conn.execute(
    `UPDATE user_free_image_quotas
        SET used_today = used_today + ?,
            used_total = used_total + ?,
            reserved_today = GREATEST(reserved_today - ?, 0),
            reserved_total = GREATEST(reserved_total - ?, 0),
            version = version + 1,
            updated_at = NOW(3)
      WHERE user_id = ?`,
    [todayConsumeDelta, plan.consumeImages, todayReserveDelta, plan.reservedImagesToClear, userId],
  );

  if (plan.consumeImages > 0) {
    const remainingAfter = {
      daily: Math.max(0, Number(quota.daily_limit_snapshot || 0) - Number(quota.used_today || 0) - todayConsumeDelta - Math.max(0, Number(quota.reserved_today || 0) - todayReserveDelta)),
      total: Math.max(0, Number(quota.total_limit_snapshot || 0) - Number(quota.used_total || 0) - plan.consumeImages - Math.max(0, Number(quota.reserved_total || 0) - plan.reservedImagesToClear)),
    };
    await conn.execute(
      `INSERT IGNORE INTO free_image_quota_logs
         (user_id, task_id, event_type, image_count, quota_date, daily_limit_snapshot, total_limit_snapshot,
          daily_remaining_after, total_remaining_after, remark, created_at)
       VALUES (?, ?, 'consume', ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        userId,
        taskId,
        plan.consumeImages,
        logs.quota_date,
        quota.daily_limit_snapshot || 0,
        quota.total_limit_snapshot || 0,
        remainingAfter.daily,
        remainingAfter.total,
        remark,
      ],
    );
  }
}

export function isFreeImageQuotaSnapshot(value: unknown): boolean {
  const snapshot = parseJsonObject(value);
  return snapshot.billingSource === FREE_IMAGE_QUOTA_BILLING_SOURCE;
}

export async function recoverStaleFreeImageQuotaReservations(input: { maxBatch?: number; staleMinutes?: number } = {}) {
  const maxBatch = Math.min(Math.max(1, toNonNegativeInt(input.maxBatch, 50)), 200);
  const staleMinutes = Math.max(5, toNonNegativeInt(input.staleMinutes, 60));
  const rows = await query<any>(
    `SELECT r.task_id
       FROM free_image_quota_logs r
       LEFT JOIN ai_tasks t ON t.id = r.task_id
       LEFT JOIN free_image_quota_logs s
         ON s.task_id = r.task_id AND s.event_type IN ('consume', 'release')
      WHERE r.event_type = 'reserve'
        AND s.id IS NULL
        AND r.created_at < DATE_SUB(NOW(3), INTERVAL ? MINUTE)
        AND (t.id IS NULL OR t.status IN ('failed', 'cancelled'))
      GROUP BY r.task_id
      ORDER BY MIN(r.created_at) ASC
      LIMIT ${maxBatch}`,
    [staleMinutes],
  ).catch(() => []);

  let released = 0;
  let failed = 0;
  for (const row of rows) {
    const taskId = Number(row.task_id || 0);
    if (!taskId) continue;
    try {
      await releaseFreeImageQuotaForTask(taskId, 'Recovered stale free quota reservation');
      released++;
    } catch {
      failed++;
    }
  }
  return { scanned: rows.length, released, failed };
}

async function settleFreeImageQuotaTaskTx(conn: PoolConnection, taskId: number, actualImages: number, remark: string): Promise<void> {
  await lockQuotaLogRows(conn, taskId);
  const logs = await readQuotaLogSummary(conn, taskId);
  const userId = Number(logs?.user_id || 0);
  const reservedImages = toNonNegativeInt(logs?.reserved_images, 0);
  const settledImages = toNonNegativeInt(logs?.settled_images, 0);
  const remainingReserved = Math.max(0, reservedImages - settledImages);
  if (!userId || remainingReserved <= 0) return;

  const quota = await lockQuotaRow(conn, userId);
  if (!quota) return;
  const sameQuotaDate = formatQuotaDateKey(quota.quota_date) === formatQuotaDateKey(logs.quota_date);
  const settlement = planFreeImageQuotaSettlement({ reservedImages: remainingReserved, actualImages });
  const todayReserveDelta = sameQuotaDate ? remainingReserved : 0;
  const todayConsumeDelta = sameQuotaDate ? settlement.consumeImages : 0;

  await conn.execute(
    `UPDATE user_free_image_quotas
        SET used_today = used_today + ?,
            used_total = used_total + ?,
            reserved_today = GREATEST(reserved_today - ?, 0),
            reserved_total = GREATEST(reserved_total - ?, 0),
            version = version + 1,
            updated_at = NOW(3)
      WHERE user_id = ?`,
    [todayConsumeDelta, settlement.consumeImages, todayReserveDelta, remainingReserved, userId],
  );

  const remainingAfter = {
    daily: Math.max(0, Number(quota.daily_limit_snapshot || 0) - Number(quota.used_today || 0) - todayConsumeDelta - Math.max(0, Number(quota.reserved_today || 0) - todayReserveDelta)),
    total: Math.max(0, Number(quota.total_limit_snapshot || 0) - Number(quota.used_total || 0) - settlement.consumeImages - Math.max(0, Number(quota.reserved_total || 0) - remainingReserved)),
  };

  if (settlement.consumeImages > 0) {
    await conn.execute(
      `INSERT IGNORE INTO free_image_quota_logs
         (user_id, task_id, event_type, image_count, quota_date, daily_limit_snapshot, total_limit_snapshot,
          daily_remaining_after, total_remaining_after, remark, created_at)
       VALUES (?, ?, 'consume', ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        userId,
        taskId,
        settlement.consumeImages,
        logs.quota_date,
        quota.daily_limit_snapshot || 0,
        quota.total_limit_snapshot || 0,
        remainingAfter.daily,
        remainingAfter.total,
        remark,
      ],
    );
  }
  if (settlement.releaseImages > 0) {
    await conn.execute(
      `INSERT IGNORE INTO free_image_quota_logs
         (user_id, task_id, event_type, image_count, quota_date, daily_limit_snapshot, total_limit_snapshot,
          daily_remaining_after, total_remaining_after, remark, created_at)
       VALUES (?, ?, 'release', ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        userId,
        taskId,
        settlement.releaseImages,
        logs.quota_date,
        quota.daily_limit_snapshot || 0,
        quota.total_limit_snapshot || 0,
        remainingAfter.daily,
        remainingAfter.total,
        remark,
      ],
    );
  }
}

async function lockQuotaLogRows(conn: PoolConnection, taskId: number): Promise<void> {
  await conn.execute('SELECT id FROM free_image_quota_logs WHERE task_id = ? FOR UPDATE', [taskId]);
}

async function readQuotaLogSummary(conn: PoolConnection, taskId: number): Promise<any> {
  const [logRows] = await conn.execute(
    `SELECT
        MAX(CASE WHEN event_type = 'reserve' THEN user_id ELSE NULL END) AS user_id,
        MAX(CASE WHEN event_type = 'reserve' THEN quota_date ELSE NULL END) AS quota_date,
        SUM(CASE WHEN event_type = 'reserve' THEN image_count ELSE 0 END) AS reserved_images,
        SUM(CASE WHEN event_type = 'consume' THEN image_count ELSE 0 END) AS consumed_images,
        SUM(CASE WHEN event_type = 'release' THEN image_count ELSE 0 END) AS released_images,
        SUM(CASE WHEN event_type IN ('consume', 'release') THEN image_count ELSE 0 END) AS settled_images
       FROM free_image_quota_logs
      WHERE task_id = ?`,
    [taskId],
  ) as any;
  return logRows?.[0] || {};
}

async function lockQuotaRow(conn: PoolConnection, userId: number): Promise<any | null> {
  const [rows] = await conn.execute(
    `SELECT user_id, quota_date, used_today, reserved_today, used_total, reserved_total,
            daily_limit_snapshot, total_limit_snapshot, version
       FROM user_free_image_quotas
      WHERE user_id = ?
      FOR UPDATE`,
    [userId],
  ) as any;
  return rows?.[0] || null;
}

async function readDbToday(conn: PoolConnection): Promise<string> {
  const [rows] = await conn.execute('SELECT CURDATE() AS today') as any;
  return formatQuotaDateKey(rows?.[0]?.today);
}

function readRaw(raw: Record<string, unknown>, key: string): unknown {
  if (raw[key] !== undefined) return raw[key];
  const camel = key.replace(/^free_image_quota\./, '').replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return raw[camel];
}

function normalizeTierKeyList(value: unknown, fallback: string[]): string[] {
  if (value === undefined || value === null) return [...fallback];
  let rawItems: unknown[];
  if (Array.isArray(value)) {
    rawItems = value;
  } else {
    const text = String(value).trim();
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        rawItems = Array.isArray(parsed) ? parsed : [];
      } catch {
        rawItems = [];
      }
    } else {
      rawItems = text
          .split(/[,\n，\s]+/)
          .map((item) => item.trim())
          .filter(Boolean);
    }
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of rawItems) {
    const normalized = normalizeTierKey(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result.length ? result : [...fallback];
}

function normalizeTierKey(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function toNonNegativeInt(value: unknown, fallback: number): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return Math.max(0, fallback);
  return Math.max(0, parsed);
}

function parseJsonObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function formatQuotaDateKey(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}
