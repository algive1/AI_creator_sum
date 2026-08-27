import { Router, Request, Response } from 'express';
import fs from 'fs';
import axios from 'axios';
import { adminAuthMiddleware } from '../middleware/auth';
import { getConnection, query, queryOne } from '../utils/db';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { StorageService } from '../services/storage/storage.service';
import { preloadStorageConfigs } from '../services/storage/storage-config-loader';
import { validateFileSize, validateMagicBytes, getImageDimensions } from '../services/storage/upload-validator';
import { FileCategory, genFileNo } from '../services/storage/adapter.interface';
import { resolveLocalFilePath } from '../services/storage/local-paths';
import { publicRequestBaseUrl } from '../utils/public-base-url';
import { cleanupTempUpload, createDiskUpload, md5File, readUploadForImageMetadata, readUploadForValidation } from '../services/storage/upload-temp-file';
import { pipeRemoteFileResponse, rangeRequestHeaders, streamLocalFileWithRange } from '../utils/file-stream-response';

const router = Router();
const MAX_ADMIN_IMAGE_UPLOAD_SIZE = positiveInt(process.env.ADMIN_IMAGE_UPLOAD_MAX_FILE_SIZE || process.env.ADMIN_UPLOAD_MAX_FILE_SIZE || process.env.UPLOAD_MAX_FILE_SIZE, 10 * 1024 * 1024);
const MAX_ADMIN_VIDEO_UPLOAD_SIZE = positiveInt(process.env.ADMIN_VIDEO_UPLOAD_MAX_FILE_SIZE || process.env.UPLOAD_MAX_VIDEO_SIZE, 200 * 1024 * 1024);
const MAX_ADMIN_UPLOAD_SIZE = Math.max(MAX_ADMIN_IMAGE_UPLOAD_SIZE, MAX_ADMIN_VIDEO_UPLOAD_SIZE);
const FILE_CONTENT_PROXY_TIMEOUT_MS = positiveInt(process.env.FILE_CONTENT_PROXY_TIMEOUT_MS, 120000);
const upload = createDiskUpload(MAX_ADMIN_UPLOAD_SIZE);
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo']);
const ALLOWED_ADMIN_FILE_CATEGORIES = new Set<FileCategory>(['general', 'template_cover', 'ref_image', 'ref_video', 'ai_video']);
const STORAGE_KEY_PATTERN = /^[a-z_]+\/\d{4}-\d{2}\/[a-zA-Z0-9_-]{8,16}\.[a-z0-9]{2,10}$/i;

