import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { adminAuthMiddleware } from '../middleware/auth';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { getBackupRuntimeConfig, runDailyBackup } from '../services/backup.service';
import { getBackupEmailConfigForAdmin, sendBackupByEmail } from '../services/backup-email.service';
import { SettingsService } from '../services/settings.service';

const router = Router();

function asBool(value: any, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'off'].includes(text)) return false;
  return fallback;
}

function boundedInt(value: any, fallback: number, min: number, max: number): number {
  const parsed = parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

async function listBackupFiles(): Promise<{ files: { name: string; size: number; mtime: string; path: string; location: string }[]; runtime: Awaited<ReturnType<typeof getBackupRuntimeConfig>> }> {
  const runtime = await getBackupRuntimeConfig();
  const files: { name: string; size: number; mtime: string; path: string }[] = [];
  const dirs = Array.from(new Set([runtime.baseDir, runtime.autoDir]));
  for (const dir of dirs) {
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
  return {
    files: files
      .sort((a, b) => b.mtime.localeCompare(a.mtime))
      .slice(0, 50)
      .map(item => ({
        ...item,
        location: path.relative(runtime.baseDir, item.path).replace(/\\/g, '/') || item.name,
      })),
    runtime,
  };
}

// GET /backup/history
router.get('/backup/history', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    const { files, runtime } = await listBackupFiles();
    const email = await getBackupEmailConfigForAdmin();
    success(res, {
      files: files.map(f => ({
        name: f.name,
        location: f.location,
        size: f.size,
        sizeMB: parseFloat((f.size / 1024 / 1024).toFixed(2)),
        mtime: f.mtime,
      })),
      backup: {
        enabled: runtime.enabled,
        dir: runtime.baseDir,
        autoDir: runtime.autoDir,
        retentionDays: runtime.retentionDays,
        autoHour: runtime.autoHour,
        timeoutSeconds: Math.round(runtime.timeoutMs / 1000),
      },
      email,
    });
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, '获取备份历史失败: ' + (e.message || ''));
  }
});

// POST /backup/trigger
router.post('/backup/trigger', adminAuthMiddleware, async (_req: Request, res: Response) => {
  const result = await runDailyBackup({ manual: true });
  if (result.success) {
    const { files } = await listBackupFiles();
    success(res, { message: result.message, filePath: result.filePath, files });
  } else {
    error(res, ErrorCodes.SERVER_ERROR, result.message);
  }
});

// POST /backup/test-email
router.post('/backup/test-email', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    // 找最近一个备份文件做测试
    const { files } = await listBackupFiles();
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
    const body = req.body || {};
    const sets: { key: string; value: string; isSecret?: boolean }[] = [];
    if (body.backupEnabled !== undefined || body.enabledAutoBackup !== undefined) {
      sets.push({ key: 'backup.enabled', value: asBool(body.backupEnabled ?? body.enabledAutoBackup, true) ? 'true' : 'false' });
    }
    if (body.backupDir !== undefined || body.dir !== undefined) {
      sets.push({ key: 'backup.dir', value: String(body.backupDir ?? body.dir ?? '').trim() });
    }
    if (body.retentionDays !== undefined) {
      sets.push({ key: 'backup.retention_days', value: String(boundedInt(body.retentionDays, 7, 1, 365)) });
    }
    if (body.autoHour !== undefined) {
      sets.push({ key: 'backup.auto_hour', value: String(boundedInt(body.autoHour, 3, 0, 23)) });
    }
    if (body.timeoutSeconds !== undefined) {
      sets.push({ key: 'backup.timeout_seconds', value: String(boundedInt(body.timeoutSeconds, 300, 30, 3600)) });
    }
    if (body.emailEnabled !== undefined || body.enabled !== undefined) {
      sets.push({ key: 'backup.email.enabled', value: asBool(body.emailEnabled ?? body.enabled, false) ? 'true' : 'false' });
    }
    if (body.smtpHost !== undefined || body.host !== undefined) {
      sets.push({ key: 'backup.email.smtp_host', value: String(body.smtpHost ?? body.host ?? '').trim() });
    }
    if (body.smtpPort !== undefined || body.port !== undefined) {
      sets.push({ key: 'backup.email.smtp_port', value: String(boundedInt(body.smtpPort ?? body.port, 465, 1, 65535)) });
    }
    if (body.smtpSecure !== undefined || body.secure !== undefined) {
      sets.push({ key: 'backup.email.smtp_secure', value: asBool(body.smtpSecure ?? body.secure, true) ? 'true' : 'false' });
    }
    if (body.smtpUser !== undefined || body.user !== undefined) {
      sets.push({ key: 'backup.email.smtp_user', value: String(body.smtpUser ?? body.user ?? '').trim() });
    }
    if (body.smtpPass !== undefined || body.pass !== undefined) {
      const pass = String(body.smtpPass ?? body.pass ?? '').trim();
      if (pass) sets.push({ key: 'backup.email.smtp_pass', value: pass, isSecret: true });
    }
    if (body.from !== undefined) {
      sets.push({ key: 'backup.email.from', value: String(body.from).trim() });
    }
    if (body.to !== undefined) {
      sets.push({ key: 'backup.email.to', value: String(body.to).trim() });
    }
    if (sets.length === 0) {
      error(res, ErrorCodes.PARAM_ERROR, '无可更新的字段');
      return;
    }
    const adminUserId = req.user!.userId || 1;
    for (const s of sets) {
      await SettingsService.set(s.key, s.value, 'backup', adminUserId, { isSecret: !!s.isSecret });
    }
    const runtime = await getBackupRuntimeConfig();
    const email = await getBackupEmailConfigForAdmin();
    success(res, {
      updated: true,
      backup: {
        enabled: runtime.enabled,
        dir: runtime.baseDir,
        autoDir: runtime.autoDir,
        retentionDays: runtime.retentionDays,
        autoHour: runtime.autoHour,
        timeoutSeconds: Math.round(runtime.timeoutMs / 1000),
      },
      email,
    });
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, '更新备份配置失败: ' + (e.message || ''));
  }
});

export default router;
