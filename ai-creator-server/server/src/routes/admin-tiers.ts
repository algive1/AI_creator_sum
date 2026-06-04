// routes/admin-tiers.ts
import { Router, Request, Response } from 'express';
import { adminAuthMiddleware } from '../middleware/auth';
import { queryOne, query, getConnection } from '../utils/db';
import { success, error } from '../utils/response';
import { parseJson } from '../utils/content-helpers';
import { ErrorCodes } from '../types';
import { decryptApiKey, encryptApiKey } from '../services/openai-adapter.service';
import { AdapterRegistry } from '../services/adapters/adapter.registry';
import { normalizeCapabilityKey } from '../services/model-capability.service';

const router = Router();

// GET /model-tiers?feature=xxx
router.get('/model-tiers', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const feature = req.query.feature as string;
    let where = '1=1'; const p: any[] = [];
    if (feature) {
      const f = await queryOne<any>('SELECT id FROM model_features WHERE feature_key = ?', [feature]);
      if (!f) { success(res, []); return; }
      where += ' AND t.feature_id = ?'; p.push(f.id);
    }
    const rows = await query<any>(
      `SELECT t.*, mf.feature_key, mf.feature_name,
              f.cdn_url as icon_url
       FROM model_tiers t
       JOIN model_features mf ON mf.id = t.feature_id
       LEFT JOIN files f ON f.id = t.icon_file_id AND f.is_deleted = 0
       WHERE ${where} ORDER BY mf.sort_order, t.sort_order`, p
    );
    const result = [];
    for (const r of rows) {
      const binds = await query<any>(
        'SELECT tb.*, m.name as model_name, p.name as provider_name FROM tier_model_bindings tb JOIN ai_models m ON m.id = tb.model_id JOIN ai_model_providers p ON p.id = m.provider_id WHERE tb.tier_id = ? ORDER BY tb.binding_type, tb.fallback_order',
        [r.id]
      );
      const cap = await queryOne<any>('SELECT * FROM tier_capabilities WHERE tier_id = ?', [r.id]);
      result.push({
        id: r.id, featureId: r.feature_id, featureKey: r.feature_key, featureName: r.feature_name,
        tierName: r.tier_name, tierKey: r.tier_key, description: r.description, tag: r.tag,
        iconUrl: r.icon_url || '', iconFileId: r.icon_file_id || null, pointsCost: r.points_cost, isDefault: !!r.is_default,
        isRecommended: !!r.is_recommended, sortOrder: r.sort_order, status: r.status,
        qualityMultipliers: typeof r.quality_multipliers === 'string' ? JSON.parse(r.quality_multipliers) : (r.quality_multipliers || {}),
        bindings: binds.map((b: any) => ({
          id: b.id, modelId: b.model_id, modelName: b.model_name, providerName: b.provider_name,
          bindingType: b.binding_type, fallbackOrder: b.fallback_order,
          failoverOnError: !!b.failover_on_error, failoverOnTimeout: !!b.failover_on_timeout,
          failoverOnRateLimit: !!b.failover_on_rate_limit,
        })),
        capabilities: cap ? {
          supportedRatios: parseJson(cap.supported_ratios, []),
          supportedQualities: parseJson(cap.supported_qualities, []),
          supportedStyles: parseJson(cap.supported_styles, []),
          supportedDurations: cap.supported_durations ? parseJson(cap.supported_durations, []) : null,
          supportedCameraMoves: cap.supported_camera_moves ? parseJson(cap.supported_camera_moves, []) : null,
          supportedAudioModes: cap.supported_audio_modes ? parseJson(cap.supported_audio_modes, []) : null,
          defaultAudioMode: cap.default_audio_mode || 'silent',
          supportedSizeModes: parseJson(cap.supported_size_modes, ['auto', 'ratio']),
          allowCustomPixels: !!cap.allow_custom_pixels,
          nativeSizes: parseJson(cap.native_sizes, []),
          defaultRatio: cap.default_ratio || '1:1',
          maxWidth: cap.max_width,
          maxHeight: cap.max_height,
          minWidth: cap.min_width,
          minHeight: cap.min_height,
          maxTotalPixels: cap.max_total_pixels,
          maxAspectRatio: Number(cap.max_aspect_ratio || 4),
          allowPostprocess: !!cap.allow_postprocess,
          postprocessModes: parseJson(cap.postprocess_modes, ['cover', 'contain', 'resize']),
          allowUpscale: !!cap.allow_upscale,
          maxImages: cap.max_images, maxReferenceImages: cap.max_reference_images || 4, maxDurationSeconds: cap.max_duration_seconds,
        } : null,
      });
    }
    success(res, result);
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取模型档位失败'); }
});

