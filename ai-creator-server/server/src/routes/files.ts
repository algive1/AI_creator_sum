// routes/files.ts
// 文件上传与对象存储接口

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { queryOne, query, getConnection } from '../utils/db';
import { success, error } from '../utils/response';
import { ErrorCodes, JwtPayload } from '../types';
import { StorageService } from '../services/storage/storage.service';
import { preloadStorageConfigs } from '../services/storage/storage-config-loader';
import { validateMimeType, validateFileSize, validateMagicBytes, getImageDimensions } from '../services/storage/upload-validator';
import { FileCategory, FileVisibility, genFileNo } from '../services/storage/adapter.interface';
import { getLocalBaseUrl, getLocalStaticMountPath, getLocalUploadDir } from '../services/storage/local-paths';
import { hasComplianceConfirmation } from './compliance';
import * as crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import multer from 'multer';
import { translateError } from '../utils/error-translator';

const router = Router();
const MAX_IMAGE_FILE_SIZE = positiveInt(process.env.UPLOAD_MAX_FILE_SIZE, 10 * 1024 * 1024);
const MAX_VIDEO_FILE_SIZE = positiveInt(process.env.UPLOAD_MAX_VIDEO_SIZE, 200 * 1024 * 1024);
const MAX_UPLOAD_FILE_SIZE = Math.max(MAX_IMAGE_FILE_SIZE, MAX_VIDEO_FILE_SIZE);
const FILE_CONTENT_PROXY_TIMEOUT_MS = positiveInt(process.env.FILE_CONTENT_PROXY_TIMEOUT_MS, 120000);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_FILE_SIZE } });
const STORAGE_KEY_PATTERN = /^[a-z_]+\/\d{4}-\d{2}\/[a-zA-Z0-9_-]{8,16}\.[a-z0-9]{2,10}$/i;

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function maxFileSizeForMime(mimeType: string): number {
  return String(mimeType || '').startsWith('video/') ? MAX_VIDEO_FILE_SIZE : MAX_IMAGE_FILE_SIZE;
}

function requestBaseUrl(req: Request): string {
  const configured = String(process.env.APP_PUBLIC_URL || process.env.PUBLIC_API_DOMAIN || process.env.SITE_API_DOMAIN || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(configured)) return configured;
  return `${req.protocol}://${req.get('host') || ''}`.replace(/\/+$/, '');
}

function fileContentUrl(req: Request, fileNo: string): string {
  return `${requestBaseUrl(req)}/api/v1/files/${encodeURIComponent(fileNo)}/content`;
}

function fileDeliveryUrl(req: Request, file: { file_no?: string; fileNo?: string; visibility?: string; cdn_url?: string; cdnUrl?: string; access_url?: string; accessUrl?: string }): string {
  const fileNo = String(file.file_no || file.fileNo || '');
  if (file.visibility === 'private' && fileNo) return fileContentUrl(req, fileNo);
  return String(file.cdn_url || file.cdnUrl || file.access_url || file.accessUrl || '');
}

function assertFileOwner(file: any, userId: number): boolean {
  return Number(file.user_id || 0) === Number(userId || 0);
}

