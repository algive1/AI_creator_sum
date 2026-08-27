import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { error, success } from '../utils/response';
import { ErrorCodes } from '../types';
import {
  claimToolAdUnlock,
  createToolAdSession,
  getToolsConfig,
  isToolKey,
  processTool,
  requestBaseUrlFrom,
} from '../services/tools.service';

const router = Router();

function toolFailure(res: Response, err: any, fallback: string) {
  res.status(err?.status || 200).json({
    code: err?.code || ErrorCodes.SERVER_ERROR,
    message: err?.message || fallback,
    data: err?.needAd ? { needAd: true } : null,
  });
}

router.get('/config', authMiddleware, async (req: Request, res: Response) => {
  try {
    success(res, await getToolsConfig(req.user!.userId));
  } catch (err: any) {
    toolFailure(res, err, '获取工具配置失败');
  }
});

router.post('/ad-session', authMiddleware, async (req: Request, res: Response) => {
  try {
    const toolKey = String(req.body?.toolKey || '');
    if (!isToolKey(toolKey)) {
      error(res, ErrorCodes.PARAM_ERROR, '未知工具');
      return;
    }
    success(res, await createToolAdSession(req.user!.userId, toolKey));
  } catch (err: any) {
    toolFailure(res, err, '创建广告解锁会话失败');
  }
});

router.post('/ad-unlock', authMiddleware, async (req: Request, res: Response) => {
  try {
    const toolKey = String(req.body?.toolKey || '');
    if (!isToolKey(toolKey)) {
      error(res, ErrorCodes.PARAM_ERROR, '未知工具');
      return;
    }
    const sessionId = String(req.body?.sessionId || '');
    const completed = req.body?.completed ?? req.body?.isCompleted;
    success(res, await claimToolAdUnlock(req.user!.userId, toolKey, sessionId, completed === undefined ? true : !!completed));
  } catch (err: any) {
    toolFailure(res, err, '广告解锁失败');
  }
});

router.post('/process', authMiddleware, async (req: Request, res: Response) => {
  try {
    const toolKey = String(req.body?.toolKey || '');
    if (!isToolKey(toolKey)) {
      error(res, ErrorCodes.PARAM_ERROR, '未知工具');
      return;
    }
    const rawFileIds = Array.isArray(req.body?.fileIds) ? req.body.fileIds : [req.body?.fileId].filter(Boolean);
    const fileIds = rawFileIds.map((item: unknown) => Number(item)).filter((item: number) => Number.isFinite(item) && item > 0);
    success(res, await processTool({
      userId: req.user!.userId,
      toolKey,
      fileIds,
      params: req.body?.params && typeof req.body.params === 'object' ? req.body.params : {},
      requestBaseUrl: requestBaseUrlFrom(req),
    }));
  } catch (err: any) {
    toolFailure(res, err, '工具处理失败');
  }
});

export default router;
