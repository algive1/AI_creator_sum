import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getConnection, query, queryOne } from '../utils/db';
import { success, error } from '../utils/response';
import { parseJson } from '../utils/content-helpers';
import { ErrorCodes } from '../types';
import { optionalUserId } from '../utils/content-helpers';
import { hasComplianceConfirmation } from './compliance';
import { SettingsService } from '../services/settings.service';
import { isActiveMember } from '../services/membership.service';
import { createTemplateFavoriteNotification } from '../services/template-notification.service';
import { normalizePublicMediaUrl } from '../utils/public-media-url';
import {
  normalizeTemplateTargetFeatureKey,
  parseTemplateJson,
  resolveTemplateUsageType,
} from '../services/template.service';

const router = Router();
const TEMPLATE_SAVE_USE_MEMBER_MESSAGE = '\u8be5\u6a21\u677f\u4e3a\u4f1a\u5458\u4e13\u5c5e\uff0c\u5f00\u901a\u4f1a\u5458\u540e\u53ef\u4fdd\u5b58\u7d20\u6750\u548c\u4f7f\u7528\u6a21\u677f\u3002';
const TEMPLATE_MEMBER_MESSAGE = '该灵感模板为会员专享，开通会员后可使用。';
const PROFILE_REQUIRED = 4610;

router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const rows = await query<any>(
      'SELECT id, name, category_key, icon FROM template_categories WHERE status = ? ORDER BY sort_order ASC',
      ['active'],
    );
    success(res, {
      list: rows.map((row: any) => ({
        id: row.id,
        categoryId: row.id,
        name: row.name,
        categoryKey: row.category_key,
        category: row.name,
        icon: row.icon,
      })),
    });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取分类失败');
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = await optionalUserId(req);
    const listResult = await queryTemplates(userId || 0, req.query as any, req);
    success(res, {
      list: listResult.list,
      pagination: listResult.pagination,
    });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取模板列表失败');
  }
});

router.get('/recommended', async (req: Request, res: Response) => {
  try {
    const userId = await optionalUserId(req);
    const result = await queryTemplates(userId || 0, { ...req.query, pageSize: '8', sortBy: 'recommended' }, req);
    success(res, result);
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取推荐模板失败');
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const userId = await optionalUserId(req);
    const result = await queryTemplates(userId || 0, { ...req.query, keyword: req.query.keyword || (req.query as any).q }, req);
    success(res, result);
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '搜索模板失败');
  }
});

router.get('/inspirations', async (req: Request, res: Response) => {
  try {
    const userId = await optionalUserId(req);
    const result = await queryDisplayPositionTemplates('inspiration', userId || 0, req);
    success(res, result);
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取灵感模板失败');
  }
});

router.get('/home-inspirations', async (req: Request, res: Response) => {
  try {
    const userId = await optionalUserId(req);
    let result = await queryDisplayPositionTemplates('home_inspiration', userId || 0, req);
    const fallback = result.list.length === 0;
    if (fallback) {
      result = await queryDisplayPositionTemplates('inspiration', userId || 0, req);
    }
    success(res, { ...result, fallback });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取首页灵感推荐失败');
  }
});

router.get('/inspirations/top', async (req: Request, res: Response) => {
  try {
    const userId = await optionalUserId(req);
    const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize || '12'), 10) || 12, 1), 50);
    const publicUserTemplatesEnabled = await SettingsService.getBoolean('template.user_public_enabled', false);
    const sourceFilter = publicTemplateSourceFilter(publicUserTemplatesEnabled);
    const rows = await query<any>(
      `SELECT t.*, c.name AS category_name, c.category_key, u.nickname, u.avatar_url
         FROM templates t
         LEFT JOIN template_categories c ON c.id = t.category_id
         LEFT JOIN users u ON u.id = t.user_id
        WHERE t.deleted_at IS NULL AND t.is_enabled = 1 AND t.status = 'approved' AND t.review_status = 'approved'
          ${sourceFilter}
          AND t.template_type IN ('image', 'video')
          AND JSON_EXTRACT(t.display_config, '$.inspiration_top') IS NOT NULL
        ORDER BY ${templateDefaultOrderBy('inspiration_top', isRandomTemplateRequest(req))}
        LIMIT ?`,
      [pageSize],
    );
    const list = await buildPublicTemplateList(rows, userId || 0, req);
    success(res, { list });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取顶部灵感模板失败');
  }
});

