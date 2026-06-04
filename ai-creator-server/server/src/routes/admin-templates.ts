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
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(Math.max(1, parseInt(req.query.pageSize as string) || 20), 100);
    const offset = (page - 1) * pageSize;
    const where = ['t.deleted_at IS NULL', "t.source = 'official'"];
    const params: any[] = [];
    if (templateType) {
      where.push('t.template_type = ?');
      params.push(templateType);
    }
    const [countRow] = await query<any>(
      `SELECT COUNT(*) AS total FROM templates t WHERE ${where.join(' AND ')}`,
      params,
    );
    const rows = await query<any>(
      `SELECT t.*, c.name AS category_name
         FROM templates t
         LEFT JOIN template_categories c ON c.id = t.category_id
        WHERE ${where.join(' AND ')}
        ORDER BY t.template_type, t.sort_order, t.id
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
    if (!payload.title || !payload.prompt) {
      error(res, ErrorCodes.PARAM_ERROR, '缺少模板名称或提示词');
      return;
    }
    await query(
      `INSERT INTO templates
       (title, description, template_type, target_feature, usage_type, display_config, source, cover_url, preview_url, prompt, negative_prompt,
        params_json, ratio, duration, style, scene, category_id, tags_json, sort_order, is_recommended, is_hot,
        is_enabled, visibility, status, review_status, access_level, visibility_scope, usage_scope, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'official', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'free', 'all', 'all', NOW(3), NOW(3))`,
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
    const existing = await queryOne<any>('SELECT * FROM templates WHERE id = ? AND source = ? AND deleted_at IS NULL', [id, 'official']);
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

    const title = firstText(body.title, body.name);
    if (title !== undefined) { sets.push('title = ?'); values.push(title); }
    if (body.description !== undefined) { sets.push('description = ?'); values.push(String(body.description || '')); }
    const prompt = firstText(body.prompt, body.promptTemplate);
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
      `UPDATE templates
          SET status = 'offline', review_status = 'approved', is_enabled = 0, deleted_at = NOW(3), updated_at = NOW(3)
        WHERE id = ? AND source = 'official' AND deleted_at IS NULL`,
      [Number(req.params.id)],
    );
    success(res, { deleted: true });
  } catch (err: any) {
    console.error('[admin-templates] delete failed:', err);
    error(res, ErrorCodes.SERVER_ERROR, '删除模板失败');
  }
});

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
    title: String(body.title || body.name || '').trim(),
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
    isRecommended: body.isRecommended ?? body.is_recommended ? 1 : 0,
    isHot: body.isHot ?? body.is_hot ? 1 : 0,
    statusPatch: normalizeTemplateStatus(body.status || 'active'),
    displayConfig,
  };
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

export default router;
