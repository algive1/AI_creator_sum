import crypto from 'node:crypto';
import { getConnection, query, queryOne } from '../utils/db';
import { assertActiveProject } from './project.service';
import { StorageService } from './storage/storage.service';

export type AssetStatus = 'active' | 'trashed';

function parseJson(value: any, fallback: any = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function mapAsset(row: any) {
  return {
    id: Number(row.id),
    assetNo: String(row.asset_no || ''),
    projectId: Number(row.project_id),
    projectName: String(row.project_name || ''),
    fileId: row.file_id ? Number(row.file_id) : null,
    sourceTaskId: row.source_task_id ? Number(row.source_task_id) : null,
    sourceOutputId: row.source_output_id ? Number(row.source_output_id) : null,
    mediaType: row.media_type === 'video' ? 'video' : 'image',
    name: String(row.name || ''),
    isFavorite: Boolean(row.is_favorite),
    status: row.status as AssetStatus,
    url: String(row.cdn_url || row.access_url || row.output_url || ''),
    thumbnailUrl: String(row.thumbnail_url || row.cdn_url || row.access_url || ''),
    mimeType: String(row.mime_type || ''),
    fileSize: Number(row.file_size || 0),
    width: Number(row.width || 0),
    height: Number(row.height || 0),
    duration: Number(row.duration || 0),
    metadata: parseJson(row.metadata, {}),
    deletedAt: row.deleted_at || null,
    cleanupAfter: row.cleanup_after || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ASSET_SELECT = `
  SELECT a.*, p.name AS project_name,
         f.cdn_url, f.access_url, f.mime_type, f.file_size, f.width, f.height, f.duration,
         o.cos_key AS output_url, o.thumbnail_key AS thumbnail_url
    FROM media_assets a
    JOIN creation_projects p ON p.id = a.project_id
    LEFT JOIN files f ON f.id = a.file_id AND f.is_deleted = 0
    LEFT JOIN ai_task_outputs o ON o.id = a.source_output_id`;

function cleanAssetName(value: unknown): string {
  const name = String(value || '').trim();
  if (!name) throw Object.assign(new Error('请输入资产名称'), { code: 1001 });
  if (name.length > 160) throw Object.assign(new Error('资产名称最多 160 个字符'), { code: 1001 });
  return name;
}

export async function listMediaAssets(userId: number, options: {
  projectId?: number;
  mediaType?: string;
  keyword?: string;
  favorite?: boolean;
  status?: AssetStatus;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, Number(options.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize || 24)));
  const offset = (page - 1) * pageSize;
  let where = 'a.user_id = ? AND a.status = ?';
  const params: any[] = [userId, options.status || 'active'];
  if (options.projectId) { where += ' AND a.project_id = ?'; params.push(options.projectId); }
  if (options.mediaType === 'image' || options.mediaType === 'video') { where += ' AND a.media_type = ?'; params.push(options.mediaType); }
  if (options.keyword) { where += ' AND a.name LIKE ?'; params.push(`%${options.keyword}%`); }
  if (typeof options.favorite === 'boolean') { where += ' AND a.is_favorite = ?'; params.push(options.favorite ? 1 : 0); }

  const [rows, countRow] = await Promise.all([
    query<any>(`${ASSET_SELECT} WHERE ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`, [...params, pageSize, offset]),
    queryOne<any>(`SELECT COUNT(*) AS total FROM media_assets a WHERE ${where}`, params),
  ]);
  const total = Number(countRow?.total || 0);
  return { list: rows.map(mapAsset), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function getMediaAsset(userId: number, assetId: number) {
  const row = await queryOne<any>(`${ASSET_SELECT} WHERE a.id = ? AND a.user_id = ?`, [assetId, userId]);
  return row ? mapAsset(row) : null;
}

export async function updateMediaAsset(userId: number, assetId: number, patch: {
  name?: unknown;
  projectId?: number;
  isFavorite?: boolean;
}) {
  const assignments: string[] = [];
  const params: any[] = [];
  if (patch.name !== undefined) { assignments.push('name = ?'); params.push(cleanAssetName(patch.name)); }
  if (patch.projectId !== undefined) {
    assignments.push('project_id = ?');
    params.push(await assertActiveProject(userId, patch.projectId));
  }
  if (typeof patch.isFavorite === 'boolean') { assignments.push('is_favorite = ?'); params.push(patch.isFavorite ? 1 : 0); }
  if (!assignments.length) return getMediaAsset(userId, assetId);
  params.push(assetId, userId);
  const result = await query<any>(
    `UPDATE media_assets SET ${assignments.join(', ')}, updated_at = NOW(3) WHERE id = ? AND user_id = ? AND status = 'active'`,
    params,
  );
  if (Number(result[0]?.affectedRows || 0) === 0) return null;
  return getMediaAsset(userId, assetId);
}

export async function trashMediaAssets(userId: number, assetIds: number[]): Promise<number> {
  const ids = normalizeIds(assetIds);
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const result = await query<any>(
    `UPDATE media_assets
        SET status = 'trashed', deleted_at = NOW(3), cleanup_after = DATE_ADD(NOW(3), INTERVAL 30 DAY), updated_at = NOW(3)
      WHERE user_id = ? AND status = 'active' AND id IN (${placeholders})`,
    [userId, ...ids],
  );
  return Number(result[0]?.affectedRows || 0);
}

export async function restoreMediaAssets(userId: number, assetIds: number[]): Promise<number> {
  const ids = normalizeIds(assetIds);
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const result = await query<any>(
    `UPDATE media_assets
        SET status = 'active', deleted_at = NULL, cleanup_after = NULL, updated_at = NOW(3)
      WHERE user_id = ? AND status = 'trashed' AND id IN (${placeholders})`,
    [userId, ...ids],
  );
  return Number(result[0]?.affectedRows || 0);
}

export async function moveMediaAssets(userId: number, assetIds: number[], projectId: number): Promise<number> {
  const ids = normalizeIds(assetIds);
  if (!ids.length) return 0;
  const targetProjectId = await assertActiveProject(userId, projectId);
  const placeholders = ids.map(() => '?').join(',');
  const result = await query<any>(
    `UPDATE media_assets SET project_id = ?, updated_at = NOW(3)
      WHERE user_id = ? AND status = 'active' AND id IN (${placeholders})`,
    [targetProjectId, userId, ...ids],
  );
  return Number(result[0]?.affectedRows || 0);
}

export async function favoriteMediaAssets(userId: number, assetIds: number[], isFavorite: boolean): Promise<number> {
  const ids = normalizeIds(assetIds);
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const result = await query<any>(
    `UPDATE media_assets SET is_favorite = ?, updated_at = NOW(3)
      WHERE user_id = ? AND status = 'active' AND id IN (${placeholders})`,
    [isFavorite ? 1 : 0, userId, ...ids],
  );
  return Number(result[0]?.affectedRows || 0);
}

export async function createMediaAssetFromTaskOutput(input: {
  taskId: number;
  userId: number;
  outputId: number;
  fileNo?: string;
  mediaType: 'image' | 'video';
  name: string;
  metadata?: any;
}) {
  const projectId = await assertActiveProject(input.userId,
    Number((await queryOne<any>('SELECT project_id FROM ai_tasks WHERE id = ? AND user_id = ?', [input.taskId, input.userId]))?.project_id || 0) || undefined,
  );
  const file = input.fileNo
    ? await queryOne<any>('SELECT id FROM files WHERE file_no = ? AND user_id = ? AND is_deleted = 0', [input.fileNo, input.userId])
    : null;
  await query(
    `INSERT IGNORE INTO media_assets
       (asset_no, user_id, project_id, file_id, source_task_id, source_output_id, media_type, name, status, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NOW(3), NOW(3))`,
    [
      `AST${crypto.randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`,
      input.userId,
      projectId,
      file?.id || null,
      input.taskId,
      input.outputId,
      input.mediaType,
      cleanAssetName(input.name),
      JSON.stringify(input.metadata || {}),
    ],
  );
  return queryOne<any>('SELECT id FROM media_assets WHERE source_output_id = ?', [input.outputId]);
}

export async function createUploadedMediaAsset(input: { userId: number; projectId?: number; fileId: number; name?: string }) {
  const file = await queryOne<any>(
    'SELECT * FROM files WHERE id = ? AND user_id = ? AND is_deleted = 0 LIMIT 1',
    [input.fileId, input.userId],
  );
  if (!file) throw Object.assign(new Error('上传文件不存在'), { code: 4003 });
  const mediaType = String(file.mime_type || '').startsWith('video/') ? 'video' : String(file.mime_type || '').startsWith('image/') ? 'image' : '';
  if (!mediaType) throw Object.assign(new Error('只有图片和视频可加入资产库'), { code: 1001 });
  const projectId = await assertActiveProject(input.userId, input.projectId);
  const existing = await queryOne<any>(
    `${ASSET_SELECT} WHERE a.user_id = ? AND a.project_id = ? AND a.file_id = ? AND a.source_task_id IS NULL AND a.status = 'active' LIMIT 1`,
    [input.userId, projectId, input.fileId],
  );
  if (existing) return mapAsset(existing);
  const [result] = await query<any>(
    `INSERT INTO media_assets
       (asset_no, user_id, project_id, file_id, media_type, name, status, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', '{}', NOW(3), NOW(3))`,
    [
      `AST${crypto.randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`,
      input.userId,
      projectId,
      input.fileId,
      mediaType,
      cleanAssetName(input.name || file.original_name || `${mediaType === 'video' ? '视频' : '图片'}素材`),
    ],
  );
  return getMediaAsset(input.userId, Number(result.insertId));
}

export async function cleanupExpiredMediaAssets(limit = 100): Promise<{ cleaned: number; skipped: number }> {
  const rows = await query<any>(
    `SELECT a.id, a.file_id, f.storage_key, f.provider
       FROM media_assets a
       JOIN creation_projects p ON p.id = a.project_id
       LEFT JOIN files f ON f.id = a.file_id
      WHERE a.status = 'trashed' AND a.cleanup_after <= NOW(3)
        AND p.status = 'archived'
        AND NOT EXISTS (
          SELECT 1 FROM task_asset_inputs tai
          JOIN ai_tasks t ON t.id = tai.task_id
          WHERE tai.asset_id = a.id AND t.status IN ('pending', 'queued', 'processing')
        )
      ORDER BY a.cleanup_after ASC LIMIT ${Math.min(500, Math.max(1, Math.floor(limit)))}`,
  );
  let cleaned = 0;
  let skipped = 0;
  for (const asset of rows) {
    const conn = await getConnection();
    try {
      await conn.beginTransaction();
      const [references] = await conn.execute(
        `SELECT COUNT(*) AS count FROM media_assets
          WHERE file_id = ? AND id <> ?`,
        [asset.file_id, asset.id],
      ) as any;
      const hasOtherAssetReference = Number(references?.[0]?.count || 0) > 0;
      await conn.execute('DELETE FROM task_asset_inputs WHERE asset_id = ?', [asset.id]);
      if (!hasOtherAssetReference && asset.storage_key) {
        const adapter = StorageService.getActiveAdapter();
        if (asset.provider !== adapter.provider) {
          await conn.rollback();
          skipped++;
          continue;
        }
        await adapter.delete(asset.storage_key);
      }
      await conn.execute('DELETE FROM media_assets WHERE id = ?', [asset.id]);
      if (!hasOtherAssetReference && asset.file_id) {
        await conn.execute('UPDATE files SET is_deleted = 1, deleted_at = NOW(3), updated_at = NOW(3) WHERE id = ?', [asset.file_id]);
      }
      await conn.commit();
      cleaned++;
    } catch {
      await conn.rollback();
      skipped++;
    } finally {
      conn.release();
    }
  }
  return { cleaned, skipped };
}

function normalizeIds(values: number[]) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number).filter(id => Number.isInteger(id) && id > 0))].slice(0, 100);
}