router.get('/my-favorites', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize || '20'), 10) || 20, 1), 100);
    const offset = (page - 1) * pageSize;
    const rows = await query<any>(
      `SELECT t.*, c.name AS category_name, c.category_key, u.nickname, u.avatar_url, f.created_at AS favorited_at
         FROM template_favorites f
         JOIN templates t ON t.id = f.template_id
         LEFT JOIN template_categories c ON c.id = t.category_id
         LEFT JOIN users u ON u.id = t.user_id
        WHERE f.user_id = ?
          AND t.deleted_at IS NULL
          AND t.is_enabled = 1
          AND t.status = 'approved'
          AND t.review_status = 'approved'
        ORDER BY f.created_at DESC, f.id DESC
        LIMIT ? OFFSET ?`,
      [userId, pageSize, offset],
    );
    const [countRow] = await query<any>(
      `SELECT COUNT(*) AS total
         FROM template_favorites f
         JOIN templates t ON t.id = f.template_id
        WHERE f.user_id = ?
          AND t.deleted_at IS NULL
          AND t.is_enabled = 1
          AND t.status = 'approved'
          AND t.review_status = 'approved'`,
      [userId],
    );
    const list = [];
    for (const row of rows) {
      const item = await toPublicTemplate(row, userId, req);
      if (item.canView !== false) list.push({ ...item, favoritedAt: row.favorited_at });
    }
    const total = Number(countRow?.total || 0);
    success(res, {
      list,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取我的收藏失败');
  }
});

router.post('/:id(\\d+)/favorite', authMiddleware, async (req: Request, res: Response) => {
  const conn = await getConnection();
  try {
    const userId = req.user!.userId;
    const templateId = Number(req.params.id);
    await conn.beginTransaction();
    const template = await selectVisibleTemplateForFavorite(conn, templateId, userId);
    if (!template) {
      await conn.rollback();
      error(res, ErrorCodes.NOT_FOUND, '模板不存在', 404);
      return;
    }
    const [existingFavorites] = await conn.execute(
      'SELECT id FROM template_favorites WHERE user_id = ? AND template_id = ? LIMIT 1',
      [userId, templateId],
    ) as any;
    if (!existingFavorites.length) {
      const [insertedFavorite] = await conn.execute(
        'INSERT INTO template_favorites (user_id, template_id, created_at) VALUES (?, ?, NOW(3))',
        [userId, templateId],
      ) as any;
      const favoriteId = Number(insertedFavorite?.insertId || 0);
      await conn.execute('UPDATE templates SET favorite_count = COALESCE(favorite_count, 0) + 1, updated_at = NOW(3) WHERE id = ?', [templateId]);
      await conn.execute(
        `INSERT INTO user_assets (user_id, total_favorites, created_at, updated_at)
         VALUES (?, 1, NOW(3), NOW(3))
         ON DUPLICATE KEY UPDATE total_favorites = total_favorites + 1, updated_at = NOW(3)`,
        [userId],
      );
      await createTemplateFavoriteNotification({
        ownerUserId: Number(template.user_id || 0),
        actorUserId: userId,
        templateId,
        favoriteId,
      }, conn);
    }
    await conn.commit();
    success(res, await favoriteStatePayload(userId, templateId));
  } catch {
    await conn.rollback();
    error(res, ErrorCodes.SERVER_ERROR, '收藏模板失败');
  } finally {
    conn.release();
  }
});

router.delete('/:id(\\d+)/favorite', authMiddleware, async (req: Request, res: Response) => {
  const conn = await getConnection();
  try {
    const userId = req.user!.userId;
    const templateId = Number(req.params.id);
    await conn.beginTransaction();
    const template = await selectVisibleTemplateForFavorite(conn, templateId, userId);
    if (!template) {
      await conn.rollback();
      error(res, ErrorCodes.NOT_FOUND, '模板不存在', 404);
      return;
    }
    const [deleted] = await conn.execute(
      'DELETE FROM template_favorites WHERE user_id = ? AND template_id = ?',
      [userId, templateId],
    ) as any;
    if (Number(deleted?.affectedRows || 0) > 0) {
      await conn.execute('UPDATE templates SET favorite_count = GREATEST(COALESCE(favorite_count, 0) - 1, 0), updated_at = NOW(3) WHERE id = ?', [templateId]);
      await conn.execute(
        `INSERT INTO user_assets (user_id, total_favorites, created_at, updated_at)
         VALUES (?, 0, NOW(3), NOW(3))
         ON DUPLICATE KEY UPDATE total_favorites = GREATEST(total_favorites - 1, 0), updated_at = NOW(3)`,
        [userId],
      );
    }
    await conn.commit();
    success(res, await favoriteStatePayload(userId, templateId));
  } catch {
    await conn.rollback();
    error(res, ErrorCodes.SERVER_ERROR, '取消收藏失败');
  } finally {
    conn.release();
  }
});

