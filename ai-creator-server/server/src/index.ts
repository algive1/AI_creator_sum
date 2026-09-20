// src/index.ts
import express from 'express';
import compression from 'compression';
import cors, { CorsOptions, CorsOptionsDelegate } from 'cors';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { config } from './utils/config';
import { readRuntimeReleaseVersion } from './utils/runtime-version';
import { installMiddleware, checkInstalled } from './middleware/install';
import installRoutes from './routes/install';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import pointsRoutes from './routes/points';
import checkinRoutes from './routes/checkin';
import pointTaskRoutes from './routes/point-tasks';
import adsRoutes from './routes/ads';
import inviteRoutes from './routes/invite';
import freeImageQuotaRoutes from './routes/free-image-quota';
import taskRoutes from './routes/tasks';
import projectRoutes from './routes/projects';
import comicCompositionRoutes from './routes/comic-compositions';
import assetRoutes from './routes/assets';
import appHomeRoutes from './routes/app-home';
import legalRoutes from './routes/legal';
import announcementRoutes from './routes/announcements';
import complianceRoutes from './routes/compliance';
import notificationRoutes from './routes/notifications';
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
import adminToolsRoutes from './routes/admin-tools';
import filesRoutes from './routes/files';
import toolsRoutes from './routes/tools';
import { preloadStorageConfigs } from './services/storage/storage-config-loader';
import { ensureLocalUploadDir, getLocalStaticMountPath } from './services/storage/local-paths';
import { recoverStaleAiTasks } from './services/task.service';
import { closeTaskQueue } from './services/task-queue.service';
import { startVideoPollingScheduler } from './services/video-polling.service';
import { processExpiredMemberships } from './services/membership.service';
import { processMembershipMonthlyPointGrants } from './services/membership-points.service';
import { recoverPendingGrants } from './services/payment-order.service';
import { recoverOrphanedTextCharges } from './services/ai-feature.service';
import { recoverStaleFreeImageQuotaReservations } from './services/free-image-quota.service';
import { cleanupExpiredMediaAssets } from './services/media-asset.service';
import { buildMemberBenefitIconSvg } from './services/member-benefit-icons.service';
import { runDailyBackup, shouldRunDailyBackupNow } from './services/backup.service';
import { cleanupExpiredAdSessions } from './services/ads.service';
import { registerCronHeartbeat, startCronWatchdog, wrapCronTask } from './services/cron-watchdog.service';
import { getInstallLockPath } from './services/install-readiness.service';
import { endDbPool, query, queryOne } from './utils/db';
import { performanceMiddleware } from './middleware/performance.middleware';
import { privateNoStore, cacheFor } from './middleware/cache-control.middleware';
import { adminOperationLogMiddleware } from './middleware/admin-operation-log.middleware';
import {
  globalRateLimiter,
  loginRateLimiter,
  registerRateLimiter,
  taskUserRateLimiter,
} from './middleware/rate-limit.middleware';

const app = express();
let storageConfigPreloadPromise: Promise<void> | null = null;
let installedRuntimeStarted = false;
let installCompletionWatcher: NodeJS.Timeout | null = null;
let hourlyRuntimeTimer: NodeJS.Timeout | null = null;
let membershipRuntimeTimer: NodeJS.Timeout | null = null;

// 信任 Nginx/宝塔 反向代理的 X-Forwarded-For 头，否则限流和 IP 相关功能会异常
app.set('trust proxy', 1);

app.use(compression());
app.use(globalRateLimiter);

