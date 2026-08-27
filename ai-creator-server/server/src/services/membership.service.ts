import type { PoolConnection } from 'mysql2/promise';
import { queryOne, query } from '../utils/db';
import { appCache } from '../utils/ttl-cache';
import { normalizePublicIconUrl } from './member-benefit-icons.service';

export interface MemberFeatureDiscount {
  featureKey: string;
  featureName: string;
  discountPercent: number;
}

export interface ResolvedMemberDiscount {
  planId: number;
  versionKey: string;
  planName: string;
  discountPercent: number;
  memberDiscountApplied: boolean;
  source: 'feature' | 'legacy' | 'none';
}

export function normalizeDiscountPercent(value: unknown): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return 100;
  return Math.min(100, Math.max(1, Math.round(raw * 100) / 100));
}

export function applyFeatureDiscount(basePointsCost: number, discountPercent: number): number {
  const base = Math.max(0, Math.trunc(Number(basePointsCost) || 0));
  if (base <= 0) return 0;
  return Math.max(1, Math.round(base * normalizeDiscountPercent(discountPercent) / 100));
}

export async function isActiveMember(userId: number): Promise<boolean> {
  if (!userId) return false;
  const membership = await queryOne<any>(
    `SELECT level_after
       FROM user_memberships
      WHERE user_id = ? AND status = 'active' AND expire_at > NOW(3)
      ORDER BY expire_at DESC
      LIMIT 1`,
    [userId],
  );
  return !!membership && membership.level_after !== 'free';
}

export async function processExpiredMemberships(): Promise<{ expired: number; downgraded: number }> {
  const affectedUsers = await query<any>(
    `SELECT DISTINCT user_id, level_after
       FROM user_memberships
      WHERE status = 'active' AND expire_at <= NOW(3)`,
  );

  if (affectedUsers.length === 0) return { expired: 0, downgraded: 0 };

  await query(
    `UPDATE user_memberships
        SET status = 'expired'
      WHERE status = 'active' AND expire_at <= NOW(3)`,
  );

  let downgraded = 0;
  for (const row of affectedUsers) {
    // 用 NOT EXISTS 子查询消除 TOCTOU 窗口：
    // 降级前再次确认用户确实没有活跃的会员记录（防止并发购买被覆盖）
    const [result] = await query<any>(
      `UPDATE user_assets
          SET membership_level = 'free', membership_expire_at = NULL
        WHERE user_id = ?
          AND membership_level = ?
          AND NOT EXISTS (
            SELECT 1 FROM user_memberships
             WHERE user_id = user_assets.user_id
               AND status = 'active'
               AND expire_at > NOW(3)
          )`,
      [row.user_id, row.level_after],
    );
    if ((result as any)?.affectedRows > 0) {
      downgraded++;
    }
  }

  console.log(`[Membership] Processed ${affectedUsers.length} expired memberships, downgraded ${downgraded} users`);
  return { expired: affectedUsers.length, downgraded };
}

export async function getMembershipVersions() {
  return appCache.remember(
    'membership:versions:active',
    10 * 60 * 1000,
    () => query<any>(
      'SELECT id, name, version_key, description, sort_order, status FROM member_versions WHERE status = ? ORDER BY sort_order',
      ['active'],
    ),
  );
}

export async function getPlanFeatureDiscounts(planId: number): Promise<MemberFeatureDiscount[]> {
  const rows = await query<any>(
    `SELECT d.feature_key, mf.feature_name, d.discount_percent
       FROM member_plan_feature_discounts d
       LEFT JOIN model_features mf ON mf.feature_key = d.feature_key
      WHERE d.plan_id = ? AND d.status = 'active'
      ORDER BY COALESCE(mf.sort_order, 999), d.feature_key`,
    [planId],
  );
  return rows.map((row: any) => ({
    featureKey: row.feature_key,
    featureName: row.feature_name || row.feature_key,
    discountPercent: normalizeDiscountPercent(row.discount_percent),
  }));
}

export async function replacePlanFeatureDiscounts(planId: number, discounts: any[]): Promise<void>;
export async function replacePlanFeatureDiscounts(conn: PoolConnection, planId: number, discounts: any[]): Promise<void>;
export async function replacePlanFeatureDiscounts(connOrPlanId: PoolConnection | number, discountsOrPlanId: any[] | number, maybeDiscounts?: any[]): Promise<void> {
  const conn: PoolConnection | null = maybeDiscounts !== undefined ? connOrPlanId as PoolConnection : null;
  const planId: number = maybeDiscounts !== undefined ? discountsOrPlanId as number : connOrPlanId as number;
  const discounts: any[] = (maybeDiscounts !== undefined ? maybeDiscounts : discountsOrPlanId as any[]) || [];
  const rows = Array.isArray(discounts) ? discounts : [];
  const exec = async (sql: string, params: any[]) => conn ? conn.execute(sql, params) : query(sql, params);
  await exec('DELETE FROM member_plan_feature_discounts WHERE plan_id = ?', [planId]);
  for (const item of rows) {
    const featureKey = String(item.featureKey || item.feature_key || '').trim();
    if (!featureKey) continue;
    await exec(
      `INSERT INTO member_plan_feature_discounts (plan_id, feature_key, discount_percent, status)
       VALUES (?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE discount_percent = VALUES(discount_percent), status = 'active', updated_at = NOW(3)`,
      [planId, featureKey, normalizeDiscountPercent(item.discountPercent ?? item.discount_percent)],
    );
  }
}

