import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { query, queryOne } from '../utils/db';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { optionalUserId, matchesTarget } from '../utils/content-helpers';

const router = Router();

router.get('/popup', async (req: Request, res: Response) => {
  try {
    const userId = await optionalUserId(req);
    const announcements = await loadVisibleAnnouncements('popup');
    const today = toDateKey(new Date());
    const list: any[] = [];

    for (const item of announcements) {
      if (userId && !(await matchesTarget(item, userId))) continue;
      const record = userId ? await getRecord(item.id, userId) : null;
      if (!shouldShowPopup(item, record, today)) continue;
      list.push(toPublicAnnouncement(item, record));
    }

    if (userId && list[0]) {
      await upsertPopupRecord(list[0].id, userId);
    }
    success(res, { list: list.slice(0, 1), popupAnnouncement: list[0] || null });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取公告失败');
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = await optionalUserId(req);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(req.query.pageSize as string) || 10), 50);
    const rows = await loadVisibleAnnouncements();
    const filtered: any[] = [];
    for (const row of rows) {
      if (userId && !(await matchesTarget(row, userId))) continue;
      filtered.push(toPublicAnnouncement(row, userId ? await getRecord(row.id, userId) : null));
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
    const row = await queryOne<any>(
      `SELECT * FROM announcements
        WHERE id = ? AND enabled = 1 AND deleted_at IS NULL
          AND (start_at IS NULL OR start_at <= NOW(3))
          AND (end_at IS NULL OR end_at >= NOW(3))`,
      [id],
    );
    if (!row) {
      error(res, ErrorCodes.NOT_FOUND, '公告不存在', 404);
      return;
    }
    if (userId && !(await matchesTarget(row, userId))) {
      error(res, ErrorCodes.FORBIDDEN, '无权查看', 403);
      return;
    }
    success(res, toPublicAnnouncement(row, userId ? await getRecord(row.id, userId) : null));
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取公告详情失败');
  }
});

router.post('/:id(\\d+)/read', authMiddleware, async (req: Request, res: Response) => {
  try {
    const announcementId = Number(req.params.id);
    await upsertReadRecord(announcementId, req.user!.userId);
    success(res, { announcementId, read: true });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '标记已读失败');
  }
});

router.post('/:id(\\d+)/close', authMiddleware, async (req: Request, res: Response) => {
  try {
    const announcementId = Number(req.params.id);
    await upsertCloseRecord(announcementId, req.user!.userId);
    success(res, { announcementId, closed: true });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '关闭公告失败');
  }
});

async function loadVisibleAnnouncements(type?: string) {
  return query<any>(
    `SELECT * FROM announcements
      WHERE enabled = 1 AND deleted_at IS NULL
        ${type ? 'AND type = ?' : ''}
        ${type === 'popup' ? "AND show_frequency <> 'list_only'" : ''}
        AND (start_at IS NULL OR start_at <= NOW(3))
        AND (end_at IS NULL OR end_at >= NOW(3))
      ORDER BY priority DESC, sort_order DESC, created_at DESC`,
    type ? [type] : [],
  );
}

async function getRecord(announcementId: number, userId: number) {
  return queryOne<any>('SELECT * FROM announcement_user_records WHERE announcement_id = ? AND user_id = ?', [announcementId, userId]);
}

async function upsertPopupRecord(announcementId: number, userId: number) {
  await query(
    `INSERT INTO announcement_user_records
     (announcement_id, user_id, first_seen_at, last_popup_at, popup_count, created_at, updated_at)
     VALUES (?, ?, NOW(3), NOW(3), 1, NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE
       first_seen_at = COALESCE(first_seen_at, VALUES(first_seen_at)),
       last_popup_at = VALUES(last_popup_at),
       popup_count = popup_count + 1,
       updated_at = NOW(3)`,
    [announcementId, userId],
  );
}

async function upsertReadRecord(announcementId: number, userId: number) {
  await query(
    `INSERT INTO announcement_user_records
     (announcement_id, user_id, first_seen_at, read_at, popup_count, created_at, updated_at)
     VALUES (?, ?, NOW(3), NOW(3), 0, NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE read_at = VALUES(read_at), updated_at = NOW(3)`,
    [announcementId, userId],
  );
}

async function upsertCloseRecord(announcementId: number, userId: number) {
  await query(
    `INSERT INTO announcement_user_records
     (announcement_id, user_id, first_seen_at, closed_at, popup_count, created_at, updated_at)
     VALUES (?, ?, NOW(3), NOW(3), 0, NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE closed_at = VALUES(closed_at), updated_at = NOW(3)`,
    [announcementId, userId],
  );
}

function toPublicAnnouncement(row: any, record: any) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    type: row.type,
    showFrequency: row.show_frequency,
    priority: row.priority,
    startAt: row.start_at,
    endAt: row.end_at,
    readAt: record?.read_at || null,
    closedAt: record?.closed_at || null,
    popupCount: record?.popup_count || 0,
  };
}

function toDateKey(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

function shouldShowPopup(item: any, record: any, today: string): boolean {
  const frequency = item.show_frequency || 'once_per_day';
  if (frequency === 'list_only') return false;
  if (frequency === 'every_open') return true;
  if (!record) return true;
  if (frequency === 'once') return !record.closed_at && !record.popup_count;
  if (frequency === 'once_per_day') {
    return !(record.closed_at && toDateKey(record.closed_at) === today)
      && !(record.last_popup_at && toDateKey(record.last_popup_at) === today);
  }
  return true;
}

export default router;