function absoluteSourceUrl(req: Request, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${requestBaseUrl(req)}${path}`;
}

function getFileCategory(value: string): FileCategory {
  const valid: FileCategory[] = ['avatar', 'ref_image', 'ref_video', 'template_cover', 'ai_output', 'ai_video', 'general'];
  return valid.includes(value as FileCategory) ? (value as FileCategory) : 'general';
}
function getVisibility(value: string | undefined): FileVisibility {
  return value === 'public' ? 'public' : 'private';
}

function storageErrorCode(err: any): number {
  if (typeof err?.code === 'number') return err.code;
  const code = String(err?.code || '');
  if (code === 'UNSUPPORTED_STORAGE_PROVIDER') return ErrorCodes.UNSUPPORTED_STORAGE_PROVIDER;
  if (code === 'STORAGE_PROVIDER_CONFIG_MISSING') return ErrorCodes.STORAGE_PROVIDER_CONFIG_MISSING;
  if (code === 'LOCAL_UPLOAD_DIR_UNSAFE' || code === 'LOCAL_UPLOAD_DIR_NOT_WRITABLE') return ErrorCodes.LOCAL_UPLOAD_DIR_UNAVAILABLE;
  return ErrorCodes.FILE_STORAGE_ERROR;
}

function storageFallbackMessage(err: any): string {
  const code = String(err?.code || '');
  const message = String(err?.message || '').trim();
  if (code === 'UNSUPPORTED_STORAGE_PROVIDER') return 'UNSUPPORTED_STORAGE_PROVIDER';
  if (code === 'STORAGE_PROVIDER_CONFIG_MISSING') return message || 'STORAGE_PROVIDER_CONFIG_MISSING';
  if (code === 'LOCAL_UPLOAD_DIR_UNSAFE' || code === 'LOCAL_UPLOAD_DIR_NOT_WRITABLE') return message || 'LOCAL_UPLOAD_DIR_UNAVAILABLE';
  return translateError(err, 'storage').friendlyMessage || 'storage error';
}

function normalizePositiveInt(value: unknown): number {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function isValidStorageKey(value: unknown): boolean {
  return STORAGE_KEY_PATTERN.test(String(value || ''));
}

function callbackSecretMatches(req: Request): boolean {
  const expected = String(process.env.UPLOAD_CALLBACK_SECRET || '').trim();
  if (!expected) return false;
  const actual = String(req.query.secret || req.headers['x-upload-callback-secret'] || req.body?.secret || '').trim();
  try {
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function confirmUploadedStorageObject(params: {
  storageKey: string;
  userId?: number;
  etag?: string;
  fileSize?: number;
  mimeType?: string;
  uploadMode: string;
  req: Request;
}) {
  const { storageKey, userId, uploadMode, req } = params;
  if (!isValidStorageKey(storageKey)) {
    const err: any = new Error('storageKey 格式不正确');
    err.code = ErrorCodes.PARAM_ERROR;
    throw err;
  }

  const file = await queryOne<any>(
    'SELECT * FROM files WHERE storage_key = ? AND is_deleted = 0',
    [storageKey],
  );
  if (!file) {
    const err: any = new Error('未找到上传占位记录');
    err.code = ErrorCodes.FILE_PERMISSION_DENIED;
    throw err;
  }
  if (userId && file.user_id !== userId) {
    const err: any = new Error('文件不属于当前用户');
    err.code = ErrorCodes.FILE_PERMISSION_DENIED;
    throw err;
  }

  const adapter = StorageService.getActiveAdapter();
  const fileSize = normalizePositiveInt(params.fileSize) || Number(file.file_size || 0);
  const mimeType = String(params.mimeType || file.mime_type || '');
  const etag = String(params.etag || file.etag || '');
  const accessUrl = file.access_url || adapter.getAccessUrl(storageKey);
  const cdnUrl = file.cdn_url || adapter.getCdnUrl(storageKey);
  const mimeCheck = validateMimeType(mimeType);
  if (!mimeCheck.valid) {
    const err: any = new Error(mimeCheck.reason || '不支持的文件类型');
    err.code = 4002;
    throw err;
  }
  const sizeCheck = validateFileSize(fileSize, mimeType, { image: MAX_IMAGE_FILE_SIZE, video: MAX_VIDEO_FILE_SIZE });
  if (!sizeCheck.valid) {
    const err: any = new Error(sizeCheck.reason || '文件大小超过限制');
    err.code = 4001;
    throw err;
  }

  await query(
    `UPDATE files
        SET file_size = ?, mime_type = ?, etag = ?, access_url = ?, cdn_url = ?, updated_at = NOW(3)
      WHERE id = ?`,
    [fileSize, mimeType, etag, accessUrl, cdnUrl, file.id],
  );

  const logUserId = Number(file.user_id || userId || 0);
  if (logUserId > 0) {
    await query(
      `INSERT INTO file_upload_logs
       (file_id, user_id, upload_mode, file_size, mime_type, duration_ms, source_ip, user_agent, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'success', NOW(3))`,
      [file.id, logUserId, uploadMode, fileSize, mimeType, 0, req.ip || '', (req.headers['user-agent'] || '').substring(0, 500)],
    );
  }

  return {
    fileId: file.id,
    fileNo: file.file_no,
    url: fileDeliveryUrl(req, { ...file, cdn_url: cdnUrl, access_url: accessUrl }),
    mimeType,
    fileSize,
    confirmed: true,
  };
}

// 5.1 GET /api/v1/files/upload-config
router.get('/upload-config', authMiddleware, async (_req: Request, res: Response) => {
  try {
    await preloadStorageConfigs();
    const provider = StorageService.getActiveProvider();
    StorageService.getActiveAdapter();
    success(res, {
      uploadMode: process.env.UPLOAD_MODE === 'direct_client' ? 'direct_client' : 'server_relay',
      storageProvider: provider,
      supportedStorageProviders: StorageService.getSupportedProviders(),
      staticBaseUrl: provider === 'local' ? getLocalBaseUrl() : '',
      staticMountPath: provider === 'local' ? getLocalStaticMountPath() : '',
      localUploadDir: provider === 'local' ? getLocalUploadDir() : '',
      maxFileSize: MAX_UPLOAD_FILE_SIZE,
      maxImageSize: MAX_IMAGE_FILE_SIZE,
      maxVideoSize: MAX_VIDEO_FILE_SIZE,
      allowedMimeTypes: ['image/png','image/jpeg','image/webp','image/gif','image/svg+xml','video/mp4','video/quicktime','video/webm','video/x-msvideo'],
      maxConcurrent: 3,
    });
  } catch (err: any) {
    console.error('获取上传配置失败:', err);
    error(res, storageErrorCode(err), storageFallbackMessage(err));
  }
});

// 5.2 GET /api/v1/files/credential
router.get('/credential', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { fileCategory, originalName, fileSize, contentType, visibility } = req.query as any;
    if (!fileCategory || !originalName || !fileSize || !contentType) { error(res, ErrorCodes.PARAM_ERROR, '缺少参数: fileCategory, originalName, fileSize, contentType'); return; }
    const size = parseInt(fileSize, 10);
    if (isNaN(size) || size <= 0) { error(res, ErrorCodes.PARAM_ERROR, 'fileSize 无效'); return; }
    const mimeCheck = validateMimeType(contentType);
    if (!mimeCheck.valid) { error(res, 4002, mimeCheck.reason || '不支持的文件类型'); return; }
    const sizeCheck = validateFileSize(size, contentType, { image: MAX_IMAGE_FILE_SIZE, video: MAX_VIDEO_FILE_SIZE });
    if (!sizeCheck.valid) { error(res, 4001, sizeCheck.reason || '文件大小超过限制'); return; }
    await preloadStorageConfigs();
    const adapter = StorageService.getActiveAdapter();
    const category = getFileCategory(fileCategory);
    const fileVisibility = getVisibility(visibility);
    const storageKey = StorageService.genStorageKey(category, originalName);
    const credential = await adapter.generateCredential({ storageKey, contentType, maxFileSize: maxFileSizeForMime(contentType) });
    const fileNo = genFileNo();
    const [insertResult] = await query<any>(
      `INSERT INTO files
       (file_no, user_id, provider, storage_key, original_name, mime_type, file_size, width, height, duration, md5_hash, etag, access_url, cdn_url, file_category, visibility, ref_type, ref_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, '', '', ?, ?, ?, ?, null, null, NOW(3))`,
      [fileNo, req.user!.userId, adapter.provider, storageKey, String(originalName).slice(0, 256), String(contentType).slice(0, 128), size, '', '', category, fileVisibility],
    );
    const fileId = Number((insertResult as any)?.insertId || 0);
    const { provider: _provider, ...safeCredential } = credential as any;
    const deliveryUrl = fileVisibility === 'private' ? fileContentUrl(req, fileNo) : credential.cdnUrl;
    success(res, { ...safeCredential, cdnUrl: deliveryUrl, url: deliveryUrl, fileId, fileNo });
  } catch (err: any) {
    console.error('生成上传凭证失败:', err);
    error(res, storageErrorCode(err), storageFallbackMessage(err));
  }
});

// 5.3 POST /api/v1/files/upload (后端中转上传)
router.post('/upload', authMiddleware, (req: Request, res: Response) => {
    upload.single('file')(req, res, async (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return error(res, 4001, `文件大小超出限制，图片最大 ${Math.round(MAX_IMAGE_FILE_SIZE / 1024 / 1024)}MB，视频最大 ${Math.round(MAX_VIDEO_FILE_SIZE / 1024 / 1024)}MB`);
      return error(res, ErrorCodes.PARAM_ERROR, err.message || '上传失败');
    }
    const conn = await getConnection();
    try {
      const file = (req as any).file;
      if (!file) return error(res, ErrorCodes.PARAM_ERROR, '未找到上传文件');
      const body = req.body || {};
      const category = getFileCategory(body.fileCategory || 'general');
      const visibility = getVisibility(body.visibility);
      const userId = req.user!.userId;

      const mimeCheck = validateMimeType(file.mimetype);
      if (!mimeCheck.valid) return error(res, 4002, mimeCheck.reason!);
      const sizeCheck = validateFileSize(file.size, file.mimetype, { image: MAX_IMAGE_FILE_SIZE, video: MAX_VIDEO_FILE_SIZE });
      if (!sizeCheck.valid) return error(res, 4001, sizeCheck.reason!);
      const magicCheck = validateMagicBytes(file.buffer, file.mimetype);
      if (!magicCheck.valid) return error(res, 4002, magicCheck.reason!);

      await preloadStorageConfigs();
      const adapter = StorageService.getActiveAdapter();
      const storageKey = StorageService.genStorageKey(category, file.originalname);
      const uploadStart = Date.now();
      const uploadResult = await adapter.upload(storageKey, file.buffer, file.mimetype);
      const publicUrl = uploadResult.cdnUrl || uploadResult.url || '';

      const dims = getImageDimensions(file.buffer);
      const md5Hash = crypto.createHash('md5').update(file.buffer).digest('hex');
      const fileNo = genFileNo();
      const insertSql = `INSERT INTO files (file_no, user_id, provider, storage_key, original_name, mime_type, file_size, width, height, duration, md5_hash, etag, access_url, cdn_url, file_category, visibility, ref_type, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`;
      const [insertResult] = await conn.execute(insertSql, [fileNo, userId, adapter.provider, storageKey, file.originalname, file.mimetype, file.size, dims.width, dims.height, 0, md5Hash, uploadResult.etag || '', uploadResult.url, publicUrl, category, visibility, null, null]) as any;
      const fileId = Number((insertResult as any)?.insertId || 0);

      const durationMs = Date.now() - uploadStart;
      await conn.execute(`INSERT INTO file_upload_logs (file_id, user_id, upload_mode, file_size, mime_type, duration_ms, source_ip, user_agent, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'success', NOW(3))`, [fileId, userId, 'server_relay', file.size, file.mimetype, durationMs, req.ip || '', (req.headers['user-agent'] || '').substring(0, 500)]);

      return success(res, { fileId, fileNo, url: fileDeliveryUrl(req, { file_no: fileNo, visibility, cdn_url: publicUrl, access_url: uploadResult.url }), mimeType: file.mimetype, fileSize: file.size, width: dims.width, height: dims.height });
    } catch (uploadErr: any) {
      console.error('文件上传失败:', uploadErr);
      return error(res, storageErrorCode(uploadErr), storageFallbackMessage(uploadErr));
    } finally {
      conn.release();
    }
  });
});

router.post('/notify', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { storageKey, provider: _provider, etag, fileSize, mimeType, contentType } = req.body;
    if (!storageKey) { error(res, ErrorCodes.PARAM_ERROR, '缺少 storageKey'); return; }
    const confirmed = await confirmUploadedStorageObject({
      storageKey: String(storageKey),
      userId: req.user!.userId,
      etag: String(etag || ''),
      fileSize: normalizePositiveInt(fileSize),
      mimeType: String(mimeType || contentType || ''),
      uploadMode: 'direct_client',
      req,
    });
    return success(res, confirmed);
  } catch (err: any) {
    console.error('文件直传确认失败:', err);
    error(res, err?.code || storageErrorCode(err), err?.message || storageFallbackMessage(err), err?.code === ErrorCodes.FILE_PERMISSION_DENIED ? 403 : 200);
  }
});

router.post('/qiniu-callback', async (req: Request, res: Response) => {
  try {
    if (!callbackSecretMatches(req)) {
      error(res, ErrorCodes.FILE_PERMISSION_DENIED, '上传回调未授权', 403);
      return;
    }
    const storageKey = req.body?.storageKey || req.body?.key;
    if (!storageKey) { error(res, ErrorCodes.PARAM_ERROR, '缺少 storageKey'); return; }
    const confirmed = await confirmUploadedStorageObject({
      storageKey: String(storageKey),
      etag: String(req.body?.etag || req.body?.hash || ''),
      fileSize: normalizePositiveInt(req.body?.fileSize || req.body?.fsize),
      mimeType: String(req.body?.mimeType || req.body?.mime || ''),
      uploadMode: 'qiniu_callback',
      req,
    });
    success(res, confirmed);
  } catch (err: any) {
    error(res, err?.code || storageErrorCode(err), err?.message || storageFallbackMessage(err), err?.code === ErrorCodes.FILE_PERMISSION_DENIED ? 403 : 200);
  }
});

router.post('/upyun-callback', async (req: Request, res: Response) => {
  try {
    if (!callbackSecretMatches(req)) {
      error(res, ErrorCodes.FILE_PERMISSION_DENIED, '上传回调未授权', 403);
      return;
    }
    const storageKey = req.body?.storageKey || req.body?.key || req.body?.path;
    if (!storageKey) { error(res, ErrorCodes.PARAM_ERROR, '缺少 storageKey'); return; }
    const confirmed = await confirmUploadedStorageObject({
      storageKey: String(storageKey).replace(/^\/+/, ''),
      etag: String(req.body?.etag || req.body?.sign || ''),
      fileSize: normalizePositiveInt(req.body?.fileSize || req.body?.file_size),
      mimeType: String(req.body?.mimeType || req.body?.contentType || ''),
      uploadMode: 'upyun_callback',
      req,
    });
    success(res, confirmed);
  } catch (err: any) {
    error(res, err?.code || storageErrorCode(err), err?.message || storageFallbackMessage(err), err?.code === ErrorCodes.FILE_PERMISSION_DENIED ? 403 : 200);
  }
});

router.post('/:id(\\d+)/export', authMiddleware, async (req: Request, res: Response) => {
  try {
    const file = await queryOne<any>('SELECT * FROM files WHERE id = ? AND is_deleted = 0', [Number(req.params.id)]);
    if (!file) { error(res, ErrorCodes.NOT_FOUND, '文件不存在', 404); return; }
    if (file.user_id !== req.user!.userId) { error(res, ErrorCodes.FILE_PERMISSION_DENIED, '文件不属于当前用户', 403); return; }
    const confirmed = await hasComplianceConfirmation(req.user!.userId, 'export_save');
    if (!confirmed) { error(res, ErrorCodes.COMPLIANCE_CONFIRM_REQUIRED, '请先完成导出确认'); return; }

    const recordId = await createExportRecord(file.id, req.user!.userId, 'pending', '');
    const mimeType = String(file.mime_type || '');
    if (mimeType.startsWith('video/')) {
      await updateExportRecord(recordId, { status: 'failed', failReason: '当前暂不支持视频导出清理' });
      error(res, ErrorCodes.VIDEO_EXPORT_SANITIZE_NOT_SUPPORTED, '当前暂不支持视频导出清理，请稍后再试。');
      return;
    }
    if (!mimeType.startsWith('image/')) {
      await updateExportRecord(recordId, { status: 'failed', failReason: '仅支持图片导出清理' });
      error(res, ErrorCodes.FILE_STORAGE_ERROR, '仅支持图片导出清理');
      return;
    }

    try {
      const result = await exportFileWithSanitize(file);
      await updateExportRecord(recordId, {
        exportFileNo: result.fileNo,
        exportStorageKey: result.storageKey,
        exportUrl: result.cdnUrl,
        metadataSanitized: 1,
        aiImplicitLabelKept: 1,
        platformWatermarkRemoved: result.platformWatermarkRemoved ? 1 : 0,
        status: 'success',
        failReason: '',
      });
      success(res, {
        fileId: result.fileId,
        fileNo: result.fileNo,
        exportUrl: result.cdnUrl,
        status: 'success',
        metadataSanitized: true,
        aiImplicitLabelKept: true,
        platformWatermarkRemoved: result.platformWatermarkRemoved,
      });
    } catch (exportErr: any) {
      const reason = String(exportErr?.message || '导出失败').substring(0, 500);
      await updateExportRecord(recordId, { status: 'failed', failReason: reason });
      error(res, exportErr?.code || ErrorCodes.SERVER_ERROR, reason);
    }
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '文件导出失败');
  }
});

// 5.5.2 GET /api/v1/files/:id/export-status
router.get('/:id(\\d+)/export-status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const file = await queryOne<any>('SELECT * FROM files WHERE id = ? AND is_deleted = 0', [Number(req.params.id)]);
    if (!file) { error(res, ErrorCodes.NOT_FOUND, '文件不存在', 404); return; }
    if (file.user_id !== req.user!.userId) { error(res, ErrorCodes.FILE_PERMISSION_DENIED, '文件不属于当前用户', 403); return; }
    const record = await queryOne<any>(
      `SELECT * FROM file_export_records WHERE file_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
      [file.id, req.user!.userId],
    );
    success(res, {
      fileId: file.id,
      status: record?.status || 'none',
      exportUrl: record?.export_url || '',
      exportFileNo: record?.export_file_no || '',
      metadataSanitized: !!record?.metadata_sanitized,
      aiImplicitLabelKept: record?.ai_implicit_label_kept !== 0,
      platformWatermarkRemoved: !!record?.platform_watermark_removed,
      failReason: record?.fail_reason || '',
      createdAt: record?.created_at || null,
      updatedAt: record?.updated_at || null,
    });
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '获取导出状态失败');
  }
});

