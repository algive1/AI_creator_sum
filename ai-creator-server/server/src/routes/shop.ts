import { Router, Request, Response } from 'express';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { listPointPackages, listMemberPlans } from '../services/payment-order.service';

const router = Router();

router.get('/point-packages', async (_req: Request, res: Response) => {
  try {
    const list = await listPointPackages();
    success(res, { list });
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取积分套餐失败');
  }
});

router.get('/member-plans', async (_req: Request, res: Response) => {
  try {
    const list = await listMemberPlans();
    success(res, { list });
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取会员套餐失败');
  }
});

export default router;
