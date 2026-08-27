import { Router, Request, Response } from 'express';
import { adminAuthMiddleware } from '../middleware/auth';
import { query, queryOne } from '../utils/db';
import { success, error } from '../utils/response';
import { parseJson } from '../utils/content-helpers';
import { ErrorCodes } from '../types';
import { createTemplateReviewNotification } from '../services/template-notification.service';
import { clearSystemPromptCache } from '../services/system-prompt.service';

const router = Router();

function requireSuperAdmin(req: Request, res: Response): boolean {
  if (req.user?.role === 'super_admin') return true;
  error(res, ErrorCodes.FORBIDDEN, '仅超级管理员可操作', 403);
  return false;
}

router.get('/legal-documents', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await query<any>(
      `SELECT * FROM legal_documents ORDER BY doc_type, effective_at DESC, id DESC`,
    );
    success(res, { list: rows.map(toLegalDocument) });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取协议列表失败');
  }
});

router.post('/legal-documents', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { docType, title, version, content, enabled, effectiveAt } = req.body;
    if (!docType || !title || !version || !content) {
      error(res, ErrorCodes.PARAM_ERROR, '缺少协议必填参数');
      return;
    }
    await query(
      `INSERT INTO legal_documents (doc_type, title, version, content, enabled, effective_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
      [docType, title, version, content, enabled === false ? 0 : 1, effectiveAt || null],
    );
    success(res, { created: true });
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, `创建协议失败: ${err.message || ''}`.trim());
  }
});

router.put('/legal-documents/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { docType, title, version, content, enabled, effectiveAt } = req.body;
    const sets: string[] = [];
    const vals: any[] = [];
    if (docType !== undefined) { sets.push('doc_type = ?'); vals.push(docType); }
    if (title !== undefined) { sets.push('title = ?'); vals.push(title); }
    if (version !== undefined) { sets.push('version = ?'); vals.push(version); }
    if (content !== undefined) { sets.push('content = ?'); vals.push(content); }
    if (enabled !== undefined) { sets.push('enabled = ?'); vals.push(enabled ? 1 : 0); }
    if (effectiveAt !== undefined) { sets.push('effective_at = ?'); vals.push(effectiveAt || null); }
    if (!sets.length) {
      error(res, ErrorCodes.PARAM_ERROR, '没有可更新的字段');
      return;
    }
    vals.push(id);
    await query(`UPDATE legal_documents SET ${sets.join(', ')}, updated_at = NOW(3) WHERE id = ?`, vals);
    success(res, { updated: true });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '更新协议失败');
  }
});

router.get('/announcements', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await query<any>('SELECT * FROM announcements ORDER BY priority DESC, sort_order DESC, id DESC');
    success(res, { list: rows.map(toAnnouncement) });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取公告列表失败');
  }
});

router.post('/announcements', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const payload = normalizeAnnouncement(req.body);
    await query(
      `INSERT INTO announcements
       (title, content, type, enabled, start_at, end_at, sort_order, priority, show_frequency, target_type, target_user_ids, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
      [
        payload.title,
        payload.content,
        payload.type,
        payload.enabled ? 1 : 0,
        payload.startAt,
        payload.endAt,
        payload.sortOrder,
        payload.priority,
        payload.showFrequency,
        payload.targetType,
        payload.targetUserIds ? JSON.stringify(payload.targetUserIds) : null,
      ],
    );
    success(res, { created: true });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '创建公告失败');
  }
});

router.put('/announcements/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const payload = normalizeAnnouncement(req.body);
    const sets = [
      'title = ?',
      'content = ?',
      'type = ?',
      'enabled = ?',
      'start_at = ?',
      'end_at = ?',
      'sort_order = ?',
      'priority = ?',
      'show_frequency = ?',
      'target_type = ?',
      'target_user_ids = ?',
      'updated_at = NOW(3)',
    ];
    await query(
      `UPDATE announcements SET ${sets.join(', ')} WHERE id = ?`,
      [
        payload.title,
        payload.content,
        payload.type,
        payload.enabled ? 1 : 0,
        payload.startAt,
        payload.endAt,
        payload.sortOrder,
        payload.priority,
        payload.showFrequency,
        payload.targetType,
        payload.targetUserIds ? JSON.stringify(payload.targetUserIds) : null,
        Number(req.params.id),
      ],
    );
    success(res, { updated: true });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '更新公告失败');
  }
});