// 安全响应头
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', buildContentSecurityPolicy(req));
  if (shouldSendHsts(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

const configuredCorsOrigins = parseCorsAllowedOrigins();
const corsOptionsDelegate: CorsOptionsDelegate<express.Request> = (req, callback) => {
  const origin = req.header('Origin');
  if (!origin) return callback(null, { origin: false });

  const normalizedOrigin = normalizeOrigin(origin);
  const sameOrigin = normalizedOrigin === requestOrigin(req);
  const allowed = sameOrigin
    || configuredCorsOrigins.includes(normalizedOrigin)
    || (config.nodeEnv === 'development' && configuredCorsOrigins.length === 0);

  const options: CorsOptions = allowed ? { origin: true, credentials: true } : { origin: false };
  callback(null, options);
};

if (config.nodeEnv !== 'development' && configuredCorsOrigins.length === 0) {
  console.warn('[Security] CORS_ALLOWED_ORIGINS is empty. Browser cross-origin requests are blocked except same-origin admin/API calls.');
}

app.use(cors(corsOptionsDelegate));
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(performanceMiddleware);
app.use(privateNoStore);

if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
}

function isBlockedProbeRequest(req: express.Request): boolean {
  if (req.path.startsWith('/@fs') || req.path === '/proxy' || req.path.startsWith('/proxy/')) return true;
  if (req.path === '/' && ('url' in req.query || 'dest' in req.query)) return true;
  return false;
}

function parseCorsAllowedOrigins(): string[] {
  return String(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
}

function normalizeOrigin(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch {
    return raw.replace(/\/+$/, '').toLowerCase();
  }
}

function buildContentSecurityPolicy(req: express.Request): string {
  const configured = String(process.env.CONTENT_SECURITY_POLICY || '').trim();
  if (configured) return configured;
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "form-action 'self'",
  ];
  if (shouldUpgradeInsecureRequests(req)) {
    directives.push('upgrade-insecure-requests');
  }
  return directives.join('; ');
}

function shouldSendHsts(req: express.Request): boolean {
  if (isLoopbackRequestHost(req)) return false;
  const enabled = String(process.env.ENABLE_HSTS || '').toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(enabled)) return false;
  if (enabled) return ['1', 'true', 'on', 'yes'].includes(enabled);
  return config.nodeEnv === 'production' || req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function shouldUpgradeInsecureRequests(req: express.Request): boolean {
  if (isLoopbackRequestHost(req)) return false;
  const enabled = String(process.env.ENABLE_HSTS || '').toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(enabled)) return false;
  if (enabled) return ['1', 'true', 'on', 'yes'].includes(enabled);
  return config.nodeEnv === 'production';
}

function isLoopbackRequestHost(req: express.Request): boolean {
  return isLoopbackHost(req.get('host') || '');
}

function isLoopbackHost(host: string): boolean {
  const raw = String(host || '').trim().toLowerCase();
  if (!raw) return false;
  const withoutPort = raw.startsWith('[')
    ? raw.slice(1, raw.indexOf(']') > -1 ? raw.indexOf(']') : undefined)
    : raw.split(':')[0];
  return withoutPort === 'localhost' || withoutPort === '127.0.0.1' || withoutPort === '::1';
}

