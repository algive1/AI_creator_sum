import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { adminAuthMiddleware } from '../middleware/auth';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { config } from '../utils/config';
import { runDailyBackup } from '../services/backup.service';
import { sendBackupByEmail } from '../services/backup-email.service';
import { SettingsService } from '../services/settings.service';

const router = Router();
const BACKUP_DIR = path.join(config.release.appRootDir, 'backups/db');
const AUTO_DIR = path.join(BACKUP_DIR, 'auto');

function listBackupFiles(): { name: string; size: number; mtime: string; path: string }[] {
  const files: { name: string; size: number; mtime: string; path: string }[] = [];
  for (const dir of [BACKUP_DIR, AUTO_DIR]) {
    try {
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.sql')) continue;
        const full = path.join(dir, name);
        try {
          const stat = fs.statSync(full);
          files.push({ name, size: stat.size, mtime: stat.mtime.toISOString(), path: full });
        } catch { /* skip */ }
      }
    } catch { /* dir not exist yet */ }
  }
  return files.sort((a, b) => b.mtime.localeCompare(a.mtime)).slice(0, 50);
}

// GET /backup/history
router.get('/backup/history', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const files = listBackupFiles();
    const emailEnabled = await SettingsService.getBoolean('backup.email.enabled', false);
    const emailFrom = await SettingsService.getString('backup.email.from', '');
    const emailTo = await SettingsService.getString('backup.email.to', '');
    success(res, {
      files: files.map(f => ({
        name: f.name,
        size: f.size,
        sizeMB: parseFloat((f.size / 1024 / 1024).toFixed(2)),
        mtime: f.mtime,
      })),
      email: { enabled: emailEnabled, from: emailFrom, to: emailTo },
    });
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, '获取备份历史失败: ' + (e.message || ''));
  }
});

// POST /backup/trigger
router.post('/backup/trigger', adminAuthMiddleware, async (_req: Request, res: Response) => {
  const result = await runDailyBackup();
  if (result.success) {
    success(res, { message: result.message });
  } else {
    error(res, ErrorCodes.SERVER_ERROR, result.message);
  }
});

// POST /backup/test-email
router.post('/backup/test-email', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    // 找最近一个备份文件做测试
    const files = listBackupFiles();
    if (files.length === 0) {
      error(res, ErrorCodes.PARAM_ERROR, '没有可用的备份文件，请先手动触发一次备份');
      return;
    }
    const sent = await sendBackupByEmail(files[0].path);
    if (sent) {
      success(res, { message: '测试邮件已发送，请检查收件箱' });
    } else {
      error(res, ErrorCodes.SERVER_ERROR, '邮件发送失败，请检查 SMTP 配置和服务器日志');
    }
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, '发送测试邮件失败: ' + (e.message || ''));
  }
});

// PUT /backup/email-config
router.put('/backup/email-config', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { enabled, from, to } = req.body;
    const sets: { key: string; value: string; type: string }[] = [];
    if (enabled !== undefined && enabled !== null) {
      sets.push({ key: 'backup.email.enabled', value: enabled ? 'true' : 'false', type: 'boolean' });
    }
    if (from !== undefined) {
      sets.push({ key: 'backup.email.from', value: String(from), type: 'string' });
    }
    if (to !== undefined) {
      sets.push({ key: 'backup.email.to', value: String(to), type: 'string' });
    }
    if (sets.length === 0) {
      error(res, ErrorCodes.PARAM_ERROR, '无可更新的字段');
      return;
    }
    const adminUserId = req.user!.userId || 1;
    for (const s of sets) {
      await SettingsService.set(s.key, s.value, adminUserId);
    }
    success(res, { updated: true });
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, '更新邮件配置失败: ' + (e.message || ''));
  }
});

export default router;
