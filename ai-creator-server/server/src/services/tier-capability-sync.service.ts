import type { Connection, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getConnection } from '../utils/db';
import { parseJson } from '../utils/content-helpers';

type Executor = Pick<Connection | PoolConnection, 'execute'>;

interface SyncResult {
  tierId: number;
  modelId: number;
  synced: boolean;
  reason?: string;
}

const VIDEO_INPUT_MODES = ['text', 'first_frame', 'reference_images', 'first_last', 'source_video'];
const VIDEO_REFERENCE_UPLOAD_MODES = ['none', 'first_frame', 'reference_images', 'first_last', 'source_video'];

export async function syncTierCapabilitiesFromPrimaryModel(
  executor: Executor,
  tierId: number,
  modelId: number,
): Promise<SyncResult> {
  if (!tierId || !modelId) return { tierId, modelId, synced: false, reason: 'missing_id' };

  const model = await selectOne<any>(
    executor,
    `SELECT id, model_type, sub_type, name, api_model_name, config
       FROM ai_models
      WHERE id = ? AND deleted_at IS NULL
      LIMIT 1`,
    [modelId],
  );
  if (!model) return { tierId, modelId, synced: false, reason: 'model_not_found' };

  const existing = await selectOne<any>(
    executor,
    'SELECT * FROM tier_capabilities WHERE tier_id = ? LIMIT 1',
    [tierId],
  );
  const config = parseJson(model.config, {});
  const next = buildTierCapabilitiesFromModelConfig(model, config, existing || {});

  await executor.execute(
    `INSERT INTO tier_capabilities
       (tier_id, supported_ratios, supported_qualities, supported_styles, supported_durations, supported_camera_moves, supported_audio_modes, default_audio_mode,
        supported_size_modes, allow_custom_pixels, native_sizes, default_ratio, max_width, max_height, min_width, min_height,
        max_total_pixels, max_aspect_ratio, allow_postprocess, postprocess_modes, allow_upscale, max_images, max_reference_images, input_mode, reference_upload_mode, min_reference_images, required_reference, max_duration_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE supported_ratios=?, supported_qualities=?, supported_styles=?, supported_durations=?, supported_camera_moves=?, supported_audio_modes=?, default_audio_mode=?,
        supported_size_modes=?, allow_custom_pixels=?, native_sizes=?, default_ratio=?, max_width=?, max_height=?, min_width=?, min_height=?,
        max_total_pixels=?, max_aspect_ratio=?, allow_postprocess=?, postprocess_modes=?, allow_upscale=?, max_images=?, max_reference_images=?, input_mode=?, reference_upload_mode=?, min_reference_images=?, required_reference=?, max_duration_seconds=?, updated_at=NOW(3)`,
    [
      tierId, json(next.supportedRatios), json(next.supportedQualities), json(next.supportedStyles), json(next.supportedDurations), json(next.supportedCameraMoves), json(next.supportedAudioModes), next.defaultAudioMode,
      json(next.supportedSizeModes), next.allowCustomPixels, json(next.nativeSizes), next.defaultRatio,
      next.maxWidth, next.maxHeight, next.minWidth, next.minHeight, next.maxTotalPixels, next.maxAspectRatio,
      next.allowPostprocess, json(next.postprocessModes), next.allowUpscale, next.maxImages, next.maxReferenceImages, next.inputMode, next.referenceUploadMode, next.minReferenceImages, next.requiredReference, next.maxDurationSeconds,
      json(next.supportedRatios), json(next.supportedQualities), json(next.supportedStyles), json(next.supportedDurations), json(next.supportedCameraMoves), json(next.supportedAudioModes), next.defaultAudioMode,
      json(next.supportedSizeModes), next.allowCustomPixels, json(next.nativeSizes), next.defaultRatio,
      next.maxWidth, next.maxHeight, next.minWidth, next.minHeight, next.maxTotalPixels, next.maxAspectRatio,
      next.allowPostprocess, json(next.postprocessModes), next.allowUpscale, next.maxImages, next.maxReferenceImages, next.inputMode, next.referenceUploadMode, next.minReferenceImages, next.requiredReference, next.maxDurationSeconds,
    ],
  );

  return { tierId, modelId, synced: true };
}

