import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getUserById, getUserFullData, updateUserProfile } from '../services/user.service';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';

const router = Router();

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await getUserById(req.user!.userId);
    if (!user) {
      error(res, ErrorCodes.NOT_FOUND, 'User not found', 404);
      return;
    }
    success(res, user);
  } catch (err: any) {
    console.error('Failed to get current user:', err);
    error(res, ErrorCodes.SERVER_ERROR, 'Failed to get current user');
  }
});

router.put('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { nickname, avatarUrl, preferences } = req.body;
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
      error(res, ErrorCodes.NOT_FOUND, 'User not found', 404);
      return;
    }
    success(res, data);
  } catch (err: any) {
    console.error('Failed to get current user full profile:', err);
    error(res, ErrorCodes.SERVER_ERROR, 'Failed to get current user full profile');
  }
});

export default router;