router.delete('/announcements/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await query<any>('DELETE FROM announcements WHERE id = ?', [Number(req.params.id)]);
    if ((result as any).affectedRows === 0) { error(res, ErrorCodes.NOT_FOUND, '公告不存在', 404); return; }
    success(res, { deleted: true });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '删除公告失败');
  }
});

router.get('/system-prompts', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await query<any>('SELECT * FROM system_prompts ORDER BY target_feature, prompt_type, enabled DESC, version DESC, id DESC');
    success(res, { list: rows.map(toSystemPrompt) });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取提示词列表失败');
  }
});

router.post('/system-prompts', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { promptKey, promptName, promptType, targetFeature, content, enabled, version, remark } = req.body;
    if (!promptKey || !promptName || !targetFeature || !content) {
      error(res, ErrorCodes.PARAM_ERROR, '缺少提示词必填参数');
      return;
    }
    await query(
      `INSERT INTO system_prompts
       (prompt_key, prompt_name, prompt_type, target_feature, content, enabled, version, remark, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
      [promptKey, promptName, promptType || 'system', targetFeature, content, enabled === false ? 0 : 1, version || 'v1', remark || ''],
    );
    clearSystemPromptCache(targetFeature);
    success(res, { created: true });
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, `创建提示词失败: ${err.message || ''}`.trim());
  }
});

router.put('/system-prompts/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    if (!requireSuperAdmin(req, res)) return;
    const { promptKey, promptName, promptType, targetFeature, content, enabled, version, remark } = req.body;
    await query(
      `UPDATE system_prompts
          SET prompt_key = ?, prompt_name = ?, prompt_type = ?, target_feature = ?, content = ?, enabled = ?, version = ?, remark = ?, updated_at = NOW(3)
        WHERE id = ?`,
      [promptKey, promptName, promptType || 'system', targetFeature, content, enabled === false ? 0 : 1, version || 'v1', remark || '', Number(req.params.id)],
    );
    clearSystemPromptCache(targetFeature);
    success(res, { updated: true });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '更新提示词失败');
  }
});

router.get('/compliance-confirmations', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await query<any>(
      `SELECT c.*, u.nickname, u.avatar_url
         FROM user_compliance_confirmations c
         LEFT JOIN users u ON u.id = c.user_id
        ORDER BY c.confirmed_at DESC
        LIMIT 200`,
    );
    success(res, {
      list: rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        nickname: row.nickname || '',
        avatarUrl: row.avatar_url || '',
        scene: row.scene,
        taskId: row.task_id,
        fileId: row.file_id,
        templateId: row.template_id,
        confirmationText: row.confirmation_text,
        requiredText: row.required_text,
        policyVersion: row.policy_version,
        confirmedAt: row.confirmed_at,
        ip: row.ip,
        userAgent: row.user_agent,
      })),
    });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取合规确认记录失败');
  }
});

router.get('/template-reviews', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await query<any>(
      `SELECT * FROM templates
        WHERE source = 'user' AND deleted_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 200`,
    );
    success(res, { list: rows.map(toTemplate) });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取模板审核列表失败');
  }
});

router.post('/templates/:id(\\d+)/approve', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const template = await queryOne<any>(
      'SELECT id, user_id, source, title FROM templates WHERE id = ? AND deleted_at IS NULL',
      [Number(req.params.id)],
    );
    await query(
      `UPDATE templates
          SET status = 'approved', review_status = 'approved', review_reason = '', reviewed_by = ?, reviewed_at = NOW(3), is_enabled = 1, updated_at = NOW(3)
        WHERE id = ?`,
      [req.user!.userId, Number(req.params.id)],
    );
    if (template?.source === 'user' && Number(template.user_id || 0) > 0) {
      await createTemplateReviewNotification({
        userId: Number(template.user_id || 0),
        templateId: Number(template.id || 0),
        reviewStatus: 'approved',
      });
    }
    await logTemplateReview(Number(req.params.id), 'approve', '', req.user!.userId);
    success(res, { approved: true });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '审核通过失败');
  }
});

router.post('/templates/:id(\\d+)/reject', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    await query(
      `UPDATE templates
          SET status = 'rejected', review_status = 'rejected', review_reason = ?, reviewed_by = ?, reviewed_at = NOW(3), is_enabled = 0, updated_at = NOW(3)
        WHERE id = ?`,
      [reason, req.user!.userId, Number(req.params.id)],
    );
    await logTemplateReview(Number(req.params.id), 'reject', reason, req.user!.userId);
    success(res, { rejected: true });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '审核拒绝失败');
  }
});

router.post('/templates/:id(\\d+)/offline', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    await query(
      `UPDATE templates
          SET status = 'offline', is_enabled = 0, review_reason = ?, reviewed_by = ?, reviewed_at = NOW(3), updated_at = NOW(3)
        WHERE id = ?`,
      [reason, req.user!.userId, Number(req.params.id)],
    );
    await logTemplateReview(Number(req.params.id), 'offline', reason, req.user!.userId);
    success(res, { offline: true });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '下架模板失败');
  }
});

async function logTemplateReview(templateId: number, action: string, reason: string, operatorId: number) {
  await query(
    'INSERT INTO template_review_logs (template_id, action, reason, operator_id, created_at) VALUES (?, ?, ?, ?, NOW(3))',
    [templateId, action, reason, operatorId],
  );
}

function toLegalDocument(row: any) {
  return {
    id: row.id,
    docType: row.doc_type,
    title: row.title,
    version: row.version,
    content: row.content,
    enabled: !!row.enabled,
    effectiveAt: row.effective_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAnnouncement(row: any) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    type: row.type,
    enabled: !!row.enabled,
    startAt: row.start_at,
    endAt: row.end_at,
    sortOrder: row.sort_order,
    priority: row.priority,
    showFrequency: row.show_frequency,
    targetType: row.target_type,
    targetUserIds: parseJson(row.target_user_ids, []),
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeAnnouncement(body: any) {
  return {
    title: String(body.title || ''),
    content: String(body.content || ''),
    type: body.type || 'popup',
    enabled: body.enabled === false ? false : true,
    startAt: body.startAt || body.start_at || null,
    endAt: body.endAt || body.end_at || null,
    sortOrder: Number(body.sortOrder ?? body.sort_order ?? 0),
    priority: Number(body.priority ?? 0),
    showFrequency: body.showFrequency || body.show_frequency || 'once_per_day',
    targetType: body.targetType || body.target_type || 'all',
    targetUserIds: parseJson(body.targetUserIds ?? body.target_user_ids, []),
  };
}

function toSystemPrompt(row: any) {
  return {
    id: row.id,
    promptKey: row.prompt_key,
    promptName: row.prompt_name,
    promptType: row.prompt_type,
    targetFeature: row.target_feature,
    content: row.content,
    enabled: !!row.enabled,
    version: row.version,
    remark: row.remark,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTemplate(row: any) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    templateType: row.template_type,
    targetFeature: row.target_feature,
    source: row.source,
    userId: row.user_id,
    taskId: row.task_id,
    outputId: row.output_id,
    coverUrl: row.cover_url,
    previewUrl: row.preview_url,
    prompt: row.prompt,
    negativePrompt: row.negative_prompt,
    paramsJson: parseJson(row.params_json, {}),
    ratio: row.ratio,
    width: row.width,
    height: row.height,
    duration: row.duration,
    style: row.style,
    scene: row.scene,
    categoryId: row.category_id,
    tagsJson: parseJson(row.tags_json, []),
    sortOrder: row.sort_order,
    isRecommended: !!row.is_recommended,
    isHot: !!row.is_hot,
    isEnabled: !!row.is_enabled,
    visibility: row.visibility,
    status: row.status,
    reviewStatus: row.review_status,
    reviewReason: row.review_reason,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    usageCount: row.usage_count,
    viewCount: row.view_count,
    favoriteCount: row.favorite_count,
    contentCheckResult: parseJson(row.content_check_result, null),
    accessLevel: row.access_level,
    visibilityScope: row.visibility_scope,
    usageScope: row.usage_scope,
    requiredMemberPlanId: row.required_member_plan_id,
    memberBadgeText: row.member_badge_text,
    memberLockMessage: row.member_lock_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ===== 敏感词管理 =====

router.get('/sensitive-words', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await query<any>('SELECT id, word, created_at FROM content_sensitive_words ORDER BY id');
    success(res, rows);
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取敏感词列表失败'); }
});

router.post('/sensitive-words', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const word = String(req.body?.word || '').trim();
    if (!word) { error(res, ErrorCodes.PARAM_ERROR, '请输入敏感词'); return; }
    if (word.length > 64) { error(res, ErrorCodes.PARAM_ERROR, '敏感词最多 64 个字符'); return; }
    const [r] = await query<any>('INSERT INTO content_sensitive_words (word) VALUES (?)', [word]);
    success(res, { id: (r as any).insertId, word });
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') { error(res, ErrorCodes.PARAM_ERROR, '该敏感词已存在'); return; }
    error(res, ErrorCodes.SERVER_ERROR, '添加敏感词失败');
  }
});

router.delete('/sensitive-words/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await query<any>('DELETE FROM content_sensitive_words WHERE id = ?', [parseInt(req.params.id)]);
    if ((result as any).affectedRows === 0) { error(res, ErrorCodes.NOT_FOUND, '敏感词不存在', 404); return; }
    success(res, { deleted: true });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '删除敏感词失败'); }
});

// ===== 模板分类管理 =====
router.get('/template-categories', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await query<any>('SELECT * FROM template_categories ORDER BY sort_order, id');
    success(res, rows.map((r: any) => ({ id: r.id, name: r.name, categoryKey: r.category_key, icon: r.icon || '', sortOrder: r.sort_order, status: r.status, createdAt: r.created_at })));
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取分类失败'); }
});
router.post('/template-categories', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, categoryKey, icon, sortOrder } = req.body;
    if (!name || !categoryKey) { error(res, ErrorCodes.PARAM_ERROR, '名称和标识不能为空'); return; }
    const [r] = await query<any>('INSERT INTO template_categories (name, category_key, icon, sort_order) VALUES (?, ?, ?, ?)', [name, categoryKey, icon || '', sortOrder || 0]);
    success(res, { id: (r as any).insertId });
  } catch (e: any) { if (e.code === 'ER_DUP_ENTRY') { error(res, ErrorCodes.PARAM_ERROR, '标识已存在'); return; } error(res, ErrorCodes.SERVER_ERROR, '创建分类失败'); }
});
router.put('/template-categories/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, icon, sortOrder, status } = req.body;
    const sets: string[] = []; const vals: any[] = [];
    if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
    if (icon !== undefined) { sets.push('icon = ?'); vals.push(icon); }
    if (sortOrder !== undefined) { sets.push('sort_order = ?'); vals.push(sortOrder); }
    if (status) { sets.push('status = ?'); vals.push(status); }
    if (!sets.length) { error(res, ErrorCodes.PARAM_ERROR, '无更新字段'); return; }
    vals.push(parseInt(req.params.id));
    await query('UPDATE template_categories SET ' + sets.join(', ') + ' WHERE id = ?', vals);
    success(res, { updated: true });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '更新分类失败'); }
});
router.delete('/template-categories/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await query<any>('DELETE FROM template_categories WHERE id = ?', [parseInt(req.params.id)]);
    if ((result as any).affectedRows === 0) { error(res, ErrorCodes.NOT_FOUND, '分类不存在', 404); return; }
    success(res, { deleted: true });
  }
  catch { error(res, ErrorCodes.SERVER_ERROR, '删除分类失败'); }
});

export default router;
