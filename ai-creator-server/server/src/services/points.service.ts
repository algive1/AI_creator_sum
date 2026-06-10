// src/services/points.service.ts
import type { PoolConnection } from 'mysql2/promise';
import { getConnection, queryOne, query } from '../utils/db';

interface PointsOperation {
  allowed: boolean;
  errorCode?: number;
  errorMessage?: string;
  newBalance?: number;
  newFrozen?: number;
  earnedDelta?: number;
  spentDelta?: number;
  refundedDelta?: number;
}

export interface LockedPointAccount {
  balance: number;
  frozen_balance: number;
  version: number;
}

export interface PointChangeTxParams {
  userId: number;
  amount: number;
  source: string;
  refType: string;
  refId: string;
  title: string;
  remark?: string;
  operatorId?: number | null;
}

export async function executePointsTransaction(
  userId: number,
  operation: (account: { balance: number; frozenBalance: number; version: number }) => PointsOperation
): Promise<void> {
  return retryPointVersionConflict(async () => {
    const conn = await getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.execute(
        'SELECT balance, frozen_balance, version FROM point_accounts WHERE user_id = ? FOR UPDATE',
        [userId]
      ) as any;

      if (!rows || rows.length === 0) {
        throw Object.assign(new Error('积分账户不存在'), { code: 1005 });
      }

      const account = rows[0];
      const result = operation(account);

      if (!result.allowed) {
        await conn.rollback();
        throw Object.assign(new Error(result.errorMessage || '操作失败'), { code: result.errorCode || 1002 });
      }

      const [updateResult] = await conn.execute(
        `UPDATE point_accounts
         SET balance = ?, frozen_balance = ?, total_earned = total_earned + ?,
             total_spent = total_spent + ?, total_refunded = total_refunded + ?,
             version = version + 1, updated_at = NOW(3)
         WHERE user_id = ? AND version = ?`,
        [
          result.newBalance ?? account.balance,
          result.newFrozen ?? account.frozen_balance,
          result.earnedDelta ?? 0,
          result.spentDelta ?? 0,
          result.refundedDelta ?? 0,
          userId,
          account.version,
        ]
      );

      if ((updateResult as any).affectedRows === 0) {
        throw Object.assign(new Error('积分账户版本冲突'), { code: 'POINT_VERSION_CONFLICT' });
      }

      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  });
}

export async function lockPointAccountTx(conn: PoolConnection, userId: number): Promise<LockedPointAccount> {
  let [rows] = await conn.execute(
    'SELECT balance, frozen_balance, version FROM point_accounts WHERE user_id = ? FOR UPDATE',
    [userId],
  ) as any;

  if (!rows || rows.length === 0) {
    await conn.execute(
      `INSERT INTO point_accounts
       (user_id, balance, total_earned, total_spent, total_refunded, frozen_balance, version, created_at, updated_at)
       VALUES (?, 0, 0, 0, 0, 0, 1, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE updated_at = updated_at`,
      [userId],
    );
    [rows] = await conn.execute(
      'SELECT balance, frozen_balance, version FROM point_accounts WHERE user_id = ? FOR UPDATE',
      [userId],
    ) as any;
    if (!rows || rows.length === 0) {
      throw Object.assign(new Error('积分账户不存在'), { code: 1005 });
    }
  }

  return rows[0];
}

export async function applyPointChangeTx(
  conn: PoolConnection,
  account: LockedPointAccount,
  params: PointChangeTxParams,
): Promise<{ balanceBefore: number; balanceAfter: number; pointLogId: number }> {
  const amount = Math.trunc(params.amount);
  if (amount === 0) {
    return { balanceBefore: account.balance, balanceAfter: account.balance, pointLogId: 0 };
  }

  const balanceBefore = account.balance;
  const balanceAfter = balanceBefore + amount;
  if (balanceAfter < 0) {
    throw Object.assign(new Error('积分不足'), { code: 1002 });
  }

  const earnedDelta = amount > 0 ? amount : 0;
  const spentDelta = amount < 0 ? Math.abs(amount) : 0;
  const type = amount > 0 ? 'earn' : 'spend';

  const [updateResult] = await conn.execute(
    `UPDATE point_accounts
       SET balance = ?, total_earned = total_earned + ?, total_spent = total_spent + ?,
           version = version + 1, updated_at = NOW(3)
       WHERE user_id = ? AND version = ?`,
    [balanceAfter, earnedDelta, spentDelta, params.userId, account.version],
  );

  if ((updateResult as any).affectedRows === 0) {
    throw Object.assign(new Error('积分账户版本冲突'), { code: 'POINT_VERSION_CONFLICT' });
  }

  const [pointLogResult] = await conn.execute(
    `INSERT INTO point_logs
     (user_id, type, amount, balance_before, balance_after, frozen_before, frozen_after,
      source, ref_type, ref_id, title, remark, operator_id, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, NOW(3))`,
    [
      params.userId,
      type,
      amount,
      balanceBefore,
      balanceAfter,
      params.source,
      params.refType,
      params.refId,
      params.title,
      params.remark ?? '',
      params.operatorId ?? null,
    ],
  );
  const pointLogId = Number((pointLogResult as any).insertId || 0);

  await conn.execute(
    `INSERT INTO user_assets
     (user_id, points_balance, total_points_earned, total_points_spent, membership_level, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'free', NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE
       points_balance = VALUES(points_balance),
       total_points_earned = total_points_earned + VALUES(total_points_earned),
       total_points_spent = total_points_spent + VALUES(total_points_spent),
       updated_at = NOW(3)`,
    [params.userId, balanceAfter, earnedDelta, spentDelta],
  );

  account.balance = balanceAfter;
  account.version += 1;

  return { balanceBefore, balanceAfter, pointLogId };
}

