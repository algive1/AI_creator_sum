import { getConnection, query, queryOne } from '../utils/db';
import { SettingsService } from './settings.service';
import { applyPointChangeTx, lockPointAccountTx } from './points.service';

const DEFAULT_NORMAL_REWARDS = [10, 15, 20, 25, 30, 50, 80];
const DEFAULT_SUPER_REWARDS = [20, 30, 40, 50, 60, 80, 100];

export interface CheckinConfig {
  enabled: boolean;
  normalEnabled: boolean;
  superEnabled: boolean;
  superRequiresAd: boolean;
  rewards: number[];
  superRewards: number[];
  allowMakeup: boolean;
  makeupCostPoints: number;
}

export interface CheckinDayItem {
  day: number;
  reward: number;
  status: 'done' | 'today' | 'pending';
  statusText: string;
}

export interface CheckinModeStatus {
  enabled: boolean;
  signedToday: boolean;
  streak: number;
  currentDay: number;
  todayReward: number;
  days: CheckinDayItem[];
  lastSignedAt: string | null;
  canSign: boolean;
}

export interface CheckinStatus {
  config: CheckinConfig;
  signedToday: boolean;
  streak: number;
  todayReward: number;
  days: CheckinDayItem[];
  normal: CheckinModeStatus;
  super: CheckinModeStatus & {
    adRequired: boolean;
    adCompletedToday: boolean;
  };
  makeup: {
    enabled: boolean;
    costPoints: number;
    available: boolean;
    targetDate: string | null;
    message: string;
  };
  adCompletedToday: boolean;
  history: Array<{
    id: number;
    title: string;
    points: number;
    time: string;
    status: string;
    refType: string;
    remark: string;
  }>;
}

export interface NormalCheckinResult {
  signedToday: boolean;
  streak: number;
  reward: number;
  balance: number;
  rewardPoints: number;
  currentDay: number;
  days: CheckinDayItem[];
}

export interface SuperCheckinResult extends NormalCheckinResult {
  adRequired: boolean;
  adCompletedToday: boolean;
}

export interface MakeupCheckinResult extends NormalCheckinResult {
  makeupDate: string;
  costPoints: number;
}

function parseInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseRewardsJson(value: string, fallback: number[]): number[] {
  if (!value || !String(value).trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return fallback;
    const numbers = parsed
      .map((item) => Math.max(0, Number.parseInt(String(item || '').trim(), 10) || 0))
      .filter((item) => Number.isFinite(item));
    return numbers.length > 0 ? numbers : fallback;
  } catch {
    return fallback;
  }
}

function rewardForDay(rewards: number[], day: number): number {
  if (rewards.length === 0 || day <= 0) return 0;
  const index = Math.min(day - 1, rewards.length - 1);
  return Number(rewards[index] || 0);
}

function buildDayItems(rewards: number[], streak: number, signedToday: boolean): CheckinDayItem[] {
  const currentDay = signedToday ? Math.max(1, Math.min(streak, rewards.length || 1)) : Math.max(1, Math.min(streak + 1, rewards.length || 1));
  return rewards.map((reward, index) => {
    const day = index + 1;
    let status: CheckinDayItem['status'];
    if (signedToday) {
      status = day <= streak ? 'done' : 'pending';
    } else if (day <= streak) {
      status = 'done';
    } else if (day === currentDay) {
      status = 'today';
    } else {
      status = 'pending';
    }
    return {
      day,
      reward,
      status,
      statusText: status === 'done' ? '已签' : status === 'today' ? '今日' : '',
    };
  });
}

function buildModeStatus(params: {
  enabled: boolean;
  rewards: number[];
  signedToday: boolean;
  streak: number;
  lastSignedAt: string | null;
}): CheckinModeStatus {
  const currentDay = params.signedToday
    ? Math.max(1, Math.min(params.streak, params.rewards.length || 1))
    : Math.max(1, Math.min(params.streak + 1, params.rewards.length || 1));
  return {
    enabled: params.enabled,
    signedToday: params.signedToday,
    streak: params.streak,
    currentDay,
    todayReward: params.signedToday ? 0 : rewardForDay(params.rewards, currentDay),
    days: buildDayItems(params.rewards, params.streak, params.signedToday),
    lastSignedAt: params.lastSignedAt,
    canSign: params.enabled && !params.signedToday,
  };
}

