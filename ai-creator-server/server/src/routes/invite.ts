// src/routes/invite.ts
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import {
  bindInviteCode,
  buildInviteSharePath,
  buildInviteShareTitle,
  ensureUserInviteCode,
  getInviteConfig,
  getInviteRewardRecords,
  getInviteSummary,
} from '../services/invite.service';

const router = Router();

router.get('/my-code', authMiddleware, async (req: Request, res: Response) => {
  try {
    const config = await getInviteConfig();
    const inviteCode = await ensureUserInviteCode(req.user!.userId);
    success(res, {
      enabled: config.enabled,
      inviteCode,
      sharePath: buildInviteSharePath(inviteCode),
      shareTitle: buildInviteShareTitle(),
    });
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取邀请码失败');
  }
});

router.post('/bind', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { inviteCode } = req.body || {};
    if (!inviteCode || typeof inviteCode !== 'string') {
      error(res, ErrorCodes.PARAM_ERROR, '请输入邀请码');
      return;
    }

    const result = await bindInviteCode(req.user!.userId, inviteCode, 'manual');
    success(res, result);
  } catch (err: any) {
    if (err?.code && err.code < 5000) {
      error(res, err.code, err.message || '绑定邀请码失败');
      return;
    }
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '绑定邀请码失败');
  }
});

router.get('/summary', authMiddleware, async (req: Request, res: Response) => {
  try {
    const summary = await getInviteSummary(req.user!.userId);
    success(res, summary);
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取邀请概览失败');
  }
});

router.get('/records', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { page, pageSize } = req.query as any;
    const result = await getInviteRewardRecords(
      req.user!.userId,
      page ? parseInt(page) : 1,
      pageSize ? parseInt(pageSize) : 20,
    );
    success(res, result);
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取邀请记录失败');
  }
});

export default router;
