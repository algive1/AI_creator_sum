import { Router, Request, Response } from 'express';
import { query, queryOne } from '../utils/db';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { getLegalRequiredStatus } from './legal';
import { optionalUserId, matchesTarget, isToday } from '../utils/content-helpers';
import { SettingsService } from '../services/settings.service';
import { getAdRewardConfig, getAdRewardStatus } from '../services/ads.service';
import { getCheckinConfig, getSigninStatus } from '../services/signin.service';

const router = Router();

router.get('/home', async (req: Request, res: Response) => {
  try {
    const userId = await optionalUserId(req);
    const legalRequired = userId ? await getLegalRequiredStatus(userId) : { required: true, missing: [] };
    const popupAnnouncement = legalRequired.required ? null : await getPopupAnnouncement(userId);
    const homeAnnouncements = await getHomeAnnouncements(userId);
    const featureEntries = await getFeatureEntries();
    const recommendedTemplates = await getTemplates('recommended');
    const hotTemplates = await getTemplates('hot');
    const inspirationSections = await getInspirationSections();
    const userSummary = userId ? await getUserSummary(userId) : null;
    const recentWorks = userId ? await getRecentWorks(userId) : [];
    const membershipEnabled = await SettingsService.getBoolean('membership.enabled', false);
    const [adConfig, checkinConfig, adStatus, checkinStatus] = await Promise.all([
      getAdRewardConfig(),
      getCheckinConfig(),
      userId ? getAdRewardStatus(userId) : Promise.resolve(null),
      userId ? getSigninStatus(userId) : Promise.resolve(null),
    ]);

    success(res, {
      popupAnnouncement,
      homeAnnouncements,
      featureEntries,
      recommendedTemplates,
      hotTemplates,
      inspirationSections,
      userSummary,
      recentWorks,
      complianceRequired: userId ? legalRequired.missing.length > 0 : true,
      legalRequired,
      membershipEnabled,
      rewardCenter: {
        ad: {
          ...adConfig,
          status: adStatus,
        },
        checkin: {
          ...checkinConfig,
          status: checkinStatus,
        },
      },
    });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取首页聚合数据失败');
  }
});

async function getPopupAnnouncement(userId: number | null) {
  const item = await queryOne<any>(
    `SELECT * FROM announcements
      WHERE enabled = 1 AND deleted_at IS NULL AND type = 'popup'
        AND (start_at IS NULL OR start_at <= NOW(3))
        AND (end_at IS NULL OR end_at >= NOW(3))
        AND show_frequency <> 'list_only'
      ORDER BY priority DESC, sort_order DESC, created_at DESC LIMIT 1`,
  );
  if (!item) return null;
  if (userId && !(await matchesTarget(item, userId))) return null;
  if (userId) {
    const record = await queryOne<any>('SELECT * FROM announcement_user_records WHERE announcement_id = ? AND user_id = ?', [item.id, userId]);
    if (!shouldShowPopup(item, record)) return null;
  }
  return { id: item.id, title: item.title, content: item.content, type: item.type, showFrequency: item.show_frequency };
}

async function getHomeAnnouncements(userId: number | null) {
  const rows = await query<any>(
    `SELECT * FROM announcements
      WHERE enabled = 1 AND deleted_at IS NULL AND type IN ('home', 'profile', 'system', 'activity', 'maintenance')
        AND (start_at IS NULL OR start_at <= NOW(3))
        AND (end_at IS NULL OR end_at >= NOW(3))
      ORDER BY priority DESC, sort_order DESC, created_at DESC
      LIMIT 10`,
  );
  if (rows.length === 0) return [];
  const records = userId
    ? await query<any>(
      `SELECT * FROM announcement_user_records
        WHERE user_id = ? AND announcement_id IN (${rows.map(() => '?').join(',')})`,
      [userId, ...rows.map((row: any) => row.id)],
    )
    : [];
  const result: any[] = [];
  for (const row of rows) {
    if (userId && !(await matchesTarget(row, userId))) continue;
    const record = userId ? records.find((item: any) => Number(item.announcement_id) === Number(row.id)) : null;
    if (userId) {
      if (record?.closed_at && isToday(record.closed_at) && row.show_frequency === 'once_per_day') continue;
    }
    result.push({
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
    });
  }
  return result;
}