async function getDateInfo() {
  const row = await queryOne<any>(
    `SELECT
       DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today,
       DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 DAY), '%Y-%m-%d') AS yesterday,
       DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 2 DAY), '%Y-%m-%d') AS day_before_yesterday`,
  );
  return {
    today: row?.today || '',
    yesterday: row?.yesterday || '',
    dayBeforeYesterday: row?.day_before_yesterday || '',
  };
}

export async function getCheckinConfig(): Promise<CheckinConfig> {
  const [enabled, normalEnabled, superEnabled, superRequiresAd, rewardsJson, superRewardsJson, allowMakeup, makeupCostPoints] = await Promise.all([
    SettingsService.getBoolean('signin.enabled', false),
    SettingsService.getBoolean('signin.normal_enabled', true),
    SettingsService.getBoolean('signin.super_enabled', false),
    SettingsService.getBoolean('signin.super_requires_ad', true),
    SettingsService.getString('signin.rewards_json', JSON.stringify(DEFAULT_NORMAL_REWARDS)),
    SettingsService.getString('signin.super_rewards_json', JSON.stringify(DEFAULT_SUPER_REWARDS)),
    SettingsService.getBoolean('signin.allow_makeup', false),
    SettingsService.getString('signin.makeup_cost_points', '0'),
  ]);

  return {
    enabled,
    normalEnabled,
    superEnabled,
    superRequiresAd,
    rewards: parseRewardsJson(rewardsJson, DEFAULT_NORMAL_REWARDS),
    superRewards: parseRewardsJson(superRewardsJson, DEFAULT_SUPER_REWARDS),
    allowMakeup,
    makeupCostPoints: Math.max(0, parseInteger(makeupCostPoints, 0)),
  };
}

async function getNormalStatus(userId: number, config: CheckinConfig, dateInfo: Awaited<ReturnType<typeof getDateInfo>>) {
  const todayRow = await queryOne<any>(
    `SELECT id, signin_date, streak_day, reward_points, normal_signed_at, normal_is_makeup
       FROM signin_records
      WHERE user_id = ? AND signin_date = ?`,
    [userId, dateInfo.today],
  );
  const yesterdayRow = await queryOne<any>(
    `SELECT id, signin_date, streak_day, reward_points, normal_signed_at
       FROM signin_records
      WHERE user_id = ? AND signin_date = ? AND normal_signed_at IS NOT NULL`,
    [userId, dateInfo.yesterday],
  );

  const signedToday = !!todayRow?.normal_signed_at;
  const streak = signedToday ? Number(todayRow?.streak_day || 0) : yesterdayRow ? Number(yesterdayRow.streak_day || 0) : 0;
  const lastSignedAt = signedToday ? todayRow.normal_signed_at : yesterdayRow?.normal_signed_at || null;

  return buildModeStatus({
    enabled: config.enabled && config.normalEnabled,
    rewards: config.rewards,
    signedToday,
    streak,
    lastSignedAt,
  });
}

async function getSuperStatus(userId: number, config: CheckinConfig, dateInfo: Awaited<ReturnType<typeof getDateInfo>>) {
  const todayRow = await queryOne<any>(
    `SELECT id, signin_date, super_streak_day, super_reward_points, super_signed_at
       FROM signin_records
      WHERE user_id = ? AND signin_date = ?`,
    [userId, dateInfo.today],
  );
  const yesterdayRow = await queryOne<any>(
    `SELECT id, signin_date, super_streak_day, super_reward_points, super_signed_at
       FROM signin_records
      WHERE user_id = ? AND signin_date = ? AND super_signed_at IS NOT NULL`,
    [userId, dateInfo.yesterday],
  );
  const adCompletedToday = await hasAdCompletedToday(userId);
  const signedToday = !!todayRow?.super_signed_at;
  const streak = signedToday ? Number(todayRow?.super_streak_day || 0) : yesterdayRow ? Number(yesterdayRow.super_streak_day || 0) : 0;
  const lastSignedAt = signedToday ? todayRow.super_signed_at : yesterdayRow?.super_signed_at || null;

  return {
    ...buildModeStatus({
      enabled: config.enabled && config.superEnabled && (!config.superRequiresAd || adCompletedToday),
      rewards: config.superRewards,
      signedToday,
      streak,
      lastSignedAt,
    }),
    adRequired: config.superRequiresAd,
    adCompletedToday,
  };
}

