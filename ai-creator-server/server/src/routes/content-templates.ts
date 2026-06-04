import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { query, queryOne } from '../utils/db';
import { success, error } from '../utils/response';
import { parseJson } from '../utils/content-helpers';
import { ErrorCodes } from '../types';
import { optionalUserId } from '../utils/content-helpers';
import { hasComplianceConfirmation } from './compliance';
import { SettingsService } from '../services/settings.service';

const router = Router();
const TEMPLATE_MEMBER_MESSAGE = '该灵感模板为会员专享，开通会员后可使用。';

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
    const listResult = await queryTemplates(userId || 0, req.query as any);
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
    const result = await queryTemplates(userId || 0, { ...req.query, pageSize: '8', sortBy: 'recommended' });
    success(res, result);
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取推荐模板失败');
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const userId = await optionalUserId(req);
    const result = await queryTemplates(userId || 0, { ...req.query, keyword: req.query.keyword || (req.query as any).q });
    success(res, result);
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '搜索模板失败');
  }
});

router.get('/inspirations', async (req: Request, res: Response) => {
  try {
    const userId = await optionalUserId(req);
    const rows = await query<any>(
      `SELECT * FROM templates
        WHERE deleted_at IS NULL AND is_enabled = 1 AND status = 'approved' AND review_status = 'approved'
          AND template_type = 'inspiration' AND source = 'official'
        ORDER BY is_hot DESC, is_recommended DESC, sort_order DESC, id DESC`,
    );
    const list = [];
    for (const row of rows) {
      const item = await toPublicTemplate(row, userId || 0);
      if (item.canView !== false) list.push(item);
    }
    success(res, { list });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取灵感模板失败');
  }
});

router.get('/:id(\\d+)', async (req: Request, res: Response) => {
  try {
    const userId = await optionalUserId(req) || 0;
    const row = await queryOne<any>(
      `SELECT * FROM templates WHERE id = ? AND deleted_at IS NULL`,
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
    const item = await toPublicTemplate(row, userId);
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
    const permission = await checkMembershipPermission(userId, template);
    if (!isOwner && (permission.canView === false || !permission.canUse)) {
      error(res, ErrorCodes.MEMBERSHIP_REQUIRED, TEMPLATE_MEMBER_MESSAGE, 403);
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
      coverUrl: outputType === 'image' ? outputUrl : (output.thumbnail_key || ''),
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
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
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
      `SELECT * FROM templates WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC`,
      [req.user!.userId],
    );
    success(res, { list: await Promise.all(rows.map(row => toPublicTemplate(row, req.user!.userId))) });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取我的模板失败');
  }
});

async function toPublicTemplate(row: any, userId: number) {
  const permission = await checkMembershipPermission(userId, row);
  const paramsJson = parseJson(row.params_json, {});
  const tagsJson = parseJson(row.tags_json, []);
  return {
    id: row.id,
    title: row.title,
    name: row.title,
    description: row.description,
    templateType: row.template_type,
    targetFeature: row.target_feature,
    usageType: row.usage_type || 'generate',
    source: row.source,
    coverUrl: row.cover_url,
    previewUrl: row.preview_url,
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
    canUse: permission.canUse,
    lockReason: permission.lockReason,
    reviewStatus: row.review_status,
    status: row.status,
    usageCount: row.usage_count,
    viewCount: row.view_count,
    favoriteCount: row.favorite_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function queryTemplates(userId: number, queryParams: any) {
  const { templateType, targetFeature, source, keyword, categoryId, page, pageSize, sortBy } = queryParams;
  const pg = Math.max(parseInt(page || '1', 10), 1);
  const ps = Math.min(Math.max(parseInt(pageSize || '20', 10), 1), 100);
  const offset = (pg - 1) * ps;
  const publicUserTemplatesEnabled = await SettingsService.getBoolean('template.user_public_enabled', false);

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
  if (targetFeature) {
    where.push('t.target_feature = ?');
    params.push(targetFeature);
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

  const orderBy = sortBy === 'hot'
    ? 't.usage_count DESC, t.favorite_count DESC, t.sort_order DESC'
    : sortBy === 'new'
      ? 't.created_at DESC'
      : 't.is_recommended DESC, t.is_hot DESC, t.sort_order DESC, t.id DESC';

  const rows = await query<any>(
    `SELECT t.*
       FROM templates t
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
  const list = [];
  for (const row of rows) {
    const item = await toPublicTemplate(row, userId);
    if (item.canView !== false) list.push(item);
  }
  return {
    list,
    pagination: { page: pg, pageSize: ps, total: Number(countRow?.total || 0), totalPages: Math.ceil(Number(countRow?.total || 0) / ps) },
  };
}

async function checkMembershipPermission(userId: number, row: any) {
  const membershipEnabled = await SettingsService.getBoolean('membership.enabled', false);
  const inspirationGateEnabled = await SettingsService.getBoolean('inspiration.member_gate_enabled', false);
  const templateGateEnabled = await SettingsService.getBoolean('template.member_gate_enabled', false);
  const isInspiration = row.template_type === 'inspiration' || row.target_feature === 'inspiration';
  const gatingEnabled = membershipEnabled && (isInspiration ? inspirationGateEnabled : templateGateEnabled);
  const accessLevel = row.access_level || 'free';
  const visibilityScope = row.visibility_scope || 'all';
  const usageScope = row.usage_scope || 'all';
  const requiredMemberPlanId = row.required_member_plan_id || null;
  const memberBadgeText = row.member_badge_text || '';
  let canView = true;
  let canUse = true;
  let lockReason = '';

  if (gatingEnabled && (accessLevel === 'member' || visibilityScope === 'member' || usageScope === 'member')) {
    const membership = await queryOne<any>(
      'SELECT level_after FROM user_memberships WHERE user_id = ? AND status = ? AND expire_at > NOW(3) ORDER BY expire_at DESC LIMIT 1',
      [userId, 'active'],
    );
    const isMember = !!membership && membership.level_after !== 'free';
    if (!isMember) {
      if (visibilityScope === 'member') canView = false;
      if (accessLevel === 'member' || usageScope === 'member') canUse = false;
      lockReason = TEMPLATE_MEMBER_MESSAGE;
    }
  }

  return { accessLevel, visibilityScope, usageScope, requiredMemberPlanId, memberBadgeText, canView, canUse, lockReason };
}

function isApprovedPublicTemplate(row: any) {
  return row.is_enabled !== 0 && row.visibility === 'public' && row.status === 'approved' && row.review_status === 'approved' && !row.deleted_at;
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
