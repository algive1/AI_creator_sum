import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import axios from 'axios';
import { adminAuthMiddleware } from '../middleware/auth';
import { getConnection, queryOne } from '../utils/db';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { StorageService } from '../services/storage/storage.service';
import { preloadStorageConfigs } from '../services/storage/storage-config-loader';
import { validateFileSize, validateMagicBytes, getImageDimensions } from '../services/storage/upload-validator';
import { FileCategory, genFileNo } from '../services/storage/adapter.interface';
import { resolveLocalFilePath } from '../services/storage/local-paths';

const router = Router();
const MAX_ADMIN_IMAGE_UPLOAD_SIZE = positiveInt(process.env.ADMIN_IMAGE_UPLOAD_MAX_FILE_SIZE || process.env.ADMIN_UPLOAD_MAX_FILE_SIZE || process.env.UPLOAD_MAX_FILE_SIZE, 10 * 1024 * 1024);
const MAX_ADMIN_VIDEO_UPLOAD_SIZE = positiveInt(process.env.ADMIN_VIDEO_UPLOAD_MAX_FILE_SIZE || process.env.UPLOAD_MAX_VIDEO_SIZE, 200 * 1024 * 1024);
const MAX_ADMIN_UPLOAD_SIZE = Math.max(MAX_ADMIN_IMAGE_UPLOAD_SIZE, MAX_ADMIN_VIDEO_UPLOAD_SIZE);
const FILE_CONTENT_PROXY_TIMEOUT_MS = positiveInt(process.env.FILE_CONTENT_PROXY_TIMEOUT_MS, 120000);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ADMIN_UPLOAD_SIZE } });
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo']);
const ALLOWED_ADMIN_FILE_CATEGORIES = new Set<FileCategory>(['general', 'template_cover', 'ref_image', 'ref_video', 'ai_video']);