async function getFeatureEntries() {
  return [
    { id: 'image', title: 'AI生图', icon: 'image', path: '/pages/image-create/image-create' },
    { id: 'video', title: 'AI生视频', icon: 'video', path: '/pages/video-create/video-create' },
    { id: 'manga', title: 'AI漫剧', icon: 'manga', path: '/pages/manga/manga' },
  ];
}

async function getTemplates(sortBy: 'recommended' | 'hot') {
  const publicUserTemplatesEnabled = await SettingsService.getBoolean('template.user_public_enabled', false);
  const sourceFilter = publicUserTemplatesEnabled ? '' : "AND source = 'official'";
  const rows = await query<any>(
    `SELECT id, title, description, template_type, cover_url, prompt, ratio, style, duration, usage_count, favorite_count, is_hot, is_recommended
       FROM templates
      WHERE is_enabled = 1 AND visibility = 'public' AND status = 'approved' AND review_status = 'approved' AND deleted_at IS NULL
        ${sourceFilter}
      ORDER BY ${sortBy === 'hot' ? 'usage_count DESC, favorite_count DESC' : 'is_recommended DESC, sort_order DESC'}
      LIMIT 8`,
  );
  return rows.map((row: any) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    templateType: row.template_type,
    coverUrl: row.cover_url,
    prompt: row.prompt,
    ratio: row.ratio,
    style: row.style,
    duration: row.duration,
    usageCount: row.usage_count,
    favoriteCount: row.favorite_count,
  }));
}

async function getInspirationSections() {
  const rows = await query<any>(
    `SELECT c.id, c.name, c.category_key, c.icon
       FROM template_categories c
      WHERE c.status = 'active'
      ORDER BY c.sort_order ASC`,
  );
  return rows.map((row: any) => ({ id: row.id, name: row.name, categoryKey: row.category_key, icon: row.icon }));
}

async function getUserSummary(userId: number) {
  const user = await queryOne<any>('SELECT nickname, avatar_url FROM users WHERE id = ?', [userId]);
  const points = await queryOne<any>('SELECT balance FROM point_accounts WHERE user_id = ?', [userId]);
  return { nickname: user?.nickname || '', avatarUrl: user?.avatar_url || '', points: points?.balance || 0 };
}

async function getRecentWorks(userId: number) {
  const rows = await query<any>(
    `SELECT t.id, t.task_type, t.title, t.status, t.created_at, o.cos_key as thumbnail
       FROM ai_tasks t LEFT JOIN ai_task_outputs o ON o.task_id = t.id AND o.output_index = 0
      WHERE t.user_id = ? ORDER BY t.created_at DESC LIMIT 4`, [userId]
  );
  return rows.map((r: any) => ({
    id: r.id, type: r.task_type, title: r.title,
    thumbnail: r.thumbnail
      ? (r.thumbnail.startsWith('local://') ? '/mock/' + r.thumbnail.replace('local://', '') : r.thumbnail) : null,
    status: r.status, createdAt: r.created_at,
  }));
}

function shouldShowPopup(item: any, record: any) {
  const frequency = item.show_frequency || 'once_per_day';
  if (frequency === 'list_only') return false;
  if (frequency === 'every_open') return true;
  if (!record) return true;
  if (frequency === 'once') return !record.closed_at && !record.popup_count;
  if (frequency === 'once_per_day') {
    return !(record.closed_at && isToday(record.closed_at)) && !(record.last_popup_at && isToday(record.last_popup_at));
  }
  return true;
}

export default router;