// POST /model-tiers
router.post('/model-tiers', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { featureId, tierName, tierKey, description, tag, pointsCost, isDefault, isRecommended, sortOrder, iconFileId, qualityMultipliers } = req.body;
    if (!featureId || !tierName || !tierKey || pointsCost === undefined) { error(res, ErrorCodes.PARAM_ERROR, '缺少必要参数'); return; }
    const [r] = await query<any>(
      'INSERT INTO model_tiers (feature_id, tier_name, tier_key, description, tag, icon_file_id, points_cost, is_default, is_recommended, sort_order, status, quality_multipliers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [featureId, tierName, tierKey, description || '', tag || '', iconFileId || null, pointsCost, isDefault ? 1 : 0, isRecommended ? 1 : 0, sortOrder || 0, 'active', JSON.stringify(qualityMultipliers || {})]
    );
    const tierId = (r as any).insertId;
    // Auto-create empty capabilities
    await query(
      'INSERT IGNORE INTO tier_capabilities (tier_id, supported_ratios, supported_qualities, supported_styles, supported_size_modes, native_sizes, postprocess_modes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [tierId, '[]', '[]', '[]', '["auto","ratio"]', '[]', '["cover","contain","resize"]']
    );
    success(res, { id: tierId });
  } catch (e: any) { error(res, ErrorCodes.SERVER_ERROR, '创建档位失败: ' + (e.message || '')); }
});

// PUT /model-tiers/:id
router.put('/model-tiers/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { tierName, description, tag, pointsCost, isDefault, isRecommended, sortOrder, status, iconFileId, qualityMultipliers } = req.body;
    const sets: string[] = []; const vals: any[] = [];
    if (tierName !== undefined) { sets.push('tier_name = ?'); vals.push(tierName); }
    if (description !== undefined) { sets.push('description = ?'); vals.push(description); }
    if (tag !== undefined) { sets.push('tag = ?'); vals.push(tag); }
    if (pointsCost !== undefined) { sets.push('points_cost = ?'); vals.push(pointsCost); }
    if (isDefault !== undefined) { sets.push('is_default = ?'); vals.push(isDefault ? 1 : 0); }
    if (isRecommended !== undefined) { sets.push('is_recommended = ?'); vals.push(isRecommended ? 1 : 0); }
    if (sortOrder !== undefined) { sets.push('sort_order = ?'); vals.push(sortOrder); }
    if (status) { sets.push('status = ?'); vals.push(status); }
    if (iconFileId !== undefined) { sets.push('icon_file_id = ?'); vals.push(iconFileId || null); }
    if (qualityMultipliers !== undefined) { sets.push('quality_multipliers = ?'); vals.push(JSON.stringify(qualityMultipliers || {})); }
    if (sets.length === 0) { error(res, ErrorCodes.PARAM_ERROR, '没有可更新字段'); return; }
    vals.push(id);
    await query('UPDATE model_tiers SET ' + sets.join(', ') + ' WHERE id = ?', vals);
    success(res, { updated: true });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '更新档位失败'); }
});

// GET /model-tiers/:id/bindings
router.get('/model-tiers/:id(\\d+)/bindings', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await query<any>('SELECT tb.*, m.name as model_name, p.name as provider_name FROM tier_model_bindings tb JOIN ai_models m ON m.id = tb.model_id JOIN ai_model_providers p ON p.id = m.provider_id WHERE tb.tier_id = ? ORDER BY tb.binding_type, tb.fallback_order', [parseInt(req.params.id)]);
    success(res, rows.map((r: any) => ({
      id: r.id, modelId: r.model_id, modelName: r.model_name, providerName: r.provider_name,
      bindingType: r.binding_type, fallbackOrder: r.fallback_order,
      failoverOnError: !!r.failover_on_error, failoverOnTimeout: !!r.failover_on_timeout, failoverOnRateLimit: !!r.failover_on_rate_limit,
    })));
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取绑定失败'); }
});

// PUT /model-tiers/:id/bindings ? replace all
router.put('/model-tiers/:id(\\d+)/bindings', adminAuthMiddleware, async (req: Request, res: Response) => {
  const tierId = parseInt(req.params.id);
  const { bindings } = req.body;
  if (!Array.isArray(bindings)) { error(res, ErrorCodes.PARAM_ERROR, 'bindings 必须是数组'); return; }

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM tier_model_bindings WHERE tier_id = ?', [tierId]);
    for (const b of bindings) {
      await conn.execute('INSERT INTO tier_model_bindings (tier_id, model_id, binding_type, fallback_order, failover_on_error, failover_on_timeout, failover_on_rate_limit) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [tierId, b.modelId, b.bindingType || 'primary', b.fallbackOrder || 0, b.failoverOnError !== false ? 1 : 0, b.failoverOnTimeout !== false ? 1 : 0, b.failoverOnRateLimit !== false ? 1 : 0]);
    }
    await conn.commit();
    success(res, { updated: true });
  } catch {
    await conn.rollback();
    error(res, ErrorCodes.SERVER_ERROR, '保存绑定失败');
  } finally {
    conn.release();
  }
});

