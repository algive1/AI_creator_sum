// src/index.ts
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { config } from './utils/config';
import { installMiddleware, checkInstalled } from './middleware/install';
import installRoutes from './routes/install';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import pointsRoutes from './routes/points';
import checkinRoutes from './routes/checkin';
import pointTaskRoutes from './routes/point-tasks';
import adsRoutes from './routes/ads';
import inviteRoutes from './routes/invite';
import taskRoutes from './routes/tasks';
import appHomeRoutes from './routes/app-home';
import legalRoutes from './routes/legal';
import announcementRoutes from './routes/announcements';
import complianceRoutes from './routes/compliance';
import publicConfigRoutes from './routes/public-config';
import templateRoutes from './routes/content-templates';
import membershipRoutes from './routes/membership';
import shopRoutes from './routes/shop';
import orderRoutes from './routes/orders';
import wechatPaymentRoutes from './routes/wechat-payments';
import adminRoutes from './routes/admin';
import adminModelRoutes from './routes/admin-models';
import adminMembershipRoutes from './routes/admin-membership';
import adminPointTaskRoutes from './routes/admin-point-tasks';
import adminInviteRoutes from './routes/admin-invite';
import adminTemplateRoutes from './routes/admin-templates';
import adminContentRoutes from './routes/admin-content';
import adminTierRoutes from './routes/admin-tiers';
import adminSystemRoutes from './routes/admin-system';
import adminSystemUpdateRoutes from './routes/admin-system-updates';
import adminPaymentRoutes from './routes/admin-payments';
import adminConfigCheckRoutes from './routes/admin-config-check';
import adminBackupRoutes from './routes/admin-backup';
import adminFileRoutes from './routes/admin-files';
import filesRoutes from './routes/files';
import { preloadStorageConfigs } from './services/storage/storage-config-loader';
import { ensureLocalUploadDir, getLocalStaticMountPath } from './services/storage/local-paths';
import { recoverStaleAiTasks } from './services/task.service';
import { startVideoPollingScheduler } from './services/video-polling.service';
import { processExpiredMemberships } from './services/membership.service';
import { processMembershipMonthlyPointGrants } from './services/membership-points.service';
import { recoverPendingGrants } from './services/payment-order.service';
import { recoverOrphanedTextCharges } from './services/ai-feature.service';
import { buildMemberBenefitIconSvg } from './services/member-benefit-icons.service';
import { runDailyBackup } from './services/backup.service';
import { registerCronHeartbeat, startCronWatchdog, wrapCronTask, type CronTaskName } from './services/cron-watchdog.service';
import rateLimit from 'express-rate-limit';
import { getInstallLockPath } from './services/install-readiness.service';
import { endDbPool, queryOne } from './utils/db';

const app = express();

// 信任 Nginx/宝塔 反向代理的 X-Forwarded-For 头，否则限流和 IP 相关功能会异常
app.set('trust proxy', 1);

// 全局限流：每个 IP 每分钟最多 200 次请求
app.use(rateLimit({ windowMs: 60_000, max: 200, standardHeaders: true, legacyHeaders: false, message: { code: 429, message: '请求过于频繁，请稍后重试', data: null } }));


// 登录接口严格限流：每个 IP 每分钟最多 10 次
const authLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false, message: { code: 429, message: '登录尝试过于频繁，请稍后重试', data: null } });

// 安全响应头
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(cors());
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: true }));

if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
}

function isBlockedProbeRequest(req: express.Request): boolean {
  if (req.path.startsWith('/@fs') || req.path === '/proxy' || req.path.startsWith('/proxy/')) return true;
  if (req.path === '/' && ('url' in req.query || 'dest' in req.query)) return true;
  return false;
}

function readRuntimeReleaseVersion(): string {
  const candidates = [
    path.resolve(__dirname, '../../../release.json'),
    path.resolve(__dirname, '../../release.json'),
    path.resolve(__dirname, '../package.json'),
  ];
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (parsed?.version) return String(parsed.version);
    } catch {
      // Ignore invalid optional version files.
    }
  }
  return 'unknown';
}

async function warnIfNoUsableAiProvider(): Promise<void> {
  const row = await queryOne<any>(
    `SELECT COUNT(*) AS cnt
       FROM ai_model_providers
      WHERE status = 'active'
        AND COALESCE(api_base_url, '') <> ''
        AND COALESCE(api_key, '') <> ''`,
  );
  if (Number(row?.cnt || 0) === 0) {
    console.warn('[Startup] No usable AI provider API Key is configured. Configure at least one provider Base URL and API Key in the admin model settings; the mini program will hide tiers without usable providers.');
  }
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', releaseVersion: readRuntimeReleaseVersion(), timestamp: new Date().toISOString() });
});

