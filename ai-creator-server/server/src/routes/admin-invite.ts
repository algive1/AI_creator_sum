// src/routes/admin-invite.ts
import { Router, Request, Response } from 'express';
import { adminAuthMiddleware } from '../middleware/auth';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { listInviteRelationsForAdmin, listInviteRewardLogsForAdmin } from '../services/invite.service';

const router = Router();

router.get('/invite/relations', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { page, pageSize, keyword } = req.query as any;
    const result = await listInviteRelationsForAdmin(
      page ? parseInt(page) : 1,
      pageSize ? parseInt(pageSize) : 20,
      typeof keyword === 'string' ? keyword : '',
    );
    success(res, result);
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取邀请关系失败');
  }
});

router.get('/invite/reward-logs', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { page, pageSize, keyword, rewardType } = req.query as any;
    const result = await listInviteRewardLogsForAdmin(
      page ? parseInt(page) : 1,
      pageSize ? parseInt(pageSize) : 20,
      typeof keyword === 'string' ? keyword : '',
      typeof rewardType === 'string' ? rewardType : '',
    );
    success(res, result);
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取邀请奖励失败');
  }
});

export default router;