export async function getCheckinStatus(userId: number): Promise<CheckinStatus> {
  const config = await getCheckinConfig();
  const dateInfo = await getDateInfo();
  const normal = await getNormalStatus(userId, config, dateInfo);
  const superStatus = await getSuperStatus(userId, config, dateInfo);
  const todayReward = normal.todayReward;
  const adCompletedToday = superStatus.adCompletedToday;
  const makeupAvailable = config.allowMakeup && !normal.signedToday && !(await hasYesterdayNormalSign(userId, dateInfo));

  return {
    config,
    signedToday: normal.signedToday,
    streak: normal.streak,
    todayReward,
    days: normal.days,
    normal,
    super: superStatus,
    makeup: {
      enabled: config.allowMakeup,
      costPoints: config.makeupCostPoints,
      available: makeupAvailable,
      targetDate: config.allowMakeup ? dateInfo.yesterday : null,
      message: makeupAvailable ? '可补签昨天' : normal.signedToday ? '今日已签到，无法补签' : '暂无可补签日期',
    },
    adCompletedToday,
    history: await getCheckinHistory(userId),
  };
}

async function getCheckinHistory(userId: number) {
  const rows = await query<any>(
    `SELECT id, type, amount, balance_before, balance_after, source, ref_type, ref_id, title, remark, created_at
       FROM point_logs
      WHERE user_id = ? AND source = 'signin'
      ORDER BY created_at DESC
      LIMIT 12`,
    [userId],
  );
  return rows.map((row: any) => ({
    id: Number(row.id),
    title: row.title || '签到',
    points: Number(row.amount || 0),
    time: row.created_at,
    status: Number(row.amount || 0) > 0 ? '已到账' : '已扣减',
    refType: row.ref_type || '',
    remark: row.remark || '',
  }));
}

async function hasAdCompletedToday(userId: number): Promise<boolean> {
  const row = await queryOne<any>(
    "SELECT COUNT(*) AS cnt FROM ad_reward_logs WHERE user_id = ? AND ad_date = CURDATE() AND reward_status = 'claimed'",
    [userId],
  );
  return Number(row?.cnt || 0) > 0;
}

async function hasYesterdayNormalSign(userId: number, dateInfo: Awaited<ReturnType<typeof getDateInfo>>): Promise<boolean> {
  const row = await queryOne<any>(
    `SELECT id FROM signin_records
      WHERE user_id = ? AND signin_date = ? AND normal_signed_at IS NOT NULL`,
    [userId, dateInfo.yesterday],
  );
  return !!row;
}

async function hasTodayNormalSign(connDateUserId: number, dateInfo: Awaited<ReturnType<typeof getDateInfo>>): Promise<boolean> {
  const row = await queryOne<any>(
    `SELECT id FROM signin_records
      WHERE user_id = ? AND signin_date = ? AND normal_signed_at IS NOT NULL`,
    [connDateUserId, dateInfo.today],
  );
  return !!row;
}

async function getPreviousNormalStreakBeforeToday(userId: number, dateInfo: Awaited<ReturnType<typeof getDateInfo>>): Promise<number> {
  const row = await queryOne<any>(
    `SELECT streak_day FROM signin_records
      WHERE user_id = ? AND signin_date = ? AND normal_signed_at IS NOT NULL`,
    [userId, dateInfo.yesterday],
  );
  return Number(row?.streak_day || 0);
}

async function getYesterdayNormalStreak(userId: number, dateInfo: Awaited<ReturnType<typeof getDateInfo>>): Promise<number> {
  const row = await queryOne<any>(
    `SELECT streak_day FROM signin_records
      WHERE user_id = ? AND signin_date = ? AND normal_signed_at IS NOT NULL`,
    [userId, dateInfo.dayBeforeYesterday],
  );
  return Number(row?.streak_day || 0);
}

