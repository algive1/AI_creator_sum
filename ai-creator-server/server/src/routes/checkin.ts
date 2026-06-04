import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  claimMakeupCheckin,
  claimNormalCheckin,
  claimSuperCheckin,
  getSigninStatus,
} from '../services/signin.service';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';

const router = Router();

router.get('/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const status = await getSigninStatus(req.user!.userId);
    success(res, status);
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '查询签到状态失败');
  }
});

async function normalCheckin(req: Request, res: Response) {
  try {
    const result = await claimNormalCheckin(req.user!.userId);
    success(res, result);
  } catch (err: any) {
    error(res, err?.code || ErrorCodes.SERVER_ERROR, err?.message || '签到失败');
  }
}

router.post('/', authMiddleware, normalCheckin);
router.post('/normal', authMiddleware, normalCheckin);

router.post('/super', authMiddleware, async (req: Request, res: Response) => {
  try {
    const adSessionId = req.body?.adSessionId || req.body?.sessionId;
    const result = await claimSuperCheckin(req.user!.userId, adSessionId ? String(adSessionId) : undefined);
    success(res, result);
  } catch (err: any) {
    error(res, err?.code || ErrorCodes.SERVER_ERROR, err?.message || '超级签到失败');
  }
});

router.post('/makeup', authMiddleware, async (req: Request, res: Response) => {
  try {
    const targetDate = req.body?.targetDate || req.body?.date;
    const result = await claimMakeupCheckin(req.user!.userId, targetDate ? String(targetDate) : undefined);
    success(res, result);
  } catch (err: any) {
    error(res, err?.code || ErrorCodes.SERVER_ERROR, err?.message || '补签失败');
  }
});

export default router;