// PUT /model-tiers/:id/capabilities
router.put('/model-tiers/:id(\\d+)/capabilities', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const tierId = parseInt(req.params.id);
    const existing = await queryOne<any>('SELECT * FROM tier_capabilities WHERE tier_id = ?', [tierId]);
    const pick = (key: string, fallback: any) => Object.prototype.hasOwnProperty.call(req.body, key) ? req.body[key] : fallback;
    const jsonPick = (key: string, dbKey: string, fallback: any[]) => pick(key, existing ? parseJson(existing[dbKey], fallback) : fallback);
    const numberPick = (key: string, dbKey: string, fallback: number) => Number(pick(key, existing?.[dbKey] ?? fallback) || fallback);
    const booleanPick = (key: string, dbKey: string, fallback: boolean) => {
      const value = pick(key, existing ? !!existing[dbKey] : fallback);
      return value !== false ? 1 : 0;
    };
    const {
      supportedRatios, supportedQualities, supportedStyles, supportedDurations, supportedCameraMoves,
      supportedAudioModes, defaultAudioMode,
      supportedSizeModes, allowCustomPixels, nativeSizes, defaultRatio, maxWidth, maxHeight, minWidth, minHeight,
      maxTotalPixels, maxAspectRatio, allowPostprocess, postprocessModes, allowUpscale, maxImages, maxReferenceImages, maxDurationSeconds,
    } = req.body;
    const next = {
      supportedRatios: supportedRatios ?? jsonPick('supportedRatios', 'supported_ratios', []),
      supportedQualities: supportedQualities ?? jsonPick('supportedQualities', 'supported_qualities', []),
      supportedStyles: supportedStyles ?? jsonPick('supportedStyles', 'supported_styles', []),
      supportedDurations: supportedDurations ?? jsonPick('supportedDurations', 'supported_durations', []),
      supportedCameraMoves: supportedCameraMoves ?? jsonPick('supportedCameraMoves', 'supported_camera_moves', []),
      supportedAudioModes: supportedAudioModes ?? jsonPick('supportedAudioModes', 'supported_audio_modes', []),
      defaultAudioMode: defaultAudioMode ?? existing?.default_audio_mode ?? 'silent',
      supportedSizeModes: supportedSizeModes ?? jsonPick('supportedSizeModes', 'supported_size_modes', ['auto', 'ratio']),
      allowCustomPixels: booleanPick('allowCustomPixels', 'allow_custom_pixels', false),
      nativeSizes: nativeSizes ?? jsonPick('nativeSizes', 'native_sizes', []),
      defaultRatio: defaultRatio ?? existing?.default_ratio ?? '1:1',
      maxWidth: numberPick('maxWidth', 'max_width', 2048),
      maxHeight: numberPick('maxHeight', 'max_height', 2048),
      minWidth: numberPick('minWidth', 'min_width', 64),
      minHeight: numberPick('minHeight', 'min_height', 64),
      maxTotalPixels: numberPick('maxTotalPixels', 'max_total_pixels', 4194304),
      maxAspectRatio: numberPick('maxAspectRatio', 'max_aspect_ratio', 4),
      allowPostprocess: booleanPick('allowPostprocess', 'allow_postprocess', true),
      postprocessModes: postprocessModes ?? jsonPick('postprocessModes', 'postprocess_modes', ['cover', 'contain', 'resize']),
      allowUpscale: booleanPick('allowUpscale', 'allow_upscale', false),
      maxImages: numberPick('maxImages', 'max_images', 1),
      maxReferenceImages: numberPick('maxReferenceImages', 'max_reference_images', 4),
      maxDurationSeconds: numberPick('maxDurationSeconds', 'max_duration_seconds', 30),
    };
    await query(
      `INSERT INTO tier_capabilities
       (tier_id, supported_ratios, supported_qualities, supported_styles, supported_durations, supported_camera_moves, supported_audio_modes, default_audio_mode,
        supported_size_modes, allow_custom_pixels, native_sizes, default_ratio, max_width, max_height, min_width, min_height,
        max_total_pixels, max_aspect_ratio, allow_postprocess, postprocess_modes, allow_upscale, max_images, max_reference_images, max_duration_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE supported_ratios=?, supported_qualities=?, supported_styles=?, supported_durations=?, supported_camera_moves=?, supported_audio_modes=?, default_audio_mode=?,
        supported_size_modes=?, allow_custom_pixels=?, native_sizes=?, default_ratio=?, max_width=?, max_height=?, min_width=?, min_height=?,
        max_total_pixels=?, max_aspect_ratio=?, allow_postprocess=?, postprocess_modes=?, allow_upscale=?, max_images=?, max_reference_images=?, max_duration_seconds=?`,
      [
        tierId, JSON.stringify(next.supportedRatios), JSON.stringify(next.supportedQualities), JSON.stringify(next.supportedStyles), JSON.stringify(next.supportedDurations), JSON.stringify(next.supportedCameraMoves), JSON.stringify(next.supportedAudioModes), next.defaultAudioMode,
        JSON.stringify(next.supportedSizeModes), next.allowCustomPixels, JSON.stringify(next.nativeSizes), next.defaultRatio,
        next.maxWidth, next.maxHeight, next.minWidth, next.minHeight, next.maxTotalPixels, next.maxAspectRatio,
        next.allowPostprocess, JSON.stringify(next.postprocessModes), next.allowUpscale, next.maxImages, next.maxReferenceImages, next.maxDurationSeconds,
        JSON.stringify(next.supportedRatios), JSON.stringify(next.supportedQualities), JSON.stringify(next.supportedStyles), JSON.stringify(next.supportedDurations), JSON.stringify(next.supportedCameraMoves), JSON.stringify(next.supportedAudioModes), next.defaultAudioMode,
        JSON.stringify(next.supportedSizeModes), next.allowCustomPixels, JSON.stringify(next.nativeSizes), next.defaultRatio,
        next.maxWidth, next.maxHeight, next.minWidth, next.minHeight, next.maxTotalPixels, next.maxAspectRatio,
        next.allowPostprocess, JSON.stringify(next.postprocessModes), next.allowUpscale, next.maxImages, next.maxReferenceImages, next.maxDurationSeconds,
      ]
    );
    success(res, { updated: true });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '保存能力配置失败'); }
});

