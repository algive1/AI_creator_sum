// routes/admin-templates.ts
import { Router, Request, Response } from 'express';
import { adminAuthMiddleware } from '../middleware/auth';
import { queryOne, query } from '../utils/db';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import {
  durationToSeconds,
  durationToDisplay,
  mergeQualityIntoParams,
  normalizeTemplateStatus,
  normalizeTemplateTags,
  normalizeTemplateType,
  normalizeTemplateUsageType,
  targetFeatureForTemplateUsage,
  toLegacyTemplate,
} from '../services/template.service';

const router = Router();

router.get('/templates', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const templateType = req.query.type as string;
    const keyword = String(req.query.keyword || '').trim().slice(0, 80);
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(req.query.pageSize as string) || 20), 100);
    const offset = (page - 1) * pageSize;
    const where = ['t.deleted_at IS NULL', adminManageableTemplateWhere('t')];
    const params: any[] = [];
    if (templateType) {
      if (templateType === 'inspiration') {
        where.push("(JSON_EXTRACT(t.display_config, '$.home_inspiration') IS NOT NULL OR JSON_EXTRACT(t.display_config, '$.inspiration') IS NOT NULL)");
      } else {
        where.push('t.template_type = ?');
        params.push(templateType);
      }
    }
    if (keyword) {
      const pattern = `%${keyword}%`;
      where.push('(t.title LIKE ? OR t.prompt LIKE ? OR t.description LIKE ? OR c.name LIKE ?)');
      params.push(pattern, pattern, pattern, pattern);
    }
    const [countRow] = await query<any>(
      `SELECT COUNT(*) AS total
         FROM templates t
         LEFT JOIN template_categories c ON c.id = t.category_id
        WHERE ${where.join(' AND ')}`,
      params,
    );
    const rows = await query<any>(
      `SELECT t.*, c.name AS category_name
         FROM templates t
         LEFT JOIN template_categories c ON c.id = t.category_id
        WHERE ${where.join(' AND ')}
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    success(res, {
      list: rows.map((row: any) => toLegacyTemplate(row, row.category_name || '')),
      pagination: { page, pageSize, total: Number(countRow?.total || 0), totalPages: Math.ceil(Number(countRow?.total || 0) / pageSize) },
    });
  } catch (err: any) {
    console.error('[admin-templates] list failed:', err);
    error(res, ErrorCodes.SERVER_ERROR, '获取模板列表失败');
  }
});

router.post('/templates', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const payload = normalizeAdminTemplateBody(req.body);
    if (!payload.prompt) {
      error(res, ErrorCodes.PARAM_ERROR, '缺少模板提示词');
      return;
    }
    await query(
      `INSERT INTO templates
       (title, description, template_type, target_feature, usage_type, display_config, source, cover_url, preview_url, prompt, negative_prompt,
        params_json, ratio, duration, style, scene, category_id, tags_json, sort_order, usage_count, is_recommended, is_hot,
        is_enabled, visibility, status, review_status, access_level, visibility_scope, usage_scope, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'official', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'free', 'all', 'all', NOW(3), NOW(3))`,
      [
        payload.title,
        payload.description,
        payload.templateType,
        payload.targetFeature,
        payload.usageType,
        JSON.stringify(payload.displayConfig || null),
        payload.coverUrl,
        payload.previewUrl,
        payload.prompt,
        payload.negativePrompt,
        JSON.stringify(payload.paramsJson),
        payload.ratio,
        payload.duration,
        payload.style,
        payload.scene,
        payload.categoryId,
        JSON.stringify(payload.tagsJson),
        payload.sortOrder,
        payload.usageCount,
        payload.isRecommended,
        payload.isHot,
        payload.statusPatch.isEnabled,
        payload.statusPatch.visibility,
        payload.statusPatch.status,
        payload.statusPatch.reviewStatus,
      ],
    );
    success(res, { created: true });
  } catch (err: any) {
    console.error('[admin-templates] create failed:', err);
    error(res, ErrorCodes.SERVER_ERROR, '创建模板失败');
  }
});

router.put('/templates/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const existing = await queryOne<any>(
      `SELECT t.* FROM templates t WHERE t.id = ? AND ${adminManageableTemplateWhere('t')} AND t.deleted_at IS NULL`,
      [id],
    );
    if (!existing) {
      error(res, ErrorCodes.NOT_FOUND, '模板不存在', 404);
      return;
    }

    const sets: string[] = [];
    const values: any[] = [];
    const body = req.body || {};
    const templateTypeChanged = body.templateType !== undefined || body.template_type !== undefined;
    const usageTypeChanged = body.usageType !== undefined || body.usage_type !== undefined;
    const displayConfigChanged = body.displayConfig !== undefined;
    const explicitTargetFeature = body.targetFeature !== undefined || body.target_feature !== undefined;
    const nextTemplateType = templateTypeChanged
      ? normalizeTemplateType(body.templateType ?? body.template_type)
      : normalizeTemplateType(existing.template_type);
    const nextUsageType = usageTypeChanged
      ? normalizeTemplateUsageType(nextTemplateType, body.usageType ?? body.usage_type)
      : normalizeTemplateUsageType(nextTemplateType, existing.usage_type);
    const nextDisplayConfig = displayConfigChanged ? body.displayConfig : existing.display_config;

    const prompt = firstText(body.prompt, body.promptTemplate);
    if (prompt !== undefined && !prompt) {
      error(res, ErrorCodes.PARAM_ERROR, '模板提示词不能为空');
      return;
    }
    const title = firstText(body.title, body.name);
    if (title !== undefined) { sets.push('title = ?'); values.push(resolveTemplateTitle(title, prompt ?? existing.prompt)); }
    if (body.description !== undefined) { sets.push('description = ?'); values.push(String(body.description || '')); }
    if (prompt !== undefined) { sets.push('prompt = ?'); values.push(prompt); }
    if (body.negativePrompt !== undefined || body.negative_prompt !== undefined) {
      sets.push('negative_prompt = ?');
      values.push(String(body.negativePrompt ?? body.negative_prompt ?? ''));
    }
    if (body.coverUrl !== undefined || body.cover_url !== undefined) {
      const coverUrl = String(body.coverUrl ?? body.cover_url ?? '');
      sets.push('cover_url = ?');
      values.push(coverUrl);
      if (body.previewUrl === undefined && body.preview_url === undefined) {
        sets.push('preview_url = ?');
        values.push(coverUrl);
      }
    }
    if (body.previewUrl !== undefined || body.preview_url !== undefined) {
      sets.push('preview_url = ?');
      values.push(String(body.previewUrl ?? body.preview_url ?? ''));
    }
    if (body.templateType !== undefined || body.template_type !== undefined) {
      sets.push('template_type = ?');
      values.push(nextTemplateType);
    }
    if (body.displayConfig !== undefined) {
      sets.push('display_config = ?');
      values.push(body.displayConfig ? JSON.stringify(body.displayConfig) : null);
    }
    if (body.usageType !== undefined || body.usage_type !== undefined) {
      sets.push('usage_type = ?');
      values.push(nextUsageType);
    }
    if (explicitTargetFeature) {
      sets.push('target_feature = ?');
      values.push(String(body.targetFeature ?? body.target_feature ?? ''));
    } else if (templateTypeChanged || usageTypeChanged || displayConfigChanged) {
      sets.push('target_feature = ?');
      values.push(targetFeatureForTemplateUsage(nextTemplateType, nextUsageType, nextDisplayConfig));
    }
    if (body.ratio !== undefined) { sets.push('ratio = ?'); values.push(String(body.ratio || '')); }
    if (body.style !== undefined) { sets.push('style = ?'); values.push(String(body.style || '')); }
    if (body.duration !== undefined) { sets.push('duration = ?'); values.push(durationToSeconds(body.duration)); }
    if (body.scene !== undefined) { sets.push('scene = ?'); values.push(String(body.scene || '')); }
    if (body.categoryId !== undefined || body.category_id !== undefined) {
      sets.push('category_id = ?');
      values.push(toNullableId(body.categoryId ?? body.category_id));
    }
    if (body.tags !== undefined || body.tagsJson !== undefined || body.tags_json !== undefined) {
      const tags = normalizeTemplateTags(body.tags ?? body.tagsJson ?? body.tags_json);
      sets.push('tags_json = ?');
      values.push(JSON.stringify(tags));
    }
    if (body.quality !== undefined || body.resolution !== undefined || body.ratio !== undefined || body.style !== undefined || body.duration !== undefined || body.displayMode !== undefined) {
      const params = mergeQualityIntoParams(existing.params_json, body.quality);
      if (body.resolution !== undefined) params.resolution = String(body.resolution || '');
      if (body.ratio !== undefined) params.ratio = String(body.ratio || '');
      if (body.style !== undefined) params.style = String(body.style || '');
      if (body.duration !== undefined) params.duration = durationToDisplay(body.duration);
      if (body.displayMode !== undefined) params.displayMode = String(body.displayMode || 'card');
      sets.push('params_json = ?');
      values.push(JSON.stringify(params));
    }
    if (body.isRecommended !== undefined || body.is_recommended !== undefined) {
      sets.push('is_recommended = ?');
      values.push(body.isRecommended ?? body.is_recommended ? 1 : 0);
    }
    if (body.isHot !== undefined || body.is_hot !== undefined) {
      sets.push('is_hot = ?');
      values.push(body.isHot ?? body.is_hot ? 1 : 0);
    }
    if (body.sortOrder !== undefined || body.sort_order !== undefined) {
      sets.push('sort_order = ?');
      values.push(Number(body.sortOrder ?? body.sort_order ?? 0));
    }
    if (body.usageCount !== undefined || body.usage_count !== undefined) {
      sets.push('usage_count = ?');
      values.push(Math.max(0, Math.floor(Number(body.usageCount ?? body.usage_count ?? 0) || 0)));
    }
    if (body.status !== undefined) {
      const statusPatch = normalizeTemplateStatus(body.status);
      sets.push('status = ?', 'review_status = ?', 'is_enabled = ?', 'visibility = ?');
      values.push(statusPatch.status, statusPatch.reviewStatus, statusPatch.isEnabled, statusPatch.visibility);
    }

    if (!sets.length) {
      error(res, ErrorCodes.PARAM_ERROR, '没有可更新字段');
      return;
    }
    values.push(id);
    await query(`UPDATE templates SET ${sets.join(', ')}, updated_at = NOW(3) WHERE id = ?`, values);
    success(res, { updated: true });
  } catch (err: any) {
    console.error('[admin-templates] update failed:', err);
    error(res, ErrorCodes.SERVER_ERROR, '更新模板失败');
  }
});

router.delete('/templates/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    await query(
      `UPDATE templates t
          SET status = 'offline', review_status = 'approved', is_enabled = 0, deleted_at = NOW(3), updated_at = NOW(3)
        WHERE t.id = ? AND ${adminManageableTemplateWhere('t')} AND t.deleted_at IS NULL`,
      [Number(req.params.id)],
    );
    success(res, { deleted: true });
  } catch (err: any) {
    console.error('[admin-templates] delete failed:', err);
    error(res, ErrorCodes.SERVER_ERROR, '删除模板失败');
  }
});

router.delete('/templates/batch', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const ids = normalizeIdList(req.body?.ids);
    if (!ids.length) {
      error(res, ErrorCodes.PARAM_ERROR, '请选择要删除的模板');
      return;
    }
    const placeholders = ids.map(() => '?').join(',');
    const [result] = await query<any>(
      `UPDATE templates t
          SET status = 'offline', review_status = 'approved', is_enabled = 0, deleted_at = NOW(3), updated_at = NOW(3)
        WHERE t.id IN (${placeholders}) AND ${adminManageableTemplateWhere('t')} AND t.deleted_at IS NULL`,
      ids,
    );
    success(res, { deleted: true, count: Number(result?.affectedRows || 0) });
  } catch (err: any) {
    console.error('[admin-templates] batch delete failed:', err);
    error(res, ErrorCodes.SERVER_ERROR, '批量删除模板失败');
  }
});

router.put('/templates/batch/display-config', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const ids = normalizeIdList(req.body?.ids);
    if (!ids.length) {
      error(res, ErrorCodes.PARAM_ERROR, '请选择要设置展示位置的模板');
      return;
    }
    const displayConfig = normalizeDisplayConfig(req.body?.displayConfig ?? req.body?.display_config);
    const mergeDisplayConfig = req.body?.mergeDisplayConfig === true || req.body?.merge_display_config === true;
    if (!displayConfig) {
      error(res, ErrorCodes.PARAM_ERROR, '请选择至少一个展示位置');
      return;
    }
    const isRecommended = Object.values(displayConfig).some((item: any) => item?.pinned) ? 1 : 0;
    const placeholders = ids.map(() => '?').join(',');
    const nextDisplayConfig = JSON.stringify(displayConfig);
    const [result] = await query<any>(
      mergeDisplayConfig
        ? `UPDATE templates t
             SET display_config = CASE
                   WHEN JSON_VALID(display_config) THEN JSON_MERGE_PATCH(display_config, ?)
                   ELSE ?
                 END,
                 is_recommended = CASE WHEN ? = 1 THEN 1 ELSE is_recommended END,
                 updated_at = NOW(3)
           WHERE t.id IN (${placeholders}) AND ${adminManageableTemplateWhere('t')} AND t.deleted_at IS NULL`
        : `UPDATE templates t
             SET display_config = ?, is_recommended = ?, updated_at = NOW(3)
           WHERE t.id IN (${placeholders}) AND ${adminManageableTemplateWhere('t')} AND t.deleted_at IS NULL`,
      mergeDisplayConfig
        ? [nextDisplayConfig, nextDisplayConfig, isRecommended, ...ids]
        : [nextDisplayConfig, isRecommended, ...ids],
    );
    success(res, { updated: true, count: Number(result?.affectedRows || 0) });
  } catch (err: any) {
    console.error('[admin-templates] batch display config failed:', err);
    error(res, ErrorCodes.SERVER_ERROR, '批量设置展示位置失败');
  }
});

function adminManageableTemplateWhere(alias: string) {
  if (alias === 't') {
    return "(t.source = 'official' OR (t.source = 'user' AND t.review_status = 'approved'))";
  }
  return `(${alias}.source = 'official' OR (${alias}.source = 'user' AND ${alias}.review_status = 'approved'))`;
}

function normalizeAdminTemplateBody(body: any) {
  const templateType = normalizeTemplateType(body.templateType ?? body.template_type);
  const displayConfig = body.displayConfig ?? body.display_config ?? null;
  const usageType = normalizeTemplateUsageType(templateType, body.usageType ?? body.usage_type);
  const targetFeature = String(body.targetFeature || body.target_feature || targetFeatureForTemplateUsage(templateType, usageType, displayConfig));
  const paramsJson = mergeQualityIntoParams(body.paramsJson ?? body.params_json ?? {}, body.quality);
  const ratio = String(body.ratio || paramsJson.ratio || '');
  const resolution = String(body.resolution || paramsJson.resolution || '');
  const style = String(body.style || paramsJson.style || '');
  const duration = durationToSeconds(body.duration ?? paramsJson.duration);
  if (ratio) paramsJson.ratio = ratio;
  if (resolution) paramsJson.resolution = resolution;
  if (style) paramsJson.style = style;
  if (duration) paramsJson.duration = durationToDisplay(duration);
  return {
    title: resolveTemplateTitle(body.title || body.name, body.prompt || body.promptTemplate || body.prompt_template),
    description: String(body.description || '').trim(),
    templateType,
    targetFeature,
    usageType,
    coverUrl: String(body.coverUrl || body.cover_url || ''),
    previewUrl: String(body.previewUrl || body.preview_url || body.coverUrl || body.cover_url || ''),
    prompt: String(body.prompt || body.promptTemplate || body.prompt_template || '').trim(),
    negativePrompt: String(body.negativePrompt || body.negative_prompt || ''),
    paramsJson,
    ratio,
    duration,
    style,
    scene: String(body.scene || ''),
    categoryId: toNullableId(body.categoryId ?? body.category_id),
    tagsJson: normalizeTemplateTags(body.tags ?? body.tagsJson ?? body.tags_json),
    sortOrder: Number(body.sortOrder ?? body.sort_order ?? 0),
    usageCount: Math.max(0, Math.floor(Number(body.usageCount ?? body.usage_count ?? 0) || 0)),
    isRecommended: body.isRecommended ?? body.is_recommended ? 1 : 0,
    isHot: body.isHot ?? body.is_hot ? 1 : 0,
    statusPatch: normalizeTemplateStatus(body.status || 'active'),
    displayConfig,
  };
}

function resolveTemplateTitle(titleValue: any, promptValue: any): string {
  const title = String(titleValue || '').trim();
  if (title) return title.slice(0, 128);
  const prompt = String(promptValue || '').trim();
  return (prompt || '未命名模板').slice(0, 128);
}

function firstText(...values: any[]): string | undefined {
  for (const value of values) {
    if (value !== undefined) return String(value || '').trim();
  }
  return undefined;
}

function toNullableId(value: any): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeIdList(value: any): number[] {
  const source = Array.isArray(value) ? value : [];
  const ids = source
    .map((item) => Number(item))
    .filter((id) => Number.isInteger(id) && id > 0);
  return Array.from(new Set(ids)).slice(0, 100);
}

function normalizeDisplayConfig(value: any): Record<string, { pinned: boolean; pinOrder: number }> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value)
    .map(([key, config]) => {
      const safeKey = String(key || '').replace(/[^a-zA-Z0-9_]/g, '');
      if (!safeKey) return null;
      const item = config && typeof config === 'object' ? config as Record<string, any> : {};
      return [safeKey, {
        pinned: item.pinned === true,
        pinOrder: Number.isFinite(Number(item.pinOrder)) ? Math.max(0, Number(item.pinOrder)) : 0,
      }] as const;
    })
    .filter(Boolean) as Array<readonly [string, { pinned: boolean; pinOrder: number }]>;
  return entries.length ? Object.fromEntries(entries) : null;
}

export default router;