function requestOrigin(req: express.Request): string {
  const host = req.get('host');
  if (!host) return '';
  return normalizeOrigin(`${req.protocol}://${host}`);
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

app.use('/api/v1/auth/wechat-login', loginRateLimiter);
app.use('/api/v1/auth/login', loginRateLimiter);
app.use('/api/v1/auth/register', registerRateLimiter);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/points', pointsRoutes);
app.use('/api/v1/checkin', checkinRoutes);
app.use('/api/v1/point-tasks', pointTaskRoutes);
app.use('/api/v1/ads', adsRoutes);
app.use('/api/v1/invite', inviteRoutes);
app.use('/api/v1/free-image-quota', freeImageQuotaRoutes);
app.use('/api/v1/tasks', taskUserRateLimiter, taskRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/comic-compositions', comicCompositionRoutes);
app.use('/api/v1/assets', assetRoutes);
app.use('/api/v1/app/home', cacheFor(60));
app.use('/api/v1/app', appHomeRoutes);
app.use('/api/v1/home', cacheFor(60));
app.use('/api/v1', appHomeRoutes);
app.use('/api/v1/legal', legalRoutes);
app.use('/api/v1/announcements', announcementRoutes);
app.use('/api/v1/compliance', complianceRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/templates', templateRoutes);
app.use('/api/v1/membership/plans', cacheFor(600, { publicWithAuth: true }));
app.use('/api/v1/membership', membershipRoutes);
app.use('/api/v1/shop', shopRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/payments', wechatPaymentRoutes);
app.use('/api/v1/tools', toolsRoutes);
app.use('/api/v1/admin', adminOperationLogMiddleware);
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
app.use('/api/v1/admin/tools', adminToolsRoutes);
app.use('/api/v1/admin', adminBackupRoutes);
app.use('/api/v1/admin', adminFileRoutes);
app.use('/api/v1/files', filesRoutes);
app.use('/api/v1', publicConfigRoutes);
app.use('/api/install', installRoutes);

function preloadStorageConfigsOnce(): Promise<void> {
  if (!storageConfigPreloadPromise) {
    storageConfigPreloadPromise = preloadStorageConfigs().catch(err => {
      storageConfigPreloadPromise = null;
      throw err;
    });
  }
  return storageConfigPreloadPromise;
}

function mountLocalUploads(): void {
  // 自定义静态文件服务：检查文件可见性，防止私有文件被直接 URL 访问
  app.use(async (req, res, next) => {
    try {
      const staticMountPath = getLocalStaticMountPath();
      if (req.path !== staticMountPath && !req.path.startsWith(`${staticMountPath}/`)) {
        return next();
      }

      const uploadDir = ensureLocalUploadDir();
      const storageKey = req.path.slice(staticMountPath.length).replace(/^\/+/, '').replace(/\\/g, '/');

      if (!storageKey) return next();

      try {
        const files = await query<any>(
          'SELECT user_id, visibility, mime_type FROM files WHERE storage_key = ? AND is_deleted = 0',
          [storageKey],
        );
        const hasPublicFile = files.some((item: any) => item.visibility === 'public');
        const privateFile = hasPublicFile ? null : files.find((item: any) => item.visibility === 'private');

        if (privateFile) {
          // 私有文件需要认证 + 所有权检查
          const authHeader = (req.headers.authorization || '').trim();
          if (!authHeader.startsWith('Bearer ')) {
            res.status(403).json({ code: 403, message: '私有文件需要登录后访问', data: null });
            return;
          }
          try {
            const { verifyToken } = require('./services/auth.service');
            const payload = verifyToken(authHeader.substring(7));
            if (Number(payload.userId) !== Number(privateFile.user_id)) {
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
    } catch (err) {
      next(err);
    }
  });
}

mountLocalUploads();

// Serve frontend static files with update-safe cache headers.
const adminDist = path.resolve(__dirname, '../../admin-web/dist');
const adminIndexPath = path.join(adminDist, 'index.html');
const userWebDist = path.resolve(__dirname, '../../user-web/dist');
const userWebIndexPath = path.join(userWebDist, 'index.html');
const hashedFrontendAssetPattern = /\/assets\/.+-[A-Za-z0-9_-]{8,}\.(?:js|css|mjs)$/;
const userWebHosts = parseHostList(process.env.WEB_APP_HOSTS || 'ooa8.com,www.ooa8.com');

function parseHostList(value: string): string[] {
  return String(value || '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

function requestHostname(req: express.Request): string {
  const host = String(req.get('host') || '').trim().toLowerCase();
  if (!host) return '';
  if (host.startsWith('[')) {
    const closingIndex = host.indexOf(']');
    return closingIndex > 0 ? host.slice(1, closingIndex) : host;
  }
  return host.split(':')[0];
}

function isUserWebHost(req: express.Request): boolean {
  const hostname = requestHostname(req);
  return hostname ? userWebHosts.includes(hostname) : false;
}

function setFrontendStaticHeaders(res: express.Response, filePath: string): void {
  if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
  else if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css');
  else if (filePath.endsWith('.mjs')) res.setHeader('Content-Type', 'application/javascript');
  if (path.basename(filePath) === 'index.html') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else if (hashedFrontendAssetPattern.test(filePath.replace(/\\/g, '/'))) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}

const adminStaticMiddleware = express.static(adminDist, {
  setHeaders: setFrontendStaticHeaders,
});
const userWebStaticMiddleware = express.static(userWebDist, {
  setHeaders: setFrontendStaticHeaders,
});

function selectFrontendDist(req: express.Request) {
  if (isUserWebHost(req)) {
    return {
      name: 'user-web',
      dist: userWebDist,
      indexPath: userWebIndexPath,
      staticMiddleware: userWebStaticMiddleware,
      title: '用户网页端暂不可用',
      missingDetail: '服务器未找到 user-web/dist/index.html，请先构建用户网页端。',
    };
  }

  return {
    name: 'admin-web',
    dist: adminDist,
    indexPath: adminIndexPath,
    staticMiddleware: adminStaticMiddleware,
    title: '后台暂不可用',
    missingDetail: '服务器未找到 admin-web/dist/index.html，请先构建管理后台。',
  };
}

app.use((req, res, next) => {
  if (!isBlockedProbeRequest(req)) return next();
  res.status(404).json({ code: 404, message: 'API not found', data: null });
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/health')) return next();
  return selectFrontendDist(req).staticMiddleware(req, res, next);
});

function _sendMissingAdminDistPage(res: express.Response) {
  res
    .status(503)
    .setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    .type('html')
    .send(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>后台暂不可用</title>
  <style>
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f6f7f9;color:#1f2937}
    main{max-width:680px;margin:16vh auto;padding:0 24px}
    h1{font-size:28px;margin:0 0 12px}
    p{font-size:16px;line-height:1.7;margin:0 0 8px}
  </style>
</head>
<body>
  <main>
    <h1>管理后台暂不可用</h1>
    <p>后台前端构建文件缺失，服务器未找到 admin-web/dist/index.html。</p>
    <p>请重新执行 admin-web 构建或重新安装完整更新包后再访问。</p>
  </main>
</body>
</html>`);
}

function sendMissingFrontendDistPage(res: express.Response, frontend: ReturnType<typeof selectFrontendDist>) {
  res
    .status(503)
    .setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    .type('html')
    .send(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${frontend.title}</title>
  <style>
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f6f7f9;color:#1f2937}
    main{max-width:680px;margin:16vh auto;padding:0 24px}
    h1{font-size:28px;margin:0 0 12px}
    p{font-size:16px;line-height:1.7;margin:0 0 8px}
  </style>
</head>
<body>
  <main>
    <h1>${frontend.title}</h1>
    <p>${frontend.missingDetail}</p>
    <p>请重新执行前端构建或安装完整发布包后再访问。</p>
  </main>
</body>
</html>`);
}

// SPA fallback: only for non-file requests (no extension in path)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/health')) return next();
  // Skip static file requests (has file extension)
  if (/(\.[a-z0-9]{1,8})$/i.test(req.path)) return next();
  const frontend = selectFrontendDist(req);
  if (!fs.existsSync(frontend.indexPath)) {
    sendMissingFrontendDistPage(res, frontend);
    return;
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(frontend.indexPath);
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

async function bootstrap(): Promise<void> {
  try {
    await preloadStorageConfigsOnce();
  } catch (err: any) {
    console.error('[Startup] Storage config preload failed:', err?.message || err);
  }

  try {
    console.log(`[Static] local uploads mounted at ${getLocalStaticMountPath()} -> ${ensureLocalUploadDir()} (with permission check)`);
  } catch (err: any) {
    console.error('[Static] local upload mount skipped:', err?.message || err);
  }

  // 绑定 127.0.0.1 防止公网直接扫端口。所有外部请求通过 Nginx 反向代理进入。
  app.listen(config.port, '127.0.0.1', async () => {
    const installed = await checkInstalled();
    console.log('AI Creator backend started: http://localhost:' + config.port);
    console.log('Environment:', config.nodeEnv);
    console.log('Routes: /auth /users /points /checkin /ads /invite /tasks /app /legal /announcements /compliance /config /files /admin/invite');
    if (installed) {
      startInstalledRuntime();
    } else {
      startInstallCompletionWatcher();
    }
  });
}

function startInstalledRuntime(): void {
  if (installedRuntimeStarted) return;
  installedRuntimeStarted = true;
  if (installCompletionWatcher) {
    clearInterval(installCompletionWatcher);
    installCompletionWatcher = null;
  }

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

  registerCronHeartbeat('membership-expiry', 10 * 60 * 1000, processExpiredMemberships);
  registerCronHeartbeat('monthly-points', 10 * 60 * 1000, processMembershipMonthlyPointGrants);
  registerCronHeartbeat('daily-backup', 60 * 60 * 1000, runDailyBackup);
  registerCronHeartbeat('ad-cleanup', 60 * 60 * 1000, cleanupExpiredAdSessions);
  registerCronHeartbeat('free-image-quota-recovery', 60 * 60 * 1000, recoverStaleFreeImageQuotaReservations);
  registerCronHeartbeat('media-asset-cleanup', 60 * 60 * 1000, cleanupExpiredMediaAssets);

  hourlyRuntimeTimer = setInterval(() => {
    shouldRunDailyBackupNow().then(shouldRun => {
      if (shouldRun) {
        wrapCronTask('daily-backup', runDailyBackup)().catch(
          err => console.error('[Backup] Daily backup failed:', err?.message || err),
        );
      }
    }).catch(err => console.error('[Backup] Daily backup schedule check failed:', err?.message || err));
    const hour = new Date().getHours();
    if (hour === 3) {
      wrapCronTask('ad-cleanup', cleanupExpiredAdSessions)().catch(
        err => console.error('[Ads] Session cleanup failed:', err?.message || err),
      );
    }
    wrapCronTask('free-image-quota-recovery', recoverStaleFreeImageQuotaReservations)().catch(
      err => console.error('[FreeQuota] Reservation recovery failed:', err?.message || err),
    );
    wrapCronTask('media-asset-cleanup', cleanupExpiredMediaAssets)().catch(
      err => console.error('[Assets] Expired asset cleanup failed:', err?.message || err),
    );
  }, 60 * 60 * 1000);
  hourlyRuntimeTimer.unref?.();

  membershipRuntimeTimer = setInterval(() => {
    wrapCronTask('membership-expiry', processExpiredMemberships)().catch(
      err => console.error('[Cron] Membership expiry check failed:', err.message),
    );
    wrapCronTask('monthly-points', processMembershipMonthlyPointGrants)().catch(
      err => console.error('[Cron] Membership monthly point grants failed:', err.message),
    );
  }, 10 * 60 * 1000);
  membershipRuntimeTimer.unref?.();

  startCronWatchdog();
  recoverStaleAiTasks()
    .then(result => {
      if (result.recovered || result.failed) {
        console.log(`[Startup] Stale AI tasks recovered: ${result.recovered}, failed: ${result.failed}`);
      }
    })
    .catch(err => console.error('[Startup] Stale AI task recovery failed:', err.message));
  recoverStaleFreeImageQuotaReservations()
    .then(result => {
      if (result.released || result.failed) {
        console.log(`[Startup] Free image quota reservations recovered: ${result.released}, failed: ${result.failed}`);
      }
    })
    .catch(err => console.error('[Startup] Free image quota recovery failed:', err.message));
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

function startInstallCompletionWatcher(): void {
  if (installCompletionWatcher) return;
  installCompletionWatcher = setInterval(() => {
    checkInstalled()
      .then(installed => {
        if (installed) {
          console.log('[Startup] Install completed in current process; starting runtime background tasks.');
          startInstalledRuntime();
        }
      })
      .catch(err => console.error('[Startup] Install completion check failed:', err?.message || err));
  }, 5000);
  installCompletionWatcher.unref?.();
}

bootstrap().catch(err => {
  console.error('FATAL: bootstrap failed:', err);
  process.exit(1);
});

// Graceful shutdown
let _shuttingDown = false;
function gracefulShutdown(signal: string) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  console.log(`[Shutdown] Received ${signal}, gracefully shutting down...`);
  // 给进行中的请求 10 秒排空时间
  setTimeout(async () => {
    try { await closeTaskQueue(); } catch (e: any) { console.error('[Shutdown] Queue close error:', e.message); }
    try { await endDbPool(); } catch (e: any) { console.error('[Shutdown] DB pool close error:', e.message); }
    console.log('[Shutdown] Done.');
    process.exit(0);
  }, 10_000).unref();
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled rejection:', reason instanceof Error ? reason.stack : String(reason));
});
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception:', err.stack || err.message);
});

export default app;