export async function repairTierCapabilitiesFromPrimaryModels(): Promise<SyncResult[]> {
  const conn = await getConnection();
  try {
    const [rows] = await conn.execute(
      `SELECT t.id AS tier_id, b.model_id
         FROM model_tiers t
         JOIN tier_model_bindings b ON b.tier_id = t.id AND b.binding_type = 'primary'
         JOIN ai_models m ON m.id = b.model_id AND m.deleted_at IS NULL
        WHERE t.status IN ('active', 'inactive')`,
    ) as unknown as [Array<RowDataPacket & { tier_id: number; model_id: number }>, unknown];
    const results: SyncResult[] = [];
    for (const row of rows) {
      results.push(await syncTierCapabilitiesFromPrimaryModel(conn, Number(row.tier_id), Number(row.model_id)));
    }
    return results;
  } finally {
    conn.release();
  }
}

function buildTierCapabilitiesFromModelConfig(model: any, config: Record<string, any>, existing: Record<string, any>) {
  const defaultParams = plainObject(config.default_params || config.defaultParams);
  const ratios = firstArray(config.supported_ratios, config.supportedRatios, config.ratios, config.aspect_ratios, config.aspectRatios)
    || jsonColumn(existing.supported_ratios, []);
  const qualities = firstArray(config.supported_qualities, config.supportedQualities, config.supported_resolutions, config.supportedResolutions, config.resolutions, config.qualities)
    || jsonColumn(existing.supported_qualities, []);
  const durations = firstArray(config.supported_durations, config.supportedDurations, config.durations)
    || jsonColumn(existing.supported_durations, []);
  const audioModes = firstArray(config.supported_audio_modes, config.supportedAudioModes, config.audio_modes, config.audioModes)
    || jsonColumn(existing.supported_audio_modes, []);
  const nativeSizes = firstArray(config.native_sizes, config.nativeSizes, config.sizes)
    || jsonColumn(existing.native_sizes, []);
  const sizeModes = firstArray(config.supported_size_modes, config.supportedSizeModes)
    || jsonColumn(existing.supported_size_modes, model.model_type === 'image' ? ['auto', 'ratio'] : ['ratio']);
  const postprocessModes = firstArray(config.postprocess_modes, config.postprocessModes)
    || jsonColumn(existing.postprocess_modes, ['cover', 'contain', 'resize']);

  const defaultRatio = stringValue(
    config.default_ratio,
    config.defaultRatio,
    defaultParams.aspectRatio,
    defaultParams.aspect_ratio,
    defaultParams.ratio,
    ratios[0],
    existing.default_ratio,
    model.model_type === 'image' ? '1:1' : '16:9',
  );
  const inputMode = allowedString(
    stringValue(config.input_mode, config.inputMode, inferInputMode(model, config)),
    VIDEO_INPUT_MODES,
  );
  const referenceUploadMode = allowedString(
    stringValue(config.reference_upload_mode, config.referenceUploadMode, inputMode === 'text' ? 'none' : inputMode),
    VIDEO_REFERENCE_UPLOAD_MODES,
  );
  const minReferenceImages = nullableNumber(config.min_reference_images, config.minReferenceImages, existing.min_reference_images);
  const maxReferenceImages = numberValue(
    config.max_reference_images,
    config.maxReferenceImages,
    config.max_images,
    config.maxImages,
    existing.max_reference_images,
    existing.max_images,
    referenceUploadMode === 'none' ? 0 : 1,
  );
  const requiredReference = nullableBoolean(
    config.required_reference,
    config.requiredReference,
    existing.required_reference,
    minReferenceImages === null ? null : minReferenceImages > 0,
  );

  return {
    supportedRatios: ratios,
    supportedQualities: qualities,
    supportedStyles: firstArray(config.supported_styles, config.supportedStyles) || jsonColumn(existing.supported_styles, []),
    supportedDurations: durations,
    supportedCameraMoves: firstArray(config.supported_camera_moves, config.supportedCameraMoves) || jsonColumn(existing.supported_camera_moves, []),
    supportedAudioModes: audioModes,
    defaultAudioMode: stringValue(config.default_audio_mode, config.defaultAudioMode, audioModes[0], existing.default_audio_mode, 'silent'),
    supportedSizeModes: sizeModes,
    allowCustomPixels: boolInt(config.allow_custom_pixels, config.allowCustomPixels, existing.allow_custom_pixels, false),
    nativeSizes,
    defaultRatio,
    maxWidth: numberValue(config.max_width, config.maxWidth, existing.max_width, 2048),
    maxHeight: numberValue(config.max_height, config.maxHeight, existing.max_height, 2048),
    minWidth: numberValue(config.min_width, config.minWidth, existing.min_width, 64),
    minHeight: numberValue(config.min_height, config.minHeight, existing.min_height, 64),
    maxTotalPixels: numberValue(config.max_total_pixels, config.maxTotalPixels, existing.max_total_pixels, 4194304),
    maxAspectRatio: numberValue(config.max_aspect_ratio, config.maxAspectRatio, existing.max_aspect_ratio, 4),
    allowPostprocess: boolInt(config.allow_postprocess, config.allowPostprocess, existing.allow_postprocess, model.model_type === 'image'),
    postprocessModes,
    allowUpscale: boolInt(config.allow_upscale, config.allowUpscale, existing.allow_upscale, false),
    maxImages: numberValue(config.max_images, config.maxImages, maxReferenceImages, existing.max_images, 1),
    maxReferenceImages,
    inputMode,
    referenceUploadMode,
    minReferenceImages,
    requiredReference,
    maxDurationSeconds: numberValue(config.max_duration_seconds, config.maxDurationSeconds, maxSecondsFromDurations(durations), existing.max_duration_seconds, 30),
  };
}

