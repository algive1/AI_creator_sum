import type { PoolConnection } from 'mysql2/promise';
import { getConnection, query } from '../utils/db';
import { applyPointChangeTx, lockPointAccountTx } from './points.service';

const CYCLE_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface MembershipMonthlyPointRule {
  membershipId: number;
  userId: number;
  orderNo?: string;
  planName?: string;
  durationDays: number;
  totalPoints: number;
  immediatePoints: number;
  monthlyPoints: number;
  giftPoints: number;
  grantMode: string;
  startedAt: Date | string;
  expireAt: Date | string;
}

interface CycleGrant {
  cycleNo: number;
  amount: number;
}

export function calculateDueMembershipMonthlyGrants(rule: MembershipMonthlyPointRule, now = new Date()): CycleGrant[] {
  const monthlyPoints = Math.max(0, Math.trunc(Number(rule.monthlyPoints || 0)));
  if (monthlyPoints <= 0) return [];
  if (!['monthly', 'mixed'].includes(String(rule.grantMode || '').trim())) return [];

  const startedAt = new Date(rule.startedAt).getTime();
  const expireAt = new Date(rule.expireAt).getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(expireAt) || nowMs < startedAt || nowMs >= expireAt) return [];

  const durationDays = Math.max(1, Math.trunc(Number(rule.durationDays || 0)));
  const cycleCount = Math.max(1, Math.round(durationDays / CYCLE_DAYS));
  const monthlyBudget = Math.max(
    0,
    Math.trunc(Number(rule.totalPoints || 0)) - Math.max(0, Math.trunc(Number(rule.immediatePoints || 0))) - Math.max(0, Math.trunc(Number(rule.giftPoints || 0))),
  ) || monthlyPoints * cycleCount;
  const elapsedCycles = Math.min(cycleCount, Math.floor((nowMs - startedAt) / (CYCLE_DAYS * MS_PER_DAY)) + 1);
  const grants: CycleGrant[] = [];
  let granted = 0;

  for (let cycleNo = 1; cycleNo <= elapsedCycles && granted < monthlyBudget; cycleNo++) {
    const remainingBudget = monthlyBudget - granted;
    const amount = cycleNo === cycleCount
      ? remainingBudget
      : Math.min(monthlyPoints, remainingBudget);
    if (amount > 0) {
      grants.push({ cycleNo, amount });
      granted += amount;
    }
  }
  return grants;
}

export async function grantDueMembershipMonthlyPointsTx(
  conn: PoolConnection,
  rule: MembershipMonthlyPointRule,
  now = new Date(),
): Promise<{ grantedCount: number; grantedPoints: number }> {
  let grantedCount = 0;
  let grantedPoints = 0;
  const grants = calculateDueMembershipMonthlyGrants(rule, now);

  for (const grant of grants) {
    const refId = `${rule.membershipId}:${grant.cycleNo}`;
    const [existingRows] = await conn.execute(
      'SELECT id FROM point_logs WHERE source = ? AND ref_type = ? AND ref_id = ? LIMIT 1',
      ['membership_monthly', 'membership_cycle', refId],
    ) as any;
    if (existingRows?.length) continue;

    const account = await lockPointAccountTx(conn, rule.userId);
    await applyPointChangeTx(conn, account, {
      userId: rule.userId,
      amount: grant.amount,
      source: 'membership_monthly',
      refType: 'membership_cycle',
      refId,
      title: '会员月度积分到账',
      remark: `${rule.planName || '会员套餐'} 第${grant.cycleNo}期`,
    });
    grantedCount++;
    grantedPoints += grant.amount;
  }

  return { grantedCount, grantedPoints };
}

export async function processMembershipMonthlyPointGrants(userId?: number): Promise<{ memberships: number; grantedCount: number; grantedPoints: number }> {
  const params: any[] = [];
  let whereUser = '';
  if (userId) {
    whereUser = ' AND um.user_id = ?';
    params.push(userId);
  }

  const memberships = await query<any>(
    `SELECT um.id AS membershipId, um.user_id AS userId, um.started_at AS startedAt, um.expire_at AS expireAt,
            mo.order_no AS orderNo, mp.name AS planName, mp.duration_days AS durationDays,
            COALESCE(pr.total_points, 0) AS totalPoints,
            COALESCE(pr.immediate_points, 0) AS immediatePoints,
            COALESCE(pr.monthly_points, 0) AS monthlyPoints,
            COALESCE(pr.gift_points, 0) AS giftPoints,
            COALESCE(pr.grant_mode, 'immediate') AS grantMode
       FROM user_memberships um
       JOIN member_plans mp ON mp.id = um.plan_id
       LEFT JOIN member_orders mo ON mo.id = um.order_id
       LEFT JOIN member_plan_point_rules pr ON pr.plan_id = um.plan_id
      WHERE um.status = 'active'
        AND um.expire_at > NOW(3)
        AND COALESCE(pr.monthly_points, 0) > 0
        AND COALESCE(pr.grant_mode, 'immediate') IN ('monthly', 'mixed')
        ${whereUser}
      ORDER BY um.started_at ASC
      LIMIT 500`,
    params,
  );

  let grantedCount = 0;
  let grantedPoints = 0;
  for (const membership of memberships) {
    const conn = await getConnection();
    try {
      await conn.beginTransaction();
      const result = await grantDueMembershipMonthlyPointsTx(conn, membership);
      await conn.commit();
      grantedCount += result.grantedCount;
      grantedPoints += result.grantedPoints;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  return { memberships: memberships.length, grantedCount, grantedPoints };
}