router.get('/:fileNo', authMiddleware, async (req: Request, res: Response) => {
  try {
    const file = await queryOne<any>('SELECT * FROM files WHERE file_no = ? AND is_deleted = 0', [req.params.fileNo]);
    if (!file) { error(res, ErrorCodes.FILE_NOT_FOUND, '文件不存在', 404); return; }
    if (file.visibility === 'private' && !assertFileOwner(file, req.user!.userId)) { error(res, ErrorCodes.FILE_PERMISSION_DENIED, '文件不属于当前用户', 403); return; }
    const deliveryUrl = fileDeliveryUrl(req, file);
    success(res, {
      fileId: file.id,
      fileNo: file.file_no,
      url: deliveryUrl,
      cdnUrl: deliveryUrl,
      mimeType: file.mime_type,
      fileSize: file.file_size,
      width: file.width,
      height: file.height,
      duration: file.duration,
      createdAt: file.created_at,
    });
  } catch (err: any) { error(res, storageErrorCode(err), storageFallbackMessage(err)); }
});

router.delete('/:fileNo', authMiddleware, async (req: Request, res: Response) => {
  try {
    const file = await queryOne<any>('SELECT * FROM files WHERE file_no = ? AND is_deleted = 0', [req.params.fileNo]);
    if (!file) { error(res, 4003, '文件不存在', 404); return; }
    if (file.user_id !== req.user!.userId) { error(res, 4003, '无权删除', 403); return; }
    // 先软删 DB 记录，再硬删存储对象。避免存储已删除但 DB 仍标记为未删除的悬挂状态。
    await query('UPDATE files SET is_deleted = 1, deleted_at = NOW(3), updated_at = NOW(3) WHERE file_no = ?', [req.params.fileNo]);
    await query('INSERT INTO file_delete_logs (file_id, user_id, operator_type, delete_type, storage_key, created_at) VALUES (?, ?, ?, ?, ?, NOW(3))', [file.id, req.user!.userId, 'user', 'soft', file.storage_key]);
    const adapter = StorageService.getActiveAdapter();
    await adapter.delete(file.storage_key);
    success(res, { fileNo: req.params.fileNo, deleted: true });
  } catch (err: any) { error(res, storageErrorCode(err), storageFallbackMessage(err)); }
});