// GET /model-features
router.get('/model-features', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await query<any>('SELECT * FROM model_features WHERE status = ? ORDER BY sort_order', ['active']);
    success(res, rows.map((r: any) => ({ id: r.id, featureKey: r.feature_key, featureName: r.feature_name })));
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取功能列表失败'); }
});

// ===== Real model pool (admin only) =====

// POST /real-models/preset - create/update provider and one real model from a guided preset
router.post('/real-models/preset', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const payload = normalizePresetPayload(req.body || {});
    const existingProvider = await queryOne<any>('SELECT id, config FROM ai_model_providers WHERE provider_key = ? AND deleted_at IS NULL', [payload.providerKey]);
    let providerId = Number(existingProvider?.id || 0);
    const configJson = JSON.stringify({
      ...parseJson(existingProvider?.config, {}),
      anthropicBaseUrl: payload.anthropicBaseUrl,
      presetKey: payload.providerKey,
    });

    if (providerId) {
      const sets = [
        'name = ?',
        'provider_type = ?',
        'api_base_url = ?',
        'default_timeout = ?',
        'default_retry = ?',
        'config = ?',
        "status = 'active'",
      ];
      const values: any[] = [payload.name, payload.providerType, payload.openaiBaseUrl, payload.timeoutSeconds, payload.retryTimes, configJson];
      if (payload.apiKey) {
        sets.push('api_key = ?');
        values.push(encryptApiKey(payload.apiKey));
      }
      values.push(providerId);
      await query(`UPDATE ai_model_providers SET ${sets.join(', ')}, updated_at = NOW(3) WHERE id = ?`, values);
    } else {
      if (!payload.apiKey) {
        error(res, ErrorCodes.PARAM_ERROR, '首次添加供应商必须填写 API Key');
        return;
      }
      const [insertResult] = await query<any>(
        `INSERT INTO ai_model_providers
         (name, provider_key, provider_type, api_base_url, api_key, default_timeout, default_retry, config, remark, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(3))`,
        [payload.name, payload.providerKey, payload.providerType, payload.openaiBaseUrl, encryptApiKey(payload.apiKey), payload.timeoutSeconds, payload.retryTimes, configJson, payload.remark],
      );
      providerId = Number((insertResult as any).insertId || 0);
    }

    const existingModel = await queryOne<any>(
      'SELECT id FROM ai_models WHERE provider_id = ? AND api_model_name = ? AND deleted_at IS NULL LIMIT 1',
      [providerId, payload.modelId],
    );
    let modelId = Number(existingModel?.id || 0);
    if (modelId) {
      await query(
        `UPDATE ai_models
            SET name = ?, display_name = ?, model_type = ?, sub_type = ?, upstream_model_code = ?,
                timeout_seconds = ?, retry_times = ?, status = 'active', updated_at = NOW(3)
          WHERE id = ?`,
        [payload.modelName, payload.modelName, payload.modelType, payload.subType, payload.modelId, payload.timeoutSeconds, payload.retryTimes, modelId],
      );
    } else {
      const [modelResult] = await query<any>(
        `INSERT INTO ai_models
         (provider_id, name, display_name, model_type, sub_type, api_model_name, upstream_model_code, is_async,
          query_task_url, request_template, result_path, status_mapping, error_mapping, timeout_seconds,
          retry_times, retry_delay_ms, daily_limit, daily_limit_per_user, max_concurrency, priority,
          points_cost, sort_order, remark, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, '', '{}', '', '{}', '{}', ?, ?, 1000, 0, 0, 5, 0, ?, 0, ?, 'active')`,
        [providerId, payload.modelName, payload.modelName, payload.modelType, payload.subType, payload.modelId, payload.modelId, payload.timeoutSeconds, payload.retryTimes, payload.pointsCost, payload.remark],
      );
      modelId = Number((modelResult as any).insertId || 0);
    }

    success(res, { providerId, modelId, providerKey: payload.providerKey, modelIdText: payload.modelId });
  } catch (err: any) {
    error(res, ErrorCodes.PARAM_ERROR, err?.message || '保存供应商和模型失败');
  }
});