export async function getMembershipPlans(version?: string) {
  return appCache.remember(`membership:plans:${version || 'all'}`, 10 * 60 * 1000, async () => {
    let sql = `SELECT p.id, p.name, p.plan_key, p.duration_type, p.duration_days, p.price, p.original_price,
                    p.tag, p.highlight_features, p.sort_order,
                    v.name AS version_name, v.version_key,
                    pr.id AS point_rule_id, pr.total_points, pr.immediate_points, pr.monthly_points,
                    pr.gift_points, pr.grant_mode, pr.points_expire_type, pr.points_discount_rate
               FROM member_plans p
               JOIN member_versions v ON v.id = p.version_id
               LEFT JOIN member_plan_point_rules pr ON pr.plan_id = p.id
              WHERE p.status = ? AND v.status = ?`;
    const params: any[] = ['active', 'active'];
    if (version) {
      sql += ' AND v.version_key = ?';
      params.push(version);
    }
    sql += ' ORDER BY v.sort_order, p.sort_order';
    return query<any>(sql, params);
  });
}

export async function getPlanDetail(planId: number) {
  const plan = await queryOne<any>(
    'SELECT p.*, v.name as version_name, v.version_key FROM member_plans p JOIN member_versions v ON v.id = p.version_id WHERE p.id = ?',
    [planId],
  );
  if (!plan) return null;

  // Merge version rights template with plan overrides; only return enabled rights
  const rights = await query<any>(
    `SELECT vr.right_key, vr.right_name,
            COALESCE(pr.right_value, vr.right_value) AS right_value,
            vr.hint, vr.right_category,
            COALESCE(pr.icon_url, vr.icon_url) AS icon_url,
            COALESCE(pr.icon_file_id, vr.icon_file_id) AS icon_file_id
       FROM member_version_rights vr
       LEFT JOIN member_plan_rights pr ON pr.plan_id = ? AND pr.right_key COLLATE utf8mb4_unicode_ci = vr.right_key COLLATE utf8mb4_unicode_ci
      WHERE vr.version_id = ?
        AND COALESCE(pr.enabled, 1) = 1
      ORDER BY COALESCE(pr.sort_order, vr.sort_order)`,
    [planId, plan.version_id],
  );
  const pointRules = await queryOne<any>('SELECT * FROM member_plan_point_rules WHERE plan_id = ?', [planId]);
  const featureDiscounts = await getPlanFeatureDiscounts(planId);
  return { plan, rights: await normalizeRightsWithIcons(rights), pointRules, featureDiscounts };
}

export async function resolveMemberFeatureDiscount(userId: number, featureKey: string): Promise<ResolvedMemberDiscount> {
  const fallback: ResolvedMemberDiscount = {
    planId: 0,
    versionKey: '',
    planName: '',
    discountPercent: 100,
    memberDiscountApplied: false,
    source: 'none',
  };
  const key = String(featureKey || '').trim();
  if (!userId || !key) return fallback;

  const membership = await queryOne<any>(
    `SELECT um.plan_id, mp.name AS plan_name, mv.version_key
       FROM user_memberships um
       JOIN member_plans mp ON mp.id = um.plan_id
       JOIN member_versions mv ON mv.id = um.version_id
      WHERE um.user_id = ? AND um.status = 'active' AND um.expire_at > NOW(3)
      ORDER BY um.expire_at DESC
      LIMIT 1`,
    [userId],
  );
  if (!membership?.plan_id) return fallback;

  const row = await queryOne<any>(
    `SELECT discount_percent
       FROM member_plan_feature_discounts
      WHERE plan_id = ? AND feature_key = ? AND status = 'active'
      LIMIT 1`,
    [membership.plan_id, key],
  );
  if (row) {
    const discountPercent = normalizeDiscountPercent(row.discount_percent);
    return {
      planId: Number(membership.plan_id),
      versionKey: membership.version_key || '',
      planName: membership.plan_name || '',
      discountPercent,
      memberDiscountApplied: discountPercent < 100,
      source: 'feature',
    };
  }

  const pointRule = await queryOne<any>('SELECT points_discount_rate FROM member_plan_point_rules WHERE plan_id = ?', [membership.plan_id]);
  const legacyRate = Number(pointRule?.points_discount_rate ?? 1);
  const discountPercent = legacyRate > 0 && legacyRate < 1 ? normalizeDiscountPercent(legacyRate * 100) : 100;
  return {
    planId: Number(membership.plan_id),
    versionKey: membership.version_key || '',
    planName: membership.plan_name || '',
    discountPercent,
    memberDiscountApplied: discountPercent < 100,
    source: discountPercent < 100 ? 'legacy' : 'none',
  };
}

