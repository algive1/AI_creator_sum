// routes/admin-models.ts
// Admin model and provider management routes

import axios from 'axios';
import { Router, Request, Response } from 'express';
import { adminAuthMiddleware } from '../middleware/auth';
import { getConnection, queryOne, query } from '../utils/db';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { decryptApiKey, encryptApiKey } from '../services/openai-adapter.service';
import { normalizeCapabilityKey } from '../services/model-capability.service';
import { getAdminModelList } from '../services/model-list.service';

const router = Router();
const MAX_PAGE_SIZE = 100;

function shouldPaginate(req: Request): boolean {
  return String(req.query.paginate || '') === '1' || req.query.page !== undefined || req.query.pageSize !== undefined;
}

function readPagination(req: Request) {
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function mapProviderRow(r: any) {
  return {
    id: r.id, name: r.name, providerKey: r.provider_key, code: r.provider_key, providerType: r.provider_type, protocolType: r.provider_type,
    apiBaseUrl: r.api_base_url, timeout: r.default_timeout, retry: r.default_retry,
    apiKeyConfigured: !!r.api_key,
    apiKeyMasked: maskApiKeyForAdmin(r.api_key),
    status: r.status, healthStatus: r.health_status, lastHealthCheck: r.last_health_check,
    remark: r.remark || '', createdAt: r.created_at,
  };
}

// ===== Providers =====

router.get('/providers', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const where: string[] = ['deleted_at IS NULL'];
    const params: any[] = [];
    const keyword = String(req.query.keyword || '').trim();
    const providerType = String(req.query.providerType || '').trim();
    const status = String(req.query.status || '').trim();
    if (keyword) {
      where.push('(name LIKE ? OR provider_key LIKE ? OR api_base_url LIKE ? OR remark LIKE ?)');
      params.push(...Array(4).fill(`%${keyword}%`));
    }
    if (providerType === 'openai') {
      where.push('provider_type = ?');
      params.push('openai');
    } else if (providerType === 'custom') {
      where.push('provider_type IN (?, ?, ?)');
      params.push('custom', 'self', 'self_proxy');
    } else if (providerType === 'openai_compatible') {
      where.push('provider_type NOT IN (?, ?, ?, ?)');
      params.push('openai', 'custom', 'self', 'self_proxy');
    } else if (providerType) {
      where.push('provider_type = ?');
      params.push(providerType);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    const whereSql = where.join(' AND ');
    if (shouldPaginate(req)) {
      const { page, pageSize, offset } = readPagination(req);
      const [cnt] = await query<any>(`SELECT COUNT(*) AS total FROM ai_model_providers WHERE ${whereSql}`, params);
      const rows = await query<any>(
        `SELECT id, name, provider_key, provider_type, api_base_url, api_key, default_timeout, default_retry, status, last_health_check, health_status, remark, created_at
           FROM ai_model_providers
          WHERE ${whereSql}
          ORDER BY id
          LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      );
      const total = Number(cnt?.total || 0);
      success(res, {
        list: rows.map(mapProviderRow),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
      return;
    }

    const rows = await query<any>(
      `SELECT id, name, provider_key, provider_type, api_base_url, api_key, default_timeout, default_retry, status, last_health_check, health_status, remark, created_at
         FROM ai_model_providers
        WHERE ${whereSql}
        ORDER BY id`,
      params,
    );
    success(res, rows.map(mapProviderRow));
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取模型供应商失败'); }
});

router.post('/providers', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, providerKey, code, providerType, protocolType, apiBaseUrl, apiKey, timeout, retry, remark } = req.body;
    const resolvedKey = providerKey || code;
    const resolvedType = providerType || protocolType || 'custom';
    if (!name || !resolvedKey || !apiBaseUrl || !apiKey) { error(res, ErrorCodes.PARAM_ERROR, '缺少供应商名称、标识、接口地址或 API Key'); return; }
    const encryptedKey = encryptApiKey(apiKey);
    const [r] = await query<any>(
      'INSERT INTO ai_model_providers (name, provider_key, provider_type, api_base_url, api_key, default_timeout, default_retry, remark, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))',
      [name, resolvedKey, resolvedType, apiBaseUrl, encryptedKey, timeout || 120, retry || 3, remark || '', 'active']
    );
    success(res, { id: (r as any).insertId });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '创建模型供应商失败'); }
});

router.put('/providers/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, providerType, protocolType, apiBaseUrl, apiKey, timeout, retry, remark, status, code } = req.body;
    const sets: string[] = []; const vals: any[] = [];
    if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
    if (providerType || protocolType) { sets.push('provider_type = ?'); vals.push(providerType || protocolType); }
    if (code !== undefined) { sets.push('provider_key = ?'); vals.push(code); }
    if (apiBaseUrl) { sets.push('api_base_url = ?'); vals.push(apiBaseUrl); }
    if (apiKey && apiKey.trim() && !isMaskedApiKeyPlaceholder(apiKey)) { sets.push('api_key = ?'); vals.push(encryptApiKey(apiKey)); }
    if (timeout) { sets.push('default_timeout = ?'); vals.push(timeout); }
    if (retry !== undefined) { sets.push('default_retry = ?'); vals.push(retry); }
    if (remark !== undefined) { sets.push('remark = ?'); vals.push(remark); }
    if (status) { sets.push('status = ?'); vals.push(status); }
    if (sets.length === 0) { error(res, ErrorCodes.PARAM_ERROR, '没有可更新的供应商字段'); return; }
    vals.push(parseInt(req.params.id));
    await query('UPDATE ai_model_providers SET ' + sets.join(', ') + ', updated_at = NOW(3) WHERE id = ?', vals);
    success(res, { updated: true });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '更新模型供应商失败'); }
});

router.delete('/providers/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  const conn = await getConnection();
  try {
    const providerId = parseInt(req.params.id, 10);
    await conn.beginTransaction();
    const [modelRows] = await conn.execute(
      'SELECT id FROM ai_models WHERE provider_id = ? AND deleted_at IS NULL FOR UPDATE',
      [providerId],
    ) as any;
    const modelIds = (modelRows || []).map((row: any) => Number(row.id)).filter(Boolean);
    let bindingDeleted = 0;
    let fallbackDeleted = 0;
    let modelDeleted = 0;
    if (modelIds.length) {
      const placeholders = modelIds.map(() => '?').join(',');
      const [bindingResult] = await conn.execute(`DELETE FROM tier_model_bindings WHERE model_id IN (${placeholders})`, modelIds) as any;
      const [fallbackResult] = await conn.execute(`DELETE FROM ai_model_fallback_rules WHERE model_id IN (${placeholders}) OR fallback_model_id IN (${placeholders})`, [...modelIds, ...modelIds]) as any;
      const [modelResult] = await conn.execute(`UPDATE ai_models SET deleted_at = NOW(3), updated_at = NOW(3) WHERE id IN (${placeholders}) AND deleted_at IS NULL`, modelIds) as any;
      bindingDeleted = Number(bindingResult?.affectedRows || 0);
      fallbackDeleted = Number(fallbackResult?.affectedRows || 0);
      modelDeleted = Number(modelResult?.affectedRows || 0);
    }
    const [providerResult] = await conn.execute(
      'UPDATE ai_model_providers SET deleted_at = NOW(3), updated_at = NOW(3) WHERE id = ? AND deleted_at IS NULL',
      [providerId],
    ) as any;
    if (!Number(providerResult?.affectedRows || 0)) {
      await conn.rollback();
      error(res, ErrorCodes.NOT_FOUND, '供应商不存在', 404);
      return;
    }
    await conn.commit();
    success(res, { deleted: true, modelDeleted, bindingDeleted, fallbackDeleted });
  } catch {
    await conn.rollback();
    error(res, ErrorCodes.SERVER_ERROR, '删除供应商失败');
  } finally {
    conn.release();
  }
});

router.post('/providers/:id(\\d+)/api-key/copy', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const provider = await queryOne<any>(
      'SELECT id, name, provider_key, api_key FROM ai_model_providers WHERE id = ? AND deleted_at IS NULL',
      [parseInt(req.params.id)],
    );
    if (!provider) { error(res, ErrorCodes.NOT_FOUND, '供应商不存在', 404); return; }
    const apiKey = decryptApiKey(provider.api_key || '');
    if (!apiKey) { error(res, ErrorCodes.PARAM_ERROR, '供应商未配置 API Key'); return; }
    await query(
      'INSERT INTO admin_operation_logs (admin_user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, NOW(3))',
      [req.user!.userId, 'provider.copy_api_key', 'provider', String(provider.id), JSON.stringify({ providerKey: provider.provider_key, providerName: provider.name })],
    ).catch(() => undefined);
    success(res, { value: apiKey });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '复制供应商 API Key 失败'); }
});

router.post('/providers/:id(\\d+)/health-check', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const provider = await queryOne<any>('SELECT id, name, provider_type, api_base_url, api_key FROM ai_model_providers WHERE id = ? AND deleted_at IS NULL', [parseInt(req.params.id)]);
    if (!provider) { error(res, ErrorCodes.NOT_FOUND, '供应商不存在', 404); return; }

    const baseUrl = String(provider.api_base_url || '').replace(/\/$/, '');
    const apiKey = decryptApiKey(provider.api_key || '');
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '');

    try {
      const response = await axios.get(buildProviderHealthUrl(baseUrl, provider.provider_type), {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
        validateStatus: (s) => s < 500,
      });
      const healthy = response.status < 500;
      await query('UPDATE ai_model_providers SET health_status = ?, last_health_check = ? WHERE id = ?',
        [healthy ? 'healthy' : 'unhealthy', now, provider.id]);
      success(res, { healthy, status: response.status, checkedAt: now });
    } catch (err: any) {
      const status = err.response?.status || 'network_error';
      await query('UPDATE ai_model_providers SET health_status = ?, last_health_check = ? WHERE id = ?',
        ['unhealthy', now, provider.id]);
      success(res, { healthy: false, status, message: err.message?.slice(0, 200) || '连接失败', checkedAt: now });
    }
  } catch { error(res, ErrorCodes.SERVER_ERROR, '健康检查失败'); }
});

// POST /providers/:id/sync — sync models from provider API
router.post('/providers/:id(\\d+)/sync', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const provider = await queryOne<any>(
      'SELECT id, name, provider_key, provider_type, api_base_url, api_key FROM ai_model_providers WHERE id = ? AND deleted_at IS NULL',
      [parseInt(req.params.id)],
    );
    if (!provider) { error(res, ErrorCodes.NOT_FOUND, '供应商不存在', 404); return; }

    const apiKey = decryptApiKey(provider.api_key || '');
    const baseUrl = String(provider.api_base_url || '').replace(/\/v1\/?$/, '').replace(/\/$/, '');
    let newModels: Array<{ id: string; name: string }> = [];

    // 巴格格: /v1/frontstage/model-config
    if (provider.provider_type === 'bagege' || provider.provider_key === 'bagege') {
      const resp = await axios.get(`${baseUrl}/v1/frontstage/model-config`, {
        headers: { Authorization: 'Bearer ' + apiKey },
        timeout: 15000,
      });
      const names = resp.data?.displayNames || {};
      newModels = Object.entries(names).map(([id, name]) => ({ id, name: String(name) }));
    } else if (provider.provider_type === 'xiaoma' || provider.provider_key === 'xiaoma') {
      // 小马AI: /v1/skills/models?type=image 和 ?type=video
      for (const mediaType of ['image', 'video']) {
        try {
          const resp = await axios.get(`${baseUrl}/v1/skills/models?type=${mediaType}`, {
            headers: { Authorization: 'Bearer ' + apiKey },
            timeout: 15000,
          });
          const models = resp.data?.models || resp.data?.data || [];
          for (const m of models) {
            const mid = m.name || m.id || '';
            const display = m.display_name || m.name || mid;
            if (mid) newModels.push({ id: mid, name: display });
          }
        } catch { /* skip failed type */ }
      }
    } else if (provider.provider_type === 'apimart') {
      // APIMart: OpenAI-compatible /v1/models with apimart-specific error handling
      const resp = await axios.get(`${baseUrl}/v1/models`, {
        headers: { Authorization: 'Bearer ' + apiKey },
        timeout: 15000,
        validateStatus: (s) => s < 500,
      });
      if (resp.data?.error) {
        error(res, ErrorCodes.PARAM_ERROR, 'APIMart API 返回错误：' + (resp.data.error.message || '未知错误'));
        return;
      }
      const data = resp.data?.data || [];
      newModels = data
        .filter((m: any) => m.id && m.id !== 'unknown')
        .map((m: any) => ({ id: m.id, name: m.id }));
    } else {
      // OpenAI-compatible: /v1/models
      try {
        const resp = await axios.get(`${baseUrl}/v1/models`, {
          headers: { Authorization: 'Bearer ' + apiKey },
          timeout: 15000,
        });
        const data = resp.data?.data || [];
        newModels = data
          .filter((m: any) => m.id && m.id !== 'unknown')
          .map((m: any) => ({ id: m.id, name: m.id }));
      } catch {
        error(res, ErrorCodes.PARAM_ERROR, '该供应商不支持模型同步或 API 不可达');
        return;
      }
    }

    if (!newModels.length) {
      error(res, ErrorCodes.PARAM_ERROR, '未从供应商获取到任何模型');
      return;
    }

    // Get existing model IDs for this provider
    const existing = await query<any>(
      'SELECT api_model_name FROM ai_models WHERE provider_id = ? AND deleted_at IS NULL',
      [provider.id],
    );
    const existingIds = new Set(existing.map((r: any) => r.api_model_name));

    let added = 0;
    let skipped = 0;
    for (const m of newModels) {
      if (existingIds.has(m.id)) { skipped++; continue; }
      // Guess model_type from name and tags; default to 'unknown' (admin must verify)
      const lower = (m.name || '').toLowerCase();
      let modelType = 'unknown';
      if (/video|vid|veo|kling|sora|wan|pixverse|grok|seedance|happyhorse|omni|hailuo|minimax|luma|runway|mochi|cogvideox/i.test(lower)) modelType = 'video';
      else if (/text|chat|llm|tts|audio|speech|whisper|music|suno/i.test(lower)) modelType = 'text';
      else if (/image|img|dall-e|flux|sd|stable|midjourney/i.test(lower)) modelType = 'image';

      await query(
        `INSERT IGNORE INTO ai_models (provider_id, name, display_name, model_type, sub_type, api_model_name, upstream_model_code, is_async, timeout_seconds, retry_times, retry_delay_ms, daily_limit, daily_limit_per_user, max_concurrency, priority, points_cost, api_cost_cents, sort_order, config, remark, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, '', ?, ?, 1, 300, 3, 3000, 0, 0, 5, 0, 0, 0, 999, '{}', 'auto-synced', 'active', NOW(3), NOW(3))`,
        [provider.id, m.name, m.name, modelType, m.id, m.id],
      );
      added++;
    }

    success(res, {
      providerId: provider.id,
      providerName: provider.name,
      totalRemote: newModels.length,
      added,
      skipped,
      message: `同步完成：从供应商获取 ${newModels.length} 个模型，新增 ${added} 个，跳过已存在 ${skipped} 个。`,
    });
  } catch (err: any) {
    console.error('[admin-models] sync failed:', err?.message);
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '同步模型失败');
  }
});

// GET /providers/:id/balance
router.get('/providers/:id(\\d+)/balance', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const provider = await queryOne<any>(
      'SELECT id, name, provider_key, api_base_url, api_key FROM ai_model_providers WHERE id = ? AND deleted_at IS NULL',
      [parseInt(req.params.id)],
    );
    if (!provider) { error(res, ErrorCodes.NOT_FOUND, '供应商不存在', 404); return; }

    const apiKey = decryptApiKey(provider.api_key || '');
    if (!apiKey) { success(res, { available: false, message: '未配置 API Key' }); return; }

    const baseUrl = String(provider.api_base_url || '').replace(/\/v1\/?$/, '').replace(/\/$/, '');

    // APIMart: /v1/balance
    if (provider.provider_type === 'apimart' || provider.provider_key === 'apimart') {
      try {
        const resp = await axios.get(`${baseUrl}/v1/balance`, {
          headers: { Authorization: 'Bearer ' + apiKey },
          timeout: 10000,
          validateStatus: (s) => s < 500,
        });
        const data = resp.data;
        if (data?.balance !== undefined) {
          success(res, { available: true, balance: data.balance, currency: data.currency || 'USD' });
        } else if (data?.error?.message) {
          // Extract balance from error: "current: X.XX USD"
          const match = data.error.message.match(/current:\s*([\d.]+)\s*(\w+)/);
          if (match) {
            success(res, { available: true, balance: parseFloat(match[1]), currency: match[2] || 'USD' });
          } else {
            success(res, { available: false, message: data.error.message?.substring(0, 200) });
          }
        } else {
          success(res, { available: false, message: '无法解析余额' });
        }
      } catch (err: any) {
        success(res, { available: false, message: err?.message?.substring(0, 200) || '查询失败' });
      }
      return;
    }

    success(res, { available: false, message: '该供应商暂不支持余额查询' });
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '查询余额失败');
  }
});

// ===== Models =====

router.get('/', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await getAdminModelList();
    success(res, rows.map((r: any) => ({
      id: r.id, name: r.name, displayName: r.display_name, modelType: r.model_type,
      upstreamModelCode: r.upstream_model_code || '', apiModelName: r.api_model_name, modelCode: r.api_model_name,
      providerId: r.provider_id, providerName: r.provider_name, providerType: r.provider_type, protocolType: r.provider_type,
      pointsCost: r.points_cost, isDefault: !!r.is_default, isAsync: !!r.is_async,
      isRecommended: !!r.is_recommended, membershipOnly: !!r.membership_only,
      sortOrder: r.sort_order, status: r.status, createdAt: r.created_at,
    })));
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取模型列表失败'); }
});



// PUT /models/:id — update model fields
router.put('/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { displayName, apiModelName, modelCode, pointsCost, isDefault, isRecommended, membershipOnly, sortOrder, status, upstreamModelCode, isAsync, dailyLimit, dailyLimitPerUser, iconFileId, description, isFallback } = req.body;
    const sets: string[] = []; const vals: any[] = [];
    if (displayName !== undefined) { sets.push('display_name = ?'); vals.push(displayName); }
    if (apiModelName !== undefined || modelCode !== undefined) { sets.push('api_model_name = ?'); vals.push(apiModelName !== undefined ? apiModelName : modelCode); }
    if (pointsCost !== undefined) { sets.push('points_cost = ?'); vals.push(pointsCost); }
    if (isDefault !== undefined) { sets.push('is_default = ?'); vals.push(isDefault ? 1 : 0); }
    if (isRecommended !== undefined) { sets.push('is_recommended = ?'); vals.push(isRecommended ? 1 : 0); }
    if (membershipOnly !== undefined) { sets.push('membership_only = ?'); vals.push(membershipOnly ? 1 : 0); }
    if (sortOrder !== undefined) { sets.push('sort_order = ?'); vals.push(sortOrder); }
    if (status) { sets.push('status = ?'); vals.push(status); }
    if (upstreamModelCode !== undefined) { sets.push('upstream_model_code = ?'); vals.push(upstreamModelCode); }
    if (iconFileId !== undefined) { sets.push('icon_file_id = ?'); vals.push(iconFileId || null); }
    if (description !== undefined) { sets.push('description = ?'); vals.push(description); }
    if (isFallback !== undefined) { sets.push('is_fallback = ?'); vals.push(isFallback ? 1 : 0); }
    if (isAsync !== undefined) { sets.push('is_async = ?'); vals.push(isAsync ? 1 : 0); }
    if (dailyLimit !== undefined) { sets.push('daily_limit = ?'); vals.push(dailyLimit); }
    if (dailyLimitPerUser !== undefined) { sets.push('daily_limit_per_user = ?'); vals.push(dailyLimitPerUser); }
    if (sets.length === 0) { error(res, ErrorCodes.PARAM_ERROR, '没有可更新的模型字段'); return; }
    vals.push(id);
    await query('UPDATE ai_models SET ' + sets.join(', ') + ' WHERE id = ?', vals);
    success(res, { updated: true });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '更新模型失败'); }
});

router.delete('/:id(\\d+)', adminAuthMiddleware, async (req: Request, res: Response) => {
  const conn = await getConnection();
  try {
    const modelId = parseInt(req.params.id, 10);
    await conn.beginTransaction();
    const [bindingResult] = await conn.execute('DELETE FROM tier_model_bindings WHERE model_id = ?', [modelId]) as any;
    const [fallbackResult] = await conn.execute('DELETE FROM ai_model_fallback_rules WHERE model_id = ? OR fallback_model_id = ?', [modelId, modelId]) as any;
    const [result] = await conn.execute('UPDATE ai_models SET deleted_at = NOW(3), updated_at = NOW(3) WHERE id = ? AND deleted_at IS NULL', [modelId]) as any;
    if (!Number(result?.affectedRows || 0)) {
      await conn.rollback();
      error(res, ErrorCodes.NOT_FOUND, '模型不存在', 404);
      return;
    }
    await conn.commit();
    success(res, {
      deleted: true,
      bindingDeleted: Number(bindingResult?.affectedRows || 0),
      fallbackDeleted: Number(fallbackResult?.affectedRows || 0),
    });
  } catch {
    await conn.rollback();
    error(res, ErrorCodes.SERVER_ERROR, '删除模型失败');
  } finally {
    conn.release();
  }
});

// ===== Capabilities =====

router.get('/:id(\\d+)/capabilities', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await query<any>('SELECT id, capability_key, is_supported, config FROM ai_model_capabilities WHERE model_id = ?', [parseInt(req.params.id)]);
    success(res, rows.map((r: any) => ({ id: r.id, key: normalizeCapabilityKey(r.capability_key), supported: !!r.is_supported, config: typeof r.config === 'string' ? JSON.parse(r.config) : r.config })));
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取模型能力失败'); }
});

router.post('/:id(\\d+)/capabilities', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { capabilities } = req.body;
    if (!Array.isArray(capabilities)) { error(res, ErrorCodes.PARAM_ERROR, '模型能力配置必须是数组'); return; }
    const modelId = parseInt(req.params.id);
    await query('DELETE FROM ai_model_capabilities WHERE model_id = ?', [modelId]);
    for (const cap of capabilities) {
      await query('INSERT INTO ai_model_capabilities (model_id, capability_key, is_supported, config) VALUES (?, ?, ?, ?)',
        [modelId, normalizeCapabilityKey(cap.key), cap.supported ? 1 : 0, JSON.stringify(cap.config || {})]);
    }
    success(res, { updated: true });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '保存模型能力失败'); }
});

// ===== Price Rules =====

router.get('/:id(\\d+)/prices', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await query<any>('SELECT * FROM ai_model_price_rules WHERE model_id = ?', [parseInt(req.params.id)]);
    success(res, rows);
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取模型价格规则失败'); }
});

router.post('/:id(\\d+)/prices', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { rule_name, base_points, free_points, monthly_points, yearly_points, business_monthly_points, business_yearly_points, api_cost_cents, api_currency, duration_surcharge, resolution_surcharge, image_count_surcharge } = req.body;
    const [r] = await query<any>('INSERT INTO ai_model_price_rules (model_id, rule_name, base_points, free_points, monthly_points, yearly_points, business_monthly_points, business_yearly_points, api_cost_cents, api_currency, duration_surcharge, resolution_surcharge, image_count_surcharge) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [parseInt(req.params.id), rule_name || '', base_points || 1, free_points || 2, monthly_points || 2, yearly_points || 1, business_monthly_points || 1, business_yearly_points || 1, api_cost_cents || 0, api_currency || 'USD', JSON.stringify(duration_surcharge || {}), JSON.stringify(resolution_surcharge || {}), JSON.stringify(image_count_surcharge || {})]);
    success(res, { id: (r as any).insertId });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '创建模型价格规则失败'); }
});

// ===== Fallback Rules =====

router.get('/:id(\\d+)/fallbacks', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const rows = await query<any>('SELECT f.*, m.display_name as fallback_name FROM ai_model_fallback_rules f JOIN ai_models m ON m.id = f.fallback_model_id WHERE f.model_id = ?', [parseInt(req.params.id)]);
    success(res, rows);
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取模型兜底规则失败'); }
});

router.post('/:id(\\d+)/fallbacks', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { fallback_model_id, trigger_on_error, trigger_on_timeout, trigger_on_rate_limit, keep_original_price, priority } = req.body;
    await query('INSERT INTO ai_model_fallback_rules (model_id, fallback_model_id, trigger_on_error, trigger_on_timeout, trigger_on_rate_limit, keep_original_price, priority) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE trigger_on_error = ?, trigger_on_timeout = ?, trigger_on_rate_limit = ?, keep_original_price = ?, priority = ?',
      [parseInt(req.params.id), fallback_model_id, trigger_on_error ? 1 : 0, trigger_on_timeout ? 1 : 0, trigger_on_rate_limit ? 1 : 0, keep_original_price ? 1 : 0, priority || 0, trigger_on_error ? 1 : 0, trigger_on_timeout ? 1 : 0, trigger_on_rate_limit ? 1 : 0, keep_original_price ? 1 : 0, priority || 0]);
    success(res, { updated: true });
  } catch { error(res, ErrorCodes.SERVER_ERROR, '保存模型兜底规则失败'); }
});

router.get('/cost-summary', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const range = String(req.query.range || 'month');
    const now = new Date();
    let since = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    if (range === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); since = d.toISOString().slice(0, 10); }
    else if (range === 'today') since = now.toISOString().slice(0, 10);
    else if (range === 'all') since = '2020-01-01';

    const rows = await query<any>(
      `SELECT m.name AS modelName, p.name AS providerName,
              cl.model_id, cl.provider_id,
              COUNT(*) AS callCount,
              SUM(cl.api_cost_cents) AS totalCostCents,
              COALESCE(SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END), 0) AS successCount,
              COALESCE(SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END), 0) AS failCount,
              COALESCE(SUM(t.points_cost), 0) AS totalPoints
         FROM ai_task_cost_logs cl
         JOIN ai_models m ON m.id = cl.model_id
         JOIN ai_model_providers p ON p.id = cl.provider_id
         JOIN ai_tasks t ON t.id = cl.task_id
        WHERE cl.created_at >= ?
        GROUP BY cl.model_id, cl.provider_id
        ORDER BY callCount DESC`,
      [since],
    );
    success(res, rows.map((r: any) => {
      const total = Number(r.callCount || 0);
      const success = Number(r.successCount || 0);
      return {
        modelName: r.modelName,
        providerName: r.providerName,
        callCount: total,
        successCount: success,
        failCount: Number(r.failCount || 0),
        successRate: total > 0 ? Math.round((success / total) * 1000) / 10 : 0,
        totalCostYuan: Number(r.totalCostCents || 0) / 100,
        totalPoints: Number(r.totalPoints || 0),
      };
    }));
  } catch { error(res, ErrorCodes.SERVER_ERROR, '获取成本统计失败'); }
});

export default router;

function buildProviderHealthUrl(baseUrl: string, providerType?: string): string {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (providerType === 'xiaoma') {
    return base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
  }
  return `${base}/models`;
}

function maskApiKeyForAdmin(encryptedValue?: string): string {
  if (!encryptedValue) return '';
  try {
    const plain = decryptApiKey(encryptedValue);
    if (!plain) return 'sk-****';
    if (plain.length <= 8) return '****';
    return `${plain.slice(0, 3)}****${plain.slice(-4)}`;
  } catch {
    return 'sk-****';
  }
}

function isMaskedApiKeyPlaceholder(value: string): boolean {
  const trimmed = String(value || '').trim();
  return trimmed === 'sk-****' || /\*{3,}/.test(trimmed);
}