// GET /real-models
router.get('/real-models', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const rows = await query<any>(
      `SELECT m.*, p.name as provider_name, p.provider_type,
              c.last_test_status, c.last_test_at, c.last_test_message
         FROM ai_models m
         JOIN ai_model_providers p ON p.id = m.provider_id
         LEFT JOIN config_check_results c ON c.target_key = CONCAT('ai-model:', m.id)
        WHERE m.deleted_at IS NULL AND p.deleted_at IS NULL
        ORDER BY p.name, m.name`,
    );
    success(res, rows.map((r: any) => {
      const config = parseJson(r.config, {});
      const capabilities = normalizeCapabilitiesForAdmin(config.capabilities);
      return ({
        id: r.id, name: r.name, providerId: r.provider_id, providerName: r.provider_name, providerType: r.provider_type,
        displayName: r.display_name || r.name,
        modelType: r.model_type, subType: r.sub_type, apiModelName: r.api_model_name,
        modelCode: r.api_model_name,
        upstreamModelCode: r.upstream_model_code || "",
        isAsync: !!r.is_async,
        pointsCost: r.points_cost,
        apiCostCents: r.api_cost_cents || 0,
        queryTaskUrl: r.query_task_url || "",
        requestTemplate: typeof r.request_template === "string" ? JSON.parse(r.request_template) : (r.request_template || {}),
        resultPath: r.result_path || "",
        statusMapping: typeof r.status_mapping === "string" ? JSON.parse(r.status_mapping) : (r.status_mapping || {}),
        errorMapping: typeof r.error_mapping === "string" ? JSON.parse(r.error_mapping) : (r.error_mapping || {}),
        timeoutSeconds: r.timeout_seconds || 120,
        retryTimes: r.retry_times || 3,
        retryDelayMs: r.retry_delay_ms || 1000,
        dailyLimit: r.daily_limit || 0,
        dailyLimitPerUser: r.daily_limit_per_user || 0,
        maxConcurrency: r.max_concurrency || 5,
        priority: r.priority || 0,
        status: r.status, sortOrder: r.sort_order, remark: r.remark || "", createdAt: r.created_at,
        config,
        capabilities,
        lastTestStatus: r.last_test_status || 'untested',
        lastTestAt: r.last_test_at || null,
        lastTestMessage: r.last_test_message || '',
      });
    }));
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取真实模型失败'); }
});

// POST /real-models
router.post('/real-models', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { providerId, name, displayName, modelType, subType, apiModelName, modelCode, upstreamModelCode, isAsync,
      queryTaskUrl, requestTemplate, resultPath, statusMapping, errorMapping,
      timeoutSeconds, retryTimes, retryDelayMs, dailyLimit, dailyLimitPerUser,
      maxConcurrency, priority, sortOrder, pointsCost, apiCostCents, status, remark } = req.body;
    const resolvedModelCode = apiModelName || modelCode;
    if (!providerId || !name || !modelType || !resolvedModelCode) { error(res, ErrorCodes.PARAM_ERROR, '缺少必要参数(providerId, name, modelType, modelCode)'); return; }
    const [r] = await query<any>(
      'INSERT INTO ai_models (provider_id, name, display_name, model_type, sub_type, api_model_name, upstream_model_code, is_async, query_task_url, request_template, result_path, status_mapping, error_mapping, timeout_seconds, retry_times, retry_delay_ms, daily_limit, daily_limit_per_user, max_concurrency, priority, points_cost, api_cost_cents, sort_order, remark, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [providerId, name, displayName || name, modelType, subType || "", resolvedModelCode,
       upstreamModelCode || "", isAsync ? 1 : 0,
       queryTaskUrl || "", JSON.stringify(requestTemplate || {}), resultPath || "",
       JSON.stringify(statusMapping || {}), JSON.stringify(errorMapping || {}),
       timeoutSeconds || 120, retryTimes || 3, retryDelayMs || 1000,
       dailyLimit || 0, dailyLimitPerUser || 0, maxConcurrency || 5, priority || 0,
       pointsCost ?? 2, Number(apiCostCents || 0), sortOrder || 0, remark || "", status || "active"]
    );
    success(res, { id: (r as any).insertId });
  } catch (e: any) { error(res, ErrorCodes.SERVER_ERROR, '创建真实模型失败: ' + (e.message || '')); }
});