function positiveInt(value: any, fallback: number): number {
  const parsed = parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function uploadFailed(res: Response, message: string, httpStatus = 400): void {
  error(res, ErrorCodes.FILE_UPLOAD_FAILED, message, httpStatus);
}

function getAdminFileCategory(value: unknown): FileCategory {
  const requested = String(value || 'general') as FileCategory;
  return ALLOWED_ADMIN_FILE_CATEGORIES.has(requested) ? requested : 'general';
}

function maxFileSizeForMime(mimeType: string): number {
  return String(mimeType || '').startsWith('video/') ? MAX_ADMIN_VIDEO_UPLOAD_SIZE : MAX_ADMIN_IMAGE_UPLOAD_SIZE;
}

function validateAdminUploadDescriptor(fileSize: number, mimeType: string): string | null {
  const isImage = mimeType.startsWith('image/');
  const isVideo = mimeType.startsWith('video/');
  if (isImage && !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) return '仅支持 jpg、jpeg、png、webp 图片';
  if (isVideo && !ALLOWED_VIDEO_MIME_TYPES.has(mimeType)) return '仅支持 mp4、mov、webm、avi 视频';
  if (!isImage && !isVideo) return '仅支持图片或视频文件';
  if (!Number.isFinite(fileSize) || fileSize <= 0) return '文件大小无效';

  const maxSize = isVideo ? MAX_ADMIN_VIDEO_UPLOAD_SIZE : MAX_ADMIN_IMAGE_UPLOAD_SIZE;
  if (fileSize > maxSize) return `${isVideo ? '视频' : '图片'}大小超过限制，最大 ${Math.round(maxSize / 1024 / 1024)}MB`;
  const sizeCheck = validateFileSize(fileSize, mimeType, {
    image: MAX_ADMIN_IMAGE_UPLOAD_SIZE,
    video: MAX_ADMIN_VIDEO_UPLOAD_SIZE,
  });
  if (!sizeCheck.valid) return `${isVideo ? '视频' : '图片'}大小超过限制`;
  return null;
}

function validateAdminFile(file: Express.Multer.File, validationBuffer: Buffer): string | null {
  const descriptorError = validateAdminUploadDescriptor(file.size, file.mimetype);
  if (descriptorError) return descriptorError;
  const isVideo = file.mimetype.startsWith('video/');
  const magicCheck = validateMagicBytes(validationBuffer, file.mimetype);
  if (!magicCheck.valid) return `${isVideo ? '视频' : '图片'}文件内容与类型不匹配`;
  return null;
}

function requestBaseUrl(req: Request): string {
  return publicRequestBaseUrl(req);
}

function absoluteFileUrl(req: Request, url: string): string {
  const value = String(url || '').trim();
  if (!value || /^https?:\/\//i.test(value)) return value;
  return `${requestBaseUrl(req)}${value.startsWith('/') ? value : `/${value}`}`;
}

function adminFileContentUrl(fileNo: string): string {
  return `/api/v1/admin/files/${encodeURIComponent(fileNo)}/content`;
}

function publicFileContentUrl(req: Request, fileNo: string): string {
  return absoluteFileUrl(req, `/api/v1/files/${encodeURIComponent(fileNo)}/content`);
}

function choosePublicDeliveryUrl(req: Request, fileNo: string, publicUrl: string): string {
  return absoluteFileUrl(req, publicUrl) || publicFileContentUrl(req, fileNo);
}

function storageSourceUrl(req: Request, file: any): string {
  const adapter = StorageService.getActiveAdapter();
  const raw = file.provider === adapter.provider && file.storage_key
    ? adapter.getAccessUrl(file.storage_key)
    : (file.cdn_url || file.access_url || '');
  return absoluteFileUrl(req, raw);
}

function buildAdminUploadResponse(req: Request, input: {
  fileId: number;
  fileNo: string;
  storageKey: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  publicUrl: string;
  accessUrl: string;
  provider: string;
}) {
  const displayUrl = adminFileContentUrl(input.fileNo);
  const absolutePublicUrl = choosePublicDeliveryUrl(req, input.fileNo, input.publicUrl);
  const publicProxyUrl = publicFileContentUrl(req, input.fileNo);
  const storageUrl = absoluteFileUrl(req, input.publicUrl);
  const accessUrl = absoluteFileUrl(req, input.accessUrl);
  const stablePublicUrl = absolutePublicUrl || publicProxyUrl;
  return {
    url: stablePublicUrl,
    deliveryUrl: stablePublicUrl,
    displayUrl,
    previewUrl: accessUrl || stablePublicUrl || publicProxyUrl || displayUrl,
    copyUrl: stablePublicUrl || publicProxyUrl || accessUrl,
    rawUrl: input.publicUrl,
    publicUrl: stablePublicUrl,
    storageUrl,
    publicProxyUrl,
    accessUrl,
    cdnUrl: storageUrl,
    fileId: input.fileId,
    fileNo: input.fileNo,
    filename: input.originalName,
    size: input.fileSize,
    mimeType: input.mimeType,
    storageProvider: input.provider,
  };
}

router.get('/files/upload-config', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    await preloadStorageConfigs();
    const provider = StorageService.getActiveProvider();
    StorageService.getActiveAdapter();
    success(res, {
      uploadMode: provider === 'local' ? 'server_relay' : 'direct_client',
      storageProvider: provider,
      directUploadProviders: ['qiniu_kodo', 'tencent_cos'],
      fallbackUploadUrl: '/api/v1/admin/files/upload',
      maxFileSize: MAX_ADMIN_UPLOAD_SIZE,
      maxImageSize: MAX_ADMIN_IMAGE_UPLOAD_SIZE,
      maxVideoSize: MAX_ADMIN_VIDEO_UPLOAD_SIZE,
      allowedMimeTypes: [
        ...Array.from(ALLOWED_IMAGE_MIME_TYPES),
        ...Array.from(ALLOWED_VIDEO_MIME_TYPES),
      ],
    });
  } catch (err: any) {
    error(res, ErrorCodes.FILE_STORAGE_ERROR, err?.message || '获取上传配置失败');
  }
});