async function selectOne<T>(executor: Executor, sql: string, params: any[]): Promise<T | null> {
  const [rows] = await executor.execute(sql, params) as unknown as [T[], unknown];
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function plainObject(value: any): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function firstArray(...values: any[]): string[] | null {
  for (const value of values) {
    const items = normalizeArray(value);
    if (items.length) return items;
  }
  return null;
}

function normalizeArray(value: any): string[] {
  const parsed = parseJson(value, value);
  const items = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  const seen = new Set<string>();
  for (const item of items) {
    const text = String(item || '').trim();
    if (text) seen.add(text);
  }
  return Array.from(seen);
}

function jsonColumn(value: any, fallback: string[]): string[] {
  const items = normalizeArray(value);
  return items.length ? items : fallback;
}

function stringValue(...values: any[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function allowedString(value: string, allowed: string[]): string | null {
  const text = String(value || '').trim();
  return allowed.includes(text) ? text : null;
}

function numberValue(...values: any[]): number {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const numberValue = Number(value);
    if (Number.isFinite(numberValue) && numberValue >= 0) return Math.trunc(numberValue);
  }
  return 0;
}

function nullableNumber(...values: any[]): number | null {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const numberValue = Number(value);
    if (Number.isFinite(numberValue) && numberValue >= 0) return Math.trunc(numberValue);
  }
  return null;
}

function boolInt(...values: any[]): number {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return value ? 1 : 0;
    const text = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(text)) return 1;
    if (['false', '0', 'no', 'off'].includes(text)) return 0;
  }
  return 0;
}

function nullableBoolean(...values: any[]): number | null {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    return boolInt(value);
  }
  return null;
}

function maxSecondsFromDurations(durations: string[]): number {
  let max = 0;
  for (const duration of durations) {
    const match = String(duration).match(/\d+/);
    if (match) max = Math.max(max, Number(match[0]) || 0);
  }
  return max || 30;
}

function inferInputMode(model: any, config: Record<string, any>): string {
  const caps = normalizeArray(config.capabilities);
  const text = `${model.sub_type || ''} ${model.name || ''} ${model.api_model_name || ''}`.toLowerCase();
  if (caps.includes('video_edit') || text.includes('edit')) return 'source_video';
  if (caps.includes('first_last_frame_video') || text.includes('first_last')) return 'first_last';
  if (caps.includes('image_to_video') || text.includes('i2v') || text.includes('image')) return 'first_frame';
  return model.model_type === 'video' ? 'text' : '';
}

function json(value: any): string {
  return JSON.stringify(value ?? []);
}