// PUT /real-models/:id
router.put('/real-models/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { providerId, name, displayName, modelType, subType, apiModelName, modelCode, upstreamModelCode, isAsync,
      queryTaskUrl, requestTemplate, resultPath, statusMapping, errorMapping,
      timeoutSeconds, retryTimes, retryDelayMs, dailyLimit, dailyLimitPerUser,
      maxConcurrency, priority, sortOrder, pointsCost, apiCostCents, status, remark } = req.body;
    const sets: string[] = []; const vals: any[] = [];
    if (providerId !== undefined) { sets.push('provider_id = ?'); vals.push(providerId); }
    if (name) { sets.push('name = ?'); vals.push(name); }
    if (displayName !== undefined) { sets.push('display_name = ?'); vals.push(displayName || name || ''); }
    if (modelType) { sets.push('model_type = ?'); vals.push(modelType); }
    if (subType !== undefined) { sets.push('sub_type = ?'); vals.push(subType); }
    if (apiModelName !== undefined || modelCode !== undefined) { sets.push('api_model_name = ?'); vals.push(apiModelName !== undefined ? apiModelName : modelCode); }
    if (upstreamModelCode !== undefined) { sets.push('upstream_model_code = ?'); vals.push(upstreamModelCode); }
    if (isAsync !== undefined) { sets.push('is_async = ?'); vals.push(isAsync ? 1 : 0); }
    if (queryTaskUrl !== undefined) { sets.push('query_task_url = ?'); vals.push(queryTaskUrl); }
    if (requestTemplate !== undefined) { sets.push('request_template = ?'); vals.push(JSON.stringify(requestTemplate)); }
    if (resultPath !== undefined) { sets.push('result_path = ?'); vals.push(resultPath); }
    if (statusMapping !== undefined) { sets.push('status_mapping = ?'); vals.push(JSON.stringify(statusMapping)); }
    if (errorMapping !== undefined) { sets.push('error_mapping = ?'); vals.push(JSON.stringify(errorMapping)); }
    if (timeoutSeconds !== undefined) { sets.push('timeout_seconds = ?'); vals.push(timeoutSeconds); }
    if (retryTimes !== undefined) { sets.push('retry_times = ?'); vals.push(retryTimes); }
    if (retryDelayMs !== undefined) { sets.push('retry_delay_ms = ?'); vals.push(retryDelayMs); }
    if (dailyLimit !== undefined) { sets.push('daily_limit = ?'); vals.push(dailyLimit); }
    if (dailyLimitPerUser !== undefined) { sets.push('daily_limit_per_user = ?'); vals.push(dailyLimitPerUser); }
    if (maxConcurrency !== undefined) { sets.push('max_concurrency = ?'); vals.push(maxConcurrency); }
    if (priority !== undefined) { sets.push('priority = ?'); vals.push(priority); }
    if (sortOrder !== undefined) { sets.push('sort_order = ?'); vals.push(sortOrder); }
    if (pointsCost !== undefined) { sets.push('points_cost = ?'); vals.push(pointsCost); }
    if (apiCostCents !== undefined) { sets.push('api_cost_cents = ?'); vals.push(Number(apiCostCents || 0)); }
    if (req.body.config !== undefined) {
      const existingModel = await queryOne<any>('SELECT config FROM ai_models WHERE id = ?', [id]);
      const existingConfig = parseJson(existingModel?.config, {});
      const merged = { ...existingConfig, ...req.body.config };
      sets.push('config = ?');
      vals.push(JSON.stringify(merged));
    }
    if (status) { sets.push('status = ?'); vals.push(status); }
    if (remark !== undefined) { sets.push('remark = ?'); vals.push(remark); }
    if (sets.length === 0) { error(res, ErrorCodes.PARAM_ERROR, '没有可更新字段'); return; }
    vals.push(id);
    await query('UPDATE ai_models SET ' + sets.join(', ') + ' WHERE id = ?', vals);
    success(res, { updated: true });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '更新真实模型失败'); }
});

router.post('/real-models/:id(\\d+)/test', adminAuthMiddleware, async (req: Request, res: Response) => {
  const modelId = parseInt(req.params.id, 10);
  const startedAt = Date.now();
  try {
    const model = await getRealModelWithProvider(modelId);
    if (!model) { error(res, ErrorCodes.NOT_FOUND, '模型不存在', 404); return; }
    const result = await runRealModelGenerationTest(model, req.body || {});
    const status = result.mappedStatus === 'completed' ? 'passed' : 'risk';
    const message = status === 'passed'
      ? '真实模型测试通过'
      : '真实模型已提交，但未在测试窗口内完成';
    await saveRealModelTestState(modelId, status, message, req.user?.userId);
    success(res, {
      status,
      message,
      durationMs: Date.now() - startedAt,
      ...result,
    });
  } catch (err: any) {
    const message = safeTestMessage(err?.message || '真实模型测试失败');
    await saveRealModelTestState(modelId, 'failed', message, req.user?.userId, [message]).catch(() => undefined);
    error(res, ErrorCodes.PARAM_ERROR, message);
  }
});

export default router;

function normalizeCapabilitiesForAdmin(value: any): string[] {
  const items = Array.isArray(value) ? value : [];
  const unique = new Set<string>();
  for (const item of items) {
    const capability = normalizeCapabilityKey(String(item || ''));
    if (capability) unique.add(capability);
  }
  return Array.from(unique);
}

async function getRealModelWithProvider(modelId: number) {
  return queryOne<any>(
    `SELECT m.*, p.provider_type, p.api_base_url, p.api_key, p.default_timeout, p.default_retry,
            p.auth_type, p.protocol_type
       FROM ai_models m
       JOIN ai_model_providers p ON p.id = m.provider_id
      WHERE m.id = ? AND m.deleted_at IS NULL AND p.deleted_at IS NULL
      LIMIT 1`,
    [modelId],
  );
}

