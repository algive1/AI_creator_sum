import { randomInt } from 'crypto';
import type { PoolConnection } from 'mysql2/promise';
import { getConnection, queryOne, query } from '../utils/db';
import { SettingsService } from './settings.service';
import { lockPointAccountTx, applyPointChangeTx } from './points.service';
import { ErrorCodes } from '../types';

const INVITE_SHARE_TITLE = '邀请你体验 AI 创作';
const INVITE_SHARE_PATH = '/pages/login/index?redirect=%2Fpages%2Fhome%2Findex&inviteCode=';
const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type InviteRewardType = 'use' | 'member_purchase';
export type InviteRewardStatus = 'granted' | 'skipped' | 'failed';
export type InviteRelationSource = 'wechat_share' | 'manual' | 'link' | 'web_register';

export interface InviteConfig {
  enabled: boolean;
  rewardOnUseEnabled: boolean;
  rewardOnUsePoints: number;
  rewardOnMemberEnabled: boolean;
  rewardOnMemberPoints: number;
  maxRewardPerDay: number;
}

export interface InviteRewardOutcome {
  status: InviteRewardStatus;
  rewardType: InviteRewardType;
  points: number;
  reason: string;
  rewardLogId: number;
  pointLogId?: number;
  grantedAt?: string | null;
}

interface InviteRelationRow {
  id: number;
  inviter_user_id: number;
  invitee_user_id: number;
  invite_code: string;
  status: string;
  source: string;
  created_at: string;
  bound_at: string | null;
  invalid_reason: string;
}

interface InviteRewardRow {
  id: number;
  inviter_user_id: number;
  invitee_user_id: number;
  invite_id: number | null;
  reward_type: InviteRewardType;
  points: number;
  status: InviteRewardStatus;
  reason: string;
  related_order_id: string;
  point_log_id: number | null;
  granted_at: string | null;
  created_at: string;
}

export function normalizeInviteCode(value: string): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function buildInviteSharePath(inviteCode: string): string {
  return INVITE_SHARE_PATH + encodeURIComponent(inviteCode);
}

export function buildInviteShareTitle(): string {
  return INVITE_SHARE_TITLE;
}

export async function getInviteConfig(): Promise<InviteConfig> {
  const [
    enabled,
    rewardOnUseEnabled,
    rewardOnUsePoints,
    rewardOnMemberEnabled,
    rewardOnMemberPoints,
    maxRewardPerDay,
  ] = await Promise.all([
    SettingsService.getBoolean('invite.enabled', false),
    SettingsService.getBoolean('invite.reward_on_use_enabled', true),
    readInviteNumberSetting('invite.reward_on_use_points', 20),
    SettingsService.getBoolean('invite.reward_on_member_enabled', true),
    readInviteNumberSetting('invite.reward_on_member_points', 100),
    readInviteNumberSetting('invite.max_reward_per_day', 20),
  ]);

  return {
    enabled,
    rewardOnUseEnabled,
    rewardOnUsePoints,
    rewardOnMemberEnabled,
    rewardOnMemberPoints,
    maxRewardPerDay,
  };
}

export async function ensureUserInviteCode(userId: number): Promise<string> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const inviteCode = await ensureUserInviteCodeTx(conn, userId);
    await conn.commit();
    return inviteCode;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function ensureUserInviteCodeTx(conn: PoolConnection, userId: number): Promise<string> {
  const profile = await queryOneTx<{ id: number; invite_code: string }>(
    conn,
    'SELECT id, invite_code FROM user_profiles WHERE user_id = ? FOR UPDATE',
    [userId],
  );

  if (profile?.invite_code && profile.invite_code.trim()) {
    return profile.invite_code;
  }

  for (let attempt = 0; attempt < 20; attempt++) {
    const inviteCode = generateInviteCode();
    try {
      if (profile) {
        await conn.execute(
          'UPDATE user_profiles SET invite_code = ?, updated_at = NOW(3) WHERE id = ?',
          [inviteCode, profile.id],
        );
      } else {
        await conn.execute(
          `INSERT INTO user_profiles
            (user_id, invite_code, invited_by_user_id, preferences, created_at, updated_at)
           VALUES (?, ?, NULL, '{}', NOW(3), NOW(3))`,
          [userId, inviteCode],
        );
      }
      return inviteCode;
    } catch (error: any) {
      if (isDuplicateInviteCodeError(error)) {
        continue;
      }
      if (!profile && isDuplicateInviteProfileError(error)) {
        const row = await queryOneTx<{ invite_code: string }>(
          conn,
          'SELECT invite_code FROM user_profiles WHERE user_id = ? FOR UPDATE',
          [userId],
        );
        if (row?.invite_code && row.invite_code.trim()) {
          return row.invite_code;
        }
        continue;
      }
      throw error;
    }
  }

  throw new Error('生成邀请码失败，请稍后重试');
}

