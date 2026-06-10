import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { config } from '../utils/config';
import { sendBackupByEmail } from './backup-email.service';
import { SettingsService } from './settings.service';

const DEFAULT_BACKUP_DIR = path.join(config.release.appRootDir, 'backups/db');
const DEFAULT_BACKUP_RETENTION_DAYS = 7;
const DEFAULT_BACKUP_TIMEOUT_MS = 5 * 60 * 1000;

export interface BackupRuntimeConfig {
  enabled: boolean;
  baseDir: string;
  autoDir: string;
  retentionDays: number;
  autoHour: number;
  timeoutMs: number;
}

function databaseConfig() {
  return {
    dbHost: config.db.host,
    dbPort: String(config.db.port || 3306),
    dbUser: config.db.user,
    dbPassword: config.db.password || '',
    dbName: config.db.database,
  };
}

function parseBoundedInt(value: string, fallback: number, min: number, max: number): number {
  const parsed = parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function resolveBackupBaseDir(value: string): string {
  const configured = String(value || '').trim();
  if (!configured) return DEFAULT_BACKUP_DIR;
  return path.resolve(configured);
}

export async function getBackupRuntimeConfig(): Promise<BackupRuntimeConfig> {
  const [enabled, dir, retentionDays, autoHour, timeoutSeconds] = await Promise.all([
    SettingsService.getBoolean('backup.enabled', true),
    SettingsService.getString('backup.dir', ''),
    SettingsService.getString('backup.retention_days', String(DEFAULT_BACKUP_RETENTION_DAYS)),
    SettingsService.getString('backup.auto_hour', '3'),
    SettingsService.getString('backup.timeout_seconds', String(DEFAULT_BACKUP_TIMEOUT_MS / 1000)),
  ]);
  const baseDir = resolveBackupBaseDir(dir);
  return {
    enabled,
    baseDir,
    autoDir: path.join(baseDir, 'auto'),
    retentionDays: parseBoundedInt(retentionDays, DEFAULT_BACKUP_RETENTION_DAYS, 1, 365),
    autoHour: parseBoundedInt(autoHour, 3, 0, 23),
    timeoutMs: parseBoundedInt(timeoutSeconds, DEFAULT_BACKUP_TIMEOUT_MS / 1000, 30, 3600) * 1000,
  };
}

export async function shouldRunDailyBackupNow(date = new Date()): Promise<boolean> {
  const runtime = await getBackupRuntimeConfig();
  return runtime.enabled && date.getHours() === runtime.autoHour;
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

async function runMysqldump(outputPath: string, runtime: BackupRuntimeConfig): Promise<void> {
  const { dbHost, dbPort, dbUser, dbPassword, dbName } = databaseConfig();
  fs.mkdirSync(runtime.autoDir, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const out = fs.createWriteStream(outputPath, { flags: 'wx' });
    const child = spawn(
      'mysqldump',
      ['--single-transaction', '--routines', '--triggers', '-h', dbHost, '-P', dbPort, '-u', dbUser, dbName],
      {
        env: { ...process.env, MYSQL_PWD: dbPassword },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stderr = '';
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      out.close();
      reject(new Error('mysqldump timed out'));
    }, runtime.timeoutMs);

    child.stdout.pipe(out);
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      out.close();
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      out.close();
      if (code === 0) resolve();
      else reject(new Error(`mysqldump exit ${code}: ${stderr.slice(0, 300)}`));
    });
  });
}

function verifyBackup(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size <= 0) {
      console.error('[Backup] Backup file is empty:', filePath);
      return false;
    }
    // 检查 SQL 文件头部（前 1KB 应包含 CREATE TABLE 或 INSERT 等 SQL 关键字）
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(1024);
    fs.readSync(fd, buf, 0, 1024, 0);
    fs.closeSync(fd);
    const head = buf.toString('utf-8');
    if (!/CREATE\s+(TABLE|DATABASE)|INSERT\s+INTO|--\s+(MySQL|phpMyAdmin)/i.test(head)) {
      console.error('[Backup] Backup file does not contain valid SQL:', filePath);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function cleanupOldBackups(runtime: BackupRuntimeConfig): number {
  let deleted = 0;
  try {
    const files = fs.readdirSync(runtime.autoDir);
    const cutoff = Date.now() - runtime.retentionDays * 24 * 60 * 60 * 1000;
    for (const name of files) {
      if (!name.endsWith('.sql')) continue;
      const fullPath = path.join(runtime.autoDir, name);
      try {
        if (fs.statSync(fullPath).mtimeMs < cutoff) {
          fs.unlinkSync(fullPath);
          deleted++;
        }
      } catch { /* skip permission errors */ }
    }
  } catch { /* dir may not exist yet */ }
  return deleted;
}

export async function runDailyBackup(options: { manual?: boolean } = {}): Promise<{ success: boolean; message: string; filePath?: string }> {
  const runtime = await getBackupRuntimeConfig();
  if (!runtime.enabled && !options.manual) {
    return { success: true, message: 'Automatic backup is disabled in admin settings' };
  }

  const stamp = todayStamp();
  const filePath = path.join(runtime.autoDir, `${stamp}.sql`);

  // 今天已备份则跳过
  if (fs.existsSync(filePath) && verifyBackup(filePath)) {
    return { success: true, message: `Backup for ${stamp} already exists, skipped`, filePath };
  }

  // 尝试备份，失败重试一次
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await runMysqldump(filePath, runtime);
      if (verifyBackup(filePath)) {
        const deleted = cleanupOldBackups(runtime);
        const sizeMB = (fs.statSync(filePath).size / 1024 / 1024).toFixed(1);
        console.log(`[Backup] Daily backup completed: ${filePath} (${sizeMB}MB)${deleted > 0 ? `, cleaned ${deleted} old` : ''}`);
        // 异步发邮件，不阻塞备份流程
        sendBackupByEmail(filePath).catch(err =>
          console.error('[Backup] Email send failed:', err?.message || err),
        );
        return { success: true, message: `Backup completed on attempt ${attempt}`, filePath };
      }
      console.error(`[Backup] Verification failed on attempt ${attempt}`);
    } catch (err: any) {
      console.error(`[Backup] Attempt ${attempt} failed:`, err?.message || err);
      // 清理失败文件
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }
  }

  console.error('[Backup] All attempts failed, daily backup skipped');
  return { success: false, message: 'All backup attempts failed' };
}
