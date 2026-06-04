import { Router, Request, Response } from 'express';
import {
  checkEnvironment,
  testDbConnection,
  saveDbConfig,
  saveSystemConfig,
  validateAdmin,
  executeInit,
  finishInstall,
  getTempConfig,
  getInstallTask,
  runInstallNow,
  startBuildTask,
  startInstallTask,
  startPm2RetryTask,
} from '../services/install.service';
import { getInstallStatus } from '../middleware/install';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';

const router = Router();

function installErrorMessage(prefix: string, err: any): string {
  const message = err?.message || String(err);
  if (/access denied/i.test(message)) return '数据库账号或密码错误，无法连接数据库。';
  return prefix + message;
}

router.get('/status', async (_req: Request, res: Response) => {
  const status = await getInstallStatus();
  if (status.installed) {
    // 安装完成后仅返回最小信息，避免泄露服务器架构
    success(res, {
      installed: true,
      state: status.state,
      status: status.state,
      message: status.message,
      lockFileExists: status.lockFileExists,
      version: '1.0.0',
      systemName: 'AI创作工坊',
    });
    return;
  }
  success(res, {
    installed: status.installed,
    state: status.state,
    status: status.state,
    message: status.message,
    lockFileExists: status.lockFileExists,
    lockFilePath: status.lockFilePath,
    lockInfo: status.lockInfo,
    environment: status.environment,
    database: status.database,
    installState: status.installState,
    service: status.service,
    diagnostics: status.diagnostics,
    version: '1.0.0',
    systemName: 'AI创作工坊',
  });
});

router.get('/check-env', async (_req: Request, res: Response) => {
  try {
    const result = await checkEnvironment();
    success(res, result);
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, '环境检测失败: ' + e.message);
  }
});

router.post('/test-db', async (req: Request, res: Response) => {
  try {
    const { host, port, database, username, password, autoCreate } = req.body;
    if (!host || !database || !username) {
      error(res, ErrorCodes.PARAM_ERROR, '请填写完整的数据库信息');
      return;
    }
    const result = await testDbConnection({
      host,
      port: parseInt(port, 10) || 3306,
      database,
      user: username,
      password: password || '',
      prefix: req.body.prefix || '',
      autoCreate: !!autoCreate,
    });
    success(res, result);
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, installErrorMessage('连接失败: ', e));
  }
});

router.post('/save-db', async (req: Request, res: Response) => {
  try {
    const { host, port, database, username, password, autoCreate } = req.body;
    if (!host || !database || !username) {
      error(res, ErrorCodes.PARAM_ERROR, '缺少数据库配置');
      return;
    }
    await testDbConnection({
      host,
      port: parseInt(port, 10) || 3306,
      database,
      user: username,
      password: password || '',
      prefix: req.body.prefix || '',
      autoCreate: !!autoCreate,
    });
    const result = await saveDbConfig({
      host,
      port: parseInt(port, 10) || 3306,
      database,
      user: username,
      password: password || '',
      prefix: req.body.prefix || '',
      autoCreate: !!autoCreate,
    });
    success(res, result);
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, installErrorMessage('保存失败: ', e));
  }
});

router.post('/save-system-config', async (req: Request, res: Response) => {
  try {
    const { siteName, adminPath, timezone, storageType, debugMode, allowRegister } = req.body;
    if (!siteName || !adminPath) {
      error(res, ErrorCodes.PARAM_ERROR, '请填写完整的系统配置');
      return;
    }
    const result = await saveSystemConfig({
      siteName,
      adminPath: adminPath || 'admin',
      timezone: timezone || 'Asia/Shanghai',
      storageType: storageType || 'local',
      debugMode: !!debugMode,
      allowRegister: allowRegister !== false,
    });
    success(res, result);
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, '保存失败: ' + e.message);
  }
});

router.post('/create-admin', async (req: Request, res: Response) => {
  try {
    const { username, password, confirmPassword, email, phone } = req.body;
    const result = await validateAdmin({ username, password, confirmPassword, email, phone });
    if (!result.valid) {
      error(res, ErrorCodes.PARAM_ERROR, result.error!);
      return;
    }
    success(res, { valid: true });
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, '校验失败: ' + e.message);
  }
});

router.post('/init', async (_req: Request, res: Response) => {
  try {
    const cfg = getTempConfig();
    if (!cfg.db || !cfg.sys || !cfg.admin) {
      error(res, ErrorCodes.PARAM_ERROR, '缺少配置，请返回前面步骤重新填写');
      return;
    }
    const result = await executeInit();
    success(res, result);
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, '初始化失败: ' + e.message);
  }
});

router.post('/finish', async (_req: Request, res: Response) => {
  try {
    const result = await finishInstall();
    success(res, result, result.message || '安装收尾修复完成，系统已恢复为已安装状态。');
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, e.message || '完成安装失败');
  }
});

router.post('/finalize', async (_req: Request, res: Response) => {
  try {
    const result = await finishInstall();
    success(res, result, result.message || '安装收尾修复完成，系统已恢复为已安装状态。');
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, e.message || '安装收尾修复失败');
  }
});

router.post('/run', async (req: Request, res: Response) => {
  try {
    const result = await runInstallNow(req.body || {});
    success(res, result);
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, installErrorMessage('安装失败: ', e));
  }
});

router.post('/tasks', async (req: Request, res: Response) => {
  try {
    const task = await startInstallTask(req.body || {});
    success(res, task);
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, installErrorMessage('安装任务启动失败: ', e));
  }
});

router.post('/retry-pm2', async (req: Request, res: Response) => {
  try {
    const task = await startPm2RetryTask(req.body || {});
    success(res, task);
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, installErrorMessage('重试启动服务失败: ', e));
  }
});

router.get('/tasks/:id', async (req: Request, res: Response) => {
  const task = getInstallTask(req.params.id);
  if (!task) {
    error(res, ErrorCodes.NOT_FOUND, '安装任务不存在');
    return;
  }
  success(res, task);
});

router.post('/build', async (_req: Request, res: Response) => {
  try {
    const task = await startBuildTask();
    success(res, task);
  } catch (e: any) {
    error(res, ErrorCodes.SERVER_ERROR, installErrorMessage('构建任务启动失败: ', e));
  }
});

export default router;
