import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getUserById, getUserFullData, updateUserPhone, updateUserProfile } from '../services/user.service';
import { getPhoneNumberByCode } from '../services/wechat.service';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';

const router = Router();

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await getUserById(req.user!.userId);
    if (!user) {
      error(res, ErrorCodes.NOT_FOUND, '用户不存在', 404);
      return;
    }
    success(res, user);
  } catch (err: any) {
    console.error('Failed to get current user:', err);
    error(res, ErrorCodes.SERVER_ERROR, '获取当前用户失败');
  }
});

router.put('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { nickname, avatarUrl, preferences } = req.body;
    if (preferences?.themeSource !== undefined && !['system', 'light', 'dark'].includes(preferences.themeSource)) {
      error(res, ErrorCodes.PARAM_ERROR, '主题偏好必须为 system、light 或 dark');
      return;
    }
    await updateUserProfile(req.user!.userId, { nickname, avatarUrl, preferences });
    const user = await getUserById(req.user!.userId);
    success(res, user);
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '更新用户信息失败');
  }
});

router.get('/me/full', authMiddleware, async (req: Request, res: Response) => {
  try {
    const data = await getUserFullData(req.user!.userId);
    if (!data) {
      error(res, ErrorCodes.NOT_FOUND, '用户不存在', 404);
      return;
    }
    success(res, data);
  } catch (err: any) {
    console.error('Failed to get current user full profile:', err);
    error(res, ErrorCodes.SERVER_ERROR, '获取用户完整资料失败');
  }
});

router.post('/me/phone', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code } = req.body || {};
    const phone = await getPhoneNumberByCode(String(code || ''));
    await updateUserPhone(req.user!.userId, phone);
    const data = await getUserFullData(req.user!.userId);
    success(res, data);
  } catch (err: any) {
    error(res, err?.code && err.code < 5000 ? err.code : ErrorCodes.SERVER_ERROR, err?.message || '绑定手机号失败');
  }
});

export default router;