export async function insertPointLog(params: {
  userId: number; type: string; amount: number;
  balanceBefore: number; balanceAfter: number;
  frozenBefore?: number; frozenAfter?: number;
  source: string; refType: string; refId: string;
  title: string; remark?: string; operatorId?: number;
}) {
  const conn = await getConnection();
  try {
    await conn.execute(
      `INSERT INTO point_logs (user_id, type, amount, balance_before, balance_after,
        frozen_before, frozen_after, source, ref_type, ref_id, title, remark, operator_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        params.userId, params.type, params.amount,
        params.balanceBefore, params.balanceAfter,
        params.frozenBefore ?? 0, params.frozenAfter ?? 0,
        params.source, params.refType, params.refId,
        params.title, params.remark ?? '', params.operatorId ?? null,
      ]
    );
  } finally {
    conn.release();
  }
}

export async function getPointsBalance(userId: number) {
  const row = await queryOne<any>(
    'SELECT balance, total_earned, total_spent, total_refunded, frozen_balance FROM point_accounts WHERE user_id = ?',
    [userId]
  );
  if (!row) return { balance: 0, totalEarned: 0, totalSpent: 0, totalRefunded: 0, frozenBalance: 0 };
  return {
    balance: row.balance,
    totalEarned: row.total_earned,
    totalSpent: row.total_spent,
    totalRefunded: row.total_refunded,
    frozenBalance: row.frozen_balance,
  };
}

export async function getPointsTransactions(
  userId: number,
  options: { type?: string; source?: string; direction?: string; category?: string; page?: number; pageSize?: number }
) {
  const page = options.page || 1;
  const pageSize = Math.min(options.pageSize || 20, 100);
  const offset = (page - 1) * pageSize;

  let where = 'user_id = ?';
  const params: any[] = [userId];
  if (options.type) { where += ' AND type = ?'; params.push(options.type); }
  if (options.source) { where += ' AND source = ?'; params.push(options.source); }
  if (options.direction === 'income') where += ' AND amount > 0';
  if (options.direction === 'expense') where += ' AND amount < 0';

  switch (options.category) {
    case 'recharge':
      where += ' AND source = ? AND ref_type = ?';
      params.push('wechat_pay', 'order_recharge');
      break;
    case 'task':
      where += ` AND (
        source IN ('task_spend', 'task_refund')
        OR ref_type IN ('ai_task_freeze', 'ai_task_settle', 'ai_task_refund')
      )`;
      break;
    case 'signin':
      where += " AND source IN ('signin', 'signin_normal', 'signin_super', 'signin_makeup')";
      break;
    case 'ad':
      where += " AND source IN ('ad', 'ad_reward')";
      break;
    case 'invite':
      where += " AND source IN ('invite_use_reward', 'invite_member_purchase_reward')";
      break;
    case 'membership':
      where += " AND (source = 'membership_monthly' OR (source = 'wechat_pay' AND ref_type = 'member_purchase_bonus'))";
      break;
    default:
      break;
  }

  const rows = await query<any>(
    `SELECT id, type, amount, balance_before, balance_after, source, ref_type, ref_id, title, remark, created_at
     FROM point_logs WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  const [countRow] = await query<any>(
    `SELECT COUNT(*) as total FROM point_logs WHERE ${where}`, params
  );
  const total = countRow?.total || 0;
  const list = rows.map((row: any) => ({
    ...row,
    refType: row.ref_type || '',
    refId: row.ref_id || '',
    balanceBefore: row.balance_before,
    balanceAfter: row.balance_after,
    createdAt: row.created_at,
  }));
  return { list, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

async function retryPointVersionConflict<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  let lastError: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (err?.code !== 'POINT_VERSION_CONFLICT' || attempt >= maxAttempts) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  if (lastError?.code === 'POINT_VERSION_CONFLICT') {
    throw Object.assign(new Error('操作繁忙，请重试'), { code: 429 });
  }
  throw lastError;
}
