import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import os from 'os';
import { SettingsService } from './settings.service';

interface EmailConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string;
}

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 超过 20MB 不发附件，只发通知

function parsePort(value: string): number {
  const port = parseInt(String(value || ''), 10);
  return Number.isFinite(port) && port > 0 ? port : 465;
}

async function loadConfig(): Promise<EmailConfig> {
  const [enabled, host, port, secure, user, pass, from, to] = await Promise.all([
    SettingsService.getBoolean('backup.email.enabled', false),
    SettingsService.getString('backup.email.smtp_host', ''),
    SettingsService.getString('backup.email.smtp_port', '465'),
    SettingsService.getBoolean('backup.email.smtp_secure', true),
    SettingsService.getString('backup.email.smtp_user', ''),
    SettingsService.getString('backup.email.smtp_pass', ''),
    SettingsService.getString('backup.email.from', ''),
    SettingsService.getString('backup.email.to', ''),
  ]);

  return {
    enabled,
    host,
    port: parsePort(port),
    secure,
    user,
    pass,
    from,
    to,
  };
}

export async function getBackupEmailConfigForAdmin() {
  const cfg = await loadConfig();
  return {
    enabled: cfg.enabled,
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    user: cfg.user,
    from: cfg.from,
    to: cfg.to,
    passConfigured: !!cfg.pass,
    passMasked: cfg.pass ? SettingsService.maskValue(cfg.pass, 'backup.email.smtp_pass') : '',
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
      secure: cfg.secure,
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
