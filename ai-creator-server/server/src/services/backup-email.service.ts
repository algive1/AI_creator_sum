import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import os from 'os';
import { config } from '../utils/config';
import { SettingsService } from './settings.service';

interface EmailConfig {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
}

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 超过 20MB 不发附件，只发通知

async function loadConfig(): Promise<EmailConfig> {
  const [enabled, from, to] = await Promise.all([
    SettingsService.getBoolean('backup.email.enabled', false),
    SettingsService.getString('backup.email.from', ''),
    SettingsService.getString('backup.email.to', ''),
  ]);

  return {
    enabled,
    host: process.env.BACKUP_EMAIL_SMTP_HOST || '',
    port: parseInt(process.env.BACKUP_EMAIL_SMTP_PORT || '465', 10),
    user: process.env.BACKUP_EMAIL_SMTP_USER || '',
    pass: process.env.BACKUP_EMAIL_SMTP_PASS || '',
    from,
    to,
  };
}

export async function sendBackupByEmail(backupPath: string): Promise<boolean> {
  const cfg = await loadConfig();
  if (!cfg.enabled) return false;
  if (!cfg.host || !cfg.user || !cfg.pass || !cfg.from || !cfg.to) {
    console.error('[BackupEmail] SMTP not fully configured, skipping email');
    return false;
  }

  const stat = fs.statSync(backupPath);
  const originalSize = stat.size;

  // gzip 压缩
  const gzPath = path.join(os.tmpdir(), `backup-${path.basename(backupPath)}.gz`);
  try {
    const raw = fs.readFileSync(backupPath);
    const compressed = zlib.gzipSync(raw);
    fs.writeFileSync(gzPath, compressed);
  } catch (err: any) {
    console.error('[BackupEmail] Gzip compression failed:', err?.message || err);
    try { fs.unlinkSync(gzPath); } catch { /* ignore */ }
    return false;
  }

  const gzSize = fs.statSync(gzPath).size;
  const dateLabel = new Date().toISOString().slice(0, 10);
  const attachTooBig = gzSize > MAX_ATTACHMENT_BYTES;

  try {
    // 动态 import nodemailer（避免未安装时启动报错）
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });

    const recipients = cfg.to.split(',').map(s => s.trim()).filter(Boolean);

    await transporter.sendMail({
      from: cfg.from,
      to: recipients.join(', '),
      subject: `[AI Creator] 数据库备份 ${dateLabel}`,
      text: attachTooBig
        ? `数据库备份已完成。\n原始大小: ${(originalSize / 1024 / 1024).toFixed(1)}MB\n压缩后: ${(gzSize / 1024 / 1024).toFixed(1)}MB\n文件过大(${(gzSize / 1024 / 1024).toFixed(1)}MB > 20MB)，未附加。\n备份路径: ${backupPath}`
        : `数据库备份已完成。\n原始大小: ${(originalSize / 1024 / 1024).toFixed(1)}MB\n压缩后: ${(gzSize / 1024 / 1024).toFixed(1)}MB\n附件: ${path.basename(gzPath)}`,
      ...(attachTooBig ? {} : {
        attachments: [{
          filename: `ai-creator-backup-${dateLabel}.sql.gz`,
          path: gzPath,
        }],
      }),
    });

    console.log(`[BackupEmail] Sent to ${recipients.join(',')} (${(gzSize / 1024 / 1024).toFixed(1)}MB${attachTooBig ? ', attachment skipped due to size' : ', attached'})`);
    return true;
  } catch (err: any) {
    console.error('[BackupEmail] Send failed:', err?.message || err);
    return false;
  } finally {
    try { fs.unlinkSync(gzPath); } catch { /* ignore */ }
  }
}
