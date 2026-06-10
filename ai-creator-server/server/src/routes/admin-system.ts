// routes/admin-system.ts
import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { adminAuthMiddleware } from '../middleware/auth';
import { getDbPoolMetrics, query, queryOne } from '../utils/db';
import { success } from '../utils/response';
import { config } from '../utils/config';
import { getLocalUploadDir, ensureLocalUploadDir } from '../services/storage/local-paths';
import { StorageService } from '../services/storage/storage.service';
import { evaluateInstallStatus } from '../services/install-readiness.service';
import { runCronTask, type CronTaskName } from '../services/cron-watchdog.service';
import { readRuntimeReleaseVersion } from '../utils/runtime-version';

type CheckStatus = 'ok' | 'warning' | 'fail';

interface CheckResult {
  status: CheckStatus;
  message: string;
  details?: Record<string, any>;
}

const router = Router();
const serverRoot = path.resolve(__dirname, '../..');
const adminDistPath = path.resolve(serverRoot, '../admin-web/dist');
const serverBuildPath = path.resolve(serverRoot, 'dist/index.js');

function readPackageVersion(): string {
  return readRuntimeReleaseVersion(path.resolve(serverRoot, 'dist'), process.cwd());
}

function safeError(err: any): string {
  return err?.message ? String(err.message).slice(0, 300) : 'unknown error';
}

async function tableExists(tableName: string): Promise<boolean> {
  const row = await queryOne<any>(
    'SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
    [config.db.database, tableName],
  );
  return Number(row?.cnt || 0) > 0;
}

async function getLatestMigration() {
  try {
    if (!await tableExists('schema_migrations')) {
      return { data: null, status: 'warning', message: 'schema_migrations table not found' };
    }
    const row = await queryOne<any>(
      'SELECT migration_key, filename, checksum, executed_at, success, error_message FROM schema_migrations ORDER BY executed_at DESC, id DESC LIMIT 1',
    );
    return { data: row || null, status: row ? 'ok' : 'warning', message: row ? 'ok' : 'no migration records' };
  } catch (err: any) {
    return { data: null, status: 'warning', message: safeError(err) };
  }
}

async function getLatestRelease() {
  try {
    if (!await tableExists('app_releases')) {
      return { data: null, status: 'warning', message: 'app_releases table not found' };
    }
    const row = await queryOne<any>(
      'SELECT version, release_name, package_name, status, installed_at, note FROM app_releases ORDER BY installed_at DESC, id DESC LIMIT 1',
    );
    return { data: row || null, status: row ? 'ok' : 'warning', message: row ? 'ok' : 'no release records' };
  } catch (err: any) {
    return { data: null, status: 'warning', message: safeError(err) };
  }
}

async function checkDb(): Promise<CheckResult> {
  try {
    await query('SELECT 1 AS ok');
    return { status: 'ok', message: 'database query ok' };
  } catch (err: any) {
    return { status: 'fail', message: 'database query failed', details: { error: safeError(err) } };
  }
}

async function checkMigration(): Promise<CheckResult> {
  try {
    if (!await tableExists('schema_migrations')) {
      return { status: 'warning', message: 'schema_migrations table not found' };
    }
    const row = await queryOne<any>(
      'SELECT migration_key, filename, success, error_message, executed_at FROM schema_migrations ORDER BY executed_at DESC, id DESC LIMIT 1',
    );
    if (!row) return { status: 'warning', message: 'no migration records' };
    if (!row.success) {
      return { status: 'fail', message: 'latest migration failed', details: { migrationKey: row.migration_key, filename: row.filename, error: row.error_message || '' } };
    }
    return { status: 'ok', message: 'latest migration succeeded', details: { migrationKey: row.migration_key, filename: row.filename, executedAt: row.executed_at } };
  } catch (err: any) {
    return { status: 'warning', message: 'migration check failed', details: { error: safeError(err) } };
  }
}

function checkEnv(): CheckResult {
  const keys = ['DB_HOST', 'DB_NAME', 'DB_USER', 'JWT_SECRET', 'ENCRYPTION_KEY'];
  const presence = Object.fromEntries(keys.map(key => [key, { present: !!process.env[key] }]));
  const missing = keys.filter(key => !process.env[key]);
  return {
    status: missing.length > 0 ? 'warning' : 'ok',
    message: missing.length > 0 ? 'some required env vars are missing' : 'required env vars are present',
    details: { keys: presence, missing },
  };
}

function checkStorage(): CheckResult {
  try {
    const provider = StorageService.getActiveProvider();
    const missing = StorageService.getMissingConfigKeys(provider);
    const details: Record<string, any> = {
      provider,
      supportedProviders: StorageService.getSupportedProviders(),
      missingConfigKeys: missing,
    };
    if (provider === 'local') {
      details.localUploadDir = getLocalUploadDir();
      try {
        ensureLocalUploadDir();
        details.uploadDirWritable = true;
      } catch (err: any) {
        details.uploadDirWritable = false;
        details.uploadDirError = safeError(err);
        return { status: 'fail', message: 'local upload directory is not writable', details };
      }
    }
    if (missing.length > 0) {
      return { status: 'warning', message: 'storage provider config missing', details };
    }
    return { status: 'ok', message: 'storage provider is readable', details };
  } catch (err: any) {
    return {
      status: 'fail',
      message: 'storage provider is invalid',
      details: { error: safeError(err) },
    };
  }
}