export async function bindInviteCode(
  inviteeUserId: number,
  inviteCode: string,
  source: InviteRelationSource = 'manual',
): Promise<{ relation: InviteRelationRow; reward: InviteRewardOutcome | null }> {
  const config = await getInviteConfig();
  if (!config.enabled) {
    throw Object.assign(new Error('邀请功能暂未开启。'), { code: ErrorCodes.INVITE_DISABLED });
  }

  const normalizedCode = normalizeInviteCode(inviteCode);
  if (!normalizedCode) {
    throw Object.assign(new Error('邀请码无效，请检查后重试。'), { code: ErrorCodes.INVITE_CODE_INVALID });
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    await ensureUserInviteCodeTx(conn, inviteeUserId);
    const inviter = await queryOneTx<{ user_id: number; invite_code: string }>(
      conn,
      `SELECT p.user_id, p.invite_code
         FROM user_profiles p
         INNER JOIN users u ON u.id = p.user_id
        WHERE p.invite_code = ? AND u.deleted_at IS NULL
        LIMIT 1`,
      [normalizedCode],
    );

    if (!inviter) {
      throw Object.assign(new Error('邀请码无效，请检查后重试。'), { code: ErrorCodes.INVITE_CODE_INVALID });
    }

    if (inviter.user_id === inviteeUserId) {
      throw Object.assign(new Error('不能填写自己的邀请码。'), { code: ErrorCodes.INVITE_SELF_NOT_ALLOWED });
    }

    const existing = await getInviteRelationByInviteeTx(conn, inviteeUserId);
    if (existing) {
      throw Object.assign(new Error('你已经绑定过邀请人，不能重复绑定。'), { code: ErrorCodes.INVITE_ALREADY_BOUND });
    }

    let relationResult: any;
    try {
      [relationResult] = await conn.execute(
        `INSERT INTO user_invites
          (inviter_user_id, invitee_user_id, invite_code, status, source, bound_at, invalid_reason, created_at, updated_at)
         VALUES (?, ?, ?, 'valid', ?, NOW(3), '', NOW(3), NOW(3))`,
        [inviter.user_id, inviteeUserId, normalizedCode, source],
      ) as any;
    } catch (error: any) {
      if (isDuplicateKeyError(error)) {
        throw Object.assign(new Error('你已经绑定过邀请人，不能重复绑定。'), { code: ErrorCodes.INVITE_ALREADY_BOUND });
      }
      throw error;
    }
    const relationId = Number((relationResult as any).insertId || 0);

    await conn.execute(
      `UPDATE user_profiles
          SET invited_by_user_id = ?, updated_at = NOW(3)
        WHERE user_id = ?
          AND (invited_by_user_id IS NULL OR invited_by_user_id = 0)`,
      [inviter.user_id, inviteeUserId],
    );

    await upsertLegacyInviteRelationTx(conn, {
      inviterUserId: inviter.user_id,
      inviteeUserId,
      inviteCode: normalizedCode,
      source,
    });

    const reward = await grantInviteRewardTx(conn, {
      inviteId: relationId,
      inviterUserId: inviter.user_id,
      inviteeUserId,
      rewardType: 'use',
      points: config.rewardOnUsePoints,
      relatedOrderId: '',
      inviteEnabled: config.enabled,
      rewardEnabled: config.rewardOnUseEnabled,
      maxRewardPerDay: config.maxRewardPerDay,
    });

    const relation = await queryOneTx<InviteRelationRow>(
      conn,
      `SELECT id, inviter_user_id, invitee_user_id, invite_code, status, source, created_at, bound_at, invalid_reason
         FROM user_invites
        WHERE id = ?`,
      [relationId],
    );

    await conn.commit();
    return { relation: relation!, reward };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function grantInviteMemberPurchaseReward(
  inviteeUserId: number,
  orderId: string | number,
): Promise<InviteRewardOutcome | null> {
  const config = await getInviteConfig();
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const relation = await getInviteRelationByInviteeTx(conn, inviteeUserId);
    if (!relation) {
      await conn.commit();
      return null;
    }

    const reward = await grantInviteRewardTx(conn, {
      inviteId: relation.id,
      inviterUserId: relation.inviter_user_id,
      inviteeUserId,
      rewardType: 'member_purchase',
      points: config.rewardOnMemberEnabled ? config.rewardOnMemberPoints : 0,
      relatedOrderId: String(orderId || ''),
      inviteEnabled: config.enabled,
      rewardEnabled: config.rewardOnMemberEnabled,
      maxRewardPerDay: config.maxRewardPerDay,
    });

    await conn.commit();
    return reward;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function getInviteSummary(userId: number): Promise<{
  enabled: boolean;
  inviteCode: string;
  sharePath: string;
  shareTitle: string;
  invitedCount: number;
  totalRewardPoints: number;
  todayRewardPoints: number;
  rewardOnUsePoints: number;
  rewardOnMemberPoints: number;
}> {
  const config = await getInviteConfig();
  const inviteCode = await ensureUserInviteCode(userId);
  const invitedCountRow = await queryOne<{ cnt: number }>(
    'SELECT COUNT(*) AS cnt FROM user_invites WHERE inviter_user_id = ? AND status = "valid"',
    [userId],
  );
  const totalRewardRow = await queryOne<{ total_points: number }>(
    `SELECT COALESCE(SUM(points), 0) AS total_points
       FROM invite_reward_logs
      WHERE inviter_user_id = ? AND status = 'granted'`,
    [userId],
  );
  const todayRewardRow = await queryOne<{ total_points: number }>(
    `SELECT COALESCE(SUM(points), 0) AS total_points
       FROM invite_reward_logs
      WHERE inviter_user_id = ? AND status = 'granted'
        AND DATE(granted_at) = CURDATE()`,
    [userId],
  );

  return {
    enabled: config.enabled,
    inviteCode,
    sharePath: buildInviteSharePath(inviteCode),
    shareTitle: INVITE_SHARE_TITLE,
    invitedCount: Number(invitedCountRow?.cnt || 0),
    totalRewardPoints: Number(totalRewardRow?.total_points || 0),
    todayRewardPoints: Number(todayRewardRow?.total_points || 0),
    rewardOnUsePoints: config.rewardOnUsePoints,
    rewardOnMemberPoints: config.rewardOnMemberPoints,
  };
}

export async function getInviteRewardRecords(userId: number, page = 1, pageSize = 20) {
  const safePage = Math.max(1, Math.trunc(page || 1));
  const safePageSize = Math.min(Math.max(1, Math.trunc(pageSize || 20)), 100);
  const offset = (safePage - 1) * safePageSize;

  const list = await query<any>(
    `SELECT
       r.id,
       r.reward_type,
       r.points,
       r.status,
       r.reason,
       r.related_order_id,
       r.created_at,
       r.granted_at,
       r.point_log_id,
       u.nickname AS invitee_nickname,
       u.id AS invitee_user_id
     FROM invite_reward_logs r
     LEFT JOIN users u ON u.id = r.invitee_user_id
     WHERE r.inviter_user_id = ?
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT ${safePageSize} OFFSET ${offset}`,
    [userId],
  );
  const totalRow = await queryOne<{ total: number }>(
    'SELECT COUNT(*) AS total FROM invite_reward_logs WHERE inviter_user_id = ?',
    [userId],
  );

  return {
    list: list.map((row: any) => ({
      id: row.id,
      inviteeNicknameMasked: maskNickname(row.invitee_nickname, row.invitee_user_id),
      rewardType: row.reward_type,
      points: row.points,
      status: row.status,
      reason: row.reason,
      createdAt: row.created_at,
      grantedAt: row.granted_at,
      relatedOrderId: row.related_order_id || '',
    })),
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total: Number(totalRow?.total || 0),
      totalPages: Math.ceil(Number(totalRow?.total || 0) / safePageSize),
    },
  };
}

export async function listInviteRelationsForAdmin(page = 1, pageSize = 20, keyword = '') {
  const safePage = Math.max(1, Math.trunc(page || 1));
  const safePageSize = Math.min(Math.max(1, Math.trunc(pageSize || 20)), 100);
  const offset = (safePage - 1) * safePageSize;
  const params: any[] = [];
  let where = '1=1';
  if (keyword.trim()) {
    where += ' AND (iu.invite_code LIKE ? OR iu.inviter_user_id = ? OR iu.invitee_user_id = ? OR inviter.nickname LIKE ? OR invitee.nickname LIKE ?)';
    params.push(`%${keyword.trim()}%`, Number(keyword) || 0, Number(keyword) || 0, `%${keyword.trim()}%`, `%${keyword.trim()}%`);
  }

  const list = await query<any>(
    `SELECT
       iu.id,
       iu.inviter_user_id,
       iu.invitee_user_id,
       iu.invite_code,
       iu.status,
       iu.source,
       iu.created_at,
       iu.bound_at,
       iu.invalid_reason,
       inviter.nickname AS inviter_nickname,
       invitee.nickname AS invitee_nickname
     FROM user_invites iu
     LEFT JOIN users inviter ON inviter.id = iu.inviter_user_id
     LEFT JOIN users invitee ON invitee.id = iu.invitee_user_id
     WHERE ${where}
     ORDER BY iu.created_at DESC, iu.id DESC
     LIMIT ${safePageSize} OFFSET ${offset}`,
    params,
  );
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM user_invites iu
      LEFT JOIN users inviter ON inviter.id = iu.inviter_user_id
      LEFT JOIN users invitee ON invitee.id = iu.invitee_user_id
      WHERE ${where}`,
    params,
  );

  return {
    list: list.map((row: any) => ({
      id: row.id,
      inviterUserId: row.inviter_user_id,
      inviterNickname: row.inviter_nickname || `用户${row.inviter_user_id}`,
      inviteeUserId: row.invitee_user_id,
      inviteeNicknameMasked: maskNickname(row.invitee_nickname, row.invitee_user_id),
      inviteCode: row.invite_code,
      status: row.status,
      source: row.source,
      createdAt: row.created_at,
      boundAt: row.bound_at,
      invalidReason: row.invalid_reason,
    })),
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total: Number(totalRow?.total || 0),
      totalPages: Math.ceil(Number(totalRow?.total || 0) / safePageSize),
    },
  };
}

export async function listInviteRewardLogsForAdmin(page = 1, pageSize = 20, keyword = '', rewardType = '') {
  const safePage = Math.max(1, Math.trunc(page || 1));
  const safePageSize = Math.min(Math.max(1, Math.trunc(pageSize || 20)), 100);
  const offset = (safePage - 1) * safePageSize;
  const params: any[] = [];
  let where = '1=1';

  if (rewardType.trim()) {
    where += ' AND r.reward_type = ?';
    params.push(rewardType.trim());
  }
  if (keyword.trim()) {
    where += ' AND (r.invite_id = ? OR r.inviter_user_id = ? OR r.invitee_user_id = ? OR r.related_order_id LIKE ? OR inviter.nickname LIKE ? OR invitee.nickname LIKE ? OR r.reason LIKE ?)';
    const numericKeyword = Number(keyword);
    params.push(
      Number.isFinite(numericKeyword) ? numericKeyword : 0,
      Number.isFinite(numericKeyword) ? numericKeyword : 0,
      Number.isFinite(numericKeyword) ? numericKeyword : 0,
      `%${keyword.trim()}%`,
      `%${keyword.trim()}%`,
      `%${keyword.trim()}%`,
      `%${keyword.trim()}%`,
    );
  }

  const list = await query<any>(
    `SELECT
       r.id,
       r.invite_id,
       r.inviter_user_id,
       r.invitee_user_id,
       r.reward_type,
       r.points,
       r.status,
       r.reason,
       r.related_order_id,
       r.point_log_id,
       r.created_at,
       r.granted_at,
       inviter.nickname AS inviter_nickname,
       invitee.nickname AS invitee_nickname
     FROM invite_reward_logs r
     LEFT JOIN users inviter ON inviter.id = r.inviter_user_id
     LEFT JOIN users invitee ON invitee.id = r.invitee_user_id
     WHERE ${where}
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT ${safePageSize} OFFSET ${offset}`,
    params,
  );
  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total
       FROM invite_reward_logs r
       LEFT JOIN users inviter ON inviter.id = r.inviter_user_id
       LEFT JOIN users invitee ON invitee.id = r.invitee_user_id
      WHERE ${where}`,
    params,
  );

  return {
    list: list.map((row: any) => ({
      id: row.id,
      inviteId: row.invite_id,
      inviterUserId: row.inviter_user_id,
      inviterNickname: row.inviter_nickname || `用户${row.inviter_user_id}`,
      inviteeUserId: row.invitee_user_id,
      inviteeNicknameMasked: maskNickname(row.invitee_nickname, row.invitee_user_id),
      rewardType: row.reward_type,
      points: row.points,
      status: row.status,
      reason: row.reason,
      relatedOrderId: row.related_order_id || '',
      createdAt: row.created_at,
      grantedAt: row.granted_at,
      pointLogId: row.point_log_id,
    })),
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total: Number(totalRow?.total || 0),
      totalPages: Math.ceil(Number(totalRow?.total || 0) / safePageSize),
    },
  };
}