// 5.7 POST /api/v1/files/batch-delete
router.post('/batch-delete', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { fileNos } = req.body;
    if (!fileNos || !Array.isArray(fileNos) || fileNos.length === 0) { error(res, ErrorCodes.PARAM_ERROR, '请提供 fileNos 数组'); return; }
    if (fileNos.length > 50) { error(res, ErrorCodes.PARAM_ERROR, '单次最多 50 个'); return; }
    const userId = req.user!.userId;
    for (const fn of fileNos) {
      const f = await queryOne<any>('SELECT user_id FROM files WHERE file_no = ? AND is_deleted = 0', [fn]);
      if (!f) { error(res, 4003, `文件 ${fn} 不存在`, 404); return; }
      if (f.user_id !== userId) { error(res, 4003, `无权删除 ${fn}`, 403); return; }
    }
    for (const fn of fileNos) {
      const f = await queryOne<any>('SELECT id, storage_key FROM files WHERE file_no = ?', [fn]);
      if (f) {
        // 先软删 DB，再硬删存储，避免悬挂记录
        await query('UPDATE files SET is_deleted = 1, deleted_at = NOW(3), updated_at = NOW(3) WHERE file_no = ?', [fn]);
        await query('INSERT INTO file_delete_logs (file_id, user_id, operator_type, delete_type, storage_key, created_at) VALUES (?, ?, ?, ?, ?, NOW(3))', [f.id, userId, 'user', 'soft', f.storage_key]);
        const adapter = StorageService.getActiveAdapter();
        await adapter.delete(f.storage_key);
      }
    }
    success(res, { deletedCount: fileNos.length, fileNos });
  } catch (err: any) { error(res, storageErrorCode(err), storageFallbackMessage(err)); }
});

