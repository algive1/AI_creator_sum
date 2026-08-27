import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getFreeImageQuotaStatus } from '../services/free-image-quota.service';
import { ErrorCodes } from '../types';
import { error, success } from '../utils/response';

const router = Router();

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    success(res, await getFreeImageQuotaStatus(req.user!.userId));
  } catch (err: any) {
    error(res, err?.code || ErrorCodes.SERVER_ERROR, err?.message || '获取免费生图额度失败');
  }
});

export default router;
