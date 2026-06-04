import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  claimAdReward,
  createAdRewardSession,
  getAdRewardStatus,
} from '../services/ads.service';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';

const router = Router();

router.get('/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const status = await getAdRewardStatus(req.user!.userId);
    success(res, {
      ...status,
      watched: status.watchedToday,
      maxPerDay: status.maxPerDay,
      remaining: status.remainingToday,
      rewardPerWatch: status.rewardPerWatch,
    });
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '查询广告状态失败');
  }
});

router.post('/session', authMiddleware, async (req: Request, res: Response) => {
  try {
    const session = await createAdRewardSession(req.user!.userId);
    success(res, {
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
      watchOrder: session.watchOrder,
      maxDailyCount: session.maxDailyCount,
      watchedToday: session.watchedToday,
      remainingToday: session.remainingToday,
    });
  } catch (err: any) {
    error(res, err?.code || ErrorCodes.SERVER_ERROR, err?.message || '创建广告会话失败');
  }
});

router.post('/reward', authMiddleware, async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    const completed = req.body?.completed ?? req.body?.isCompleted;
    const result = await claimAdReward(req.user!.userId, sessionId, completed === undefined ? true : !!completed);
    success(res, {
      ...result,
      rewarded: result.rewarded,
      rewardPoints: result.rewardPoints,
      balance: result.balance,
      watchedToday: result.watchedToday,
      remainingToday: result.remainingToday,
    });
  } catch (err: any) {
    error(res, err?.code || ErrorCodes.SERVER_ERROR, err?.message || '领取广告奖励失败');
  }
});

export default router;
