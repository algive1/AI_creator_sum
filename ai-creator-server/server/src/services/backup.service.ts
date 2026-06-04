import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { config } from '../utils/config';
import { sendBackupByEmail } from './backup-email.service';

const BACKUP_AUTO_DIR = path.join(config.release.appRootDir, 'backups/db/auto');
const BACKUP_RETENTION_DAYS = 7;
const BACKUP_TIMEOUT_MS = 5 * 60 * 1000;

function databaseConfig() {
  return {
    dbHost: config.db.host,
    dbPort: String(config.db.port || 3306),
    dbUser: config.db.user,
    dbPassword: config.db.password || '',
    dbName: config.db.database,
  };
}

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

async function runMysqldump(outputPath: string): Promise<void> {
  const { dbHost, dbPort, dbUser, dbPassword, dbName } = databaseConfig();
  fs.mkdirSync(BACKUP_AUTO_DIR, { recursive: true });

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
    }, BACKUP_TIMEOUT_MS);

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
    return true;
  } catch {
    return false;
  }
}

function cleanupOldBackups(): number {
  let deleted = 0;
  try {
    const files = fs.readdirSync(BACKUP_AUTO_DIR);
    const cutoff = Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const name of files) {
      if (!name.endsWith('.sql')) continue;
      const fullPath = path.join(BACKUP_AUTO_DIR, name);
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

export async function runDailyBackup(): Promise<{ success: boolean; message: string }> {
  const stamp = todayStamp();
  const filePath = path.join(BACKUP_AUTO_DIR, `${stamp}.sql`);

  // 今天已备份则跳过
  if (fs.existsSync(filePath) && verifyBackup(filePath)) {
    return { success: true, message: `Backup for ${stamp} already exists, skipped` };
  }

  // 尝试备份，失败重试一次
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await runMysqldump(filePath);
      if (verifyBackup(filePath)) {
        const deleted = cleanupOldBackups();
        const sizeMB = (fs.statSync(filePath).size / 1024 / 1024).toFixed(1);
        console.log(`[Backup] Daily backup completed: ${filePath} (${sizeMB}MB)${deleted > 0 ? `, cleaned ${deleted} old` : ''}`);
        // 异步发邮件，不阻塞备份流程
        sendBackupByEmail(filePath).catch(err =>
          console.error('[Backup] Email send failed:', err?.message || err),
        );
        return { success: true, message: `Backup completed on attempt ${attempt}` };
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
