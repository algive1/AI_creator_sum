import fs from 'fs';
import path from 'path';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { adminAuthMiddleware } from '../middleware/auth';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { config } from '../utils/config';
import {
  getInstallLogs,
  getInstallStatus,
  listUpdatePackages,
  precheckUpdatePackage,
  restoreDatabaseBackup,
  startInstallUpdatePackage,
} from '../services/update-package.service';

const router = Router();
const SEMVER_PATTERN_TEXT = '(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?';
const RELEASE_FILENAME = new RegExp(`^ai-creator-release-${SEMVER_PATTERN_TEXT}\\.tar\\.gz$`);
const MAX_UPDATE_PACKAGE_SIZE = parseInt(process.env.UPDATE_PACKAGE_UPLOAD_MAX_SIZE || `${500 * 1024 * 1024}`, 10);

function normalizeUploadFilename(originalName: string): { ok: boolean; filename?: string; message?: string } {
  const filename = String(originalName || '').trim();
  if (!filename) return { ok: false, message: '上传文件名为空' };
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..') || path.isAbsolute(filename) || /^[A-Za-z]:/.test(filename)) {
    return { ok: false, message: '上传文件名非法，只允许普通文件名' };
  }
  if (filename.endsWith('.zip')) return { ok: false, message: '当前仅支持 .tar.gz 发布包' };
  if (!filename.endsWith('.tar.gz')) return { ok: false, message: '当前仅支持 .tar.gz 发布包' };
  if (!RELEASE_FILENAME.test(filename)) {
    return { ok: false, message: '发布包文件名必须为 ai-creator-release-<版本号>.tar.gz，例如 ai-creator-release-1.0.3.tar.gz' };
  }
  return { ok: true, filename };
}

function updatePackagePath(filename: string): string {
  const base = path.resolve(config.release.updatePackagesDir);
  const target = path.resolve(base, filename);
  if (!target.startsWith(`${base}${path.sep}`)) throw new Error('上传路径非法');
  return target;
}

const updatePackageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        fs.mkdirSync(config.release.updatePackagesDir, { recursive: true });
        cb(null, config.release.updatePackagesDir);
      } catch (err: any) {
        cb(new Error(`更新包目录不可写：${err?.message || String(err)}`), config.release.updatePackagesDir);
      }
    },
    filename: (_req, file, cb) => {
      const normalized = normalizeUploadFilename(file.originalname);
      if (!normalized.ok || !normalized.filename) {
        cb(new Error(normalized.message || '上传文件名非法'), file.originalname);
        return;
      }
      const target = updatePackagePath(normalized.filename);
      if (fs.existsSync(target)) {
        cb(new Error(`更新包已存在：${normalized.filename}，请先删除旧文件或使用新的版本号`), normalized.filename);
        return;
      }
      cb(null, normalized.filename);
    },
  }),
  limits: { fileSize: MAX_UPDATE_PACKAGE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    const normalized = normalizeUploadFilename(file.originalname);
    if (!normalized.ok) {
      cb(new Error(normalized.message || '上传文件名非法'));
      return;
    }
    cb(null, true);
  },
});

function uploadErrorMessage(err: any): string {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return `更新包大小超过限制，最大 ${Math.round(MAX_UPDATE_PACKAGE_SIZE / 1024 / 1024)}MB`;
  }
  return err?.message || '更新包上传失败';
}

router.get('/system/update-packages', adminAuthMiddleware, async (_req: Request, res: Response) => {
  const result = await listUpdatePackages();
  success(res, result);
});

router.post('/system/update-packages/upload', adminAuthMiddleware, async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    error(res, ErrorCodes.FORBIDDEN, '只有超级管理员可以上传更新包', 403);
    return;
  }

  updatePackageUpload.single('file')(req, res, async (err: any) => {
    if (err) {
      error(res, ErrorCodes.FILE_UPLOAD_FAILED, uploadErrorMessage(err), 400);
      return;
    }

    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      error(res, ErrorCodes.FILE_UPLOAD_FAILED, '未找到上传文件', 400);
      return;
    }

    try {
      if (file.size <= 0) {
        fs.unlinkSync(file.path);
        error(res, ErrorCodes.FILE_UPLOAD_FAILED, '更新包不能为空', 400);
        return;
      }

      const stat = fs.statSync(file.path);
      success(res, {
        filename: file.filename,
        size: stat.size,
        packageDir: config.release.updatePackagesDir,
        uploadedAt: stat.mtime.toISOString(),
      }, '更新包上传成功');
    } catch (uploadErr: any) {
      try {
        if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      } catch {
        // Ignore cleanup errors after upload failure.
      }
      error(res, ErrorCodes.FILE_UPLOAD_FAILED, uploadErr?.message || '更新包上传失败', 500);
    }
  });
});

router.post('/system/update-packages/precheck', adminAuthMiddleware, async (req: Request, res: Response) => {
  const filename = typeof req.body?.filename === 'string' ? req.body.filename : '';
  const result = await precheckUpdatePackage(filename);
  success(res, result);
});

router.post('/system/update-packages/install', adminAuthMiddleware, async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    error(res, ErrorCodes.FORBIDDEN, 'Super admin only', 403);
    return;
  }

  const filename = typeof req.body?.filename === 'string' ? req.body.filename : '';
  const confirmText = typeof req.body?.confirmText === 'string' ? req.body.confirmText : '';
  const operator = `admin:${req.user?.userId || 'unknown'}`;
  const result = await startInstallUpdatePackage(filename, confirmText, operator);
  if (!result.ok) {
    error(res, ErrorCodes.PARAM_ERROR, result.message, 400);
    return;
  }
  success(res, result);
});

router.get('/system/update-packages/install-status', adminAuthMiddleware, async (_req: Request, res: Response) => {
  success(res, getInstallStatus());
});

router.get('/system/update-packages/install-logs', adminAuthMiddleware, async (req: Request, res: Response) => {
  const installId = typeof req.query?.installId === 'string' ? req.query.installId : undefined;
  success(res, getInstallLogs(installId));
});

router.post('/system/update-packages/restore-database', adminAuthMiddleware, async (req: Request, res: Response) => {
  if (req.user?.role !== 'super_admin') {
    error(res, ErrorCodes.FORBIDDEN, '只有超级管理员可以导入数据库备份', 403);
    return;
  }

  try {
    const backupPath = typeof req.body?.backupPath === 'string' ? req.body.backupPath : undefined;
    const result = await restoreDatabaseBackup(backupPath);
    success(res, result, result.message);
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '数据库备份导入失败', 500);
  }
});

export default router;