app.get('/assets/member-benefit-icons/:slug.svg', (req, res) => {
  const svg = buildMemberBenefitIconSvg(req.params.slug);
  if (!svg) {
    res.status(404).type('text/plain').send('Not found');
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.type('image/svg+xml').send(svg);
});

app.use(installMiddleware);

app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/points', pointsRoutes);
app.use('/api/v1/checkin', checkinRoutes);
app.use('/api/v1/point-tasks', pointTaskRoutes);
app.use('/api/v1/ads', adsRoutes);
app.use('/api/v1/invite', inviteRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/app', appHomeRoutes);
app.use('/api/v1/legal', legalRoutes);
app.use('/api/v1/announcements', announcementRoutes);
app.use('/api/v1/compliance', complianceRoutes);
app.use('/api/v1/templates', templateRoutes);
app.use('/api/v1/membership', membershipRoutes);
app.use('/api/v1/shop', shopRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/payments', wechatPaymentRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/admin/models', adminModelRoutes);
app.use('/api/v1/admin', adminMembershipRoutes);
app.use('/api/v1/admin', adminPointTaskRoutes);
app.use('/api/v1/admin', adminInviteRoutes);
app.use('/api/v1/admin', adminTemplateRoutes);
app.use('/api/v1/admin/content', adminContentRoutes);
app.use('/api/v1/admin', adminTierRoutes);
app.use('/api/v1/admin', adminSystemRoutes);
app.use('/api/v1/admin', adminSystemUpdateRoutes);
app.use('/api/v1/admin/payments', adminPaymentRoutes);
app.use('/api/v1/admin/config-check', adminConfigCheckRoutes);
app.use('/api/v1/admin', adminBackupRoutes);
app.use('/api/v1/admin', adminFileRoutes);
app.use('/api/v1/files', filesRoutes);
app.use('/api/v1', publicConfigRoutes);
app.use('/api/install', installRoutes);

try {
  const uploadDir = ensureLocalUploadDir();
  const staticMountPath = getLocalStaticMountPath();

  // 自定义静态文件服务：检查文件可见性，防止私有文件被直接 URL 访问
  app.use(staticMountPath, async (req, res, next) => {
    const storageKey = req.path.replace(/^\/+/, '').replace(/\\/g, '/');

    if (!storageKey) return next();

    try {
      const { queryOne } = require('./utils/db');
      const file: any = await queryOne(
        'SELECT user_id, visibility, mime_type FROM files WHERE storage_key = ? AND is_deleted = 0 LIMIT 1',
        [storageKey],
      );

      if (file && file.visibility === 'private') {
        // 私有文件需要认证 + 所有权检查
        const authHeader = (req.headers.authorization || '').trim();
        if (!authHeader.startsWith('Bearer ')) {
          res.status(403).json({ code: 403, message: '私有文件需要登录后访问', data: null });
          return;
        }
        try {
          const { verifyToken } = require('./services/auth.service');
          const payload = verifyToken(authHeader.substring(7));
          if (Number(payload.userId) !== Number(file.user_id)) {
            res.status(403).json({ code: 403, message: '无权访问此文件', data: null });
            return;
          }
        } catch {
          res.status(401).json({ code: 401, message: '认证已过期，请重新登录', data: null });
          return;
        }
      }
    } catch {
      res.status(503).json({ code: 5000, message: '文件权限校验失败，请稍后重试', data: null });
      return;
    }

    // 通过权限检查，直接服务文件
    const absPath = path.join(uploadDir, storageKey);
    if (!absPath.startsWith(uploadDir + path.sep) && absPath !== uploadDir) {
      res.status(403).json({ code: 403, message: '路径不合法', data: null });
      return;
    }
    res.sendFile(absPath, { dotfiles: 'deny' }, (err: any) => {
      if (err) next();
    });
  });

  console.log(`[Static] local uploads mounted at ${staticMountPath} -> ${uploadDir} (with permission check)`);
} catch (err: any) {
  console.error('[Static] local upload mount skipped:', err?.message || err);
}

// Serve admin panel static files with correct MIME types
const adminDist = path.resolve(__dirname, '../../admin-web/dist');

app.use((req, res, next) => {
  if (!isBlockedProbeRequest(req)) return next();
  res.status(404).json({ code: 404, message: 'API not found', data: null });
});

app.use(express.static(adminDist, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    else if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
    else if (filePath.endsWith('.mjs')) res.setHeader('Content-Type', 'application/javascript');
  }
}));

// SPA fallback: only for non-file requests (no extension in path)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/health')) return next();
  // Skip static file requests (has file extension)
  if (/(\.[a-z0-9]{1,8})$/i.test(req.path)) return next();
  const indexPath = path.join(adminDist, 'index.html');
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else next();
});

app.use((_req, res) => {
  res.status(404).json({ code: 404, message: 'API not found', data: null });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ code: 5000, message: 'Internal server error', data: null });
});

