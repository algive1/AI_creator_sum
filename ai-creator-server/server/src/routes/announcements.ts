import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { optionalUserId, matchesTarget } from '../utils/content-helpers';
import {
  closeAnnouncementPopup,
  getAnnouncementRecord,
  getPopupAnnouncementForUser,
  getVisibleAnnouncementById,
  listVisibleAnnouncements,
  markAnnouncementRead,
  toPublicAnnouncement,
} from '../services/announcement.service';

const router = Router();

router.get('/popup', async (req: Request, res: Response) => {
  try {
    const userId = await optionalUserId(req);
    const popupAnnouncement = await getPopupAnnouncementForUser(userId, { markSeen: true });
    success(res, { list: popupAnnouncement ? [popupAnnouncement] : [], popupAnnouncement });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取公告失败');
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = await optionalUserId(req);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(req.query.pageSize as string) || 10), 50);
    const rows = await listVisibleAnnouncements({ includeListOnly: true });
    const filtered: any[] = [];
    for (const row of rows) {
      if (userId && !(await matchesTarget(row, userId))) continue;
      filtered.push(toPublicAnnouncement(row, userId ? await getAnnouncementRecord(row.id, userId) : null));
    }
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    success(res, { list: filtered.slice(start, start + pageSize), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取公告失败');
  }
});

router.get('/:id(\\d+)', async (req: Request, res: Response) => {
  try {
    const userId = await optionalUserId(req);
    const id = Number(req.params.id);
    const row = await getVisibleAnnouncementById(id);
    if (!row) {
      error(res, ErrorCodes.NOT_FOUND, '公告不存在', 404);
      return;
    }
    if (userId && !(await matchesTarget(row, userId))) {
      error(res, ErrorCodes.FORBIDDEN, '无权查看', 403);
      return;
    }
    success(res, toPublicAnnouncement(row, userId ? await getAnnouncementRecord(row.id, userId) : null));
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取公告详情失败');
  }
});

router.post('/:id(\\d+)/read', authMiddleware, async (req: Request, res: Response) => {
  try {
    const announcementId = Number(req.params.id);
    await markAnnouncementRead(announcementId, req.user!.userId);
    success(res, { announcementId, read: true });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '标记已读失败');
  }
});

router.post('/:id(\\d+)/close', authMiddleware, async (req: Request, res: Response) => {
  try {
    const announcementId = Number(req.params.id);
    await closeAnnouncementPopup(announcementId, req.user!.userId);
    success(res, { announcementId, closed: true });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '关闭公告失败');
  }
});

export default router;
