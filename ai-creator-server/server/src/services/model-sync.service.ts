import axios from 'axios';
import { getConnection, query } from '../utils/db';
import {
  XIAOMA_AUDIO_PARAM_NAMES,
  XIAOMA_IMAGE_PARAM_NAMES,
  XIAOMA_VIDEO_PARAM_NAMES,
} from './xiaoma-media-parameters';

export type SyncMode = 'preview' | 'apply';

export interface ProviderForModelSync {
  id: number;
  name: string;
  provider_key?: string;
  provider_type?: string;
  api_base_url?: string;
}

export interface RemoteProviderModel {
  id: string;
  name: string;
  type?: string;
  config?: Record<string, any>;
  raw?: Record<string, any>;
}

interface ExistingModelRow {
  id: number;
  provider_id?: number;
  name: string;
  display_name?: string;
  model_type: string;
  api_model_name: string;
  upstream_model_code?: string;
  query_task_url?: string;
  config?: any;
  points_cost?: number;
  api_cost_cents?: number;
  status?: string;
}

interface NormalizedRemoteModel {
  id: string;
  name: string;
  modelType: string;
  queryTaskUrl: string;
  config: Record<string, any>;
  pointsCost: number;
  apiCostCents: number;
}

export interface ModelSyncFieldChange {
  key: 'model_type' | 'query_task_url' | 'config' | 'api_cost_cents';
  label: string;
  before: any;
  after: any;
}

export interface ModelSyncAddition {
  apiModelName: string;
  name: string;
  modelType: string;
  queryTaskUrl: string;
  config: Record<string, any>;
  pointsCost: number;
  apiCostCents: number;
}

export interface ModelSyncUpdate {
  modelId: number;
  apiModelName: string;
  name: string;
  before: {
    modelType: string;
    queryTaskUrl: string;
    config: Record<string, any>;
    apiCostCents: number;
  };
  after: {
    modelType: string;
    queryTaskUrl: string;
    config: Record<string, any>;
    apiCostCents: number;
  };
  fields: ModelSyncFieldChange[];
}

export interface ModelSyncRemoval {
  modelId: number;
  apiModelName: string;
  name: string;
  modelType: string;
  status?: string;
  config?: Record<string, any>;
  bindingCount: number;
  fallbackCount: number;
  affectedTiers: Array<{
    tierId?: number;
    tierKey?: string;
    tierName?: string;
    featureKey?: string;
    featureName?: string;
  }>;
}

export interface ModelSyncPreview {
  providerId: number;
  providerName: string;
  totalRemote: number;
  additions: ModelSyncAddition[];
  updates: ModelSyncUpdate[];
  removals: ModelSyncRemoval[];
  skipped: Array<{ apiModelName: string; name: string }>;
  failures: Array<{ scope: string; message: string }>;
}

export interface ModelSyncResult extends ModelSyncPreview {
  mode: SyncMode;
  applied: boolean;
  added: number;
  updated: number;
  removed: number;
  bindingDeleted: number;
  fallbackDeleted: number;
  skippedCount: number;
  message: string;
}

const MEDIA_QUERY_TASK_URL = '/v1/skills/task-status?task_id={task_id}';
const MODEL_TYPES = new Set(['image', 'video', 'audio', 'text']);
const MANAGED_CONFIG_KEYS = [
  'sync_source',
  'sync_provider_type',
  'capabilities',
  'param_names',
  'default_params',
  'supported_ratios',
  'supported_qualities',
  'supported_durations',
  'supported_audio_modes',
  'supported_size_modes',
  'native_sizes',
  'size_options',
  'resolution_presets',
  'max_images',
  'input_mode',
  'reference_upload_mode',
  'min_reference_images',
  'max_reference_images',
  'max_audio_urls',
  'max_video_urls',
  'max_duration_seconds',
  'required_reference',
  'default_audio_mode',
  'endpoints',
  'api_format',
  'billing',
  'remote_parameters',
  'remote_status',
  'upstream_removed_at',
];