async function getYesterdaySuperStreak(userId: number, dateInfo: Awaited<ReturnType<typeof getDateInfo>>): Promise<number> {
  const row = await queryOne<any>(
    `SELECT super_streak_day FROM signin_records
      WHERE user_id = ? AND signin_date = ? AND super_signed_at IS NOT NULL`,
    [userId, dateInfo.yesterday],
  );
  return Number(row?.super_streak_day || 0);
}

async function upsertNormalCheckin(
  conn: any,
  userId: number,
  dateInfo: Awaited<ReturnType<typeof getDateInfo>>,
  streak: number,
  reward: number,
  isMakeup = false,
) {
  const todayRow = await conn.execute(
    `SELECT id FROM signin_records WHERE user_id = ? AND signin_date = ? FOR UPDATE`,
    [userId, dateInfo.today],
  ) as any;
  const existing = todayRow[0]?.[0];
  if (existing) {
    await conn.execute(
      `UPDATE signin_records
          SET streak_day = ?, reward_points = ?, normal_signed_at = NOW(3), normal_is_makeup = ?, updated_at = NOW(3)
        WHERE id = ?`,
      [streak, reward, isMakeup ? 1 : 0, existing.id],
    );
    return existing.id;
  }

  const [result] = await conn.execute(
    `INSERT INTO signin_records
     (user_id, signin_date, streak_day, reward_points, normal_signed_at, super_streak_day, super_reward_points, normal_is_makeup, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(3), 0, 0, ?, NOW(3), NOW(3))`,
    [userId, dateInfo.today, streak, reward, isMakeup ? 1 : 0],
  ) as any;
  return result.insertId;
}

async function upsertSuperCheckin(
  conn: any,
  userId: number,
  dateInfo: Awaited<ReturnType<typeof getDateInfo>>,
  streak: number,
  reward: number,
) {
  const todayRow = await conn.execute(
    `SELECT id FROM signin_records WHERE user_id = ? AND signin_date = ? FOR UPDATE`,
    [userId, dateInfo.today],
  ) as any;
  const existing = todayRow[0]?.[0];
  if (existing) {
    await conn.execute(
      `UPDATE signin_records
          SET super_streak_day = ?, super_reward_points = ?, super_signed_at = NOW(3), updated_at = NOW(3)
        WHERE id = ?`,
      [streak, reward, existing.id],
    );
    return existing.id;
  }

  const [result] = await conn.execute(
    `INSERT INTO signin_records
     (user_id, signin_date, streak_day, reward_points, normal_signed_at, super_streak_day, super_reward_points, super_signed_at, normal_is_makeup, created_at, updated_at)
     VALUES (?, ?, 0, 0, NULL, ?, ?, NOW(3), 0, NOW(3), NOW(3))`,
    [userId, dateInfo.today, streak, reward],
  ) as any;
  return result.insertId;
}

async function upsertMakeupCheckin(
  conn: any,
  userId: number,
  dateInfo: Awaited<ReturnType<typeof getDateInfo>>,
  streak: number,
  reward: number,
) {
  const [rowData] = await conn.execute(
    `SELECT id FROM signin_records WHERE user_id = ? AND signin_date = ? FOR UPDATE`,
    [userId, dateInfo.yesterday],
  ) as any;
  const existing = rowData?.[0];
  if (existing) {
    await conn.execute(
      `UPDATE signin_records
          SET streak_day = ?, reward_points = ?, normal_signed_at = NOW(3), normal_is_makeup = 1, updated_at = NOW(3)
        WHERE id = ?`,
      [streak, reward, existing.id],
    );
    return existing.id;
  }

  const [result] = await conn.execute(
    `INSERT INTO signin_records
     (user_id, signin_date, streak_day, reward_points, normal_signed_at, super_streak_day, super_reward_points, normal_is_makeup, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(3), 0, 0, 1, NOW(3), NOW(3))`,
    [userId, dateInfo.yesterday, streak, reward],
  ) as any;
  return result.insertId;
}