function checkAdminDist(): CheckResult {
  const indexPath = path.join(adminDistPath, 'index.html');
  const exists = fs.existsSync(indexPath);
  return {
    status: exists ? 'ok' : 'warning',
    message: exists ? 'admin dist exists' : 'admin dist index.html not found',
    details: { path: adminDistPath, exists },
  };
}

function checkUploadDir(): CheckResult {
  const uploadDir = getLocalUploadDir();
  try {
    const exists = fs.existsSync(uploadDir);
    if (!exists) {
      return { status: 'warning', message: 'upload directory not found', details: { path: uploadDir, exists: false, writable: false } };
    }
    fs.accessSync(uploadDir, fs.constants.W_OK);
    return { status: 'ok', message: 'upload directory writable', details: { path: uploadDir, exists: true, writable: true } };
  } catch (err: any) {
    return { status: 'warning', message: 'upload directory is not writable', details: { path: uploadDir, exists: true, writable: false, error: safeError(err) } };
  }
}

async function checkInstallState(): Promise<CheckResult> {
  try {
    const status = await evaluateInstallStatus();
    const details = {
      state: status.state,
      installed: status.installed,
      lockFileExists: status.lockFileExists,
      lockFilePath: status.lockFilePath,
      lockInfo: status.lockInfo,
      environment: status.environment,
      database: status.database,
      diagnostics: status.diagnostics,
    };

    if (status.state === 'installed') {
      return { status: 'ok', message: status.message, details };
    }
    if (status.state === 'repair_required' || status.state === 'needs_finalize') {
      return { status: 'warning', message: status.message, details };
    }
    if (status.state === 'env_missing') {
      return { status: 'warning', message: status.message, details };
    }
    return { status: 'warning', message: status.message, details };
  } catch (err: any) {
    return { status: 'fail', message: 'install status check failed', details: { error: safeError(err) } };
  }
}

function aggregate(checks: Record<string, CheckResult>): CheckStatus {
  const values = Object.values(checks).map(item => item.status);
  if (values.includes('fail')) return 'fail';
  if (values.includes('warning')) return 'warning';
  return 'ok';
}

router.get('/system/version', adminAuthMiddleware, async (_req: Request, res: Response) => {
  const latestMigration = await getLatestMigration();
  const latestRelease = await getLatestRelease();
  success(res, {
    version: readPackageVersion(),
    nodeEnv: config.nodeEnv,
    uptime: process.uptime(),
    currentTime: new Date().toISOString(),
    latestMigration,
    latestRelease,
    adminDistExists: fs.existsSync(path.join(adminDistPath, 'index.html')),
    serverBuildExists: fs.existsSync(serverBuildPath),
  });
});

router.get('/system/check', adminAuthMiddleware, async (_req: Request, res: Response) => {
  const checks = {
    db: await checkDb(),
    migration: await checkMigration(),
    env: checkEnv(),
    storage: checkStorage(),
    install: await checkInstallState(),
    adminDist: checkAdminDist(),
    uploadDir: checkUploadDir(),
  };

  success(res, {
    status: aggregate(checks),
    checks,
  });
});

router.get('/system/metrics', adminAuthMiddleware, async (_req: Request, res: Response) => {
  const [activeTasks, queuedTasks, taskStats] = await Promise.all([
    queryOne<any>("SELECT COUNT(*) AS count FROM ai_tasks WHERE status = 'processing'"),
    queryOne<any>("SELECT COUNT(*) AS count FROM ai_tasks WHERE status = 'queued'"),
    queryOne<any>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
         AVG(CASE WHEN status = 'completed' AND completed_at IS NOT NULL
                  THEN TIMESTAMPDIFF(SECOND, COALESCE(provider_started_at, started_at, created_at), completed_at)
                  ELSE NULL END) AS avg_seconds
       FROM ai_tasks
       WHERE created_at >= DATE_SUB(NOW(3), INTERVAL 1 HOUR)`,
    ),
  ]);
  const total = Number(taskStats?.total || 0);
  const completed = Number(taskStats?.completed || 0);
  success(res, {
    activeTasks: Number(activeTasks?.count || 0),
    queuedTasks: Number(queuedTasks?.count || 0),
    taskSuccessRateLastHour: total > 0 ? completed / total : 0,
    avgCompletionSecondsLastHour: Number(taskStats?.avg_seconds || 0),
    dbPool: getDbPoolMetrics(),
  });
});

// POST /cron/:taskName — 手动触发定时任务（运维兜底 / 系统 crontab 触发）
const VALID_CRON_TASKS: CronTaskName[] = ['membership-expiry', 'monthly-points', 'daily-backup', 'ad-cleanup'];
router.post('/cron/:taskName', adminAuthMiddleware, async (req: Request, res: Response) => {
  const taskName = req.params.taskName as CronTaskName;
  if (!VALID_CRON_TASKS.includes(taskName)) {
    res.status(400).json({ code: 400, message: `无效的任务名，可选: ${VALID_CRON_TASKS.join(', ')}`, data: null });
    return;
  }
  const result = await runCronTask(taskName);
  res.json({ code: result.success ? 0 : 5000, message: result.message, data: result.data ?? null });
});

export default router;
