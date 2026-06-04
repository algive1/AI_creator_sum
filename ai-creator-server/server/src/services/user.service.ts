import { getConnection, queryOne, query } from '../utils/db';
import { ensureUserInviteCodeTx } from './invite.service';
import { normalizePublicIconUrl } from './member-benefit-icons.service';
import { SettingsService } from './settings.service';

const defaultPreferences = {
  defaultRatio: '1:1',
  defaultQuality: 'high',
  aiOptimize: true,
  systemPrompt: '',
  imagePlatformWatermarkEnabled: true,
  imagePlatformWatermarkOffConfirmed: false,
};

function parsePreferences(value: any) {
  if (!value) return { ...defaultPreferences };
  if (typeof value === 'object') return { ...defaultPreferences, ...value };
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? { ...defaultPreferences, ...parsed } : { ...defaultPreferences };
  } catch {
    return { ...defaultPreferences };
  }
}

export async function findOrCreateUserByOpenid(openid: string, unionid?: string) {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();

    const [userRows] = await conn.execute(
      'SELECT * FROM users WHERE openid = ? AND deleted_at IS NULL',
      [openid],
    ) as any;

    let user = userRows?.[0];
    const isNewUser = !user;

    if (isNewUser) {
      const [result] = await conn.execute(
        `INSERT INTO users (openid, unionid, nickname, avatar_url, account_type, status, created_at, updated_at)
         VALUES (?, ?, '', '', 'wechat_miniprogram', 'normal', NOW(3), NOW(3))`,
        [openid, unionid || null],
      ) as any;
      const userId = Number((result as any).insertId || 0);

      await ensureUserInviteCodeTx(conn, userId);
      await conn.execute(
        'UPDATE user_profiles SET preferences = ?, updated_at = NOW(3) WHERE user_id = ?',
        [JSON.stringify(defaultPreferences), userId],
      );

      const registerBonus = 50;
      await conn.execute(
        `INSERT INTO point_accounts (user_id, balance, total_earned, total_spent, total_refunded, frozen_balance, version, created_at, updated_at)
         VALUES (?, ?, ?, 0, 0, 0, 1, NOW(3), NOW(3))`,
        [userId, registerBonus, registerBonus],
      );

      await conn.execute(
        `INSERT INTO point_logs (user_id, type, amount, balance_before, balance_after, source, ref_type, ref_id, title, created_at)
         VALUES (?, 'earn', ?, 0, ?, 'register', 'user', ?, 'New user bonus', NOW(3))`,
        [userId, registerBonus, registerBonus, userId.toString()],
      );

      await conn.execute(
        `INSERT INTO user_assets (user_id, points_balance, total_points_earned, membership_level, created_at, updated_at)
         VALUES (?, ?, ?, 'free', NOW(3), NOW(3))`,
        [userId, registerBonus, registerBonus],
      );

      const [createdRows] = await conn.execute('SELECT * FROM users WHERE id = ?', [userId]) as any;
      user = createdRows?.[0];
    } else {
      await conn.execute(
        'UPDATE users SET last_login_at = NOW(3), updated_at = NOW(3) WHERE id = ?',
        [user.id],
      );
      if (unionid && !user.unionid) {
        await conn.execute('UPDATE users SET unionid = ? WHERE id = ?', [unionid, user.id]);
      }
      await ensureUserInviteCodeTx(conn, user.id);
      const [freshRows] = await conn.execute('SELECT * FROM users WHERE id = ?', [user.id]) as any;
      user = freshRows?.[0];
    }

    await conn.commit();

    const [points] = await query<any>(
      'SELECT balance, total_earned, total_spent, frozen_balance FROM point_accounts WHERE user_id = ?',
      [user.id],
    );

    const [profile] = await query<any>(
      'SELECT invite_code, invited_by_user_id, preferences FROM user_profiles WHERE user_id = ?',
      [user.id],
    );

    return {
      user: {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatar_url,
        accountType: user.account_type,
        status: user.status,
        isNewUser,
        inviteCode: profile?.invite_code || '',
        invitedByUserId: profile?.invited_by_user_id || null,
        preferences: parsePreferences(profile?.preferences),
        createdAt: user.created_at,
      },
      points: points ? {
        balance: points.balance,
        totalEarned: points.total_earned,
        totalSpent: points.total_spent,
        frozenBalance: points.frozen_balance,
      } : { balance: 0, totalEarned: 0, totalSpent: 0, frozenBalance: 0 },
      membership: {
        level: 'free',
        expireAt: null,
      },
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function getUserById(userId: number) {
  const user = await queryOne<any>('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [userId]);
  if (!user) return null;

  const [points] = await query<any>(
    'SELECT balance, total_earned, total_spent, frozen_balance FROM point_accounts WHERE user_id = ?',
    [userId],
  );

  const [membership] = await query<any>(
    `SELECT um.level_after AS level, um.expire_at
       FROM user_memberships um
      WHERE um.user_id = ? AND um.status = 'active' AND um.expire_at > NOW(3)
      ORDER BY um.expire_at DESC LIMIT 1`,
    [userId],
  );

  const [profile] = await query<any>(
    'SELECT invite_code, invited_by_user_id, preferences FROM user_profiles WHERE user_id = ?',
    [userId],
  );

  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatar_url,
    phone: user.phone ? user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : null,
    status: user.status,
    accountType: user.account_type,
    inviteCode: profile?.invite_code || '',
    invitedByUserId: profile?.invited_by_user_id || null,
    preferences: parsePreferences(profile?.preferences),
    createdAt: user.created_at,
    points: points || { balance: 0, totalEarned: 0, totalSpent: 0, frozenBalance: 0 },
    membership: {
      level: membership?.level || 'free',
      expireAt: membership?.expire_at || null,
    },
  };
}

export async function updateUserProfile(userId: number, data: { nickname?: string; avatarUrl?: string; preferences?: any }) {
  const updates: string[] = [];
  const params: any[] = [];

  if (data.nickname !== undefined) {
    updates.push('nickname = ?');
    params.push(data.nickname);
  }
  if (data.avatarUrl !== undefined) {
    updates.push('avatar_url = ?');
    params.push(data.avatarUrl);
  }

  if (updates.length > 0) {
    params.push(userId);
    await query('UPDATE users SET ' + updates.join(', ') + ', updated_at = NOW(3) WHERE id = ?', params);
  }

  if (data.preferences && typeof data.preferences === 'object') {
    const profile = await queryOne<any>('SELECT preferences FROM user_profiles WHERE user_id = ?', [userId]);
    const mergedPreferences = { ...parsePreferences(profile?.preferences), ...data.preferences };
    await query(
      'UPDATE user_profiles SET preferences = ?, updated_at = NOW(3) WHERE user_id = ?',
      [JSON.stringify(mergedPreferences), userId],
    );
  }

  return getUserById(userId);
}

export async function getUserFullData(userId: number) {
  const user = await queryOne<any>('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [userId]);
  if (!user) return null;

  const [points] = await query<any>(
    'SELECT balance, total_earned, total_spent, frozen_balance FROM point_accounts WHERE user_id = ?',
    [userId],
  );

  const [assets] = await query<any>(
    'SELECT * FROM user_assets WHERE user_id = ?',
    [userId],
  );

  const [membership] = await query<any>(
    `SELECT um.level_after AS level, um.started_at, um.expire_at, um.auto_renew,
            mp.name AS plan_name, mp.id AS plan_id, mp.duration_type, mp.duration_days,
            mv.name AS version_name, mv.version_key
       FROM user_memberships um
       JOIN member_plans mp ON mp.id = um.plan_id
       JOIN member_versions mv ON mv.id = um.version_id
      WHERE um.user_id = ? AND um.status = 'active' AND um.expire_at > NOW(3)
      ORDER BY um.expire_at DESC LIMIT 1`,
    [userId],
  );

  const rights = membership?.plan_id
    ? await query<any>(
        'SELECT right_key, right_name, right_value, right_category, icon_url, icon_file_id FROM member_plan_rights WHERE plan_id = ? ORDER BY sort_order',
        [membership.plan_id],
      )
    : [];
  const rightsWithIcons = await Promise.all(rights.map(async (right: any) => ({
    ...right,
    icon_url: await normalizePublicIconUrl(right.icon_url || ''),
  })));

  const [taskCounts] = await query<any>(
    `SELECT
        COUNT(*) AS total_creations,
        SUM(CASE WHEN task_type = 'image' THEN 1 ELSE 0 END) AS image_count,
        SUM(CASE WHEN task_type = 'video' THEN 1 ELSE 0 END) AS video_count
       FROM ai_tasks
      WHERE user_id = ?`,
    [userId],
  );

  const profile = await queryOne<any>('SELECT invite_code, preferences FROM user_profiles WHERE user_id = ?', [userId]);
  const invited = await queryOne<any>(
    'SELECT COUNT(*) AS cnt FROM user_invites WHERE inviter_user_id = ? AND status = ?',
    [userId, 'valid'],
  ).catch(() => ({ cnt: 0 }));
  const inviteEnabled = await SettingsService.getBoolean('invite.enabled', false).catch(() => false);

  return {
    user: {
      id: user.id,
      nickname: user.nickname || '',
      avatarUrl: user.avatar_url || '',
      openidBound: !!user.openid,
      preferences: parsePreferences(profile?.preferences),
    },
    points: {
      balance: Number(points?.balance || 0),
      frozenBalance: Number(points?.frozen_balance || 0),
      totalEarned: Number(points?.total_earned || 0),
      totalSpent: Number(points?.total_spent || 0),
    },
    membership: {
      isMember: !!membership,
      level: membership?.level || '',
      membershipLevel: membership?.level || 'free',
      versionKey: membership?.version_key || '',
      versionName: membership?.version_name || '',
      planId: membership?.plan_id || null,
      planName: membership?.plan_name || '',
      durationType: membership?.duration_type || '',
      durationDays: Number(membership?.duration_days || 0),
      startedAt: membership?.started_at || null,
      expireAt: membership?.expire_at || null,
      remainingDays: membership?.expire_at ? Math.max(0, Math.ceil((new Date(membership.expire_at).getTime() - Date.now()) / 86400000)) : 0,
      autoRenew: !!membership?.auto_renew,
      rights: rightsWithIcons.map((right: any) => ({
        rightKey: right.right_key,
        rightName: right.right_name,
        rightValue: right.right_value,
        rightCategory: right.right_category,
        iconUrl: right.icon_url || '',
        iconFileId: right.icon_file_id ? Number(right.icon_file_id) : null,
      })),
    },
    assets: {
      totalCreations: Number(taskCounts?.total_creations || assets?.total_creations || 0),
      imageCount: Number(taskCounts?.image_count || 0),
      videoCount: Number(taskCounts?.video_count || 0),
    },
    invite: {
      inviteCode: profile?.invite_code || '',
      inviteEnabled,
      invitedCount: Number(invited?.cnt || 0),
    },
    menus: [],
  };
}
