import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import {
  listTemplateNotifications,
  markAllTemplateNotificationsRead,
  markTemplateNotificationRead,
  unreadTemplateFavoriteNotificationCount,
  unreadTemplateNotificationCount,
  unreadTemplateReviewNotificationCount,
} from '../services/template-notification.service';

const router = Router();

router.get('/unread-count', authMiddleware, async (req: Request, res: Response) => {
  try {
    const [templateFavoriteCount, templateReviewCount, total] = await Promise.all([
      unreadTemplateFavoriteNotificationCount(req.user!.userId),
      unreadTemplateReviewNotificationCount(req.user!.userId),
      unreadTemplateNotificationCount(req.user!.userId),
    ]);
    success(res, {
      total,
      templateFavoriteCount,
      templateReviewCount,
    });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取消息未读数失败');
  }
});

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(String(req.query.pageSize || '20'), 10) || 20), 50);
    success(res, await listTemplateNotifications(req.user!.userId, page, pageSize));
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取消息列表失败');
  }
});

router.post('/:id(\\d+)/read', authMiddleware, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    await markTemplateNotificationRead(req.user!.userId, id);
    success(res, { id, read: true });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '标记消息已读失败');
  }
});

router.post('/read-all', authMiddleware, async (req: Request, res: Response) => {
  try {
    const affected = await markAllTemplateNotificationsRead(req.user!.userId);
    success(res, { read: true, affected });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '标记消息已读失败');
  }
});

export default router;
