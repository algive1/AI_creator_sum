import { query, queryOne } from '../utils/db';

export interface TemplateFavoriteNotificationInput {
  ownerUserId: number;
  actorUserId: number;
  templateId: number;
  favoriteId?: number | null;
}

export interface TemplateReviewNotificationInput {
  userId: number;
  templateId: number;
  reviewStatus?: 'approved';
}

interface QueryExecutor {
  execute?: (sql: string, params?: any) => Promise<any>;
}

export const REVIEW_NOTIFICATION_ID_OFFSET = 900_000_000_000;

export async function createTemplateFavoriteNotification(input: TemplateFavoriteNotificationInput, executor?: QueryExecutor) {
  const ownerUserId = Number(input.ownerUserId || 0);
  const actorUserId = Number(input.actorUserId || 0);
  const templateId = Number(input.templateId || 0);
  const favoriteId = input.favoriteId ? Number(input.favoriteId) : null;
  if (!ownerUserId || !actorUserId || !templateId || ownerUserId === actorUserId) return;

  const sql = `INSERT INTO template_favorite_notifications
     (owner_user_id, actor_user_id, template_id, favorite_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE favorite_id = COALESCE(VALUES(favorite_id), favorite_id),
       read_at = NULL, created_at = NOW(3), updated_at = NOW(3)`;
  const params = [ownerUserId, actorUserId, templateId, favoriteId];
  if (executor?.execute) {
    await executor.execute(sql, params);
    return;
  }
  await query(sql, params);
}

export async function createTemplateReviewNotification(input: TemplateReviewNotificationInput) {
  const userId = Number(input.userId || 0);
  const templateId = Number(input.templateId || 0);
  const reviewStatus = input.reviewStatus || 'approved';
  if (!userId || !templateId || reviewStatus !== 'approved') return;

  await query(
    `INSERT INTO template_review_notifications
       (user_id, template_id, review_status, created_at, updated_at)
     VALUES (?, ?, ?, NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE read_at = NULL, created_at = NOW(3), updated_at = NOW(3)`,
    [userId, templateId, reviewStatus],
  );
}

export async function unreadTemplateFavoriteNotificationCount(userId: number) {
  if (!userId) return 0;
  const row = await queryOne<any>(
    `SELECT COUNT(*) AS total
       FROM template_favorite_notifications
      WHERE owner_user_id = ? AND read_at IS NULL`,
    [userId],
  );
  return Number(row?.total || 0);
}

export async function unreadTemplateReviewNotificationCount(userId: number) {
  if (!userId) return 0;
  const row = await queryOne<any>(
    `SELECT COUNT(*) AS total
       FROM template_review_notifications
      WHERE user_id = ? AND read_at IS NULL`,
    [userId],
  );
  return Number(row?.total || 0);
}

export async function unreadTemplateNotificationCount(userId: number) {
  const [favoriteCount, reviewCount] = await Promise.all([
    unreadTemplateFavoriteNotificationCount(userId),
    unreadTemplateReviewNotificationCount(userId),
  ]);
  return favoriteCount + reviewCount;
}

