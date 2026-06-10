import { Request } from 'express';
import { verifyToken } from '../services/auth.service';
import { queryOne } from './db';

export async function optionalUserId(req: Request): Promise<number | null> {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    const payload = verifyToken(header.substring(7));
    return Number((payload as any).userId) || null;
  } catch {
    return null;
  }
}

export async function matchesTarget(row: any, userId: number): Promise<boolean> {
  const targetType = row.target_type || 'all';
  if (targetType === 'all') return true;
  if (targetType === 'specified') {
    const ids = Array.isArray(row.target_user_ids) ? row.target_user_ids : parseJson(row.target_user_ids, []);
    return ids.map(Number).includes(Number(userId));
  }
  if (targetType === 'new_users') {
    const user = await queryOne<any>(
      'SELECT id FROM users WHERE id = ? AND created_at >= DATE_SUB(NOW(3), INTERVAL 7 DAY) AND deleted_at IS NULL LIMIT 1',
      [userId],
    );
    return !!user;
  }
  if (targetType === 'vip' || targetType === 'free') {
    const m = await queryOne<any>(
      'SELECT level_after FROM user_memberships WHERE user_id = ? AND status = ? AND expire_at > NOW(3) ORDER BY expire_at DESC LIMIT 1',
      [userId, 'active'],
    );
    return targetType === 'vip' ? !!m && m.level_after !== 'free' : !m || m.level_after === 'free';
  }
  return true;
}

export function parseJson(value: any, fallback: any = []) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * 判断给定日期是否为今天（使用本地时区，而非 UTC）。
 * 数据库使用 +08:00 时区，JS Date 的本地方法默认使用系统时区。
 */
export function isToday(value: Date | string): boolean {
  const date = value instanceof Date ? value : new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}