async function saveRealModelTestState(
  modelId: number,
  status: 'passed' | 'failed' | 'risk',
  message: string,
  operator?: number,
  errors: string[] = [],
) {
  await query(
    `INSERT INTO config_check_results
       (target_key, target_type, last_test_status, last_test_at, last_test_message, last_test_operator, last_test_errors, manual_verified, updated_at)
     VALUES (?, 'ai_model', ?, NOW(3), ?, ?, ?, 0, NOW(3))
     ON DUPLICATE KEY UPDATE target_type = VALUES(target_type), last_test_status = VALUES(last_test_status),
       last_test_at = NOW(3), last_test_message = VALUES(last_test_message),
       last_test_operator = VALUES(last_test_operator), last_test_errors = VALUES(last_test_errors),
       manual_verified = 0, updated_at = NOW(3)`,
    [`ai-model:${modelId}`, status, message.substring(0, 512), operator || null, JSON.stringify(errors)],
  );
}

async function runRealModelGenerationTest(model: any, body: any) {
  const modelType = String(model.model_type || '');
  if (!['image', 'video', 'text'].includes(modelType)) {
    throw new Error('当前仅支持图片、视频和文本真实模型测试');
  }
  if (!model.api_base_url || !model.api_key) throw new Error('模型供应商缺少 Base URL 或 API Key');
  const modelCode = String(model.upstream_model_code || model.api_model_name || '').trim();
  if (!modelCode) throw new Error('真实模型缺少模型 ID');
  const adapter = AdapterRegistry.get(model.provider_type || 'openai_compatible');
  if (!adapter) throw new Error('当前供应商类型暂不支持真实模型测试');

  const taskType = resolveTestTaskType(model, body);
  const prompt = String(body.prompt || '').trim() || defaultTestPrompt(model.model_type);
  const images = normalizeTestImages(body.images);
  if (['image_to_image', 'image_edit', 'image_to_video'].includes(taskType) && images.length === 0) {
    throw new Error('该模型测试需要参考图，请在请求中传 images');
  }
  if (taskType === 'first_last_frame_video' && images.length < 2) {
    throw new Error('首尾帧视频模型测试需要传入两张参考图');
  }
  const modelConfig = parseJson(model.config, {});
  const params = modelType === 'video'
    ? { duration: body.duration || '3s', ratio: body.ratio || '16:9', quality: body.quality || 'standard' }
    : modelType === 'text'
      ? {
          apiFormat: String(modelConfig.api_format || modelConfig.apiFormat || 'openai'),
          systemPrompt: body.systemPrompt || body.system_prompt || '',
          temperature: body.temperature,
          topP: body.topP ?? body.top_p,
          maxTokens: body.maxTokens ?? body.max_tokens,
        }
      : {
          imageCount: 1,
          nativeSize: body.nativeSize || body.resolution || '1024x1024',
          quality: body.quality || 'standard',
          ratio: body.ratio,
          aspect_ratio: body.aspect_ratio,
        };
  const timeout = Math.max(5, Number(model.timeout_seconds || model.default_timeout || 120)) * 1000;

  const submit = await adapter.submitTask({
    upstreamCode: modelCode,
    taskType,
    prompt,
    images,
    params,
    providerConfig: {
      baseUrl: model.api_base_url,
      apiKey: decryptApiKey(model.api_key),
      timeout,
      protocolType: model.protocol_type || 'rest',
      authType: model.auth_type || 'bearer',
    },
  });
  if (submit.error) throw new Error(`${submit.error.code}: ${submit.error.message}`);

  let providerStatus = submit.status || (submit.type === 'sync' ? 'success' : 'submitted');
  let mappedStatus = adapter.mapStatus(providerStatus, parseJson(model.status_mapping, {}));
  let urls = submit.result?.urls || [];
  let responseText = extractTextResult(submit.result?.metadata);
  let cost = submit.cost || null;

  if (submit.type === 'async' && submit.providerTaskId && body.waitForResult !== false) {
    const maxPolls = clampInt(body.maxPolls, 1, 8, 3);
    const intervalSeconds = clampInt(body.pollIntervalSeconds, 1, 10, 2);
    for (let i = 0; i < maxPolls; i++) {
      await sleep(intervalSeconds * 1000);
      const polled = await adapter.queryTask(submit.providerTaskId, {
        baseUrl: model.api_base_url,
        apiKey: decryptApiKey(model.api_key),
        timeout,
        authType: model.auth_type || 'bearer',
        queryTaskUrl: model.query_task_url || undefined,
      });
      providerStatus = polled.status || providerStatus;
      mappedStatus = adapter.mapStatus(providerStatus, parseJson(model.status_mapping, {}));
      urls = polled.result?.urls || urls;
      responseText = extractTextResult(polled.result?.metadata) || responseText;
      cost = polled.cost || cost;
      if (mappedStatus === 'completed') break;
      if (polled.error && !['processing', 'queued', 'pending'].includes(mappedStatus)) {
        throw new Error(`${polled.error.code}: ${polled.error.message}`);
      }
      if (['failed', 'timeout', 'cancelled', 'canceled'].includes(mappedStatus)) {
        throw new Error(polled.error?.message || `供应商任务失败：${mappedStatus}`);
      }
    }
  }

  if (modelType === 'text' && !responseText) throw new Error('文本模型测试未返回可用文本结果');
  if (modelType !== 'text' && mappedStatus === 'completed' && urls.length === 0) throw new Error('模型任务完成但未返回可用结果地址');
  if (modelType !== 'text' && submit.type === 'sync' && urls.length === 0) throw new Error('模型测试未返回可用结果');

  return {
    resultType: submit.type,
    providerTaskId: submit.providerTaskId || '',
    providerStatus,
    mappedStatus,
    taskType,
    urls,
    text: responseText,
    requestId: extractMetadataString(submit.result?.metadata, 'requestId'),
    cost,
  };
}

