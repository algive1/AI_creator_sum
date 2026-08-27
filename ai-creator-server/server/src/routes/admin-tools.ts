import { Router, Request, Response } from 'express';
import { adminAuthMiddleware } from '../middleware/auth';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { getAdminToolsConfig, updateAdminToolsConfig } from '../services/tools.service';

const router = Router();

router.get('/config', adminAuthMiddleware, async (_req: Request, res: Response) => {
  try {
    success(res, await getAdminToolsConfig());
  } catch (err: any) {
    console.error('[admin-tools] get config failed:', {
      message: err?.message,
      code: err?.code,
      sqlState: err?.sqlState,
    });
    error(res, ErrorCodes.SERVER_ERROR, '获取工具页配置失败');
  }
});

router.put('/config', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    success(res, await updateAdminToolsConfig(req.body || {}, req.user!.userId));
  } catch (err: any) {
    console.error('[admin-tools] update config failed:', {
      message: err?.message,
      code: err?.code,
      sqlState: err?.sqlState,
    });
    error(res, ErrorCodes.PARAM_ERROR, err?.message || '保存工具页配置失败');
  }
});

export default router;