router.get('/:id(\\d+)', async (req: Request, res: Response) => {
  try {
    const userId = await optionalUserId(req) || 0;
    const row = await queryOne<any>(
      `SELECT t.*, c.name AS category_name, c.category_key, u.nickname, u.avatar_url
         FROM templates t
         LEFT JOIN template_categories c ON c.id = t.category_id
         LEFT JOIN users u ON u.id = t.user_id
        WHERE t.id = ? AND t.deleted_at IS NULL`,
      [Number(req.params.id)],
    );
    if (!row) {
      error(res, ErrorCodes.NOT_FOUND, '模板不存在', 404);
      return;
    }
    const isOwner = row.user_id === userId;
    const approvedPublic = isApprovedPublicTemplate(row);
    if (!isOwner && !approvedPublic) {
      error(res, ErrorCodes.TEMPLATE_NOT_APPROVED, '模板尚未审核通过', 403);
      return;
    }
    const publicUserTemplatesEnabled = await SettingsService.getBoolean('template.user_public_enabled', false);
    if (!isOwner && !publicUserTemplatesEnabled && row.source === 'user') {
      error(res, ErrorCodes.NOT_FOUND, '模板不存在', 404);
      return;
    }
    const item = await toPublicTemplate(row, userId, req);
    if (!isOwner && item.canView === false) {
      error(res, ErrorCodes.MEMBERSHIP_REQUIRED, TEMPLATE_MEMBER_MESSAGE, 403);
      return;
    }
    success(res, item);
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取模板详情失败');
  }
});

router.post('/:id(\\d+)/use', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const templateId = Number(req.params.id);
    const template = await queryOne<any>('SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL', [templateId]);
    if (!template) {
      error(res, ErrorCodes.NOT_FOUND, '模板不存在', 404);
      return;
    }
    const isOwner = template.user_id === userId;
    if (!isOwner && !isApprovedPublicTemplate(template)) {
      error(res, ErrorCodes.TEMPLATE_NOT_APPROVED, '模板尚未审核通过', 403);
      return;
    }
    const publicUserTemplatesEnabled = await SettingsService.getBoolean('template.user_public_enabled', false);
    if (!isOwner && !publicUserTemplatesEnabled && template.source === 'user') {
      error(res, ErrorCodes.NOT_FOUND, '模板不存在', 404);
      return;
    }
    if (!isOwner && await isImageTemplateUseMemberOnly(template, userId)) {
      error(res, ErrorCodes.MEMBERSHIP_REQUIRED, '图片模板使用为会员专属功能，请开通会员后使用。', 403);
      return;
    }
    const permission = await checkMembershipPermission(userId, template);
    if (permission.canView === false || !permission.canUse) {
      error(res, ErrorCodes.MEMBERSHIP_REQUIRED, permission.lockReason || TEMPLATE_MEMBER_MESSAGE, 403);
      return;
    }
    await query('UPDATE templates SET usage_count = usage_count + 1, updated_at = NOW(3) WHERE id = ?', [templateId]);
    await query('INSERT INTO template_usage_logs (user_id, template_id, task_id, params_modified, created_at) VALUES (?, ?, 0, 0, NOW(3))', [userId, templateId]);
    const params = parseJson(template.params_json, {});
    success(res, {
      templateId,
      prompt: template.prompt,
      negativePrompt: template.negative_prompt,
      paramsJson: params,
      ratio: template.ratio,
      width: template.width,
      height: template.height,
      duration: template.duration,
      style: template.style,
      scene: template.scene,
      targetFeature: template.target_feature,
      accessLevel: permission.accessLevel,
      visibilityScope: permission.visibilityScope,
      usageScope: permission.usageScope,
      requiredMemberPlanId: permission.requiredMemberPlanId,
      memberBadgeText: permission.memberBadgeText,
      canUse: permission.canUse,
      canSave: permission.canSave,
      lockReason: permission.lockReason,
    });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '使用模板失败');
  }
});