function positiveInt(value: any, fallback: number): number {
  const parsed = parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function uploadFailed(res: Response, message: string, httpStatus = 400): void {
  error(res, ErrorCodes.FILE_UPLOAD_FAILED, message, httpStatus);
}

function validateAdminFile(file: Express.Multer.File): string | null {
  const isImage = file.mimetype.startsWith('image/');
  const isVideo = file.mimetype.startsWith('video/');
  if (isImage && !ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
    return '仅支持 jpg、jpeg、png、webp 图片';
  }
  if (isVideo && !ALLOWED_VIDEO_MIME_TYPES.has(file.mimetype)) {
    return '仅支持 mp4、mov、webm、avi 视频';
  }
  if (!isImage && !isVideo) {
    return '仅支持图片或视频文件';
  }

  const maxSize = isVideo ? MAX_ADMIN_VIDEO_UPLOAD_SIZE : MAX_ADMIN_IMAGE_UPLOAD_SIZE;
  if (file.size > maxSize) {
    return `${isVideo ? '视频' : '图片'}大小超过限制，最大 ${Math.round(maxSize / 1024 / 1024)}MB`;
  }
  const sizeCheck = validateFileSize(file.size, file.mimetype, {
    image: MAX_ADMIN_IMAGE_UPLOAD_SIZE,
    video: MAX_ADMIN_VIDEO_UPLOAD_SIZE,
  });
  if (!sizeCheck.valid) return `${isVideo ? '视频' : '图片'}大小超过限制`;
  const magicCheck = validateMagicBytes(file.buffer, file.mimetype);
  if (!magicCheck.valid) return `${isVideo ? '视频' : '图片'}文件内容与类型不匹配`;
  return null;
}

function requestBaseUrl(req: Request): string {
  const configured = String(process.env.APP_PUBLIC_URL || process.env.PUBLIC_API_DOMAIN || process.env.SITE_API_DOMAIN || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(configured)) return configured;
  return `${req.protocol}://${req.get('host') || ''}`.replace(/\/+$/, '');
}

function absoluteFileUrl(req: Request, url: string): string {
  const value = String(url || '').trim();
  if (!value || /^https?:\/\//i.test(value)) return value;
  return `${requestBaseUrl(req)}${value.startsWith('/') ? value : `/${value}`}`;
}

function adminFileContentUrl(fileNo: string): string {
  return `/api/v1/admin/files/${encodeURIComponent(fileNo)}/content`;
}

function storageSourceUrl(req: Request, file: any): string {
  const adapter = StorageService.getActiveAdapter();
  const raw = file.provider === adapter.provider && file.storage_key
    ? adapter.getAccessUrl(file.storage_key)
    : (file.cdn_url || file.access_url || '');
  return absoluteFileUrl(req, raw);
}

router.post('/files/upload', adminAuthMiddleware, (req: Request, res: Response) => {
  upload.single('file')(req, res, async (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        uploadFailed(res, `文件大小超过限制，图片最大 ${Math.round(MAX_ADMIN_IMAGE_UPLOAD_SIZE / 1024 / 1024)}MB，视频最大 ${Math.round(MAX_ADMIN_VIDEO_UPLOAD_SIZE / 1024 / 1024)}MB`);
        return;
      }
      uploadFailed(res, err.message || '上传失败');
      return;
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      uploadFailed(res, '未找到上传文件');
      return;
    }

    const validationError = validateAdminFile(file);
    if (validationError) {
      uploadFailed(res, validationError);
      return;
    }

    const conn = await getConnection();
    try {
      const requestedCategory = String(req.body?.category || req.body?.fileCategory || 'general') as FileCategory;
      const fileCategory = ALLOWED_ADMIN_FILE_CATEGORIES.has(requestedCategory) ? requestedCategory : 'general';
      const defaultRefType = fileCategory === 'template_cover' ? 'template_cover' : fileCategory === 'ai_video' ? 'template_preview' : 'admin_upload';
      const refType = String(req.body?.refType || defaultRefType).slice(0, 32);
      const refId = String(req.body?.refId || req.user!.userId || '').slice(0, 64);
      await preloadStorageConfigs();
      const adapter = StorageService.getActiveAdapter();
      const storageKey = StorageService.genStorageKey(fileCategory, file.originalname);
      const uploadStart = Date.now();
      const uploadResult = await adapter.upload(storageKey, file.buffer, file.mimetype);
      const publicUrl = uploadResult.cdnUrl || uploadResult.url || '';
      const dims = file.mimetype.startsWith('image/') ? getImageDimensions(file.buffer) : { width: 0, height: 0 };
      const md5Hash = crypto.createHash('md5').update(file.buffer).digest('hex');
      const fileNo = genFileNo();

      await conn.beginTransaction();
      const [insertResult] = await conn.execute(
        `INSERT INTO files
         (file_no, user_id, provider, storage_key, original_name, mime_type, file_size, width, height, duration,
          md5_hash, etag, access_url, cdn_url, file_category, visibility, ref_type, ref_id, created_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'public', ?, ?, NOW(3))`,
        [
          fileNo,
          adapter.provider,
          storageKey,
          file.originalname,
          file.mimetype,
          file.size,
          dims.width,
          dims.height,
          md5Hash,
          uploadResult.etag || '',
          uploadResult.url,
          publicUrl,
          fileCategory,
          refType,
          refId,
        ],
      ) as any;
      const fileId = Number((insertResult as any)?.insertId || 0);
      const durationMs = Date.now() - uploadStart;

      await conn.execute(
        `INSERT INTO file_upload_logs
         (file_id, user_id, upload_mode, file_size, mime_type, duration_ms, source_ip, user_agent, status, created_at)
         VALUES (?, ?, 'server_relay', ?, ?, ?, ?, ?, 'success', NOW(3))`,
        [
          fileId,
          req.user!.userId,
          file.size,
          file.mimetype,
          durationMs,
          req.ip || '',
          String(req.headers['user-agent'] || '').substring(0, 500),
        ],
      );

      await conn.execute(
        `INSERT INTO admin_operation_logs (admin_user_id, action, target_type, target_id, created_at)
         VALUES (?, ?, 'file', ?, NOW(3))`,
        [req.user!.userId, `file.upload.${fileCategory}`, String(fileId)],
      );

      await conn.commit();
      const accessUrl = absoluteFileUrl(req, adapter.getAccessUrl(storageKey));
      const displayUrl = adminFileContentUrl(fileNo);
      const absolutePublicUrl = absoluteFileUrl(req, publicUrl);
      success(res, {
        url: absolutePublicUrl,
        displayUrl,
        previewUrl: accessUrl || absolutePublicUrl || displayUrl,
        copyUrl: absolutePublicUrl || accessUrl,
        rawUrl: publicUrl,
        publicUrl: absolutePublicUrl,
        accessUrl,
        cdnUrl: absolutePublicUrl,
        fileId,
        fileNo,
        filename: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        storageProvider: adapter.provider,
      }, '上传成功');
    } catch (uploadErr: any) {
      try { await conn.rollback(); } catch {}
      console.error('[admin-files] upload failed:', uploadErr);
      uploadFailed(res, uploadErr?.message || '上传失败', 500);
    } finally {
      conn.release();
    }
  });
});

router.get('/files/:fileNo/content', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const file = await queryOne<any>('SELECT * FROM files WHERE file_no = ? AND is_deleted = 0', [req.params.fileNo]);
    if (!file) {
      error(res, ErrorCodes.FILE_NOT_FOUND, '文件不存在', 404);
      return;
    }

    res.setHeader('Cache-Control', 'private, max-age=300');
    if (file.provider === 'local') {
      const filePath = resolveLocalFilePath(file.storage_key);
      if (!fs.existsSync(filePath)) {
        error(res, ErrorCodes.FILE_NOT_FOUND, '文件不存在', 404);
        return;
      }
      const stat = fs.statSync(filePath);
      res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
      res.setHeader('Content-Length', String(stat.size));
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    const response = await axios.get(storageSourceUrl(req, file), {
      responseType: 'stream',
      timeout: FILE_CONTENT_PROXY_TIMEOUT_MS,
    });
    res.setHeader('Content-Type', file.mime_type || response.headers['content-type'] || 'application/octet-stream');
    const contentLength = response.headers['content-length'];
    if (typeof contentLength === 'string' || typeof contentLength === 'number') res.setHeader('Content-Length', contentLength);
    response.data.pipe(res);
  } catch (err: any) {
    if (res.headersSent) {
      res.destroy(err);
      return;
    }
    error(res, ErrorCodes.FILE_STORAGE_ERROR, err?.message || '文件读取失败');
  }
});

export default router;