function verifyPrivateFileRequest(req: Request, res: Response, file: any): boolean {
  if (file.visibility !== 'private') return true;
  const hdr = req.headers.authorization;
  if (!hdr || !hdr.startsWith('Bearer ')) { error(res, ErrorCodes.UNAUTHORIZED, '未登录', 401); return false; }
  try {
    const { verifyToken } = require('../services/auth.service');
    const payload = verifyToken(hdr.substring(7)) as JwtPayload;
    if (!assertFileOwner(file, payload.userId)) { error(res, ErrorCodes.FILE_PERMISSION_DENIED, '文件不属于当前用户', 403); return false; }
    return true;
  } catch {
    error(res, ErrorCodes.UNAUTHORIZED, '未登录', 401);
    return false;
  }
}

// 5.9 GET /api/v1/files/:fileNo/url
router.get('/:fileNo/url', async (req: Request, res: Response) => {
  try {
    const file = await queryOne<any>('SELECT * FROM files WHERE file_no = ? AND is_deleted = 0', [req.params.fileNo]);
    if (!file) { error(res, ErrorCodes.FILE_NOT_FOUND, '文件不存在', 404); return; }
    if (!verifyPrivateFileRequest(req, res, file)) return;
    success(res, { fileNo: req.params.fileNo, url: fileDeliveryUrl(req, file) });
  } catch (err: any) { error(res, storageErrorCode(err), storageFallbackMessage(err)); }
});

