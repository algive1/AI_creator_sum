import { v4 as uuidv4 } from 'uuid';
import { getConnection, query, queryOne } from '../utils/db';
import { SettingsService } from './settings.service';
import { applyPointChangeTx, lockPointAccountTx } from './points.service';

const AD_SESSION_EXPIRE_MINUTES = 30;
const DEFAULT_POINTS_PER_WATCH = 10;
const DEFAULT_MAX_DAILY_COUNT = 5;
const AD_REWARD_SCENE = 'reward';

export interface AdRewardConfig {
  enabled: boolean;
  pointsPerWatch: number;
  maxDailyCount: number;
  adUnitId: string;
  sessionExpireMinutes: number;
}

export interface AdRewardHistoryItem {
  id: number;
  title: string;
  points: number;
  time: string;
  status: string;
  refType: string;
  remark: string;
}

export interface AdRewardStatus {
  config: AdRewardConfig;
  watchedToday: number;
  remainingToday: number;
  todayReward: number;
  rewardPerWatch: number;
  maxPerDay: number;
  adUnitId: string;
  history: AdRewardHistoryItem[];
  sessions: any[];
}

export interface AdRewardSessionResult {
  sessionId: string;
  expiresAt: string | null;
  watchOrder: number;
  maxDailyCount: number;
  watchedToday: number;
  remainingToday: number;
}

export interface AdRewardClaimResult {
  rewarded: boolean;
  status: 'claimed' | 'expired' | 'not_completed' | 'blocked';
  message: string;
  rewardPoints: number;
  balance: number;
  watchedToday: number;
  remainingToday: number;
  sessionId: string;
}

function parseInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getExpiresAt(createdAt: Date | string | null | undefined, expiresAt: Date | string | null | undefined): number {
  if (expiresAt) return new Date(expiresAt).getTime();
  if (createdAt) return new Date(createdAt).getTime() + AD_SESSION_EXPIRE_MINUTES * 60 * 1000;
  return 0;
}

export async function getAdRewardConfig(): Promise<AdRewardConfig> {
  const [enabled, pointsPerWatch, maxDailyCount, adUnitId] = await Promise.all([
    SettingsService.getBoolean('ad.reward.enabled', false),
    SettingsService.getString('ad.reward.points_per_watch', String(DEFAULT_POINTS_PER_WATCH)),
    SettingsService.getString('ad.reward.max_daily_count', String(DEFAULT_MAX_DAILY_COUNT)),
    SettingsService.getString('ad.reward.ad_unit_id', ''),
  ]);

  return {
    enabled,
    pointsPerWatch: Math.max(0, parseInteger(pointsPerWatch, DEFAULT_POINTS_PER_WATCH)),
    maxDailyCount: Math.max(0, parseInteger(maxDailyCount, DEFAULT_MAX_DAILY_COUNT)),
    adUnitId: adUnitId.trim(),
    sessionExpireMinutes: AD_SESSION_EXPIRE_MINUTES,
  };
}

export async function getAdRewardStatus(userId: number): Promise<AdRewardStatus> {
  const config = await getAdRewardConfig();
  const watchedRow = await queryOne<any>(
    "SELECT COUNT(*) AS cnt FROM ad_reward_logs WHERE user_id = ? AND ad_date = CURDATE() AND ad_scene = ? AND reward_status = 'claimed'",
    [userId, AD_REWARD_SCENE],
  );
  const watchedToday = Number(watchedRow?.cnt || 0);
  const historyRows = await query<any>(
    `SELECT id, type, amount, balance_before, balance_after, source, ref_type, ref_id, title, remark, created_at
       FROM point_logs
      WHERE user_id = ? AND source = 'ad'
      ORDER BY created_at DESC
      LIMIT 10`,
    [userId],
  );
  const sessions = await query<any>(
    `SELECT id, session_id, ad_date, watch_order, reward_status, reward_points, created_at, expires_at, claimed_at
       FROM ad_reward_logs
      WHERE user_id = ? AND ad_scene = ?
      ORDER BY created_at DESC
      LIMIT 10`,
    [userId, AD_REWARD_SCENE],
  );

  return {
    config,
    watchedToday,
    remainingToday: Math.max(0, config.maxDailyCount - watchedToday),
    todayReward: Math.max(0, config.maxDailyCount - watchedToday) * config.pointsPerWatch,
    rewardPerWatch: config.pointsPerWatch,
    maxPerDay: config.maxDailyCount,
    adUnitId: config.adUnitId,
    history: historyRows.map((row: any) => ({
      id: Number(row.id),
      title: row.title || '观看广告',
      points: Number(row.amount || 0),
      time: row.created_at,
      status: Number(row.amount || 0) > 0 ? '已到账' : '已扣减',
      refType: row.ref_type || '',
      remark: row.remark || '',
    })),
    sessions,
  };
}

