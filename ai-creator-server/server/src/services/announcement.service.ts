import { query, queryOne } from '../utils/db';
import { matchesTarget } from '../utils/content-helpers';

export interface AnnouncementRecord {
  read_at?: Date | string | null;
  closed_at?: Date | string | null;
  last_popup_at?: Date | string | null;
  popup_count?: number | null;
}

export interface AnnouncementListOptions {
  type?: string;
  types?: string[];
  includeListOnly?: boolean;
  limit?: number;
}

export async function listVisibleAnnouncements(options: AnnouncementListOptions = {}) {
  const where = [
    'enabled = 1',
    'deleted_at IS NULL',
    '(start_at IS NULL OR start_at <= NOW(3))',
    '(end_at IS NULL OR end_at >= NOW(3))',
  ];
  const params: unknown[] = [];

  if (options.type) {
    where.push('type = ?');
    params.push(options.type);
  } else if (options.types?.length) {
    where.push(`type IN (${options.types.map(() => '?').join(',')})`);
    params.push(...options.types);
  }
  if (!options.includeListOnly) {
    where.push("show_frequency <> 'list_only'");
  }

  const limit = Number(options.limit || 0);
  return query<any>(
    `SELECT * FROM announcements
      WHERE ${where.join(' AND ')}
      ORDER BY priority DESC, sort_order DESC, created_at DESC
      ${limit > 0 ? 'LIMIT ?' : ''}`,
    limit > 0 ? [...params, limit] : params,
  );
}

export async function getVisibleAnnouncementById(id: number) {
  return queryOne<any>(
    `SELECT * FROM announcements
      WHERE id = ? AND enabled = 1 AND deleted_at IS NULL
        AND (start_at IS NULL OR start_at <= NOW(3))
        AND (end_at IS NULL OR end_at >= NOW(3))`,
    [id],
  );
}

export async function getAnnouncementRecord(announcementId: number, userId: number) {
  return queryOne<AnnouncementRecord>(
    'SELECT * FROM announcement_user_records WHERE announcement_id = ? AND user_id = ?',
    [announcementId, userId],
  );
}

export async function getAnnouncementRecords(userId: number, announcementIds: number[]) {
  const ids = announcementIds.map(Number).filter(id => Number.isFinite(id) && id > 0);
  if (!userId || ids.length === 0) return [];
  return query<any>(
    `SELECT * FROM announcement_user_records
      WHERE user_id = ? AND announcement_id IN (${ids.map(() => '?').join(',')})`,
    [userId, ...ids],
  );
}

export async function getPopupAnnouncementForUser(userId: number | null, options: { markSeen?: boolean } = {}) {
  const rows = await listVisibleAnnouncements({ type: 'popup', includeListOnly: false });
  const today = toDateKey(new Date());

  for (const row of rows) {
    if (userId && !(await matchesTarget(row, userId))) continue;
    const record = userId ? await getAnnouncementRecord(row.id, userId) : null;
    if (!shouldShowPopupAnnouncement(row, record, today)) continue;
    if (userId && options.markSeen !== false) await markPopupSeen(row.id, userId);
    return toPublicAnnouncement(row, record);
  }
  return null;
}

export async function markPopupSeen(announcementId: number, userId: number) {
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

export async function markAnnouncementRead(announcementId: number, userId: number) {
  await query(
    `INSERT INTO announcement_user_records
     (announcement_id, user_id, first_seen_at, read_at, popup_count, created_at, updated_at)
     VALUES (?, ?, NOW(3), NOW(3), 0, NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE read_at = VALUES(read_at), updated_at = NOW(3)`,
    [announcementId, userId],
  );
}

export async function closeAnnouncementPopup(announcementId: number, userId: number) {
  await query(
    `INSERT INTO announcement_user_records
     (announcement_id, user_id, first_seen_at, closed_at, popup_count, created_at, updated_at)
     VALUES (?, ?, NOW(3), NOW(3), 0, NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE closed_at = VALUES(closed_at), updated_at = NOW(3)`,
    [announcementId, userId],
  );
}

export function toPublicAnnouncement(row: any, record: AnnouncementRecord | null = null) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    type: row.type,
    showFrequency: row.show_frequency,
    priority: row.priority,
    startAt: row.start_at,
    endAt: row.end_at,
    createdAt: row.created_at,
    readAt: record?.read_at || null,
    closedAt: record?.closed_at || null,
    lastPopupAt: record?.last_popup_at || null,
    popupCount: record?.popup_count || 0,
  };
}

export function shouldShowPopupAnnouncement(row: any, record: AnnouncementRecord | null, today = toDateKey(new Date())) {
  const frequency = String(row.show_frequency || 'once_per_day');
  if (frequency === 'list_only') return false;
  if (frequency === 'every_open') return true;
  if (!record) return true;
  if (frequency === 'once') return !record.closed_at && !record.read_at && !Number(record.popup_count || 0);
  if (frequency === 'once_per_day') {
    return !isSameDate(record.closed_at, today)
      && !isSameDate(record.read_at, today)
      && !isSameDate(record.last_popup_at, today);
  }
  return true;
}

function isSameDate(value: Date | string | null | undefined, dateKey: string) {
  if (!value) return false;
  return toDateKey(value) === dateKey;
}

function toDateKey(date: Date | string): string {
  const source = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(source.getTime())) return '';
  const year = source.getFullYear();
  const month = String(source.getMonth() + 1).padStart(2, '0');
  const day = String(source.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
