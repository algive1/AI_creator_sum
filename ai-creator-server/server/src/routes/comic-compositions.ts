import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { createComicCompositionJob, getComicCompositionJob } from '../services/comic-composition.service';
import { ErrorCodes } from '../types';
import { error, success } from '../utils/response';

const router = Router();
router.use(authMiddleware);

router.post('/', async (req: Request, res: Response) => {
  try { success(res, await createComicCompositionJob(req.user!.userId, req.body)); }
  catch (err: any) { error(res, err?.code || ErrorCodes.SERVER_ERROR, err?.message || '创建漫剧合成任务失败'); }
});
router.get('/:id(\\d+)', async (req: Request, res: Response) => {
  try {
    const job = await getComicCompositionJob(req.user!.userId, Number(req.params.id));
    if (!job) return error(res, ErrorCodes.NOT_FOUND, '合成任务不存在', 404);
    success(res, job);
  } catch (err: any) { error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取漫剧合成任务失败'); }
});
export default router;