// Startup security checks. Production must have strong secrets configured.
if (config.nodeEnv !== 'development') {
  const weakSecrets = [
    'your-jwt-secret-change-in-production', 'your-32-char-aes-key-here!!',
    'default-key-32-chars!!', 'please_change_this', 'please_change_this_32_chars',
  ];
  const jwtOk = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32 && !weakSecrets.includes(process.env.JWT_SECRET);
  const encOk = process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 32 && !weakSecrets.includes(process.env.ENCRYPTION_KEY);
  if (!jwtOk) {
    console.error('FATAL: JWT_SECRET is missing, too short, or uses a known default. Aborting startup.');
    if (!fs.existsSync(getInstallLockPath())) {
      console.error('Hint: Complete the install wizard at /install to configure secrets.');
    }
    process.exit(1);
  }
  if (!encOk) {
    console.error('FATAL: ENCRYPTION_KEY is missing, too short, or uses a known default. Aborting startup.');
    if (!fs.existsSync(getInstallLockPath())) {
      console.error('Hint: Complete the install wizard at /install to configure secrets.');
    }
    process.exit(1);
  }
}

// 绑定 127.0.0.1 防止公网直接扫端口。所有外部请求通过 Nginx 反向代理进入。
app.listen(config.port, '127.0.0.1', async () => {
  const installed = await checkInstalled();
  console.log('AI Creator backend started: http://localhost:' + config.port);
  console.log('Environment:', config.nodeEnv);
  console.log('Routes: /auth /users /points /checkin /ads /invite /tasks /app /legal /announcements /compliance /config /files /admin/invite');
  preloadStorageConfigs().catch(err => console.error('[Startup] Storage config preload failed:', err.message));
  if (installed) {
    processExpiredMemberships()
      .then(result => {
        if (result.expired > 0) {
          console.log(`[Startup] Expired memberships processed: ${result.expired} expired, ${result.downgraded} downgraded`);
        }
      })
      .catch(err => console.error('[Startup] Membership expiry processing failed:', err.message));
    processMembershipMonthlyPointGrants()
      .then(result => {
        if (result.grantedCount > 0) {
          console.log(`[Startup] Membership monthly points granted: ${result.grantedCount} grants, ${result.grantedPoints} points`);
        }
      })
      .catch(err => console.error('[Startup] Membership monthly point grants failed:', err.message));
    // 定时任务注册 + 看门狗
    registerCronHeartbeat('membership-expiry', 10 * 60 * 1000, processExpiredMemberships);
    registerCronHeartbeat('monthly-points', 10 * 60 * 1000, processMembershipMonthlyPointGrants);
    registerCronHeartbeat('daily-backup', 60 * 60 * 1000, runDailyBackup);

    setInterval(() => {
      const hour = new Date().getHours();
      if (hour === 3) {
        wrapCronTask('daily-backup', runDailyBackup)().catch(
          err => console.error('[Backup] Daily backup failed:', err?.message || err),
        );
      }
    }, 60 * 60 * 1000);
    setInterval(() => {
      wrapCronTask('membership-expiry', processExpiredMemberships)().catch(
        err => console.error('[Cron] Membership expiry check failed:', err.message),
      );
      wrapCronTask('monthly-points', processMembershipMonthlyPointGrants)().catch(
        err => console.error('[Cron] Membership monthly point grants failed:', err.message),
      );
    }, 10 * 60 * 1000);

    startCronWatchdog();
    recoverStaleAiTasks()
      .then(result => {
        if (result.recovered || result.failed) {
          console.log(`[Startup] Stale AI tasks recovered: ${result.recovered}, failed: ${result.failed}`);
        }
      })
      .catch(err => console.error('[Startup] Stale AI task recovery failed:', err.message));
    recoverPendingGrants()
      .then(result => {
        if (result.recovered > 0 || result.failed > 0) {
          console.log(`[Startup] Pending payment grants recovered: ${result.recovered}, failed: ${result.failed}`);
        }
      })
      .catch(err => console.error('[Startup] Pending grant recovery failed:', err.message));
    recoverOrphanedTextCharges()
      .then(result => {
        if (result.refunded > 0 || result.failed > 0) {
          console.log(`[Startup] Orphaned text charges refunded: ${result.refunded}, failed: ${result.failed}`);
        }
      })
      .catch(err => console.error('[Startup] Orphaned text charge recovery failed:', err.message));
    warnIfNoUsableAiProvider().catch(err => console.error('[Startup] AI provider config check failed:', err.message));
    startVideoPollingScheduler();
  }
});

// Graceful shutdown
let _shuttingDown = false;
function gracefulShutdown(signal: string) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  console.log(`[Shutdown] Received ${signal}, gracefully shutting down...`);
  // 给进行中的请求 10 秒排空时间
  setTimeout(async () => {
    try { await endDbPool(); } catch (e: any) { console.error('[Shutdown] DB pool close error:', e.message); }
    console.log('[Shutdown] Done.');
    process.exit(0);
  }, 10_000).unref();
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