export async function getUserMembership(userId: number) {
  const membership = await queryOne<any>(
    `SELECT um.level_after, um.started_at, um.expire_at, um.status, um.auto_renew,
            mp.name as plan_name, mv.name as version_name, mv.version_key
       FROM user_memberships um
       JOIN member_plans mp ON mp.id = um.plan_id
       JOIN member_versions mv ON mv.id = um.version_id
      WHERE um.user_id = ? AND um.status = 'active' AND um.expire_at > NOW(3)
      ORDER BY um.expire_at DESC
      LIMIT 1`,
    [userId],
  );

  if (!membership) {
    return {
      membershipLevel: 'free',
      planName: null,
      startedAt: null,
      expireAt: null,
      isExpired: false,
      autoRenew: false,
      versionName: null,
      versionKey: null,
    };
  }

  return {
    membershipLevel: membership.level_after,
    planName: membership.plan_name,
    startedAt: membership.started_at,
    expireAt: membership.expire_at,
    isExpired: new Date(membership.expire_at) < new Date(),
    autoRenew: !!membership.auto_renew,
    versionName: membership.version_name,
    versionKey: membership.version_key,
  };
}

export async function getMembershipRights(userId: number) {
  const membership = await queryOne<any>(
    `SELECT um.plan_id, p.version_id
       FROM user_memberships um
       JOIN member_plans p ON p.id = um.plan_id
      WHERE um.user_id = ? AND um.status = ? AND um.expire_at > NOW(3)
      ORDER BY um.expire_at DESC LIMIT 1`,
    [userId, 'active'],
  );
  if (!membership) return getDefaultRights();
  // Merge version rights with plan overrides; only enabled rights
  const rights = await query<any>(
    `SELECT vr.right_key, vr.right_name,
            COALESCE(pr.right_value, vr.right_value) AS right_value,
            vr.hint, vr.right_category,
            COALESCE(pr.icon_url, vr.icon_url) AS icon_url,
            COALESCE(pr.icon_file_id, vr.icon_file_id) AS icon_file_id
       FROM member_version_rights vr
       LEFT JOIN member_plan_rights pr ON pr.plan_id = ? AND pr.right_key COLLATE utf8mb4_unicode_ci = vr.right_key COLLATE utf8mb4_unicode_ci
      WHERE vr.version_id = ?
        AND COALESCE(pr.enabled, 1) = 1
      ORDER BY COALESCE(pr.sort_order, vr.sort_order)`,
    [membership.plan_id, membership.version_id],
  );
  return normalizeRightsWithIcons(rights);
}

function getDefaultRights() {
  return [
    { right_key: 'image_daily', right_name: 'AI生图', right_value: '每日20张', right_category: 'image', icon_url: '/assets/member-benefit-icons/benefit_hd_quality.svg' },
    { right_key: 'video_daily', right_name: 'AI视频', right_value: '每日3次', right_category: 'video', icon_url: '/assets/member-benefit-icons/benefit_ai_video.svg' },
    { right_key: 'max_quality', right_name: '导出画质', right_value: '720P', right_category: 'export', icon_url: '/assets/member-benefit-icons/benefit_hd_quality.svg' },
    { right_key: 'watermark_removal', right_name: '去水印', right_value: '-', right_category: 'export', icon_url: '/assets/member-benefit-icons/benefit_remove_watermark.svg' },
    { right_key: 'commercial_license', right_name: '商用授权', right_value: '-', right_category: 'business', icon_url: '/assets/member-benefit-icons/benefit_commercial.svg' },
  ];
}

async function normalizeRightsWithIcons(rows: any[]) {
  return Promise.all(rows.map(async (row: any) => {
    const iconUrl = await normalizePublicIconUrl(row.icon_url || '');
    const iconFileId = row.icon_file_id ? Number(row.icon_file_id) : null;
    return {
      ...row,
      icon_url: iconUrl,
      icon_file_id: iconFileId,
      rightKey: row.right_key,
      rightName: row.right_name,
      rightValue: row.right_value,
      rightCategory: row.right_category,
      iconUrl,
      iconFileId,
    };
  }));
}