function resolveTestTaskType(model: any, body: any): string {
  const explicit = String(body.taskType || '').trim();
  if (explicit) return explicit;
  const subType = String(model.sub_type || '').trim();
  if (model.model_type === 'video') {
    const aliases: Record<string, string> = {
      text2video: 'text_to_video',
      txt2video: 'text_to_video',
      img2video: 'image_to_video',
      image2video: 'image_to_video',
      first_last_frame: 'first_last_frame_video',
    };
    const normalized = aliases[subType] || subType;
    return ['image_to_video', 'first_last_frame_video', 'text_to_video'].includes(normalized) ? normalized : 'text_to_video';
  }
  if (model.model_type === 'text') {
    const aliases: Record<string, string> = {
      chat: 'text_generation',
      text_chat: 'text_generation',
      prompt: 'prompt_optimize',
      prompt_generate: 'prompt_optimize',
      script_generate: 'script_generation',
    };
    const normalized = aliases[subType] || subType;
    return ['text_generation', 'prompt_optimize', 'script_generation'].includes(normalized) ? normalized : 'text_generation';
  }
  if (['image_to_image', 'image_edit', 'img2img', 'edit'].includes(subType)) {
    return subType === 'img2img' ? 'image_to_image' : subType === 'edit' ? 'image_edit' : subType;
  }
  return 'text_to_image';
}

function defaultTestPrompt(modelType: string): string {
  if (modelType === 'text') return '你好';
  return modelType === 'video'
    ? 'A simple 3 second product showcase video'
    : 'A simple product photo on a clean background';
}

function normalizeTestImages(images: any): string[] {
  const items = Array.isArray(images) ? images : images ? [images] : [];
  return items.map(item => String(item || '').trim()).filter(Boolean).slice(0, 4);
}

function clampInt(value: any, min: number, max: number, fallback: number): number {
  const parsed = parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeTestMessage(message: string): string {
  return String(message || '')
    .replace(/(api[_-]?key|token|secret|password|authorization)["'=:\s]+[^,\s}]+/ig, '$1=[filtered]')
    .substring(0, 500);
}

function extractTextResult(metadata: any): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const value = metadata.text ?? metadata.content ?? metadata.outputText ?? metadata.output_text;
  return typeof value === 'string' ? value.trim() : '';
}

function extractMetadataString(metadata: any, key: string): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const value = metadata[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function normalizePresetPayload(body: any) {
  const providerKey = String(body.providerKey || body.code || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32);
  const name = String(body.name || body.providerName || '').trim();
  const modelId = String(body.modelId || body.apiModelName || body.modelCode || '').trim();
  const openaiBaseUrl = String(body.openaiBaseUrl || body.apiBaseUrl || body.baseUrl || '').trim().replace(/\/$/, '');
  const anthropicBaseUrl = String(body.anthropicBaseUrl || '').trim().replace(/\/$/, '');
  const providerType = String(body.providerType || 'openai_compatible').trim();
  const modelType = String(body.modelType || 'image').trim();
  const supportedModelTypes = new Set(['image', 'video', 'audio', 'text']);
  if (!providerKey) throw new Error('请选择供应商');
  if (!name) throw new Error('请输入供应商名称');
  if (!openaiBaseUrl) throw new Error('请输入 OpenAI 地址');
  if (!modelId) throw new Error('请输入模型 ID');
  if (!['openai', 'openai_compatible', 'relay', 'custom'].includes(providerType)) throw new Error('供应商类型不支持');
  if (!supportedModelTypes.has(modelType)) throw new Error('模型类型不支持');
  return {
    providerKey,
    name,
    providerType,
    openaiBaseUrl,
    anthropicBaseUrl,
    modelId,
    modelName: String(body.modelName || modelId).trim(),
    apiKey: String(body.apiKey || '').trim(),
    modelType,
    subType: String(body.subType || '').trim(),
    timeoutSeconds: Math.max(5, Math.min(Number(body.timeoutSeconds || body.timeout || 120), 600)),
    retryTimes: Math.max(0, Math.min(Number(body.retryTimes ?? body.retry ?? 3), 10)),
    pointsCost: Math.max(0, Number(body.pointsCost ?? 2)),
    remark: String(body.remark || '').trim(),
  };
}