async function grantInviteRewardTx(
  conn: PoolConnection,
  params: {
    inviteId: number;
    inviterUserId: number;
    inviteeUserId: number;
    rewardType: InviteRewardType;
    points: number;
    relatedOrderId: string;
    inviteEnabled: boolean;
    rewardEnabled: boolean;
    maxRewardPerDay: number;
  },
): Promise<InviteRewardOutcome> {
  const existing = await getInviteRewardByTypeTx(conn, params.inviterUserId, params.inviteeUserId, params.rewardType);
  if (existing) {
    return {
      status: existing.status,
      rewardType: existing.reward_type,
      points: existing.points,
      reason: existing.reason || '',
      rewardLogId: existing.id,
      pointLogId: existing.point_log_id || undefined,
      grantedAt: existing.granted_at,
    };
  }

  const rewardEnabled = params.inviteEnabled && params.rewardEnabled && params.points > 0;
  const reasonDisabled = !params.inviteEnabled ? 'INVITE_DISABLED' : 'REWARD_DISABLED';
  if (!rewardEnabled) {
    const skipped = await insertInviteRewardLogTx(conn, {
      ...params,
      status: 'skipped',
      reason: reasonDisabled,
      points: 0,
    });
    return skipped;
  }

  const todayCountRow = await queryOneTx<{ cnt: number }>(
    conn,
    `SELECT COUNT(*) AS cnt
       FROM invite_reward_logs
      WHERE inviter_user_id = ?
        AND status = 'granted'
        AND DATE(granted_at) = CURDATE()`,
    [params.inviterUserId],
  );
  if (Number(todayCountRow?.cnt || 0) >= Math.max(0, params.maxRewardPerDay)) {
    const skipped = await insertInviteRewardLogTx(conn, {
      ...params,
      status: 'skipped',
      reason: 'DAILY_LIMIT_REACHED',
      points: 0,
    });
    return skipped;
  }

  const rewardLog = await insertInviteRewardLogTx(conn, {
    ...params,
    status: 'failed',
    reason: 'PENDING',
  });

  const savepointName = `invite_reward_${rewardLog.rewardLogId}`;
  await conn.query(`SAVEPOINT ${savepointName}`);
  try {
    const account = await lockPointAccountTx(conn, params.inviterUserId);
    const pointChange = await applyPointChangeTx(conn, account, {
      userId: params.inviterUserId,
      amount: params.points,
      source: params.rewardType === 'use' ? 'invite_use_reward' : 'invite_member_purchase_reward',
      refType: 'invite_reward',
      refId: String(rewardLog.rewardLogId),
      title: params.rewardType === 'use' ? '邀请好友使用小程序奖励' : '邀请好友开通会员奖励',
      remark: params.relatedOrderId ? `related_order_id=${params.relatedOrderId}` : '',
    });

    await conn.execute(
      `UPDATE invite_reward_logs
          SET status = 'granted',
              reason = '',
              point_log_id = ?,
              granted_at = NOW(3),
              updated_at = NOW(3)
        WHERE id = ?`,
      [pointChange.pointLogId || null, rewardLog.rewardLogId],
    );

    return {
      status: 'granted',
      rewardType: params.rewardType,
      points: params.points,
      reason: '',
      rewardLogId: rewardLog.rewardLogId,
      pointLogId: pointChange.pointLogId || undefined,
      grantedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    await conn.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    await conn.execute(
      `UPDATE invite_reward_logs
          SET status = 'failed',
              reason = ?,
              updated_at = NOW(3)
        WHERE id = ?`,
      [normalizeRewardFailureReason(error), rewardLog.rewardLogId],
    );
    return {
      status: 'failed',
      rewardType: params.rewardType,
      points: 0,
      reason: 'INVITE_REWARD_FAILED',
      rewardLogId: rewardLog.rewardLogId,
    };
  }
}

async function insertInviteRewardLogTx(
  conn: PoolConnection,
  params: {
    inviteId: number;
    inviterUserId: number;
    inviteeUserId: number;
    rewardType: InviteRewardType;
    points: number;
    relatedOrderId: string;
    status: InviteRewardStatus;
    reason: string;
  },
): Promise<InviteRewardOutcome> {
  let result: any;
  try {
    [result] = await conn.execute(
      `INSERT INTO invite_reward_logs
        (invite_id, inviter_user_id, invitee_user_id, reward_type, points, status, reason, related_order_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
      [
        params.inviteId,
        params.inviterUserId,
        params.inviteeUserId,
        params.rewardType,
        params.points,
        params.status,
        params.reason,
        params.relatedOrderId,
      ],
    ) as any;
  } catch (error: any) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }
    const existing = await getInviteRewardByTypeTx(conn, params.inviterUserId, params.inviteeUserId, params.rewardType);
    if (existing) {
      return {
        status: existing.status,
        rewardType: existing.reward_type,
        points: existing.points,
        reason: existing.reason || '',
        rewardLogId: existing.id,
        pointLogId: existing.point_log_id || undefined,
        grantedAt: existing.granted_at,
      };
    }
    throw error;
  }

  const rewardLogId = Number((result as any).insertId || 0);
  if (params.status === 'skipped') {
    return {
      status: 'skipped',
      rewardType: params.rewardType,
      points: 0,
      reason: params.reason,
      rewardLogId,
    };
  }
  return {
    status: params.status,
    rewardType: params.rewardType,
    points: params.points,
    reason: params.reason,
    rewardLogId,
  };
}

async function getInviteRewardByTypeTx(
  conn: PoolConnection,
  inviterUserId: number,
  inviteeUserId: number,
  rewardType: InviteRewardType,
): Promise<InviteRewardRow | null> {
  return queryOneTx<InviteRewardRow>(
    conn,
    `SELECT id, inviter_user_id, invitee_user_id, invite_id, reward_type, points, status, reason,
            related_order_id, point_log_id, granted_at, created_at
       FROM invite_reward_logs
      WHERE inviter_user_id = ? AND invitee_user_id = ? AND reward_type = ?
      ORDER BY id DESC
      LIMIT 1`,
    [inviterUserId, inviteeUserId, rewardType],
  );
}

async function getInviteRelationByInviteeTx(conn: PoolConnection, inviteeUserId: number): Promise<InviteRelationRow | null> {
  const existing = await queryOneTx<InviteRelationRow>(
    conn,
    `SELECT id, inviter_user_id, invitee_user_id, invite_code, status, source, created_at, bound_at, invalid_reason
       FROM user_invites
      WHERE invitee_user_id = ?
      LIMIT 1`,
    [inviteeUserId],
  );
  if (existing) {
    return existing;
  }

  const legacy = await queryOneTx<any>(
    conn,
    `SELECT id, inviter_user_id, invitee_user_id, invite_code_used, status, created_at
       FROM invite_relations
      WHERE invitee_user_id = ?
      ORDER BY id DESC
      LIMIT 1`,
    [inviteeUserId],
  );
  if (!legacy) {
    return null;
  }

  const inviteCode = normalizeInviteCode(legacy.invite_code_used || '');
  try {
    await conn.execute(
      `INSERT INTO user_invites
        (inviter_user_id, invitee_user_id, invite_code, status, source, bound_at, invalid_reason, created_at, updated_at)
       VALUES (?, ?, ?, 'valid', 'manual', ?, '', NOW(3), NOW(3))`,
      [
        legacy.inviter_user_id,
        legacy.invitee_user_id,
        inviteCode,
        legacy.created_at || new Date(),
      ],
    );
  } catch (error: any) {
    if (!isDuplicateInviteProfileError(error) && !isDuplicateInviteCodeError(error)) {
      throw error;
    }
  }

  return queryOneTx<InviteRelationRow>(
    conn,
    `SELECT id, inviter_user_id, invitee_user_id, invite_code, status, source, created_at, bound_at, invalid_reason
       FROM user_invites
      WHERE invitee_user_id = ?
      LIMIT 1`,
    [inviteeUserId],
  );
}

async function upsertLegacyInviteRelationTx(
  conn: PoolConnection,
  params: { inviterUserId: number; inviteeUserId: number; inviteCode: string; source: InviteRelationSource },
): Promise<void> {
  await conn.execute(
    `INSERT INTO invite_relations
      (inviter_user_id, invitee_user_id, invite_code_used, status, created_at)
     VALUES (?, ?, ?, 'registered', NOW(3))
     ON DUPLICATE KEY UPDATE
       inviter_user_id = VALUES(inviter_user_id),
       invite_code_used = VALUES(invite_code_used),
       status = 'registered'`,
    [params.inviterUserId, params.inviteeUserId, params.inviteCode],
  );
}

async function queryOneTx<T>(conn: PoolConnection, sql: string, params?: any[]): Promise<T | null> {
  const [rows] = await conn.execute(sql, params) as any;
  return Array.isArray(rows) && rows.length > 0 ? rows[0] as T : null;
}

function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += INVITE_CODE_ALPHABET[randomInt(0, INVITE_CODE_ALPHABET.length)];
  }
  return code;
}

function isDuplicateInviteCodeError(error: any): boolean {
  return isDuplicateKeyError(error) && String(error?.message || '').includes('uk_invite_code');
}

function isDuplicateInviteProfileError(error: any): boolean {
  return isDuplicateKeyError(error) && String(error?.message || '').includes('uk_user_id');
}

function isDuplicateKeyError(error: any): boolean {
  return error?.code === 'ER_DUP_ENTRY' || Number(error?.errno || 0) === 1062;
}

function maskNickname(nickname: string | null | undefined, userId: number): string {
  const raw = String(nickname || '').trim();
  if (!raw) return `用户${String(userId).slice(-4)}`;
  if (raw.length <= 1) return `${raw}*`;
  if (raw.length === 2) return `${raw[0]}*`;
  return `${raw.slice(0, 1)}*${raw.slice(-1)}`;
}

function normalizeRewardFailureReason(error: any): string {
  const message = String(error?.message || 'INVITE_REWARD_FAILED');
  return message.slice(0, 255);
}

async function readInviteNumberSetting(key: string, defaultValue: number): Promise<number> {
  const raw = await SettingsService.get(key, String(defaultValue));
  const value = Number.parseInt(String(raw), 10);
  return Number.isFinite(value) ? Math.max(0, value) : defaultValue;
}