router.get('/files/credential', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const originalName = String(req.query.originalName || '').trim();
    const mimeType = String(req.query.contentType || req.query.mimeType || '').trim();
    const fileSize = Number.parseInt(String(req.query.fileSize || ''), 10);
    if (!originalName || !mimeType || !fileSize) {
      error(res, ErrorCodes.PARAM_ERROR, '缺少参数: originalName, fileSize, contentType');
      return;
    }
    const descriptorError = validateAdminUploadDescriptor(fileSize, mimeType);
    if (descriptorError) {
      uploadFailed(res, descriptorError);
      return;
    }

    const fileCategory = getAdminFileCategory(req.query.category || req.query.fileCategory);
    const defaultRefType = fileCategory === 'template_cover' ? 'template_cover' : fileCategory === 'ai_video' ? 'template_preview' : 'admin_upload';
    const refType = String(req.query.refType || defaultRefType).slice(0, 32);
    const refId = String(req.query.refId || req.user!.userId || '').slice(0, 64);
    await preloadStorageConfigs();
    const adapter = StorageService.getActiveAdapter();
    const storageKey = StorageService.genStorageKey(fileCategory, originalName);
    const credential = await adapter.generateCredential({
      storageKey,
      contentType: mimeType,
      maxFileSize: maxFileSizeForMime(mimeType),
    });
    const fileNo = genFileNo();
    const [insertResult] = await query<any>(
      `INSERT INTO files
       (file_no, user_id, provider, storage_key, original_name, mime_type, file_size, width, height, duration,
        md5_hash, etag, access_url, cdn_url, file_category, visibility, ref_type, ref_id, created_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, 0, 0, 0, '', '', '', '', ?, 'public', ?, ?, NOW(3))`,
      [fileNo, adapter.provider, storageKey, originalName.slice(0, 256), mimeType.slice(0, 128), fileSize, fileCategory, refType, refId],
    );
    const fileId = Number((insertResult as any)?.insertId || 0);
    success(res, {
      ...credential,
      fileId,
      fileNo,
      storageProvider: adapter.provider,
      fallbackUploadUrl: '/api/v1/admin/files/upload',
    });
  } catch (err: any) {
    error(res, ErrorCodes.FILE_STORAGE_ERROR, err?.message || '生成上传凭证失败');
  }
});

async function confirmAdminUploadedStorageObject(req: Request, res: Response): Promise<void> {
  const storageKey = String(req.body?.storageKey || '').trim();
  if (!STORAGE_KEY_PATTERN.test(storageKey)) {
    error(res, ErrorCodes.PARAM_ERROR, 'storageKey 格式不正确');
    return;
  }

  const file = await queryOne<any>('SELECT * FROM files WHERE storage_key = ? AND user_id IS NULL AND is_deleted = 0', [storageKey]);
  if (!file) {
    error(res, ErrorCodes.FILE_NOT_FOUND, '未找到上传占位记录', 404);
    return;
  }

  await preloadStorageConfigs();
  const adapter = StorageService.getActiveAdapter();
  if (file.provider !== adapter.provider) {
    error(res, ErrorCodes.FILE_STORAGE_ERROR, '上传存储平台与当前配置不一致，请刷新后重试');
    return;
  }

  const mimeType = String(req.body?.mimeType || req.body?.contentType || file.mime_type || '').trim();
  const fileSize = positiveInt(req.body?.fileSize, Number(file.file_size || 0));
  const descriptorError = validateAdminUploadDescriptor(fileSize, mimeType);
  if (descriptorError) {
    uploadFailed(res, descriptorError);
    return;
  }

  const accessUrl = adapter.getAccessUrl(storageKey);
  const publicUrl = adapter.getCdnUrl(storageKey);
  const etag = String(req.body?.etag || file.etag || '').slice(0, 64);
  await query(
    `UPDATE files
        SET file_size = ?, mime_type = ?, etag = ?, access_url = ?, cdn_url = ?, updated_at = NOW(3)
      WHERE id = ?`,
    [fileSize, mimeType, etag, accessUrl, publicUrl, file.id],
  );
  await query(
    `INSERT INTO file_upload_logs
     (file_id, user_id, upload_mode, file_size, mime_type, duration_ms, source_ip, user_agent, status, created_at)
     VALUES (?, ?, 'direct_client', ?, ?, ?, ?, ?, 'success', NOW(3))`,
    [
      file.id,
      req.user!.userId,
      fileSize,
      mimeType,
      positiveInt(req.body?.durationMs, 0),
      req.ip || '',
      String(req.headers['user-agent'] || '').substring(0, 500),
    ],
  );
  await query(
    `INSERT INTO admin_operation_logs (admin_user_id, action, target_type, target_id, created_at)
     VALUES (?, ?, 'file', ?, NOW(3))`,
    [req.user!.userId, `file.upload.${file.file_category || 'general'}.direct_client`, String(file.id)],
  );

  success(res, buildAdminUploadResponse(req, {
    fileId: Number(file.id || 0),
    fileNo: String(file.file_no || ''),
    storageKey,
    originalName: String(file.original_name || ''),
    fileSize,
    mimeType,
    publicUrl,
    accessUrl,
    provider: adapter.provider,
  }), '上传成功');
}