router.get('/:fileNo/content', async (req: Request, res: Response) => {
  try {
    const file = await queryOne<any>('SELECT * FROM files WHERE file_no = ? AND is_deleted = 0', [req.params.fileNo]);
    if (!file) { error(res, ErrorCodes.FILE_NOT_FOUND, '文件不存在', 404); return; }
    if (!verifyPrivateFileRequest(req, res, file)) return;
    const sourceUrl = absoluteSourceUrl(req, file.cdn_url || file.access_url || StorageService.getActiveAdapter().getAccessUrl(file.storage_key));
    if (!sourceUrl) { error(res, ErrorCodes.FILE_STORAGE_ERROR, '文件地址不存在', 404); return; }
    const response = await axios.get(sourceUrl, {
      responseType: 'stream',
      timeout: FILE_CONTENT_PROXY_TIMEOUT_MS,
      headers: req.headers.authorization ? { Authorization: req.headers.authorization } : undefined,
    });
    res.setHeader('Content-Type', file.mime_type || response.headers['content-type'] || 'application/octet-stream');
    const contentLength = response.headers['content-length'];
    if (typeof contentLength === 'string' || typeof contentLength === 'number') res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', file.visibility === 'private' ? 'private, no-store' : 'public, max-age=31536000');
    response.data.pipe(res);
  } catch (err: any) {
    if (res.headersSent) {
      res.destroy(err);
      return;
    }
    error(res, storageErrorCode(err), storageFallbackMessage(err));
  }
});