export async function listTemplateNotifications(userId: number, page = 1, pageSize = 20) {
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safePageSize = Math.min(Math.max(1, Math.floor(Number(pageSize) || 20)), 50);
  const offset = (safePage - 1) * safePageSize;
  const rows = await query<any>(
    `SELECT *
       FROM (
        SELECT n.id AS source_id, n.id AS id, 'template_favorite' AS notification_type,
               n.owner_user_id AS user_id, n.actor_user_id, actor.nickname AS actor_nickname, actor.avatar_url AS actor_avatar_url,
               n.template_id, t.title AS template_title, t.cover_url AS template_cover_url, t.preview_url AS template_preview_url,
               n.read_at, n.created_at
          FROM template_favorite_notifications n
          JOIN users actor ON actor.id = n.actor_user_id
          JOIN templates t ON t.id = n.template_id
         WHERE n.owner_user_id = ?
        UNION ALL
        SELECT n.id AS source_id, n.id + ${REVIEW_NOTIFICATION_ID_OFFSET} AS id, 'template_review_approved' AS notification_type,
               n.user_id, 0 AS actor_user_id, '' AS actor_nickname, '' AS actor_avatar_url,
               n.template_id, t.title AS template_title, t.cover_url AS template_cover_url, t.preview_url AS template_preview_url,
               n.read_at, n.created_at
          FROM template_review_notifications n
          JOIN templates t ON t.id = n.template_id
         WHERE n.user_id = ? AND n.review_status = 'approved'
       ) merged
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [userId, userId, safePageSize, offset],
  );
  const [favoriteCount, reviewCount] = await Promise.all([
    queryOne<any>('SELECT COUNT(*) AS total FROM template_favorite_notifications WHERE owner_user_id = ?', [userId]),
    queryOne<any>("SELECT COUNT(*) AS total FROM template_review_notifications WHERE user_id = ? AND review_status = 'approved'", [userId]),
  ]);
  const total = Number(favoriteCount?.total || 0) + Number(reviewCount?.total || 0);
  return {
    list: rows.map(toPublicTemplateNotification),
    pagination: { page: safePage, pageSize: safePageSize, total, totalPages: Math.ceil(total / safePageSize) },
  };
}

export async function markTemplateNotificationRead(userId: number, id: number) {
  if (!userId || !id) return false;
  if (id >= REVIEW_NOTIFICATION_ID_OFFSET) {
    await query(
      `UPDATE template_review_notifications
          SET read_at = COALESCE(read_at, NOW(3)), updated_at = NOW(3)
        WHERE id = ? AND user_id = ?`,
      [id - REVIEW_NOTIFICATION_ID_OFFSET, userId],
    );
    return true;
  }
  await query(
    `UPDATE template_favorite_notifications
        SET read_at = COALESCE(read_at, NOW(3)), updated_at = NOW(3)
      WHERE id = ? AND owner_user_id = ?`,
    [id, userId],
  );
  return true;
}

export async function markAllTemplateNotificationsRead(userId: number) {
  if (!userId) return 0;
  const favoriteResult = await query<any>(
    `UPDATE template_favorite_notifications
        SET read_at = COALESCE(read_at, NOW(3)), updated_at = NOW(3)
      WHERE owner_user_id = ? AND read_at IS NULL`,
    [userId],
  );
  const reviewResult = await query<any>(
    `UPDATE template_review_notifications
        SET read_at = COALESCE(read_at, NOW(3)), updated_at = NOW(3)
      WHERE user_id = ? AND read_at IS NULL`,
    [userId],
  );
  return Number((favoriteResult[0] as any)?.affectedRows || 0) + Number((reviewResult[0] as any)?.affectedRows || 0);
}

function toPublicTemplateNotification(row: any) {
  if (row.notification_type === 'template_review_approved') {
    const templateTitle = String(row.template_title || '').trim() || '你的模板';
    return {
      id: row.id,
      type: 'template_review_approved',
      title: '你的模板已审核通过',
      content: `「${templateTitle}」已通过审核，可在模板列表中展示。`,
      actorUserId: 0,
      actorNickname: '平台审核',
      actorAvatarUrl: '',
      templateId: row.template_id,
      templateTitle,
      templateCoverUrl: row.template_cover_url || row.template_preview_url || '',
      readAt: row.read_at || null,
      createdAt: row.created_at,
    };
  }
  const actorName = String(row.actor_nickname || '').trim() || `用户${row.actor_user_id}`;
  const templateTitle = String(row.template_title || '').trim() || '你的模板';
  return {
    id: row.id,
    type: 'template_favorite',
    title: `${actorName}收藏了你的模板`,
    content: `收藏了「${templateTitle}」。`,
    actorUserId: row.actor_user_id,
    actorNickname: actorName,
    actorAvatarUrl: row.actor_avatar_url || '',
    templateId: row.template_id,
    templateTitle,
    templateCoverUrl: row.template_cover_url || row.template_preview_url || '',
    readAt: row.read_at || null,
    createdAt: row.created_at,
  };
}