router.post('/files/notify', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    await confirmAdminUploadedStorageObject(req, res);
  } catch (err: any) {
    error(res, ErrorCodes.FILE_STORAGE_ERROR, err?.message || '确认上传失败');
  }
});

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

    let validationBuffer: Buffer;
    try {
      validationBuffer = await readUploadForValidation(file);
    } catch (readErr: any) {
      await cleanupTempUpload(file);
      uploadFailed(res, readErr?.message || '上传文件读取失败', 500);
      return;
    }
    const validationError = validateAdminFile(file, validationBuffer);
    if (validationError) {
      await cleanupTempUpload(file);
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
      const uploadResult = await adapter.uploadLarge(storageKey, fs.createReadStream(file.path), file.mimetype, file.size, { publicRead: true });
      const publicUrl = uploadResult.cdnUrl || uploadResult.url || '';
      const imageMetadataBuffer = file.mimetype.startsWith('image/') ? await readUploadForImageMetadata(file) : null;
      const dims = imageMetadataBuffer ? getImageDimensions(imageMetadataBuffer) : { width: 0, height: 0 };
      const md5Hash = await md5File(file.path);
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
      const absolutePublicUrl = choosePublicDeliveryUrl(req, fileNo, publicUrl);
      const publicProxyUrl = publicFileContentUrl(req, fileNo);
      const storageUrl = absoluteFileUrl(req, publicUrl);
      const stablePublicUrl = absolutePublicUrl || publicProxyUrl;
      success(res, {
        url: stablePublicUrl,
        deliveryUrl: stablePublicUrl,
        displayUrl,
        previewUrl: accessUrl || stablePublicUrl || publicProxyUrl || displayUrl,
        copyUrl: stablePublicUrl || publicProxyUrl || accessUrl,
        rawUrl: publicUrl,
        publicUrl: stablePublicUrl,
        storageUrl,
        publicProxyUrl,
        accessUrl,
        cdnUrl: storageUrl,
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
      await cleanupTempUpload(file);
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
      streamLocalFileWithRange(req, res, filePath, file.mime_type || 'application/octet-stream', 'private, max-age=300');
      return;
    }

    const response = await axios.get(storageSourceUrl(req, file), {
      responseType: 'stream',
      timeout: FILE_CONTENT_PROXY_TIMEOUT_MS,
      headers: rangeRequestHeaders(req),
      validateStatus: status => (status >= 200 && status < 300) || status === 206,
    });
    pipeRemoteFileResponse(res, response, file.mime_type || response.headers['content-type'] || 'application/octet-stream', 'private, max-age=300');
  } catch (err: any) {
    if (res.headersSent) {
      res.destroy(err);
      return;
    }
    error(res, ErrorCodes.FILE_STORAGE_ERROR, err?.message || '文件读取失败');
  }
});

export default router;