async function createExportRecord(fileId: number, userId: number, status: string, failReason: string) {
  const conn = await getConnection();
  try {
    const [result] = await conn.execute(
      `INSERT INTO file_export_records
       (file_id, user_id, export_file_no, export_storage_key, export_url, metadata_sanitized, ai_implicit_label_kept, platform_watermark_removed, status, fail_reason, created_at, updated_at)
       VALUES (?, ?, '', '', '', 0, 1, 0, ?, ?, NOW(3), NOW(3))`,
      [fileId, userId, status, failReason],
    ) as any;
    return result?.insertId || 0;
  } finally {
    conn.release();
  }
}

async function updateExportRecord(recordId: number, patch: any) {
  const sets: string[] = [];
  const vals: any[] = [];
  if (patch.exportFileNo !== undefined) { sets.push('export_file_no = ?'); vals.push(patch.exportFileNo); }
  if (patch.exportStorageKey !== undefined) { sets.push('export_storage_key = ?'); vals.push(patch.exportStorageKey); }
  if (patch.exportUrl !== undefined) { sets.push('export_url = ?'); vals.push(patch.exportUrl); }
  if (patch.metadataSanitized !== undefined) { sets.push('metadata_sanitized = ?'); vals.push(patch.metadataSanitized ? 1 : 0); }
  if (patch.aiImplicitLabelKept !== undefined) { sets.push('ai_implicit_label_kept = ?'); vals.push(patch.aiImplicitLabelKept ? 1 : 0); }
  if (patch.platformWatermarkRemoved !== undefined) { sets.push('platform_watermark_removed = ?'); vals.push(patch.platformWatermarkRemoved ? 1 : 0); }
  if (patch.status !== undefined) { sets.push('status = ?'); vals.push(patch.status); }
  if (patch.failReason !== undefined) { sets.push('fail_reason = ?'); vals.push(patch.failReason); }
  if (!sets.length) return;
  vals.push(recordId);
  await query(`UPDATE file_export_records SET ${sets.join(', ')}, updated_at = NOW(3) WHERE id = ?`, vals);
}