router.post('/share', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const shareEnabled = await SettingsService.getBoolean('template.user_share_enabled', true);
    if (!shareEnabled) {
      error(res, ErrorCodes.FORBIDDEN, '当前不允许用户分享模板', 403);
      return;
    }
    const shareNickname = await getShareProfileNickname(userId);
    if (!hasShareProfileNickname(shareNickname)) {
      error(res, PROFILE_REQUIRED, '请先设置昵称后再分享模板');
      return;
    }

    const { taskId, outputId, outputIndex, title, description, templateType, targetFeature, negativePrompt, paramsJson, ratio, width, height, duration, style, scene, categoryId, tagsJson } = req.body;
    const taskIdNum = toPositiveId(taskId);
    const outputIdNum = toPositiveId(outputId);
    const outputIndexNum = Number.isInteger(Number(outputIndex)) && Number(outputIndex) >= 0 ? Number(outputIndex) : 0;
    if (!taskIdNum) {
      error(res, ErrorCodes.PARAM_ERROR, 'taskId 不能为空');
      return;
    }

    const task = await queryOne<any>('SELECT * FROM ai_tasks WHERE id = ? AND user_id = ?', [taskIdNum, userId]);
    if (!task) {
      error(res, ErrorCodes.FORBIDDEN, '任务不属于当前用户', 403);
      return;
    }
    if (task.status !== 'completed') {
      error(res, ErrorCodes.PARAM_ERROR, '任务尚未完成，不能分享');
      return;
    }

    const output = outputIdNum
      ? await queryOne<any>('SELECT * FROM ai_task_outputs WHERE id = ? AND task_id = ?', [outputIdNum, taskIdNum])
      : await queryOne<any>('SELECT * FROM ai_task_outputs WHERE task_id = ? AND output_index = ?', [taskIdNum, outputIndexNum]);
    if (!output) {
      error(res, ErrorCodes.FILE_PERMISSION_DENIED, '输出不属于该任务', 403);
      return;
    }

    const outputMeta = parseJson(output.metadata, {});
    const outputFile = await queryOne<any>(
      `SELECT id, file_no, cdn_url, access_url, mime_type, file_size, width, height, duration
         FROM files
        WHERE user_id = ? AND is_deleted = 0
          AND (
            (storage_key = ? AND ref_type = 'task_output' AND ref_id = ?)
            OR file_no = ?
          )
        LIMIT 1`,
      [userId, output.cos_key || '', String(taskIdNum), outputMeta.fileNo || ''],
    );
    if (!outputFile) {
      error(res, ErrorCodes.FILE_NOT_FOUND, '输出文件不存在', 404);
      return;
    }

    const outputType = output.output_type === 'video' ? 'video' : 'image';
    const normalizedTemplateType = normalizeTemplateType(templateType || outputType);
    if (normalizedTemplateType !== outputType) {
      error(res, ErrorCodes.PARAM_ERROR, '模板类型与输出类型不一致');
      return;
    }

    const publicTemplateConfirmed = await hasComplianceConfirmation(userId, 'public_template');
    if (!publicTemplateConfirmed) {
      error(res, ErrorCodes.LEGAL_ACCEPT_REQUIRED, '请先勾选并确认公开协议');
      return;
    }

    const inputRow = await queryOne<any>('SELECT prompt, params, form_data FROM ai_task_inputs WHERE task_id = ?', [taskIdNum]);
    const taskParams = parseJson(inputRow?.params, {});
    const outputUrl = outputMeta.deliveryUrl || outputFile.cdn_url || outputFile.access_url || '';
    const coverUrl = outputType === 'image'
      ? outputUrl
      : (outputMeta.thumbnailUrl || outputMeta.thumbnail || output.thumbnail_key || outputUrl);
    const paramsPayload = parseBodyJson(paramsJson, taskParams);

    const row = {
      title: String(title || task.title || '未命名模板').trim().slice(0, 128),
      description: String(description || '').trim().slice(0, 512),
      templateType: normalizedTemplateType,
      targetFeature: targetFeature || (outputType === 'video' ? 'video_create' : 'image_create'),
      source: 'user',
      userId,
      taskId: taskIdNum,
      outputId: Number(output.id),
      coverFileId: outputType === 'image' ? outputFile.id : null,
      previewFileId: outputFile.id,
      coverUrl,
      previewUrl: outputUrl,
      prompt: inputRow?.prompt || output.prompt_used || '',
      negativePrompt: String(negativePrompt || inputRow?.negative_prompt || '').trim(),
      paramsJson: paramsPayload,
      ratio: String(ratio || output.ratio || taskParams.ratio || taskParams.sizePlan?.targetRatio || '').trim(),
      width: Number(width || output.width || outputFile.width || 0),
      height: Number(height || output.height || outputFile.height || 0),
      duration: Number(duration || outputMeta.duration || outputFile.duration || taskParams.durationSeconds || taskParams.duration || 0) || null,
      style: String(style || output.style || taskParams.style || '').trim().slice(0, 64),
      scene: String(scene || taskParams.scene || '').trim().slice(0, 64),
      categoryId: categoryId ? Number(categoryId) : null,
      tagsJson: parseBodyJson(tagsJson, []),
    };

    const inserted = await query<any>(
      `INSERT INTO templates
       (title, description, template_type, target_feature, source, user_id, task_id, output_id, cover_file_id, cover_url, preview_file_id, preview_url,
        prompt, negative_prompt, params_json, ratio, width, height, duration, style, scene, category_id, tags_json, sort_order, is_recommended, is_hot,
        is_enabled, visibility, status, review_status, review_reason, reviewed_by, reviewed_at, usage_count, view_count, favorite_count,
        content_check_result, access_level, visibility_scope, usage_scope, required_member_plan_id, member_badge_text, member_lock_message,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
      [
        row.title,
        row.description,
        row.templateType,
        row.targetFeature,
        row.source,
        row.userId,
        row.taskId,
        row.outputId,
        row.coverFileId,
        row.coverUrl,
        row.previewFileId,
        row.previewUrl,
        row.prompt,
        row.negativePrompt,
        JSON.stringify(row.paramsJson || {}),
        row.ratio,
        row.width,
        row.height,
        row.duration,
        row.style,
        row.scene,
        row.categoryId,
        JSON.stringify(row.tagsJson || []),
        0,
        0,
        0,
        1,
        'public',
        'pending',
        'pending',
        '',
        null,
        null,
        0,
        0,
        0,
        null,
        'free',
        'all',
        'all',
        null,
        '',
        '',
      ],
    );

    const createdId = Number((inserted[0] as any)?.insertId || 0);
    if (createdId) {
      await query(
        'INSERT INTO template_review_logs (template_id, action, reason, operator_id, created_at) VALUES (?, ?, ?, ?, NOW(3))',
        [createdId, 'submitted', '用户提交公开模板', userId],
      );
    }

    success(res, { created: true, templateId: createdId || undefined, status: 'pending', reviewStatus: 'pending' });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '提交模板分享失败');
  }
});

router.post('/:id(\\d+)/cancel-public', authMiddleware, async (req: Request, res: Response) => {
  try {
    const templateId = Number(req.params.id);
    const userId = req.user!.userId;
    const template = await queryOne<any>('SELECT * FROM templates WHERE id = ? AND user_id = ? AND source = ? AND deleted_at IS NULL', [templateId, userId, 'user']);
    if (!template) {
      error(res, ErrorCodes.FORBIDDEN, '只能取消自己的公开模板', 403);
      return;
    }
    await query(
      `UPDATE templates
          SET visibility = 'private', status = 'cancelled_by_user', review_status = 'pending', is_enabled = 0, updated_at = NOW(3)
        WHERE id = ?`,
      [templateId],
    );
    await query(
      'INSERT INTO template_review_logs (template_id, action, reason, operator_id, created_at) VALUES (?, ?, ?, ?, NOW(3))',
      [templateId, 'cancelled_by_user', '用户主动取消公开', userId],
    );
    success(res, { templateId, cancelled: true, status: 'cancelled_by_user' });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '取消公开失败');
  }
});

router.get('/my-templates', authMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await query<any>(
      `SELECT t.*, c.name AS category_name, c.category_key, u.nickname, u.avatar_url
         FROM templates t
         LEFT JOIN template_categories c ON c.id = t.category_id
         LEFT JOIN users u ON u.id = t.user_id
        WHERE t.user_id = ? AND t.deleted_at IS NULL
        ORDER BY t.created_at DESC, t.id DESC`,
      [req.user!.userId],
    );
    success(res, { list: await Promise.all(rows.map(row => toPublicTemplate(row, req.user!.userId, req))) });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取我的模板失败');
  }
});

async function toPublicTemplate(row: any, userId: number, req?: Request, favoritedTemplateIds?: Set<number>) {
  const permission = await checkMembershipPermission(userId, row);
  const imageUseMemberOnly = await isImageTemplateUseMemberOnly(row, userId);
  const canUse = permission.canUse && !imageUseMemberOnly;
  const canSave = permission.canSave;
  const lockReason = imageUseMemberOnly ? '图片模板使用为会员专属功能，请开通会员后使用。' : permission.lockReason;
  const paramsJson = parseJson(row.params_json, {});
  const tagsJson = parseJson(row.tags_json, []);
  const displayConfig = parseTemplateJson<Record<string, any> | null>(row.display_config, null);
  const targetFeature = normalizeTemplateTargetFeatureKey(row.target_feature);
  const usageType = resolveTemplateUsageType(row.template_type, row.usage_type, targetFeature, displayConfig);
  const coverUrl = await normalizePublicMediaUrl(req, row.cover_url);
  const previewUrl = await normalizePublicMediaUrl(req, row.preview_url);
  return {
    id: row.id,
    title: row.title || row.prompt || '灵感模板',
    name: row.title || row.prompt || '灵感模板',
    description: row.description,
    templateType: row.template_type,
    targetFeature,
    usageType,
    displayConfig,
    source: row.source,
    author: displayTemplateAuthor(row),
    nickname: displayTemplateAuthor(row),
    avatarUrl: row.avatar_url || '',
    authorAvatar: row.avatar_url || '',
    coverUrl,
    previewUrl,
    prompt: row.prompt,
    promptTemplate: row.prompt,
    negativePrompt: row.negative_prompt,
    paramsJson,
    defaultParams: paramsJson,
    ratio: row.ratio,
    width: row.width,
    height: row.height,
    duration: row.duration,
    style: row.style,
    quality: (paramsJson as any).quality || (paramsJson as any).resolution || '',
    scene: row.scene,
    categoryId: row.category_id,
    categoryName: row.category_name || '',
    category: row.category_name || '',
    categoryKey: row.category_key || '',
    tagsJson,
    tags: Array.isArray(tagsJson) ? tagsJson.join(',') : '',
    isRecommended: !!row.is_recommended,
    isHot: !!row.is_hot,
    accessLevel: permission.accessLevel,
    visibilityScope: permission.visibilityScope,
    usageScope: permission.usageScope,
    requiredMemberPlanId: permission.requiredMemberPlanId,
    memberBadgeText: permission.memberBadgeText,
    canView: permission.canView,
    canUse,
    canSave,
    lockReason,
    reviewStatus: row.review_status,
    status: row.status,
    usageCount: row.usage_count,
    viewCount: row.view_count,
    favoriteCount: row.favorite_count,
    isFavorited: favoritedTemplateIds ? favoritedTemplateIds.has(Number(row.id)) : userId > 0 ? await isTemplateFavorited(userId, Number(row.id)) : false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function displayTemplateAuthor(row: any) {
  if (String(row.source || '') === 'official') return '@官方灵感';
  const nickname = String(row.nickname || '').trim();
  if (nickname) return nickname.startsWith('@') ? nickname : `@${nickname}`;
  if (row.user_id) return `@用户${row.user_id}`;
  return '@官方灵感';
}

async function isTemplateFavorited(userId: number, templateId: number) {
  if (!userId || !templateId) return false;
  const row = await queryOne<any>('SELECT id FROM template_favorites WHERE user_id = ? AND template_id = ? LIMIT 1', [userId, templateId]);
  return !!row;
}

async function favoriteStatePayload(userId: number, templateId: number) {
  const template = await queryOne<any>('SELECT favorite_count FROM templates WHERE id = ?', [templateId]);
  const assets = await queryOne<any>('SELECT total_favorites FROM user_assets WHERE user_id = ?', [userId]);
  return {
    templateId,
    isFavorited: await isTemplateFavorited(userId, templateId),
    favoriteCount: Number(template?.favorite_count || 0),
    totalFavorites: Number(assets?.total_favorites || 0),
  };
}

async function selectVisibleTemplateForFavorite(conn: any, templateId: number, userId: number) {
  if (!templateId) return null;
  const [rows] = await conn.execute('SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [templateId]) as any;
  const template = rows?.[0];
  if (!template) return null;
  const isOwner = Number(template.user_id) === Number(userId);
  if (!isOwner && !isApprovedPublicTemplate(template)) return null;
  const publicUserTemplatesEnabled = await SettingsService.getBoolean('template.user_public_enabled', false);
  if (!isOwner && !publicUserTemplatesEnabled && template.source === 'user') return null;
  const permission = await checkMembershipPermission(userId, template);
  if (!isOwner && permission.canView === false) return null;
  return template;
}

async function queryTemplates(userId: number, queryParams: any, req?: Request) {
  const { templateType, targetFeature, source, keyword, categoryId, page, pageSize, sortBy } = queryParams;
  const pg = Math.max(parseInt(page || '1', 10), 1);
  const ps = Math.min(Math.max(parseInt(pageSize || '20', 10), 1), 100);
  const offset = (pg - 1) * ps;
  const publicUserTemplatesEnabled = await SettingsService.getBoolean('template.user_public_enabled', false);
  const normalizedTargetFeature = targetFeature ? normalizeTemplateTargetFeatureKey(targetFeature) : '';
  const randomRequested = isRandomTemplateRequest({ query: queryParams } as Request);

  const where: string[] = [
    't.deleted_at IS NULL',
    't.is_enabled = 1',
    "t.visibility = 'public'",
    "t.status = 'approved'",
    "t.review_status = 'approved'",
  ];
  const params: any[] = [];
  if (templateType) {
    where.push('t.template_type = ?');
    params.push(templateType);
  }
  if (normalizedTargetFeature) {
    const aliases = targetFeatureLookupValues(normalizedTargetFeature);
    where.push(`(t.target_feature IN (${aliases.map(() => '?').join(', ')}) OR JSON_EXTRACT(t.display_config, '${displayConfigJsonPath(normalizedTargetFeature)}') IS NOT NULL)`);
    params.push(...aliases);
  }
  if (!publicUserTemplatesEnabled) {
    where.push("t.source = 'official'");
  } else if (source) {
    where.push('t.source = ?');
    params.push(source);
  }
  if (keyword) {
    where.push('(t.title LIKE ? OR t.description LIKE ? OR t.prompt LIKE ?)');
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }
  if (categoryId) {
    where.push('t.category_id = ?');
    params.push(Number(categoryId));
  }

  const defaultOrderBy = sortBy === 'hot'
    ? 't.usage_count DESC, t.favorite_count DESC, t.sort_order DESC'
    : sortBy === 'new'
      ? 't.created_at DESC'
      : templateDefaultOrderBy(normalizedTargetFeature, randomRequested);
  const orderBy = normalizedTargetFeature && sortBy !== 'hot' && sortBy !== 'new'
    ? templateDefaultOrderBy(normalizedTargetFeature, randomRequested)
    : defaultOrderBy;

  const rows = await query<any>(
    `SELECT t.*, c.name AS category_name, c.category_key, u.nickname, u.avatar_url
       FROM templates t
       LEFT JOIN template_categories c ON c.id = t.category_id
       LEFT JOIN users u ON u.id = t.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?`,
    [...params, ps, offset],
  );
  const [countRow] = await query<any>(
    `SELECT COUNT(*) AS total
       FROM templates t
      WHERE ${where.join(' AND ')}`,
    params,
  );
  const list = await buildPublicTemplateList(rows, userId, req);
  return {
    list,
    pagination: { page: pg, pageSize: ps, total: Number(countRow?.total || 0), totalPages: Math.ceil(Number(countRow?.total || 0) / ps) },
  };
}

async function queryDisplayPositionTemplates(position: 'home_inspiration' | 'inspiration', userId: number, req?: Request) {
  const page = Math.max(parseInt(String(req?.query?.page || '1'), 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(String(req?.query?.pageSize || '24'), 10) || 24, 1), 50);
  const offset = (page - 1) * pageSize;
  const publicUserTemplatesEnabled = await SettingsService.getBoolean('template.user_public_enabled', false);
  const sourceFilter = publicUserTemplatesEnabled ? '' : "AND t.source = 'official'";
  const includeUserShared = position === 'inspiration' && publicUserTemplatesEnabled;
  const displayPath = displayConfigJsonPath(position);
  const where = `t.deleted_at IS NULL AND t.is_enabled = 1 AND t.status = 'approved' AND t.review_status = 'approved'
        ${sourceFilter}
        AND (JSON_EXTRACT(t.display_config, '${displayPath}') IS NOT NULL${includeUserShared ? " OR t.source = 'user'" : ''})`;
  const [rows, countRows] = await Promise.all([
    query<any>(
    `SELECT t.*, c.name AS category_name, c.category_key, u.nickname, u.avatar_url
       FROM templates t
       LEFT JOIN template_categories c ON c.id = t.category_id
       LEFT JOIN users u ON u.id = t.user_id
      WHERE ${where}
      ORDER BY ${templateDefaultOrderBy(position, isRandomTemplateRequest(req))}
      LIMIT ? OFFSET ?`,
      [pageSize, offset],
    ),
    query<any>(`SELECT COUNT(*) AS total FROM templates t WHERE ${where}`),
  ]);
  const list = await buildPublicTemplateList(rows, userId, req);
  const total = Number(countRows[0]?.total || 0);
  return {
    list,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    total,
    hasMore: offset + rows.length < total,
  };
}

async function buildPublicTemplateList(rows: any[], userId: number, req?: Request) {
  const favoritedTemplateIds = await getFavoritedTemplateIds(userId, rows);
  const list = [];
  for (const row of rows) {
    const item = await toPublicTemplate(row, userId, req, favoritedTemplateIds);
    if (item.canView !== false) list.push(item);
  }
  return list;
}

async function getFavoritedTemplateIds(userId: number, templates: any[]): Promise<Set<number>> {
  const templateIds = [...new Set(templates.map((item) => Number(item.id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!userId || !templateIds.length) return new Set();
  const rows = await query<any>(
    `SELECT template_id FROM template_favorites
      WHERE user_id = ? AND template_id IN (${templateIds.map(() => '?').join(',')})`,
    [userId, ...templateIds],
  );
  return new Set(rows.map((row) => Number(row.template_id)).filter((id) => Number.isInteger(id) && id > 0));
}

async function isImageTemplateUseMemberOnly(row: any, userId: number) {
  void isImageLikeTemplate(row);
  void userId;
  return false;
}

function isImageLikeTemplate(row: any) {
  const displayConfig = parseTemplateJson<Record<string, any> | null>(row.display_config, null);
  const targetFeature = normalizeTemplateTargetFeatureKey(row.target_feature);
  const usageType = resolveTemplateUsageType(row.template_type, row.usage_type, targetFeature, displayConfig);
  const signature = [row.template_type, targetFeature, usageType].map((item) => String(item || '').toLowerCase()).join('|');
  if (signature.includes('video')) return false;
  return row.template_type === 'image' || row.template_type === 'inspiration' || signature.includes('image') || signature.includes('img');
}

async function checkMembershipPermission(userId: number, row: any) {
  const membershipEnabled = await SettingsService.getBoolean('membership.enabled', false);
  const templateSaveUseMemberOnly = membershipEnabled
    && await SettingsService.getBoolean('membership.template_save_use_member_only', false);
  const accessLevel = row.access_level || 'free';
  const visibilityScope = row.visibility_scope || 'all';
  const usageScope = row.usage_scope || 'all';
  const requiredMemberPlanId = row.required_member_plan_id || null;
  const memberBadgeText = row.member_badge_text || '';
  let canView = true;
  let canUse = true;
  let canSave = true;
  let lockReason = '';

  if (templateSaveUseMemberOnly) {
    const isMember = await isActiveMember(userId);
    if (!isMember) {
      canUse = false;
      canSave = false;
      lockReason = TEMPLATE_SAVE_USE_MEMBER_MESSAGE;
    }
  }

  return { accessLevel, visibilityScope, usageScope, requiredMemberPlanId, memberBadgeText, canView, canUse, canSave, lockReason };
}

function isApprovedPublicTemplate(row: any) {
  return row.is_enabled !== 0 && row.visibility === 'public' && row.status === 'approved' && row.review_status === 'approved' && !row.deleted_at;
}

function targetFeatureLookupValues(value: string) {
  const normalized = normalizeTemplateTargetFeatureKey(value);
  const values = new Set<string>([normalized]);
  if (normalized === 'text_to_image') values.add('image_create');
  if (normalized === 'text_to_video') values.add('video_create');
  if (normalized === 'image_edit') values.add('image_editing');
  return Array.from(values).filter(Boolean);
}

function displayConfigJsonPath(feature: string) {
  const key = String(feature || '').replace(/[^a-zA-Z0-9_]/g, '');
  return key ? `$.${key}` : '$.__invalid__';
}

function displayPositionOrderBy(feature: string) {
  const path = displayConfigJsonPath(feature);
  return [
    `JSON_UNQUOTE(JSON_EXTRACT(display_config, '${path}.pinned')) = 'true' DESC`,
    `CAST(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(display_config, '${path}.pinOrder')), '0') AS UNSIGNED) DESC`,
  ].join(', ');
}

function templateDefaultOrderBy(feature: string, random = false) {
  const nonPinnedOrder = random ? templateRandomOrderBy() : 't.created_at DESC, t.id DESC';
  return `${displayPositionOrderBy(feature)}, ${nonPinnedOrder}`;
}

function templateRandomOrderBy() {
  return 'RAND(), t.created_at DESC, t.id DESC';
}

function publicTemplateSourceFilter(publicUserTemplatesEnabled: boolean) {
  return publicUserTemplatesEnabled ? '' : "AND t.source = 'official'";
}

function isRandomTemplateRequest(req?: Request | { query?: Record<string, any> }) {
  const query = req?.query || {};
  const value = String(query.random ?? query.sortBy ?? query.sort_by ?? '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'random'].includes(value);
}

async function getShareProfileNickname(userId: number) {
  if (!userId) return '';
  const row = await queryOne<any>('SELECT nickname FROM users WHERE id = ? AND deleted_at IS NULL', [userId]);
  return String(row?.nickname || '').trim();
}

function hasShareProfileNickname(nickname: string) {
  const value = String(nickname || '').trim();
  if (!value) return false;
  const normalized = value.replace(/^@+/, '').trim().toLowerCase();
  return !['用户', '微信用户', '创意小助手', 'ai用户', 'ai创作用户'].includes(normalized);
}

function toPositiveId(value: any) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function normalizeTemplateType(value: any) {
  const text = String(value || '').trim();
  if (text === 'video') return 'video';
  return 'image';
}

function parseBodyJson(value: any, fallback: any) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

export default router;
