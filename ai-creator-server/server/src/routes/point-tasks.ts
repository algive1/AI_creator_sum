import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { query } from '../utils/db';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { getPointsBalance } from '../services/points.service';

const router = Router();

const SUPPORTED_TASK_KEYS = new Set(['watch_ad', 'daily_checkin', 'share_work', 'invite_friend', 'open_pro', 'checkin_7']);

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const rows = await query<any>(
      `SELECT *
         FROM point_tasks
        WHERE status = 'active'
        ORDER BY task_group, sort_order, id`,
    );
    const balance = await getPointsBalance(userId);
    const list = (await Promise.all(rows.map(async (row: any) => {
      const task = toPublicTask(row);
      if (!SUPPORTED_TASK_KEYS.has(task.id)) return null;
      const completed = await isTaskCompleted(userId, task.id);
      return toPublicTask(row, completed);
    }))).filter(Boolean);
    success(res, {
      todayAvailable: balance.balance,
      list,
    });
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取积分任务失败');
  }
});

async function isTaskCompleted(userId: number, taskKey: string) {
  switch (taskKey) {
    case 'watch_ad': {
      const rows = await query<any>(
        `SELECT id FROM ad_reward_logs
          WHERE user_id = ? AND ad_date = CURDATE() AND reward_status = 'claimed'
          LIMIT 1`,
        [userId],
      );
      return Boolean(rows?.[0]);
    }
    case 'share_work': {
      const rows = await query<any>(
        `SELECT id FROM templates
          WHERE user_id = ? AND source = 'user' AND deleted_at IS NULL AND DATE(created_at) = CURDATE()
          LIMIT 1`,
        [userId],
      );
      return Boolean(rows?.[0]);
    }
    case 'invite_friend': {
      const rows = await query<any>(
        `SELECT id FROM user_invites
          WHERE inviter_user_id = ? AND status = 'valid'
          LIMIT 1`,
        [userId],
      );
      return Boolean(rows?.[0]);
    }
    case 'open_pro': {
      const rows = await query<any>(
        `SELECT id FROM user_memberships
          WHERE user_id = ? AND status = 'active' AND (expire_at IS NULL OR expire_at > NOW(3))
          LIMIT 1`,
        [userId],
      );
      return Boolean(rows?.[0]);
    }
    case 'daily_checkin': {
      const rows = await query<any>(
        `SELECT id FROM signin_records
          WHERE user_id = ? AND signin_date = CURDATE() AND normal_signed_at IS NOT NULL
          LIMIT 1`,
        [userId],
      );
      return Boolean(rows?.[0]);
    }
    case 'checkin_7': {
      const rows = await query<any>(
        `SELECT streak_day FROM signin_records
          WHERE user_id = ? AND normal_signed_at IS NOT NULL
          ORDER BY signin_date DESC LIMIT 1`,
        [userId],
      );
      return Number(rows?.[0]?.streak_day || 0) >= 7;
    }
    default:
      return false;
  }
}

function toPublicTask(row: any, completed = false) {
  const taskKey = String(row.task_key || '');
  return {
    id: taskKey,
    taskId: Number(row.id || 0),
    title: row.title || '',
    group: row.task_group || 'daily',
    reward: Number(row.reward_points || 0),
    icon: row.icon || '',
    action: row.action_text || '去完成',
    resetCycle: row.reset_cycle || 'daily',
    completed,
    claimed: completed,
    claimable: false,
    sortOrder: Number(row.sort_order || 0),
  };
}

export default router;