export function generateHongniaoSeedMigration(input: {
  models: RemoteProviderModel[];
  checkedAt?: string;
  migrationName?: string;
}): string {
  const checkedAt = input.checkedAt || new Date().toISOString().slice(0, 10);
  const rows = input.models
    .map((remote, index) => normalizeRemoteModel(remote) ? { remote, normalized: normalizeRemoteModel(remote)!, index } : null)
    .filter((item): item is { remote: RemoteProviderModel; normalized: NormalizedRemoteModel; index: number } => Boolean(item));

  const values = rows.map(({ normalized, index }) => {
    const modelType = normalized.modelType;
    const sortOrder = modelType === 'image' ? 9600 + index : 8800 + index;
    const subType = modelType === 'video'
      ? inferHongniaoSubType(normalized.config)
      : modelType === 'image'
        ? 'text2img'
        : '';
    const pricing = deriveModelPricingFromConfig(normalized.config);
    return [
      sqlString(normalized.id),
      sqlString(`Hongniao-${normalized.id}`),
      sqlString(`Hongniao ${normalized.name}`),
      sqlString(modelType),
      sqlString(subType),
      sqlString(normalized.queryTaskUrl),
      String(pricing.pointsCost),
      String(pricing.apiCostCents),
      String(sortOrder),
      sqlString(stableStringify(normalized.config)),
      sqlString(`Hongniao model refreshed from /v1/models on ${checkedAt}.`),
    ].join(', ');
  });

  return [
    `-- ${input.migrationName || 'Refresh Hongniao models from live /v1/models response.'}`,
    `-- Source checked on ${checkedAt}. Model count: ${rows.length}.`,
    '-- This migration never stores plaintext API keys.',
    '',
    "SET @hongniao_exists := (SELECT COUNT(*) FROM ai_model_providers WHERE provider_key = 'hongniao' AND deleted_at IS NULL);",
    '',
    'INSERT INTO ai_model_providers',
    '  (name, provider_key, provider_type, api_base_url, api_key, default_timeout, default_retry, auth_type, protocol_type, remark, status, created_at, updated_at)',
    "SELECT 'Hongniao AI', 'hongniao', 'hongniao', 'https://open.hongniaoai.com/v1', '', 600, 2, 'api_key', 'rest',",
    "       'Hongniao async image/video API. Uses X-API-Key. Configure API Key in admin or HONGNIAO_API_KEY.',",
    "       'active', NOW(3), NOW(3)",
    ' WHERE @hongniao_exists = 0;',
    '',
    'UPDATE ai_model_providers',
    "   SET name = 'Hongniao AI',",
    "       provider_type = 'hongniao',",
    "       api_base_url = 'https://open.hongniaoai.com/v1',",
    "       auth_type = 'api_key',",
    "       protocol_type = 'rest',",
    '       default_timeout = GREATEST(COALESCE(default_timeout, 0), 600),',
    '       default_retry = IF(default_retry IS NULL OR default_retry = 0, 2, default_retry),',
    "       remark = 'Hongniao async image/video API. Uses X-API-Key. Configure API Key in admin or HONGNIAO_API_KEY.',",
    "       status = IF(status IS NULL OR status = '', 'active', status),",
    '       updated_at = NOW(3)',
    " WHERE provider_key = 'hongniao' AND deleted_at IS NULL;",
    '',
    "SET @hongniao_id := (SELECT id FROM ai_model_providers WHERE provider_key = 'hongniao' AND deleted_at IS NULL LIMIT 1);",
    '',
    'DROP TEMPORARY TABLE IF EXISTS tmp_hongniao_models_refresh;',
    'CREATE TEMPORARY TABLE tmp_hongniao_models_refresh (',
    '  api_model_name VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL PRIMARY KEY,',
    '  name VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,',
    '  display_name VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,',
    '  model_type VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,',
    '  sub_type VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,',
    '  query_task_url VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,',
    '  points_cost INT NOT NULL,',
    '  api_cost_cents INT NOT NULL,',
    '  sort_order INT NOT NULL,',
    '  config_json JSON NOT NULL,',
    '  remark VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
    '',
    'INSERT INTO tmp_hongniao_models_refresh',
    '  (api_model_name, name, display_name, model_type, sub_type, query_task_url, points_cost, api_cost_cents, sort_order, config_json, remark)',
    values.length ? `VALUES\n  (${values.join('),\n  (')});` : 'SELECT NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL WHERE 0;',
    '',
    '-- Update current Hongniao models in place first so existing tier bindings keep their model IDs.',
    'UPDATE ai_models m',
    'JOIN tmp_hongniao_models_refresh x',
    '  ON m.provider_id = @hongniao_id',
    ' AND m.api_model_name COLLATE utf8mb4_unicode_ci = x.api_model_name COLLATE utf8mb4_unicode_ci',
    '   SET m.name = x.name,',
    '       m.display_name = x.display_name,',
    '       m.model_type = x.model_type,',
    '       m.sub_type = x.sub_type,',
    '       m.upstream_model_code = x.api_model_name,',
    '       m.is_async = 1,',
    '       m.query_task_url = x.query_task_url,',
    '       m.request_template = JSON_OBJECT(),',
    "       m.result_path = '',",
    "       m.status_mapping = JSON_OBJECT('queued','queued','pending','processing','processing','processing','completed','completed','success','completed','failed','failed'),",
    '       m.error_mapping = JSON_OBJECT(),',
    '       m.timeout_seconds = 600,',
    '       m.retry_times = 2,',
    '       m.retry_delay_ms = 5000,',
    '       m.daily_limit = 0,',
    '       m.daily_limit_per_user = 0,',
    '       m.max_concurrency = 2,',
    '       m.priority = 0,',
    '       m.points_cost = x.points_cost,',
    '       m.api_cost_cents = x.api_cost_cents,',
    '       m.sort_order = x.sort_order,',
    '       m.config = x.config_json,',
    '       m.remark = x.remark,',
    "       m.status = 'active',",
    '       m.updated_at = NOW(3)',
    ' WHERE m.deleted_at IS NULL;',
    '',
    'INSERT INTO ai_models',
    '  (provider_id, name, display_name, model_type, sub_type, api_model_name, upstream_model_code, is_async,',
    '   query_task_url, request_template, result_path, status_mapping, error_mapping,',
    '   timeout_seconds, retry_times, retry_delay_ms, daily_limit, daily_limit_per_user,',
    '   max_concurrency, priority, points_cost, api_cost_cents, sort_order, config, remark, status, created_at, updated_at)',
    "SELECT @hongniao_id, x.name, x.display_name, x.model_type, x.sub_type, x.api_model_name, x.api_model_name, 1,",
    "       x.query_task_url, JSON_OBJECT(), '',",
    "       JSON_OBJECT('queued','queued','pending','processing','processing','processing','completed','completed','success','completed','failed','failed'),",
    '       JSON_OBJECT(), 600, 2, 5000, 0, 0, 2, 0, x.points_cost, x.api_cost_cents, x.sort_order, x.config_json, x.remark,',
    "       'active', NOW(3), NOW(3)",
    '  FROM tmp_hongniao_models_refresh x',
    ' WHERE @hongniao_id IS NOT NULL',
    '   AND NOT EXISTS (',
    '         SELECT 1',
    '           FROM ai_models m',
    '          WHERE m.provider_id = @hongniao_id',
    '            AND m.api_model_name COLLATE utf8mb4_unicode_ci = x.api_model_name COLLATE utf8mb4_unicode_ci',
    '            AND m.deleted_at IS NULL',
    '       );',
    '',
    '-- Soft-delete only Hongniao models that are no longer present in the upstream model list.',
    'UPDATE ai_models m',
    'LEFT JOIN tmp_hongniao_models_refresh x',
    '  ON m.api_model_name COLLATE utf8mb4_unicode_ci = x.api_model_name COLLATE utf8mb4_unicode_ci',
    '   SET m.deleted_at = NOW(3),',
    "       m.status = 'inactive',",
    '       m.updated_at = NOW(3)',
    ' WHERE m.provider_id = @hongniao_id',
    '   AND m.deleted_at IS NULL',
    '   AND x.api_model_name IS NULL;',
    '',
    '-- Remove bindings that still point to obsolete Hongniao models after the refresh.',
    'DELETE b',
    '  FROM tier_model_bindings b',
    '  JOIN ai_models m ON m.id = b.model_id',
    ' WHERE m.provider_id = @hongniao_id',
    '   AND m.deleted_at IS NOT NULL;',
    '',
    '-- Refresh public/admin capability fields for tiers already bound to active Hongniao primary models.',
    'INSERT INTO tier_capabilities',
    '  (tier_id, supported_ratios, supported_qualities, supported_durations, supported_audio_modes, default_audio_mode,',
    '   supported_size_modes, native_sizes, default_ratio, allow_postprocess, postprocess_modes, max_images, max_reference_images,',
    '   input_mode, reference_upload_mode, min_reference_images, required_reference, max_duration_seconds)',
    'SELECT b.tier_id,',
    "       COALESCE(JSON_EXTRACT(m.config, '$.supported_ratios'), JSON_ARRAY()),",
    "       COALESCE(JSON_EXTRACT(m.config, '$.supported_qualities'), JSON_ARRAY()),",
    "       COALESCE(JSON_EXTRACT(m.config, '$.supported_durations'), JSON_ARRAY()),",
    "       COALESCE(JSON_EXTRACT(m.config, '$.supported_audio_modes'), JSON_ARRAY()),",
    "       'silent',",
    "       COALESCE(JSON_EXTRACT(m.config, '$.supported_size_modes'), IF(m.model_type = 'image', JSON_ARRAY('auto','ratio'), JSON_ARRAY('ratio'))),",
    '       JSON_ARRAY(),',
    "       COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(m.config, '$.default_params.aspectRatio')), ''),",
    "                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(m.config, '$.supported_ratios[0]')), ''),",
    "                IF(m.model_type = 'image', '1:1', '16:9')),",
    '       IF(m.model_type = \'image\', 1, 0),',
    '       IF(m.model_type = \'image\', JSON_ARRAY(\'cover\',\'contain\',\'resize\'), JSON_ARRAY()),',
    "       COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(m.config, '$.max_images')) AS UNSIGNED),",
    "                CAST(JSON_UNQUOTE(JSON_EXTRACT(m.config, '$.max_reference_images')) AS UNSIGNED), 1),",
    "       COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(m.config, '$.max_reference_images')) AS UNSIGNED), 1),",
    "       NULLIF(JSON_UNQUOTE(JSON_EXTRACT(m.config, '$.input_mode')), ''),",
    "       NULLIF(JSON_UNQUOTE(JSON_EXTRACT(m.config, '$.reference_upload_mode')), ''),",
    "       COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(m.config, '$.min_reference_images')) AS UNSIGNED), 0),",
    "       IF(COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(m.config, '$.min_reference_images')) AS UNSIGNED), 0) > 0, 1, 0),",
    "       COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(m.config, '$.default_params.seconds')) AS UNSIGNED), 30)",
    '  FROM tier_model_bindings b',
    '  JOIN ai_models m ON m.id = b.model_id',
    " WHERE b.binding_type = 'primary'",
    '   AND m.provider_id = @hongniao_id',
    '   AND m.deleted_at IS NULL',
    'ON DUPLICATE KEY UPDATE',
    '  supported_ratios = VALUES(supported_ratios),',
    '  supported_qualities = VALUES(supported_qualities),',
    '  supported_durations = VALUES(supported_durations),',
    '  supported_audio_modes = VALUES(supported_audio_modes),',
    '  default_audio_mode = VALUES(default_audio_mode),',
    '  supported_size_modes = VALUES(supported_size_modes),',
    '  native_sizes = VALUES(native_sizes),',
    '  default_ratio = VALUES(default_ratio),',
    '  allow_postprocess = VALUES(allow_postprocess),',
    '  postprocess_modes = VALUES(postprocess_modes),',
    '  max_images = VALUES(max_images),',
    '  max_reference_images = VALUES(max_reference_images),',
    '  input_mode = VALUES(input_mode),',
    '  reference_upload_mode = VALUES(reference_upload_mode),',
    '  min_reference_images = VALUES(min_reference_images),',
    '  required_reference = VALUES(required_reference),',
    '  max_duration_seconds = VALUES(max_duration_seconds),',
    '  updated_at = NOW(3);',
    '',
    'DROP TEMPORARY TABLE IF EXISTS tmp_hongniao_models_refresh;',
    '',
  ].join('\n');
}

export async function syncProviderModels(options: {
  provider: ProviderForModelSync;
  apiKey: string;
  mode: SyncMode;
}): Promise<ModelSyncResult> {
  const existingRows = await query<ExistingModelRow>(
    'SELECT id, provider_id, name, display_name, model_type, api_model_name, upstream_model_code, query_task_url, config, points_cost, api_cost_cents, status FROM ai_models WHERE provider_id = ? AND deleted_at IS NULL',
    [options.provider.id],
  );
  const remote = await fetchRemoteModels(
    options.provider,
    options.apiKey,
    existingRows.map((item) => ({
      id: item.api_model_name,
      name: item.display_name || item.name || item.api_model_name,
      type: item.model_type,
    })),
  );
  const preview = buildModelSyncPreview({
    providerId: options.provider.id,
    providerName: options.provider.name,
    existingRows,
    remoteModels: remote.models,
    failures: remote.failures,
    removalPolicy: isHongniaoProvider(options.provider) ? 'soft' : 'none',
  });
  await hydrateRemovalImpacts(preview);

  let applied = false;
  let added = 0;
  let updated = 0;
  let removed = 0;
  let bindingDeleted = 0;
  let fallbackDeleted = 0;
  if (options.mode === 'apply') {
    const appliedCounts = await applyModelSyncPreview(options.provider.id, preview);
    applied = true;
    added = appliedCounts.added;
    updated = appliedCounts.updated;
    removed = appliedCounts.removed;
    bindingDeleted = appliedCounts.bindingDeleted;
    fallbackDeleted = appliedCounts.fallbackDeleted;
  }

  return {
    ...preview,
    mode: options.mode,
    applied,
    added,
    updated,
    removed,
    bindingDeleted,
    fallbackDeleted,
    skippedCount: preview.skipped.length,
    message: buildSyncMessage(options.mode, preview, added, updated, removed),
  };
}

