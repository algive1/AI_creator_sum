import { Request, Response, NextFunction } from 'express';
import {
  evaluateInstallStatus,
  readInstallLock,
  writeInstallLock,
  type InstallStatusReport,
} from '../services/install-readiness.service';

let _cachedStatus: InstallStatusReport | null = null;

export function resetInstallCache(): void {
  _cachedStatus = null;
}

export function setInstallCacheInstalled(): void {
  _cachedStatus = {
    state: 'installed',
    installed: true,
    lockFileExists: true,
    lockFilePath: '',
    lockInfo: null,
    environment: { ok: true, missing: [], invalid: [], issues: [] },
    database: {
      connected: true,
      ready: true,
      missingTables: [],
      missingColumns: {},
      missingIndexes: {},
      missingConfigs: [],
      systemInstalledValue: 'true',
      adminReady: true,
      adminUsers: 1,
    },
    installState: null,
    service: {
      ready: true,
      port: Number(process.env.PORT || 3000),
      pm2Home: process.env.PM2_HOME || '',
      pm2Status: 'online',
      pm2Cwd: '',
      pm2ScriptPath: '',
      healthCheckUrl: process.env.HEALTH_CHECK_URL || 'http://127.0.0.1:3000/health',
      healthOk: true,
    },
    diagnostics: {
      appRootDir: process.env.APP_ROOT_DIR || '/www/wwwroot/ai-creator',
      currentPath: '',
      currentTarget: '',
      currentReleaseVersion: '',
      currentReleaseJsonPath: '',
      currentServerEntryExists: true,
      pm2AppName: process.env.PM2_APP_NAME || 'ai-creator',
      pm2ScriptPath: '',
      installLockPath: '',
      installLockExists: true,
      legacyLockPaths: [],
      sharedEnvPath: '',
      sharedEnvExists: true,
      healthCheckUrl: process.env.HEALTH_CHECK_URL || 'http://127.0.0.1:3000/health',
      healthResponse: '',
      databaseCoreReady: true,
      databaseMissingTables: [],
      databaseMissingConfigs: [],
    },
    message: '已安装且服务可访问',
  };
}

export async function getInstallStatus(): Promise<InstallStatusReport> {
  return getInstallStatusInternal(false);
}

/**
 * 获取安装状态，可选择跳过缓存以进行定期健康检查。
 * @param skipCache 为 true 时强制重新评估，用于验证系统仍然健康。
 */
export async function getInstallStatusInternal(skipCache: boolean): Promise<InstallStatusReport> {
  if (!skipCache && _cachedStatus?.installed) {
    return _cachedStatus;
  }

  const status = await evaluateInstallStatus();
  if (status.installed) {
    if (!status.lockFileExists) {
      try {
        writeInstallLock(status.lockFilePath);
        status.lockFileExists = true;
        status.lockInfo = readInstallLock(status.lockFilePath);
      } catch {
        // The database state already proves the installation is complete.
      }
    }
    _cachedStatus = status;
  }

  return status;
}

export async function checkInstalled(): Promise<boolean> {
  const status = await getInstallStatus();
  return status.installed;
}

export async function installMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const reqPath = req.path;

  if (reqPath.startsWith('/install') || reqPath.startsWith('/api/install/')) {
    const installed = await checkInstalled();

    const canReadAfterInstalled =
      reqPath === '/api/install/status' ||
      (req.method === 'GET' && reqPath.startsWith('/api/install/tasks/'));

    if (installed && reqPath.startsWith('/api/install/') && !canReadAfterInstalled) {
      res.json({ code: 1001, message: 'System already installed', data: null });
      return;
    }

    if (installed && (reqPath === '/install' || reqPath === '/install/')) {
      res.redirect('/login');
      return;
    }

    return next();
  }

  const installStatus = await getInstallStatus();
  if (!installStatus.installed) {
    if (reqPath.startsWith('/api/')) {
      // 安装完成前允许返回诊断信息，但减少敏感数据泄露
      res.json({
        code: 1000,
        message: installStatus.message || 'System not installed',
        data: {
          redirect: '/install',
          state: installStatus.state,
          lockFileExists: installStatus.lockFileExists,
          // 仅在未安装时返回详细诊断，安装后不返回
          missingEnv: installStatus.installed ? undefined : installStatus.environment.missing,
          invalidEnv: installStatus.installed ? undefined : installStatus.environment.invalid,
          databaseError: installStatus.installed ? undefined : installStatus.database.error,
          missingTables: installStatus.installed ? undefined : installStatus.database.missingTables,
          missingColumns: installStatus.installed ? undefined : installStatus.database.missingColumns,
          missingIndexes: installStatus.installed ? undefined : installStatus.database.missingIndexes,
          missingConfigs: installStatus.installed ? undefined : installStatus.database.missingConfigs,
          diagnostics: installStatus.installed ? undefined : installStatus.diagnostics,
        },
      });
      return;
    }
    if (reqPath.startsWith('/assets/') || /\.(js|css|png|ico|svg|woff2?|ttf|eot|map)$/i.test(reqPath)) {
      return next();
    }
    if (!reqPath.startsWith('/install')) {
      res.redirect('/install');
      return;
    }
  }

  next();
}