export async function createAdRewardSession(userId: number): Promise<AdRewardSessionResult> {
  const config = await getAdRewardConfig();
  if (!config.enabled || config.maxDailyCount <= 0) {
    throw Object.assign(new Error('广告积分功能未开启'), { code: 1001 });
  }
  if (!config.adUnitId) {
    throw Object.assign(new Error('请先在后台配置微信激励视频广告位'), { code: 1001 });
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    const [watchedRows] = await conn.execute(
      "SELECT COUNT(*) AS cnt FROM ad_reward_logs WHERE user_id = ? AND ad_date = CURDATE() AND ad_scene = ? AND reward_status = 'claimed' FOR UPDATE",
      [userId, AD_REWARD_SCENE],
    ) as any;
    const watchedToday = Number(watchedRows?.[0]?.cnt || 0);
    if (config.maxDailyCount > 0 && watchedToday >= config.maxDailyCount) {
      await conn.rollback();
      throw Object.assign(new Error('今日广告次数已用完'), { code: 1004 });
    }

    const sessionId = `ad_${Date.now()}_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const watchOrder = watchedToday + 1;

    await conn.execute(
      `INSERT INTO ad_reward_logs
       (user_id, ad_date, session_id, ad_scene, watch_order, reward_status, expires_at, created_at)
       VALUES (?, CURDATE(), ?, ?, ?, 'pending', DATE_ADD(NOW(3), INTERVAL ${AD_SESSION_EXPIRE_MINUTES} MINUTE), NOW(3))`,
      [userId, sessionId, AD_REWARD_SCENE, watchOrder],
    );
    await conn.commit();

    const expiresAtRow = await queryOne<any>(
      'SELECT expires_at FROM ad_reward_logs WHERE session_id = ? AND user_id = ? AND ad_scene = ? LIMIT 1',
      [sessionId, userId, AD_REWARD_SCENE],
    );

    return {
      sessionId,
      expiresAt: expiresAtRow?.expires_at || null,
      watchOrder,
      maxDailyCount: config.maxDailyCount,
      watchedToday,
      remainingToday: Math.max(0, config.maxDailyCount - watchedToday),
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function claimAdReward(
  userId: number,
  sessionId: string,
  completed = true,
): Promise<AdRewardClaimResult> {
  const config = await getAdRewardConfig();
  if (!config.enabled || config.maxDailyCount <= 0) {
    throw Object.assign(new Error('广告积分功能未开启'), { code: 1001 });
  }
  if (!config.adUnitId) {
    throw Object.assign(new Error('请先在后台配置微信激励视频广告位'), { code: 1001 });
  }
  if (!sessionId || !sessionId.trim()) {
    throw Object.assign(new Error('缺少sessionId'), { code: 1001 });
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const account = await lockPointAccountTx(conn, userId);
    const [sessionRows] = await conn.execute(
      'SELECT id, user_id, ad_date, session_id, watch_order, reward_status, reward_points, created_at, expires_at, claimed_at FROM ad_reward_logs WHERE session_id = ? AND user_id = ? AND ad_scene = ? FOR UPDATE',
      [sessionId, userId, AD_REWARD_SCENE],
    ) as any;

    if (!sessionRows || sessionRows.length === 0) {
      await conn.rollback();
      throw Object.assign(new Error('广告会话无效'), { code: 1001 });
    }

    const session = sessionRows[0];
    if (session.reward_status === 'claimed') {
      await conn.rollback();
      throw Object.assign(new Error('奖励已领取'), { code: 1001 });
    }

    const expiresAt = getExpiresAt(session.created_at, session.expires_at);
    const now = Date.now();

    // 最小观看时间检查：广告至少需要 15 秒才能完整观看
    const MIN_WATCH_MS = 15_000;
    const sessionCreatedAt = new Date(session.created_at).getTime();
    if (completed && now - sessionCreatedAt < MIN_WATCH_MS) {
      await conn.rollback();
      throw Object.assign(
        new Error(`广告观看时间不足，请至少观看 ${Math.ceil(MIN_WATCH_MS / 1000)} 秒后再领取`),
        { code: 1001 },
      );
    }

    const watchedRow = await conn.execute(
      "SELECT COUNT(*) AS cnt FROM ad_reward_logs WHERE user_id = ? AND ad_date = ? AND ad_scene = ? AND reward_status = 'claimed' FOR UPDATE",
      [userId, session.ad_date, AD_REWARD_SCENE],
    ) as any;
    const watchedToday = Number(watchedRow[0]?.[0]?.cnt || 0);

    if (!completed) {
      await conn.execute(
        "UPDATE ad_reward_logs SET reward_status = 'expired', reward_points = 0, claimed_at = NOW(3) WHERE id = ?",
        [session.id],
      );
      await conn.commit();
      return {
        rewarded: false,
        status: 'not_completed',
        message: '广告未完整观看',
        rewardPoints: 0,
        balance: account.balance,
        watchedToday,
        remainingToday: Math.max(0, config.maxDailyCount - watchedToday),
        sessionId,
      };
    }

    if (expiresAt > 0 && now > expiresAt) {
      await conn.execute(
        "UPDATE ad_reward_logs SET reward_status = 'expired', reward_points = 0, claimed_at = NOW(3) WHERE id = ?",
        [session.id],
      );
      await conn.commit();
      return {
        rewarded: false,
        status: 'expired',
        message: '广告会话已过期',
        rewardPoints: 0,
        balance: account.balance,
        watchedToday,
        remainingToday: Math.max(0, config.maxDailyCount - watchedToday),
        sessionId,
      };
    }

    if (config.maxDailyCount > 0 && watchedToday >= config.maxDailyCount) {
      await conn.execute(
        "UPDATE ad_reward_logs SET reward_status = 'expired', reward_points = 0, claimed_at = NOW(3) WHERE id = ?",
        [session.id],
      );
      await conn.commit();
      return {
        rewarded: false,
        status: 'blocked',
        message: '今日广告次数已用完',
        rewardPoints: 0,
        balance: account.balance,
        watchedToday,
        remainingToday: 0,
        sessionId,
      };
    }

    const { balanceAfter } = await applyPointChangeTx(conn, account, {
      userId,
      amount: config.pointsPerWatch,
      source: 'ad',
      refType: 'ad_reward_session',
      refId: sessionId,
      title: '观看广告',
      remark: `广告奖励第${session.watch_order}次`,
    });

    await conn.execute(
      "UPDATE ad_reward_logs SET reward_status = 'claimed', reward_points = ?, claimed_at = NOW(3) WHERE id = ?",
      [config.pointsPerWatch, session.id],
    );

    await conn.commit();

    const claimedRow = await queryOne<any>(
      "SELECT COUNT(*) AS cnt FROM ad_reward_logs WHERE user_id = ? AND ad_date = ? AND ad_scene = ? AND reward_status = 'claimed'",
      [userId, session.ad_date, AD_REWARD_SCENE],
    );
    const claimedToday = Number(claimedRow?.cnt || 0);

    return {
      rewarded: true,
      status: 'claimed',
      message: 'success',
      rewardPoints: config.pointsPerWatch,
      balance: balanceAfter,
      watchedToday: claimedToday,
      remainingToday: Math.max(0, config.maxDailyCount - claimedToday),
      sessionId,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

/** 清理过期的 pending 广告会话（超过 24 小时的标记为 expired） */
export async function cleanupExpiredAdSessions(): Promise<number> {
  const [result] = await query<any>(
    "UPDATE ad_reward_logs SET reward_status = 'expired', reward_points = 0 WHERE reward_status = 'pending' AND created_at < DATE_SUB(NOW(3), INTERVAL 24 HOUR)",
  );
  const cleaned = (result as any)?.affectedRows || 0;
  if (cleaned > 0) console.log(`[Ads] Cleaned ${cleaned} expired ad sessions`);
  return cleaned;
}