export async function claimNormalCheckin(userId: number): Promise<NormalCheckinResult> {
  const config = await getCheckinConfig();
  if (!config.enabled || !config.normalEnabled) {
    throw Object.assign(new Error('普通签到未开启'), { code: 1001 });
  }

  const dateInfo = await getDateInfo();
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const account = await lockPointAccountTx(conn, userId);
    const todaySigned = await hasTodayNormalSign(userId, dateInfo);
    if (todaySigned) {
      await conn.rollback();
      throw Object.assign(new Error('今日已签到'), { code: 1001 });
    }

    const streakBefore = await getPreviousNormalStreakBeforeToday(userId, dateInfo);
    const streak = Math.max(1, streakBefore + 1);
    const reward = rewardForDay(config.rewards, streak);

    const { balanceAfter } = await applyPointChangeTx(conn, account, {
      userId,
      amount: reward,
      source: 'signin',
      refType: 'signin_normal',
      refId: dateInfo.today,
      title: '每日签到',
      remark: `普通签到第${streak}天`,
    });

    await upsertNormalCheckin(conn, userId, dateInfo, streak, reward, false);
    await conn.commit();

    return {
      signedToday: true,
      streak,
      reward,
      balance: balanceAfter,
      rewardPoints: reward,
      currentDay: Math.min(streak, config.rewards.length || 1),
      days: buildDayItems(config.rewards, streak, true),
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function validateSuperAdRequirement(conn: any, userId: number, adSessionId?: string) {
  if (adSessionId && adSessionId.trim()) {
    const [rows] = await conn.execute(
      `SELECT id, reward_status, created_at, expires_at
         FROM ad_reward_logs
        WHERE user_id = ? AND session_id = ? FOR UPDATE`,
      [userId, adSessionId.trim()],
    ) as any;
    if (!rows || rows.length === 0) {
      throw Object.assign(new Error('广告会话无效'), { code: 1001 });
    }
    const session = rows[0];
    if (session.reward_status !== 'claimed') {
      throw Object.assign(new Error('请先完成广告观看'), { code: 1001 });
    }
    const expiresAt = session.expires_at ? new Date(session.expires_at).getTime() : new Date(session.created_at).getTime() + 30 * 60 * 1000;
    if (Date.now() > expiresAt) {
      throw Object.assign(new Error('广告会话已过期'), { code: 1001 });
    }
    return true;
  }

  const row = await conn.execute(
    "SELECT COUNT(*) AS cnt FROM ad_reward_logs WHERE user_id = ? AND ad_date = CURDATE() AND reward_status = 'claimed'",
    [userId],
  ) as any;
  return Number(row[0]?.[0]?.cnt || 0) > 0;
}

export async function claimSuperCheckin(userId: number, adSessionId?: string): Promise<SuperCheckinResult> {
  const config = await getCheckinConfig();
  if (!config.enabled || !config.superEnabled) {
    throw Object.assign(new Error('超级签到未开启'), { code: 1001 });
  }

  const dateInfo = await getDateInfo();
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const account = await lockPointAccountTx(conn, userId);
    const todayRow = await conn.execute(
      `SELECT id, super_signed_at FROM signin_records WHERE user_id = ? AND signin_date = ? FOR UPDATE`,
      [userId, dateInfo.today],
    ) as any;
    const today = todayRow[0]?.[0];
    if (today?.super_signed_at) {
      await conn.rollback();
      throw Object.assign(new Error('今日超级签到已完成'), { code: 1001 });
    }

    const adSatisfied = config.superRequiresAd ? await validateSuperAdRequirement(conn, userId, adSessionId) : true;
    if (!adSatisfied) {
      await conn.rollback();
      throw Object.assign(new Error('请先完成广告观看'), { code: 1001 });
    }

    const streakBefore = await getYesterdaySuperStreak(userId, dateInfo);
    const streak = Math.max(1, streakBefore + 1);
    const reward = rewardForDay(config.superRewards, streak);

    const { balanceAfter } = await applyPointChangeTx(conn, account, {
      userId,
      amount: reward,
      source: 'signin',
      refType: 'signin_super',
      refId: dateInfo.today,
      title: '超级签到',
      remark: `超级签到第${streak}天`,
    });

    await upsertSuperCheckin(conn, userId, dateInfo, streak, reward);
    await conn.commit();

    return {
      signedToday: true,
      streak,
      reward,
      balance: balanceAfter,
      rewardPoints: reward,
      currentDay: Math.min(streak, config.superRewards.length || 1),
      days: buildDayItems(config.superRewards, streak, true),
      adRequired: config.superRequiresAd,
      adCompletedToday: !!adSatisfied,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function claimMakeupCheckin(userId: number, targetDate?: string): Promise<MakeupCheckinResult> {
  const config = await getCheckinConfig();
  if (!config.enabled || !config.allowMakeup) {
    throw Object.assign(new Error('补签功能未开启'), { code: 1001 });
  }

  const dateInfo = await getDateInfo();
  const makeupDate = targetDate && targetDate.trim() ? targetDate.trim() : dateInfo.yesterday;
  if (makeupDate !== dateInfo.yesterday) {
    throw Object.assign(new Error('目前仅支持补签昨天'), { code: 1001 });
  }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const account = await lockPointAccountTx(conn, userId);
    const todaySigned = await hasTodayNormalSign(userId, dateInfo);
    if (todaySigned) {
      await conn.rollback();
      throw Object.assign(new Error('今日已签到，无法补签'), { code: 1001 });
    }

    const [yesterdayRows] = await conn.execute(
      `SELECT id, normal_signed_at, streak_day FROM signin_records
        WHERE user_id = ? AND signin_date = ? FOR UPDATE`,
      [userId, dateInfo.yesterday],
    ) as any;
    const yesterday = yesterdayRows?.[0];
    if (yesterday?.normal_signed_at) {
      await conn.rollback();
      throw Object.assign(new Error('昨天已签过，无法补签'), { code: 1001 });
    }

    const prevStreak = await getYesterdayNormalStreak(userId, dateInfo);
    const streak = Math.max(1, prevStreak + 1);
    const reward = rewardForDay(config.rewards, streak);
    const cost = config.makeupCostPoints;
    let balanceAfter = account.balance;

    if (cost > 0) {
      const debit = await applyPointChangeTx(conn, account, {
        userId,
        amount: -cost,
        source: 'signin',
        refType: 'signin_makeup_cost',
        refId: `makeup_${dateInfo.yesterday}`,
        title: '补签扣费',
        remark: `补签${dateInfo.yesterday}`,
      });
      balanceAfter = debit.balanceAfter;
    }

    const credit = await applyPointChangeTx(conn, account, {
      userId,
      amount: reward,
      source: 'signin',
      refType: 'signin_makeup',
      refId: `makeup_${dateInfo.yesterday}`,
      title: '补签',
      remark: `补签${dateInfo.yesterday} 第${streak}天`,
    });
    balanceAfter = credit.balanceAfter;

    await upsertMakeupCheckin(conn, userId, dateInfo, streak, reward);
    await conn.commit();

    return {
      signedToday: false,
      streak,
      reward,
      balance: balanceAfter,
      rewardPoints: reward,
      currentDay: Math.min(streak + 1, config.rewards.length || 1),
      days: buildDayItems(config.rewards, streak, false),
      makeupDate,
      costPoints: cost,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function getSigninStatus(userId: number): Promise<CheckinStatus> {
  const config = await getCheckinConfig();
  const dateInfo = await getDateInfo();
  const normal = await getNormalStatus(userId, config, dateInfo);
  const superStatus = await getSuperStatus(userId, config, dateInfo);
  const adCompletedToday = superStatus.adCompletedToday;
  const makeupAvailable = config.allowMakeup && !normal.signedToday && !(await hasYesterdayNormalSign(userId, dateInfo));

  return {
    config,
    signedToday: normal.signedToday,
    streak: normal.streak,
    todayReward: normal.todayReward,
    days: normal.days,
    normal,
    super: superStatus,
    makeup: {
      enabled: config.allowMakeup,
      costPoints: config.makeupCostPoints,
      available: makeupAvailable,
      targetDate: config.allowMakeup ? dateInfo.yesterday : null,
      message: makeupAvailable ? '可补签昨天' : normal.signedToday ? '今日已签到，无法补签' : '暂无可补签日期',
    },
    adCompletedToday,
    history: await getCheckinHistory(userId),
  };
}

export async function doSignin(userId: number): Promise<NormalCheckinResult> {
  return claimNormalCheckin(userId);
}
