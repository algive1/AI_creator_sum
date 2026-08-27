import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { archiveProject, createProject, getProject, listProjects, renameProject, restoreProject } from '../services/project.service';
import { ErrorCodes } from '../types';
import { error, success } from '../utils/response';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: Request, res: Response) => {
  try {
    const status = req.query.status === 'archived' ? 'archived' : 'active';
    success(res, { list: await listProjects(req.user!.userId, status) });
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取项目失败');
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    success(res, await createProject(req.user!.userId, req.body?.name));
  } catch (err: any) {
    error(res, err?.code || ErrorCodes.SERVER_ERROR, err?.message || '创建项目失败');
  }
});

router.get('/:id(\\d+)', async (req: Request, res: Response) => {
  try {
    const project = await getProject(req.user!.userId, Number(req.params.id));
    if (!project) return error(res, ErrorCodes.NOT_FOUND, '项目不存在', 404);
    success(res, project);
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取项目详情失败');
  }
});

router.put('/:id(\\d+)', async (req: Request, res: Response) => {
  try {
    const project = await renameProject(req.user!.userId, Number(req.params.id), req.body?.name);
    if (!project) return error(res, ErrorCodes.NOT_FOUND, '项目不存在', 404);
    success(res, project);
  } catch (err: any) {
    error(res, err?.code || ErrorCodes.SERVER_ERROR, err?.message || '重命名项目失败');
  }
});

router.post('/:id(\\d+)/archive', async (req: Request, res: Response) => {
  try {
    if (!await archiveProject(req.user!.userId, Number(req.params.id))) return error(res, ErrorCodes.NOT_FOUND, '项目不存在', 404);
    success(res, { archived: true });
  } catch (err: any) {
    error(res, err?.code || ErrorCodes.SERVER_ERROR, err?.message || '归档项目失败');
  }
});

router.post('/:id(\\d+)/restore', async (req: Request, res: Response) => {
  try {
    if (!await restoreProject(req.user!.userId, Number(req.params.id))) return error(res, ErrorCodes.NOT_FOUND, '项目不存在', 404);
    success(res, { restored: true });
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '恢复项目失败');
  }
});

export default router;
