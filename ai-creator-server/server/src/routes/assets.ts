import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  favoriteMediaAssets,
  createUploadedMediaAsset,
  getMediaAsset,
  listMediaAssets,
  moveMediaAssets,
  restoreMediaAssets,
  trashMediaAssets,
  updateMediaAsset,
} from '../services/media-asset.service';
import { ErrorCodes } from '../types';
import { error, success } from '../utils/response';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req: Request, res: Response) => {
  try {
    const favorite = req.query.favorite === undefined ? undefined : req.query.favorite === 'true' || req.query.favorite === '1';
    success(res, await listMediaAssets(req.user!.userId, {
      projectId: req.query.projectId ? Number(req.query.projectId) : undefined,
      mediaType: String(req.query.mediaType || ''),
      keyword: String(req.query.keyword || '').trim(),
      favorite,
      status: req.query.status === 'trashed' ? 'trashed' : 'active',
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 24),
    }));
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取资产失败');
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    success(res, await createUploadedMediaAsset({
      userId: req.user!.userId,
      projectId: req.body?.projectId ? Number(req.body.projectId) : undefined,
      fileId: Number(req.body?.fileId),
      name: req.body?.name,
    }));
  } catch (err: any) {
    error(res, err?.code || ErrorCodes.SERVER_ERROR, err?.message || '素材加入资产库失败');
  }
});

router.post('/batch', async (req: Request, res: Response) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const action = String(req.body?.action || '');
    let affected = 0;
    if (action === 'delete') affected = await trashMediaAssets(req.user!.userId, ids);
    else if (action === 'restore') affected = await restoreMediaAssets(req.user!.userId, ids);
    else if (action === 'move') affected = await moveMediaAssets(req.user!.userId, ids, Number(req.body?.projectId));
    else if (action === 'favorite') {
      if (typeof req.body?.isFavorite !== 'boolean') return error(res, ErrorCodes.PARAM_ERROR, '收藏状态必须是布尔值');
      affected = await favoriteMediaAssets(req.user!.userId, ids, req.body.isFavorite);
    }
    else return error(res, ErrorCodes.PARAM_ERROR, '不支持的批量操作');
    success(res, { affected });
  } catch (err: any) {
    error(res, err?.code || ErrorCodes.SERVER_ERROR, err?.message || '批量操作失败');
  }
});

router.get('/:id(\\d+)', async (req: Request, res: Response) => {
  try {
    const asset = await getMediaAsset(req.user!.userId, Number(req.params.id));
    if (!asset) return error(res, ErrorCodes.NOT_FOUND, '资产不存在', 404);
    success(res, asset);
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取资产详情失败');
  }
});

router.patch('/:id(\\d+)', async (req: Request, res: Response) => {
  try {
    const asset = await updateMediaAsset(req.user!.userId, Number(req.params.id), req.body || {});
    if (!asset) return error(res, ErrorCodes.NOT_FOUND, '资产不存在', 404);
    success(res, asset);
  } catch (err: any) {
    error(res, err?.code || ErrorCodes.SERVER_ERROR, err?.message || '更新资产失败');
  }
});

router.delete('/:id(\\d+)', async (req: Request, res: Response) => {
  try {
    success(res, { deleted: await trashMediaAssets(req.user!.userId, [Number(req.params.id)]) > 0 });
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '删除资产失败');
  }
});

router.post('/:id(\\d+)/restore', async (req: Request, res: Response) => {
  try {
    success(res, { restored: await restoreMediaAssets(req.user!.userId, [Number(req.params.id)]) > 0 });
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '恢复资产失败');
  }
});

export default router;