async function exportFileWithSanitize(file: any) {
  const maxBytes = parseInt(process.env.VIDEO_TASK_MAX_FILE_MB || '200', 10) * 1024 * 1024;
  const tempDir = path.join(os.tmpdir(), 'ai-creator-export');
  await fs.promises.mkdir(tempDir, { recursive: true });
  const inputPath = path.join(tempDir, `src-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const exportId = crypto.randomBytes(8).toString('hex');
  const outputName = `ai-export-${exportId}`;
  const outputPath = path.join(tempDir, `${outputName}.png`);
  const downloadUrl = file.access_url || file.cdn_url;

  try {
    await downloadToFile(downloadUrl, inputPath, maxBytes);
    if (!(file.mime_type || '').startsWith('image/')) {
      const err: any = new Error('仅支持图片导出清理');
      err.code = ErrorCodes.FILE_STORAGE_ERROR;
      throw err;
    }
    // 添加 30 秒超时，防止恶意/损坏图片导致进程挂起
    await Promise.race([
      sharp(inputPath).rotate().png().toFile(outputPath),
      new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error('图片处理超时，请使用较小的图片'), { code: ErrorCodes.FILE_STORAGE_ERROR })), 30_000)),
    ]);
    const size = (await fs.promises.stat(outputPath)).size;
    const adapter = StorageService.getActiveAdapter();
    const storageKey = StorageService.genStorageKey((file.file_category || 'general') as FileCategory, `${outputName}.png`);
    const stream = fs.createReadStream(outputPath);
    const uploadResult = await adapter.uploadLarge(storageKey, stream, 'image/png', size);
    const fileNo = genFileNo();
    const conn = await getConnection();
    try {
      const [insertResult] = await conn.execute(
        `INSERT INTO files
         (file_no, user_id, provider, storage_key, original_name, mime_type, file_size, width, height, duration, md5_hash, etag, access_url, cdn_url, file_category, visibility, ref_type, ref_id, metadata_sanitized, ai_implicit_label_kept, platform_watermark_removed, created_at)` ,
        [
          fileNo,
          file.user_id,
          adapter.provider,
          storageKey,
          `${outputName}.png`,
          'image/png',
          size,
          file.width || 0,
          file.height || 0,
          file.duration || 0,
          '',
          uploadResult.etag || '',
          uploadResult.url,
          uploadResult.cdnUrl,
          file.file_category || 'general',
          file.visibility || 'private',
          'file_export',
          String(file.id),
          1,
          1,
          0,
        ],
      ) as any;
      const fileId = Number((insertResult as any)?.insertId || 0);
      return { fileId, fileNo, storageKey, cdnUrl: uploadResult.cdnUrl, platformWatermarkRemoved: false };
    } finally {
      conn.release();
    }
  } finally {
    await safeUnlink(inputPath);
    await safeUnlink(outputPath);
  }
}

async function downloadToFile(url: string, filePath: string, maxBytes: number) {
  if (!url) throw new Error('缺少文件地址');
  const response = await axios.get(url, { responseType: 'stream', timeout: 120000 });
  const contentLength = Number(response.headers['content-length'] || 0);
  if (contentLength > maxBytes) throw new Error('文件过大');
  await new Promise<void>((resolve, reject) => {
    const writer = fs.createWriteStream(filePath);
    let downloaded = 0;
    response.data.on('data', (chunk: Buffer) => {
      downloaded += chunk.length;
      if (downloaded > maxBytes) {
        response.data.destroy(new Error('文件过大'));
      }
    });
    response.data.on('error', reject);
    writer.on('error', reject);
    writer.on('finish', resolve);
    response.data.pipe(writer);
  });
}

async function safeUnlink(filePath: string) {
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // ignore
  }
}

export default router;