export async function fetchRemoteModels(
  provider: ProviderForModelSync,
  apiKey: string,
  additionalModels: Array<Pick<RemoteProviderModel, 'id' | 'name' | 'type'>> = [],
): Promise<{
  models: RemoteProviderModel[];
  failures: Array<{ scope: string; message: string }>;
}> {
  const baseUrl = String(provider.api_base_url || '').replace(/\/v1\/?$/i, '').replace(/\/+$/, '');
  const providerType = String(provider.provider_type || '').toLowerCase();
  const providerKey = String(provider.provider_key || '').toLowerCase();
  const failures: Array<{ scope: string; message: string }> = [];
  let models: RemoteProviderModel[] = [];

  if (providerType === 'bagege' || providerKey === 'bagege') {
    const resp = await axios.get(`${baseUrl}/v1/frontstage/model-config`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 15000,
    });
    const names = resp.data?.displayNames || {};
    models = Object.entries(names).map(([id, name]) => ({ id, name: String(name) }));
  } else if (providerType === 'xiaoma' || providerKey === 'xiaoma') {
    const fetchDetailedModel = async (
      item: Record<string, any>,
      mediaType: string,
      requireDetail: boolean,
    ): Promise<RemoteProviderModel | null> => {
      const mid = cleanString(item.id || item.model || item.model_id || item.name);
      if (!mid) return null;
      let raw = item;
      try {
        const detailResp = await axios.get(`${baseUrl}/v1/skills/models/${encodeURIComponent(mid)}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 15000,
        });
        const detail = detailResp.data?.data || detailResp.data;
        if (detail && typeof detail === 'object' && !Array.isArray(detail)) raw = { ...item, ...detail };
      } catch (err: any) {
        failures.push({
          scope: `xiaoma:${requireDetail ? 'existing:' : ''}${mediaType}:${mid}`,
          message: String(err?.message || 'detail fetch failed').slice(0, 200),
        });
        if (requireDetail) return null;
      }
      const display = cleanString(raw.display_name || raw.displayName || raw.title || raw.name || item.name || mid);
      return {
        id: mid,
        name: display || mid,
        type: mediaType,
        config: buildMediaModelConfig(mediaType, raw, providerType || providerKey),
        raw,
      };
    };

    for (const mediaType of ['image', 'video', 'audio']) {
      try {
        const resp = await axios.get(`${baseUrl}/v1/skills/models?type=${mediaType}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 15000,
        });
        const list = normalizeRemoteList(resp.data);
        const detailedModels = await mapWithConcurrency(list, 6, (item) => fetchDetailedModel(item, mediaType, false));
        models.push(...detailedModels.filter((item): item is NonNullable<typeof item> => item !== null));
      } catch (err: any) {
        failures.push({ scope: `xiaoma:${mediaType}`, message: String(err?.message || 'fetch failed').slice(0, 200) });
      }
    }

    const listedIds = new Set(models.map((item) => item.id));
    const existingMediaModels = additionalModels.filter((item) => (
      item.id
      && ['image', 'video', 'audio'].includes(String(item.type || '').toLowerCase())
      && !listedIds.has(String(item.id))
    ));
    const legacyDetails = await mapWithConcurrency(existingMediaModels, 6, (item) => (
      fetchDetailedModel(item as Record<string, any>, String(item.type || '').toLowerCase(), true)
    ));
    models.push(...legacyDetails.filter((item): item is NonNullable<typeof item> => item !== null));
  } else if (providerType === 'hongniao' || providerKey === 'hongniao') {
    const resp = await axios.get(`${baseUrl}/v1/models`, {
      headers: { 'X-API-Key': apiKey },
      timeout: 15000,
      validateStatus: (status) => status < 500,
    });
    const data = unwrapHongniaoBody(resp.data);
    if (data?.error) throw new Error(data.error.message || 'Provider API returned an error');
    if (data?.code !== undefined && !['0', '200', 'success'].includes(String(data.code).toLowerCase())) {
      throw new Error(data.message || data.msg || 'Provider API returned an error');
    }
    models = normalizeHongniaoModelList(data.models || data.data?.models || data.data)
      .filter((item: any) => item?.id && item.id !== 'unknown')
      .map((item: any) => {
        const id = String(item.id);
        const modelType = normalizeHongniaoModelType(item.type, id);
        return {
          id,
          name: String(item.name || item.display_name || item.displayName || id),
          type: modelType,
          config: buildHongniaoModelConfig(modelType, item),
          raw: item,
        };
      });
  } else {
    const resp = await axios.get(`${baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 15000,
      validateStatus: (status) => status < 500,
    });
    if (resp.data?.error) throw new Error(resp.data.error.message || 'Provider API returned an error');
    const data = resp.data?.data || [];
    models = data
      .filter((item: any) => item?.id && item.id !== 'unknown')
      .map((item: any) => ({ id: String(item.id), name: String(item.id), raw: item }));
  }

  const unique = new Map<string, RemoteProviderModel>();
  for (const model of models) {
    if (!model.id || unique.has(model.id)) continue;
    unique.set(model.id, model);
  }
  return { models: [...unique.values()], failures };
}

export function buildModelSyncPreview(input: {
  providerId: number;
  providerName: string;
  existingRows: ExistingModelRow[];
  remoteModels: RemoteProviderModel[];
  failures?: Array<{ scope: string; message: string }>;
  removalPolicy?: 'none' | 'soft';
}): ModelSyncPreview {
  const existingByApiName = new Map(input.existingRows.map((row) => [String(row.api_model_name || ''), row]));
  const remoteApiNames = new Set<string>();
  const additions: ModelSyncAddition[] = [];
  const updates: ModelSyncUpdate[] = [];
  const removals: ModelSyncRemoval[] = [];
  const skipped: Array<{ apiModelName: string; name: string }> = [];

  for (const remote of input.remoteModels) {
    const normalized = normalizeRemoteModel(remote);
    if (!normalized) continue;
    remoteApiNames.add(normalized.id);
    const existing = existingByApiName.get(normalized.id);
    if (!existing) {
      additions.push({
        apiModelName: normalized.id,
        name: normalized.name,
        modelType: normalized.modelType,
        queryTaskUrl: normalized.queryTaskUrl,
        config: normalized.config,
        pointsCost: normalized.pointsCost,
        apiCostCents: normalized.apiCostCents,
      });
      continue;
    }

    const beforeConfig = parseJsonObject(existing.config);
    const afterConfig = mergeManagedConfig(beforeConfig, normalized.config);
    const before = {
      modelType: String(existing.model_type || 'unknown'),
      queryTaskUrl: String(existing.query_task_url || ''),
      config: beforeConfig,
      apiCostCents: Number(existing.api_cost_cents || 0),
    };
    const after = {
      modelType: normalized.modelType,
      queryTaskUrl: normalized.queryTaskUrl,
      config: afterConfig,
      apiCostCents: normalized.apiCostCents,
    };
    const fields = diffManagedFields(before, after);
    if (fields.length) {
      updates.push({
        modelId: Number(existing.id),
        apiModelName: normalized.id,
        name: String(existing.display_name || existing.name || normalized.name),
        before,
        after,
        fields,
      });
    } else {
      skipped.push({ apiModelName: normalized.id, name: String(existing.display_name || existing.name || normalized.name) });
    }
  }

  if (input.removalPolicy !== 'none') {
    for (const row of input.existingRows) {
      const apiModelName = String(row.api_model_name || '');
      if (!apiModelName || remoteApiNames.has(apiModelName)) continue;
      removals.push({
        modelId: Number(row.id),
        apiModelName,
        name: String(row.display_name || row.name || apiModelName),
        modelType: String(row.model_type || 'unknown'),
        status: row.status,
        config: parseJsonObject(row.config),
        bindingCount: 0,
        fallbackCount: 0,
        affectedTiers: [],
      });
    }
  }

  return {
    providerId: input.providerId,
    providerName: input.providerName,
    totalRemote: input.remoteModels.length,
    additions,
    updates,
    removals,
    skipped,
    failures: input.failures || [],
  };
}

export function buildExistingModelUpdatePatch(update: ModelSyncUpdate): Record<string, any> {
  const patch: Record<string, any> = {};
  for (const field of update.fields) {
    if (field.key === 'model_type') patch.model_type = update.after.modelType;
    if (field.key === 'query_task_url') patch.query_task_url = update.after.queryTaskUrl;
    if (field.key === 'config') patch.config = stableStringify(update.after.config);
    if (field.key === 'api_cost_cents') patch.api_cost_cents = update.after.apiCostCents;
  }
  return patch;
}

export async function applyModelSyncPreview(providerId: number, preview: ModelSyncPreview): Promise<{
  added: number;
  updated: number;
  removed: number;
  bindingDeleted: number;
  fallbackDeleted: number;
}> {
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    let added = 0;
    let updated = 0;
    let removed = 0;
    let bindingDeleted = 0;
    let fallbackDeleted = 0;

    for (const item of preview.additions) {
      const [result] = await conn.execute(
        `INSERT IGNORE INTO ai_models
         (provider_id, name, display_name, model_type, sub_type, api_model_name, upstream_model_code, is_async, query_task_url, request_template, timeout_seconds, retry_times, retry_delay_ms, daily_limit, daily_limit_per_user, max_concurrency, priority, points_cost, api_cost_cents, sort_order, config, remark, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, '', ?, ?, 1, ?, '{}', 300, 3, 3000, 0, 0, 5, 0, ?, ?, 999, ?, 'auto-synced', 'active', NOW(3), NOW(3))`,
        [
          providerId,
          item.name,
          item.name,
          item.modelType,
          item.apiModelName,
          item.apiModelName,
          item.queryTaskUrl,
          item.pointsCost,
          item.apiCostCents,
          stableStringify(item.config),
        ],
      ) as any;
      added += Number(result?.affectedRows || 0);
    }

    for (const item of preview.updates) {
      const patch = buildExistingModelUpdatePatch(item);
      const sets: string[] = [];
      const values: any[] = [];
      if (Object.hasOwn(patch, 'model_type')) {
        sets.push('model_type = ?');
        values.push(patch.model_type);
      }
      if (Object.hasOwn(patch, 'query_task_url')) {
        sets.push('query_task_url = ?');
        values.push(patch.query_task_url);
      }
      if (Object.hasOwn(patch, 'config')) {
        sets.push('config = ?');
        values.push(patch.config);
      }
      if (Object.hasOwn(patch, 'api_cost_cents')) {
        sets.push('api_cost_cents = ?');
        values.push(patch.api_cost_cents);
      }
      if (!sets.length) continue;
      values.push(item.modelId, providerId);
      const [result] = await conn.execute(
        `UPDATE ai_models SET ${sets.join(', ')}, updated_at = NOW(3) WHERE id = ? AND provider_id = ? AND deleted_at IS NULL`,
        values,
      ) as any;
      updated += Number(result?.affectedRows || 0);
    }

    const removalIds = preview.removals.map((item) => Number(item.modelId)).filter(Boolean);
    if (removalIds.length) {
      const placeholders = removalIds.map(() => '?').join(',');
      const [bindingResult] = await conn.execute(
        `DELETE FROM tier_model_bindings WHERE model_id IN (${placeholders})`,
        removalIds,
      ) as any;
      bindingDeleted = Number(bindingResult?.affectedRows || 0);

      const [fallbackResult] = await conn.execute(
        `DELETE FROM ai_model_fallback_rules WHERE model_id IN (${placeholders}) OR fallback_model_id IN (${placeholders})`,
        [...removalIds, ...removalIds],
      ) as any;
      fallbackDeleted = Number(fallbackResult?.affectedRows || 0);

      const removedAt = new Date().toISOString();
      for (const item of preview.removals) {
        const before = parseJsonObject(item.config);
        const nextConfig = stableStringify({
          ...before,
          upstream_removed_at: removedAt,
          upstream_removed_reason: 'remote_model_missing',
        });
        const [result] = await conn.execute(
          `UPDATE ai_models
              SET status = 'inactive',
                  config = ?,
                  updated_at = NOW(3)
            WHERE id = ? AND provider_id = ? AND deleted_at IS NULL`,
          [nextConfig, item.modelId, providerId],
        ) as any;
        removed += Number(result?.affectedRows || 0);
      }
    }

    await conn.commit();
    return { added, updated, removed, bindingDeleted, fallbackDeleted };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function isHongniaoProvider(provider: ProviderForModelSync): boolean {
  const providerType = String(provider.provider_type || '').toLowerCase();
  const providerKey = String(provider.provider_key || '').toLowerCase();
  return providerType === 'hongniao' || providerKey === 'hongniao';
}

async function hydrateRemovalImpacts(preview: ModelSyncPreview): Promise<void> {
  if (!preview.removals.length) return;
  const ids = preview.removals.map((item) => Number(item.modelId)).filter(Boolean);
  if (!ids.length) return;
  const byId = new Map(preview.removals.map((item) => [Number(item.modelId), item]));
  const placeholders = ids.map(() => '?').join(',');

  try {
    const bindings = await query<any>(
      `SELECT b.model_id,
              t.id AS tier_id,
              t.tier_key,
              t.tier_name,
              mf.feature_key,
              mf.feature_name
         FROM tier_model_bindings b
         LEFT JOIN model_tiers t ON t.id = b.tier_id
         LEFT JOIN model_features mf ON mf.id = t.feature_id
        WHERE b.model_id IN (${placeholders})`,
      ids,
    );
    for (const row of bindings) {
      const target = byId.get(Number(row.model_id));
      if (!target) continue;
      target.bindingCount += 1;
      target.affectedTiers.push({
        tierId: row.tier_id ? Number(row.tier_id) : undefined,
        tierKey: row.tier_key || undefined,
        tierName: row.tier_name || undefined,
        featureKey: row.feature_key || undefined,
        featureName: row.feature_name || undefined,
      });
    }
  } catch (err: any) {
    preview.failures.push({ scope: 'removal-bindings', message: String(err?.message || err).slice(0, 200) });
  }

  try {
    const fallbackRows = await query<any>(
      `SELECT model_id, COUNT(*) AS fallback_count
         FROM (
           SELECT model_id AS model_id
             FROM ai_model_fallback_rules
            WHERE model_id IN (${placeholders})
           UNION ALL
           SELECT fallback_model_id AS model_id
             FROM ai_model_fallback_rules
            WHERE fallback_model_id IN (${placeholders})
         ) x
        GROUP BY model_id`,
      [...ids, ...ids],
    );
    for (const row of fallbackRows) {
      const target = byId.get(Number(row.model_id));
      if (target) target.fallbackCount = Number(row.fallback_count || 0);
    }
  } catch (err: any) {
    preview.failures.push({ scope: 'removal-fallbacks', message: String(err?.message || err).slice(0, 200) });
  }
}

function deriveModelPricingFromConfig(config: Record<string, any>): { pointsCost: number; apiCostCents: number } {
  const amount = Number(config?.billing?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { pointsCost: 0, apiCostCents: 0 };
  return {
    pointsCost: Math.max(1, Math.round(amount * 10)),
    apiCostCents: Math.max(1, Math.round(amount * 100)),
  };
}

function normalizeRemoteModel(remote: RemoteProviderModel): NormalizedRemoteModel | null {
  const id = cleanString(remote.id);
  if (!id || id === 'unknown') return null;
  const name = cleanString(remote.name) || id;
  const modelType = guessModelType(remote.type, `${id} ${name}`);
  const config = remote.config && Object.keys(remote.config).length
    ? remote.config
    : buildDefaultModelConfig(modelType, remote.raw || remote);
  const queryTaskUrl = cleanString(config.endpoints?.query || config.query_task_url || config.queryTaskUrl)
    || (isMediaModelType(modelType) ? MEDIA_QUERY_TASK_URL : '');
  return {
    id,
    name,
    modelType,
    queryTaskUrl,
    config,
    ...deriveModelPricingFromConfig(config),
  };
}

function buildDefaultModelConfig(modelType: string, raw: Record<string, any>): Record<string, any> {
  if (isMediaModelType(modelType)) return buildMediaModelConfig(modelType, raw, '');
  return compactObject({
    sync_source: 'admin_model_sync',
    capabilities: modelType === 'text' ? ['text_generation'] : [],
    param_names: extractParamNames(raw),
    default_params: objectFromAliases(raw, ['default_params', 'defaultParams', 'defaults']),
    api_format: modelType === 'text' ? 'openai_compatible' : undefined,
  });
}

function buildMediaModelConfig(mediaType: string, raw: Record<string, any>, providerType: string): Record<string, any> {
  const type = guessModelType(mediaType, cleanString(raw.name || raw.id || raw.model || ''));
  const modelId = cleanString(raw.name || raw.id || raw.model || '');
  const params = extractMediaParamEntries(raw);
  const paramNames = extractParamNames(raw);
  const imageParam = findMediaParam(params, [...XIAOMA_IMAGE_PARAM_NAMES]);
  const videoParam = findMediaParam(params, [...XIAOMA_VIDEO_PARAM_NAMES]);
  const audioParam = findMediaParam(params, [...XIAOMA_AUDIO_PARAM_NAMES]);
  const ratioParam = findMediaParam(params, ['aspect_ratio', 'aspectRatio', 'ratio']);
  const sizeParam = findMediaParam(params, ['size']);
  const qualityParam = findMediaParam(params, ['quality']);
  const resolutionParam = findMediaParam(params, ['resolution']);
  const durationParam = findMediaParam(params, ['duration', 'seconds']);
  const nativeSizes = availableMediaParamValues(sizeParam).filter((item) => /^\d+x\d+$/i.test(item));
  const ratioValues = availableMediaParamValues(ratioParam);
  const supportedRatios = arrayFromAliases(raw, ['supported_ratios', 'supportedRatios', 'ratios', 'aspect_ratios', 'aspectRatios']);
  if (!supportedRatios.length) {
    supportedRatios.push(...(ratioValues.length
      ? ratioValues
      : nativeSizes.map((item) => {
        const match = item.match(/^(\d+)x(\d+)$/i);
        return match ? nearestCommonRatio(Number(match[1]), Number(match[2])) : '';
      }).filter(Boolean)));
  }
  const qualityValues = uniqueStrings([
    ...availableMediaParamValues(qualityParam),
    ...availableMediaParamValues(resolutionParam),
  ]);
  const durationValues = normalizeHongniaoDurations(availableMediaParamValues(durationParam));
  const inferred = inferXiaomaMediaCapabilities(type, modelId, params);
  const explicitCapabilities = arrayFromAliases(raw, ['capabilities', 'features']);
  const defaultParams = buildMediaDefaultParams(raw, params);
  const maxReferenceImages = imageParam
    ? inferMediaParamMaxItems(imageParam) ?? (inferred.referenceUploadMode === 'first_last' ? 2 : type === 'image' ? 10 : 1)
    : undefined;
  const maxVideoUrls = videoParam ? inferMediaParamMaxItems(videoParam) ?? 1 : undefined;
  const maxAudioUrls = audioParam ? inferMediaParamMaxItems(audioParam) ?? 1 : undefined;
  const maxDurationSeconds = durationValues.reduce((max, item) => Math.max(max, Number(item.match(/\d+/)?.[0] || 0)), 0) || undefined;
  const sizeOptions = nativeSizes.map((size) => {
    const match = size.match(/^(\d+)x(\d+)$/i)!;
    const ratio = nearestCommonRatio(Number(match[1]), Number(match[2]));
    const resolutionPreset = inferResolutionPresetFromSize(modelId, Number(match[1]), Number(match[2]));
    return { key: `${ratio}_${resolutionPreset}_${size}`, ratio, resolutionPreset, label: size, upstreamSize: size };
  });

  return compactObject({
    sync_source: 'admin_model_sync',
    sync_provider_type: providerType || undefined,
    capabilities: explicitCapabilities.length ? explicitCapabilities : inferred.capabilities,
    param_names: paramNames,
    remote_parameters: params,
    default_params: defaultParams,
    supported_ratios: uniqueStrings(supportedRatios),
    supported_qualities: qualityValues.length ? qualityValues : arrayFromAliases(raw, ['supported_qualities', 'supportedQualities', 'qualities', 'resolutions', 'supported_resolutions', 'supportedResolutions']),
    supported_durations: durationValues.length ? durationValues : arrayFromAliases(raw, ['supported_durations', 'supportedDurations', 'durations']),
    supported_audio_modes: arrayFromAliases(raw, ['supported_audio_modes', 'supportedAudioModes', 'audioModes']),
    supported_size_modes: sizeOptions.length ? ['ratio'] : arrayFromAliases(raw, ['supported_size_modes', 'supportedSizeModes', 'sizeModes']),
    native_sizes: nativeSizes,
    size_options: sizeOptions.length ? sizeOptions : arrayFromAliases(raw, ['size_options', 'sizeOptions']),
    resolution_presets: sizeOptions.length ? uniqueStrings(sizeOptions.map((item) => item.resolutionPreset)) : arrayFromAliases(raw, ['resolution_presets', 'resolutionPresets']),
    max_images: numberFromAliases(raw, ['max_images', 'maxImages', 'max_outputs', 'maxOutputs']) ?? 1,
    input_mode: cleanString(valueFromAliases(raw, ['input_mode', 'inputMode'])) || inferred.inputMode,
    reference_upload_mode: cleanString(valueFromAliases(raw, ['reference_upload_mode', 'referenceUploadMode'])) || inferred.referenceUploadMode,
    min_reference_images: numberFromAliases(raw, ['min_reference_images', 'minReferenceImages']) ?? (imageParam?.required ? 1 : 0),
    max_reference_images: numberFromAliases(raw, ['max_reference_images', 'maxReferenceImages']) ?? maxReferenceImages,
    max_video_urls: numberFromAliases(raw, ['max_video_urls', 'maxVideoUrls']) ?? maxVideoUrls,
    max_audio_urls: numberFromAliases(raw, ['max_audio_urls', 'maxAudioUrls']) ?? maxAudioUrls,
    max_duration_seconds: maxDurationSeconds,
    required_reference: imageParam?.required ? true : undefined,
    default_audio_mode: cleanString(valueFromAliases(raw, ['default_audio_mode', 'defaultAudioMode'])),
    endpoints: {
      create: '/v1/media/generate',
      query: MEDIA_QUERY_TASK_URL,
    },
    api_format: type === 'text' ? undefined : 'xiaoma_media',
  });
}

function extractMediaParamEntries(raw: Record<string, any>): Record<string, any>[] {
  const params = raw.paramConfig?.params || raw.param_config?.params || raw.params || raw.parameters;
  return Array.isArray(params) ? params.filter((item) => item && typeof item === 'object') : [];
}

function findMediaParam(params: Record<string, any>[], names: string[]): Record<string, any> | undefined {
  const targets = new Set(names.map(normalizeParamName));
  return params.find((item) => [item.name, item.key, item.field, item.mapsTo].some((value) => targets.has(normalizeParamName(value))));
}

function availableMediaParamValues(param?: Record<string, any>): string[] {
  if (!param) return [];
  const options = valueFromAliases(param, ['options', 'values', 'enum', 'allowedValues']);
  if (!Array.isArray(options)) return typeof options === 'string' ? options.split(',').map((item) => item.trim()).filter(Boolean) : [];
  return options
    .filter((item) => !(item && typeof item === 'object' && (item.currently_unavailable === true || item.available === false)))
    .map((item) => cleanString(item?.value ?? item?.label ?? item))
    .filter(Boolean);
}

export function inferMediaParamMaxItems(param: Record<string, any>): number | undefined {
  const explicit = numberFromAliases(param, ['maxItems', 'max_items', 'max', 'maximum']);
  if (explicit !== undefined) return explicit;
  const description = cleanString(param.description || param.help || param.hint);
  const range = description.match(/\b\d+\s*[-–]\s*(\d+)\s*(?:images?|videos?|audios?|files?|urls?)\b/i);
  if (range) return Number(range[1]);
  const chineseRange = description.match(/\d+\s*[-–~～至]\s*(\d+)\s*(?:张\s*(?:参考)?(?:图片|图像|图)?|个\s*(?:视频|音频|文件|链接|URL)?|份\s*(?:文件|文档)?)/i);
  if (chineseRange) return Number(chineseRange[1]);
  const upper = description.match(/(?:up to|maximum(?: of)?|最多)\s*(\d+)\s*(?:images?|videos?|audios?|files?|urls?)/i);
  if (upper) return Number(upper[1]);
  const chineseUpper = description.match(/最多\s*(\d+)\s*(?:张|个|份)\s*(?:图片|图像|视频|音频|文件|参考图)?/i);
  return chineseUpper ? Number(chineseUpper[1]) : undefined;
}

function buildMediaDefaultParams(raw: Record<string, any>, params: Record<string, any>[]): Record<string, any> {
  const defaults = { ...objectFromAliases(raw, ['default_params', 'defaultParams', 'defaults']) };
  for (const param of params) {
    const name = cleanString(param.name || param.key || param.field);
    const normalizedName = normalizeParamName(name);
    if (!name || ['prompt', 'image', 'images', 'video', 'videos', 'audio', 'audios'].includes(normalizedName)) continue;
    let value = valueFromAliases(param, ['defaultValue', 'default_value', 'default']);
    if (value === undefined) {
      const options = Array.isArray(param.options) ? param.options : [];
      value = options.find((item: any) => item?.default === true)?.value;
    }
    if (value === undefined && param.required) value = availableMediaParamValues(param)[0];
    if (value !== undefined && value !== null && value !== '') {
      defaults[name] = ['duration', 'seconds'].includes(normalizedName)
        ? normalizeHongniaoDurations([String(value)])[0] || value
        : value;
    }
  }
  return defaults;
}

function inferXiaomaMediaCapabilities(type: string, modelId: string, params: Record<string, any>[]) {
  if (type === 'image') {
    const images = findMediaParam(params, [...XIAOMA_IMAGE_PARAM_NAMES]);
    return { capabilities: images?.required ? ['image_to_image'] : ['text_to_image', 'image_to_image'], inputMode: '', referenceUploadMode: '' };
  }
  if (type === 'audio') return { capabilities: ['audio_generation'], inputMode: '', referenceUploadMode: '' };
  if (type !== 'video') return { capabilities: [], inputMode: '', referenceUploadMode: '' };

  const id = modelId.toLowerCase();
  const images = findMediaParam(params, [...XIAOMA_IMAGE_PARAM_NAMES]);
  const videos = findMediaParam(params, [...XIAOMA_VIDEO_PARAM_NAMES]);
  const firstLast = /first.?last|shouweizhen/.test(id);
  const capabilities: string[] = [];
  if (videos || /video.?edit|videoref|motion.?control|animate/.test(id)) capabilities.push('video_edit');
  if (images) capabilities.push(firstLast ? 'first_last_frame_video' : 'image_to_video');
  if (!images?.required && !videos) capabilities.unshift('text_to_video');
  if (!capabilities.length) capabilities.push('text_to_video');
  const inputMode = videos ? 'source_video' : firstLast ? 'first_last' : images ? (inferMediaParamMaxItems(images) || 1) > 1 ? 'reference_images' : 'first_frame' : 'text';
  const referenceUploadMode = inputMode === 'text' ? 'none' : inputMode;
  return { capabilities: uniqueStrings(capabilities), inputMode, referenceUploadMode };
}

function unwrapHongniaoBody(data: any): any {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  if (typeof data.body !== 'string') return data.body && typeof data.body === 'object' ? data.body : data;
  try {
    return JSON.parse(data.body);
  } catch {
    return data;
  }
}

function normalizeHongniaoModelList(value: any): Record<string, any>[] {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object');
  if (Array.isArray(value?.models)) return value.models.filter((item: any) => item && typeof item === 'object');
  if (Array.isArray(value?.data?.models)) return value.data.models.filter((item: any) => item && typeof item === 'object');
  return [];
}

function normalizeHongniaoModelType(type: unknown, fallbackText: string): string {
  const text = cleanString(type).toLowerCase();
  if (text === 'image_generation' || text === 'image') return 'image';
  if (text === 'video_generation' || text === 'video') return 'video';
  return guessModelType(text, fallbackText);
}

function buildHongniaoModelConfig(modelType: string, raw: Record<string, any>): Record<string, any> {
  return modelType === 'image'
    ? buildHongniaoImageModelConfig(raw)
    : buildHongniaoVideoModelConfig(raw);
}

function normalizeHongniaoRemoteParameters(raw: Record<string, any>): Array<Record<string, any>> {
  const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  return tasks.map((task: any) => compactObject({
    taskKind: cleanString(task?.taskKind || task?.kind || task?.type),
    requestExample: sanitizeHongniaoSnapshotValue(task?.requestExample || task?.request_example),
    parameters: Array.isArray(task?.parameters)
      ? task.parameters
        .filter((item: any) => item && typeof item === 'object')
        .map((item: any) => sanitizeHongniaoSnapshotValue(item))
      : [],
  })).filter((task) => task.taskKind || (Array.isArray(task.parameters) && task.parameters.length));
}

function sanitizeHongniaoSnapshotValue(value: any): any {
  if (Array.isArray(value)) return value.map((item) => sanitizeHongniaoSnapshotValue(item));
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, any> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/api.?key|authorization|token|secret|password/i.test(key)) {
      output[key] = '****';
      continue;
    }
    output[key] = sanitizeHongniaoSnapshotValue(item);
  }
  return output;
}

function buildHongniaoBilling(raw: Record<string, any>, amount: number): Record<string, any> {
  return {
    type: cleanString(raw.pricing?.type || raw.pricing?.unit || raw.pricing?.billing_type) || 'per_call',
    amount,
    currency: raw.pricing?.currency || 'CNY',
  };
}

function buildHongniaoImageModelConfig(raw: Record<string, any>): Record<string, any> {
  const params = extractHongniaoParamEntries(raw);
  const paramNames = extractHongniaoParamNames(params);
  const id = cleanString(raw.id || raw.model || raw.name);
  const isGptImage2 = id.toLowerCase() === 'gpt-image-2';
  const ratioParam = findHongniaoParam(params, 'aspectRatio') || findHongniaoParam(params, 'aspect_ratio');
  const qualityParam = findHongniaoParam(params, 'quality') || findHongniaoParam(params, 'resolution');
  const imageParam = findHongniaoParam(params, 'images');
  const ratios = normalizeHongniaoImageRatios(valuesFromHongniaoParam(ratioParam), isGptImage2);
  const qualities = normalizeHongniaoQualities(valuesFromHongniaoParam(qualityParam), isGptImage2);
  const maxImages = numberFromAliases(imageParam || {}, ['max', 'maximum', 'maxImages', 'max_items', 'maxItems']) ?? (isGptImage2 ? 4 : undefined);
  const minImages = numberFromAliases(imageParam || {}, ['min', 'minimum', 'minImages', 'min_items', 'minItems']) ?? 0;
  const defaultAspect = cleanString(valueFromAliases(ratioParam || {}, ['defaultValue', 'default', 'default_value']));
  const defaultQuality = normalizeResolutionPresetCompat(cleanString(valueFromAliases(qualityParam || {}, ['defaultValue', 'default', 'default_value'])));
  const billingAmount = pickHongniaoPrice(raw);
  const sizeOptions = buildHongniaoImageSizeOptions(id, valuesFromHongniaoParam(ratioParam), qualities);
  const resolutionPresets = uniqueStrings([
    ...sizeOptions.map((item: any) => String(item.resolutionPreset || '')).filter(Boolean),
    ...qualities.filter(isResolutionPresetCompat),
  ]);
  return compactObject({
    source: 'hongniao_models_api',
    sync_source: 'admin_model_sync',
    sync_provider_type: 'hongniao',
    source_checked_at: new Date().toISOString().slice(0, 10),
    api_format: 'hongniao_image',
    remote_status: cleanString(raw.status),
    remote_parameters: normalizeHongniaoRemoteParameters(raw),
    capabilities: ['text_to_image', 'image_to_image'],
    param_names: paramNames.length ? paramNames : (isGptImage2 ? ['prompt', 'images', 'size', 'n'] : []),
    supported_ratios: ratios.length ? ratios : (isGptImage2 ? ['auto', '1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9'] : []),
    supported_qualities: qualities.length ? qualities : (isGptImage2 ? ['auto', '1K', '2K', '4K'] : []),
    resolution_presets: resolutionPresets.length ? resolutionPresets : (isGptImage2 ? ['auto', '1K', '2K', '4K'] : []),
    size_options: sizeOptions,
    default_size_key: inferHongniaoDefaultSizeKey(defaultAspect, defaultQuality, sizeOptions) || (isGptImage2 ? 'auto' : undefined),
    supports_image_count: isGptImage2 ? true : undefined,
    max_images: maxImages,
    min_reference_images: minImages,
    max_reference_images: maxImages,
    max_polling_minutes: 20,
    billing: billingAmount !== undefined ? buildHongniaoBilling(raw, billingAmount) : undefined,
    default_params: compactObject({
      aspectRatio: defaultAspect || undefined,
      resolution: defaultQuality || undefined,
      quality: defaultQuality && !isResolutionPresetCompat(defaultQuality) ? defaultQuality : undefined,
      size: isGptImage2 ? 'auto' : undefined,
      n: isGptImage2 ? 1 : undefined,
    }),
    endpoints: { create: '/v1/images', query: '/api/v1/images/{id}' },
  });
}

function buildHongniaoVideoModelConfig(raw: Record<string, any>): Record<string, any> {
  const params = extractHongniaoParamEntries(raw);
  const paramNames = extractHongniaoParamNames(params);
  const ratioParam = findHongniaoParam(params, 'aspectRatio') || findHongniaoParam(params, 'aspect_ratio');
  const secondsParam = findHongniaoParam(params, 'seconds') || findHongniaoParam(params, 'duration');
  const resolutionParam = findHongniaoParam(params, 'resolution');
  const ratioOptions = valuesFromHongniaoParam(ratioParam);
  const resolutionOptions = valuesFromHongniaoParam(resolutionParam);
  const durationOptions = normalizeHongniaoDurations(valuesFromHongniaoParam(secondsParam));
  const imageParam = findHongniaoParam(params, 'images');
  const audioParam = findHongniaoParam(params, 'audioUrls') || findHongniaoParam(params, 'audios');
  const videoParam = findHongniaoParam(params, 'videoUrls') || findHongniaoParam(params, 'videos');
  const minReferenceImages = numberFromAliases(imageParam || {}, ['min', 'minimum', 'minImages', 'min_items', 'minItems']) ?? 0;
  const maxReferenceImages = numberFromAliases(imageParam || {}, ['max', 'maximum', 'maxImages', 'max_items', 'maxItems']);
  const maxAudioUrls = numberFromAliases(audioParam || {}, ['max', 'maximum', 'maxUrls', 'max_items', 'maxItems']);
  const maxVideoUrls = numberFromAliases(videoParam || {}, ['max', 'maximum', 'maxUrls', 'max_items', 'maxItems']);
  const taskKinds = Array.isArray(raw.tasks) ? raw.tasks.map((task: any) => cleanString(task?.taskKind)) : [];
  const uploadModes = inferHongniaoVideoUploadModes({
    taskKinds,
    hasImageParam: Boolean(imageParam),
    minReferenceImages,
    maxReferenceImages,
    hasVideoParam: Boolean(videoParam),
    maxVideoUrls,
  });
  const capabilities = ['text_to_video'];
  if ((maxReferenceImages || 0) > 0 || imageParam) capabilities.push('image_to_video');
  if (taskKinds.some((kind) => kind.includes('first_last_frame'))) capabilities.push('first_last_frame_video');
  if ((maxVideoUrls || 0) > 0 || videoParam) capabilities.push('video_edit');
  return compactObject({
    source: 'hongniao_models_api',
    sync_source: 'admin_model_sync',
    sync_provider_type: 'hongniao',
    source_checked_at: new Date().toISOString().slice(0, 10),
    api_format: 'hongniao_video',
    remote_status: cleanString(raw.status),
    remote_parameters: normalizeHongniaoRemoteParameters(raw),
    capabilities,
    param_names: paramNames,
    supported_ratios: ratioOptions,
    supported_qualities: resolutionOptions,
    supported_durations: durationOptions,
    supported_audio_modes: (maxAudioUrls || 0) > 0 ? ['audio', 'silent'] : [],
    supported_size_modes: ['ratio'],
    input_mode: uploadModes.inputMode,
    reference_upload_mode: uploadModes.referenceUploadMode,
    min_reference_images: minReferenceImages,
    max_reference_images: maxReferenceImages,
    max_audio_urls: maxAudioUrls,
    max_video_urls: maxVideoUrls,
    max_polling_minutes: 20,
    billing: pickHongniaoPrice(raw) !== undefined ? buildHongniaoBilling(raw, pickHongniaoPrice(raw)!) : undefined,
    default_params: {
      aspectRatio: cleanString(valueFromAliases(ratioParam || {}, ['defaultValue', 'default', 'default_value'])) || ratioOptions[0],
      seconds: cleanString(valueFromAliases(secondsParam || {}, ['defaultValue', 'default', 'default_value'])) || durationOptions[0]?.replace(/s$/i, ''),
      resolution: cleanString(valueFromAliases(resolutionParam || {}, ['defaultValue', 'default', 'default_value'])) || resolutionOptions[0],
    },
    endpoints: { create: '/v1/videos', query: '/api/v1/videos/{id}' },
  });
}

function inferHongniaoVideoUploadModes(input: {
  taskKinds: string[];
  hasImageParam: boolean;
  minReferenceImages: number;
  maxReferenceImages?: number;
  hasVideoParam: boolean;
  maxVideoUrls?: number;
}): { inputMode: string; referenceUploadMode: string } {
  if ((input.maxVideoUrls || 0) > 0 || input.hasVideoParam) {
    return { inputMode: 'source_video', referenceUploadMode: 'source_video' };
  }

  const isFirstLastTask = input.taskKinds.some((kind) => cleanString(kind).toLowerCase().includes('first_last_frame'));
  if (isFirstLastTask) {
    return { inputMode: 'first_last', referenceUploadMode: 'first_last' };
  }

  if (input.hasImageParam) {
    const maxReferenceImages = input.maxReferenceImages || 0;
    if (maxReferenceImages > 1) {
      return { inputMode: 'reference_images', referenceUploadMode: 'reference_images' };
    }
    return { inputMode: 'first_frame', referenceUploadMode: 'first_frame' };
  }

  return { inputMode: 'text', referenceUploadMode: 'none' };
}

function extractHongniaoParamEntries(raw: Record<string, any>): Record<string, any>[] {
  const params = raw.paramConfig?.params || raw.param_config?.params || raw.params || raw.parameters;
  if (Array.isArray(params)) return params.filter((item) => item && typeof item === 'object');
  const taskParams = Array.isArray(raw.tasks)
    ? raw.tasks.flatMap((task: any) => Array.isArray(task?.parameters) ? task.parameters : [])
    : [];
  return taskParams.filter((item) => item && typeof item === 'object');
}

function extractHongniaoParamNames(params: Record<string, any>[]): string[] {
  return sortHongniaoParamNames(uniqueStrings(params.map(preferredHongniaoParamName).filter(Boolean)));
}

function preferredHongniaoParamName(item: Record<string, any>): string {
  const rawName = cleanString(item.name || item.key || item.field);
  const mapped = cleanString(item.mapsTo);
  const normalizedRaw = normalizeParamName(rawName);
  if (normalizedRaw === 'aspectratio') return 'aspectRatio';
  if (normalizedRaw === 'seconds') return 'seconds';
  if (normalizedRaw === 'audios') return 'audioUrls';
  if (normalizedRaw === 'videos') return 'videoUrls';
  if (mapped) return mapped;
  return rawName;
}

function sortHongniaoParamNames(values: string[]): string[] {
  const order = ['prompt', 'aspectRatio', 'seconds', 'images', 'audioUrls', 'videoUrls', 'resolution', 'quality'];
  return [...values].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function findHongniaoParam(params: Record<string, any>[], name: string): Record<string, any> | undefined {
  const target = normalizeParamName(name);
  return params.find((item) => [
    item.mapsTo,
    item.name,
    item.key,
    item.field,
  ].some((value) => normalizeParamName(value) === target));
}

function valuesFromHongniaoParam(param?: Record<string, any>): string[] {
  if (!param) return [];
  const value = valueFromAliases(param, ['values', 'options', 'enum', 'allowedValues']);
  if (Array.isArray(value)) return value.map((item) => cleanString(item?.value ?? item?.label ?? item)).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function normalizeHongniaoDurations(values: string[]): string[] {
  return values.map((item) => {
    const text = cleanString(item);
    if (!text) return '';
    const match = text.match(/\d+/);
    if (!match) return text;
    return `${match[0]}s`;
  }).filter(Boolean);
}

function inferHongniaoSubType(config: Record<string, any>): string {
  const capabilities = Array.isArray(config.capabilities) ? config.capabilities.map((item) => String(item)) : [];
  if (capabilities.includes('video_edit')) return 'video_edit';
  if (capabilities.includes('first_last_frame_video')) return 'first_last_frame_video';
  if (capabilities.includes('image_to_video')) return 'image_to_video';
  if (capabilities.includes('text_to_video')) return 'text_to_video';
  if (capabilities.includes('image_to_image')) return 'image_to_image';
  if (capabilities.includes('text_to_image')) return 'text2img';
  return '';
}

function normalizeHongniaoImageRatios(values: string[], includeAuto: boolean): string[] {
  const ratios = values.map((item) => normalizeHongniaoRatioValue(item)).filter(Boolean);
  return uniqueStrings(includeAuto ? ['auto', ...ratios] : ratios);
}

function buildHongniaoImageSizeOptions(modelId: string, ratioValues: string[], qualities: string[]): Array<Record<string, any>> {
  const options: Array<Record<string, any>> = [];
  if (ratioValues.some((value) => cleanString(value).toLowerCase() === 'auto')) {
    options.push({ key: 'auto', ratio: 'auto', resolutionPreset: 'auto', label: 'auto', isAuto: true, upstreamSize: 'auto' });
  }
  const resolutionFallbacks = qualities.filter(isResolutionPresetCompat);
  for (const value of ratioValues) {
    const text = cleanString(value).replace(/\u200a/g, '').replace(/\s+/g, '');
    if (!text || text.toLowerCase() === 'auto') continue;
    const ratio = normalizeHongniaoRatioValue(text);
    if (!ratio) continue;
    const sizeMatch = text.toLowerCase().match(/^(\d+)x(\d+)$/);
    if (sizeMatch) {
      const resolutionPreset = inferResolutionPresetFromSize(modelId, Number(sizeMatch[1]), Number(sizeMatch[2]));
      options.push({
        key: `${ratio}_${resolutionPreset}`.replace(/\s+/g, ''),
        ratio,
        resolutionPreset,
        label: `${ratio} ${resolutionPreset}`,
        upstreamSize: text.toLowerCase(),
      });
      continue;
    }
    const resolutions = resolutionFallbacks.length ? resolutionFallbacks : ['1K'];
    for (const resolutionPreset of resolutions) {
      options.push({
        key: `${ratio}_${resolutionPreset}`.replace(/\s+/g, ''),
        ratio,
        resolutionPreset,
        label: `${ratio} ${resolutionPreset}`,
      });
    }
  }
  return uniqueSizeOptionObjects(options);
}

function uniqueSizeOptionObjects(options: Array<Record<string, any>>): Array<Record<string, any>> {
  const seen = new Set<string>();
  const result: Array<Record<string, any>> = [];
  for (const option of options) {
    const key = String(option.key || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(option);
  }
  return result;
}

function inferHongniaoDefaultSizeKey(defaultAspect: string, defaultQuality: string, sizeOptions: Array<Record<string, any>>): string {
  if (!sizeOptions.length) return '';
  const normalizedAspect = normalizeHongniaoRatioValue(defaultAspect);
  const normalizedQuality = normalizeResolutionPresetCompat(defaultQuality);
  const byUpstream = sizeOptions.find((item) => cleanString(item.upstreamSize).toLowerCase() === cleanString(defaultAspect).toLowerCase());
  if (byUpstream?.key) return String(byUpstream.key);
  const byBoth = sizeOptions.find((item) => (
    (!normalizedAspect || item.ratio === normalizedAspect)
    && (!normalizedQuality || item.resolutionPreset === normalizedQuality)
  ));
  return String(byBoth?.key || sizeOptions[0]?.key || '');
}

function inferResolutionPresetFromSize(modelId: string, width: number, height: number): string {
  const id = modelId.toLowerCase();
  if (id.includes('4k')) return '4K';
  if (id.includes('2k')) return '2K';
  const maxSide = Math.max(width, height);
  if (maxSide >= 2800) return '4K';
  if (maxSide >= 2000) return '2K';
  return '1K';
}

function normalizeHongniaoRatioValue(value: unknown): string {
  const text = cleanString(value);
  if (!text) return '';
  if (text.toLowerCase() === 'auto') return 'auto';
  const size = text.replace(/\u200a/g, '').replace(/\s+/g, '').toLowerCase();
  const sizeMatch = size.match(/^(\d+)x(\d+)$/);
  if (sizeMatch) return nearestCommonRatio(Number(sizeMatch[1]), Number(sizeMatch[2]));
  const ratioMatch = text.match(/^(\d{1,4})\s*:\s*(\d{1,4})$/);
  if (!ratioMatch) return text;
  return nearestCommonRatio(Number(ratioMatch[1]), Number(ratioMatch[2]));
}

function nearestCommonRatio(width: number, height: number): string {
  if (!width || !height) return '';
  const actual = width / height;
  const common = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9', '9:21', '1:2', '2:1', '1:3', '3:1', '1:4', '4:1', '1:8', '8:1'];
  let best = '';
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const ratio of common) {
    const [left, right] = ratio.split(':').map(Number);
    const diff = Math.abs(actual - left / right);
    if (diff < bestDiff) {
      best = ratio;
      bestDiff = diff;
    }
  }
  return bestDiff <= 0.035 ? best : sizeToRatio(width, height);
}

function sizeToRatio(width: number, height: number): string {
  if (!width || !height) return '';
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function normalizeHongniaoQualities(values: string[], includeAuto: boolean): string[] {
  const qualities = values.map((item) => normalizeResolutionPresetCompat(item)).filter(Boolean);
  return uniqueStrings(includeAuto ? ['auto', ...qualities] : qualities);
}

function normalizeResolutionPresetCompat(value: unknown): string {
  const text = cleanString(value);
  if (!text) return '';
  const lower = text.toLowerCase();
  if (lower === 'auto') return 'auto';
  if (['standard', 'normal', '1k', '1024'].includes(lower)) return '1K';
  if (['hd', '2k', '2048'].includes(lower)) return '2K';
  if (['4k', '4096'].includes(lower)) return '4K';
  if (/^\d+(?:\.\d+)?k$/i.test(text)) return text.toUpperCase();
  return text;
}

function isResolutionPresetCompat(value: unknown): boolean {
  const normalized = normalizeResolutionPresetCompat(value);
  return ['auto', '0.5K', '1K', '2K', '4K'].includes(normalized);
}

function pickHongniaoPrice(raw: Record<string, any>): number | undefined {
  const value = raw.pricing?.amount ?? raw.price;
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function normalizeParamName(value: unknown): string {
  return cleanString(value).toLowerCase().replace(/[_\-\s]/g, '');
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = cleanString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function sqlString(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

function diffManagedFields(before: ModelSyncUpdate['before'], after: ModelSyncUpdate['after']): ModelSyncFieldChange[] {
  const fields: ModelSyncFieldChange[] = [];
  if (before.modelType !== after.modelType) {
    fields.push({ key: 'model_type', label: '模型类型', before: before.modelType, after: after.modelType });
  }
  if (before.queryTaskUrl !== after.queryTaskUrl) {
    fields.push({ key: 'query_task_url', label: '轮询接口', before: before.queryTaskUrl, after: after.queryTaskUrl });
  }
  if (stableStringify(before.config) !== stableStringify(after.config)) {
    fields.push({ key: 'config', label: '能力参数', before: before.config, after: after.config });
  }
  if (before.apiCostCents !== after.apiCostCents) {
    fields.push({ key: 'api_cost_cents', label: 'Upstream cost', before: before.apiCostCents, after: after.apiCostCents });
  }
  return fields;
}

function mergeManagedConfig(existing: Record<string, any>, nextManaged: Record<string, any>): Record<string, any> {
  const merged = { ...existing };
  if (nextManaged.sync_provider_type || nextManaged.sync_source) {
    delete merged.upstream_removed_at;
    delete merged.upstream_removed_reason;
  }
  for (const key of MANAGED_CONFIG_KEYS) {
    if (Object.hasOwn(nextManaged, key)) merged[key] = nextManaged[key];
  }
  return compactObject(merged);
}

function guessModelType(type: unknown, text: string): string {
  const normalizedType = cleanString(type).toLowerCase();
  if (MODEL_TYPES.has(normalizedType)) return normalizedType;
  const lower = text.toLowerCase();
  if (/video|vid|veo|kling|sora|wan|pixverse|grok|seedance|happyhorse|omni|hailuo|minimax|luma|runway|mochi|cogvideox/.test(lower)) return 'video';
  if (/tts|audio|speech|whisper|music|suno/.test(lower)) return 'audio';
  if (/image|img|dall-e|flux|sd|stable|midjourney|banana/.test(lower)) return 'image';
  if (/text|chat|llm|gpt|claude|gemini/.test(lower)) return 'text';
  return 'unknown';
}

function isMediaModelType(modelType: string): boolean {
  return modelType === 'image' || modelType === 'video' || modelType === 'audio';
}

function normalizeRemoteList(data: any): Record<string, any>[] {
  const list = data?.models || data?.data || data?.items || [];
  return Array.isArray(list) ? list.filter((item) => item && typeof item === 'object') : [];
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

function parseJsonObject(value: any): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function stableStringify(value: any): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: any): any {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((acc: Record<string, any>, key) => {
    acc[key] = sortValue(value[key]);
    return acc;
  }, {});
}

function compactObject(input: Record<string, any>): Record<string, any> {
  const output: Record<string, any> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) {
      output[key] = [];
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
      output[key] = {};
      continue;
    }
    output[key] = value;
  }
  return output;
}

function arrayFromAliases(input: Record<string, any>, keys: string[]): any[] {
  const value = valueFromAliases(input, keys);
  if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item.trim() : item).filter((item) => item !== '');
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function objectFromAliases(input: Record<string, any>, keys: string[]): Record<string, any> {
  const value = valueFromAliases(input, keys);
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function numberFromAliases(input: Record<string, any>, keys: string[]): number | undefined {
  const value = valueFromAliases(input, keys);
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function valueFromAliases(input: Record<string, any>, keys: string[]): any {
  for (const key of keys) {
    if (Object.hasOwn(input, key)) return input[key];
  }
  return undefined;
}

function extractParamNames(input: Record<string, any>): string[] {
  const direct = arrayFromAliases(input, ['param_names', 'paramNames', 'parameters', 'params']);
  return direct.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') return cleanString(item.name || item.key || item.field);
    return '';
  }).filter(Boolean);
}

function cleanString(value: unknown): string {
  return String(value ?? '').trim();
}

function buildSyncMessage(mode: SyncMode, preview: ModelSyncPreview, added: number, updated: number, removed: number): string {
  if (mode === 'preview') {
    return `Sync preview: remote ${preview.totalRemote}, add ${preview.additions.length}, update ${preview.updates.length}, remove ${preview.removals.length}, skip ${preview.skipped.length}.`;
  }
  return `Sync applied: added ${added}, updated ${updated}, soft-disabled ${removed}, skipped ${preview.skipped.length}.`;

  if (mode === 'preview') {
    return `同步预览完成：远端 ${preview.totalRemote} 个模型，新增 ${preview.additions.length} 个，待覆盖 ${preview.updates.length} 个，跳过 ${preview.skipped.length} 个。`;
  }
  return `同步已应用：新增 ${added} 个，覆盖能力参数 ${updated} 个，跳过 ${preview.skipped.length} 个。`;
}
