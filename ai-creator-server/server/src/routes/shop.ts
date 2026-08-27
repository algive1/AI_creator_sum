import { Router, Request, Response } from 'express';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import { listPointPackages, listMemberPlans } from '../services/payment-order.service';
import { SettingsService } from '../services/settings.service';
import { getCommerceAvailability, PURCHASE_UNAVAILABLE_MESSAGE } from '../services/commerce-availability.service';

const router = Router();

router.get('/point-packages', async (_req: Request, res: Response) => {
  try {
    const commerce = await getCommerceAvailability();
    if (!commerce.purchaseEnabled) {
      error(res, ErrorCodes.FORBIDDEN, PURCHASE_UNAVAILABLE_MESSAGE);
      return;
    }
    const list = await listPointPackages();
    success(res, { list });
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取积分套餐失败');
  }
});

router.get('/member-plans', async (_req: Request, res: Response) => {
  try {
    const commerce = await getCommerceAvailability();
    if (!commerce.purchaseEnabled || !commerce.membershipEnabled) {
      error(res, ErrorCodes.FORBIDDEN, commerce.message || PURCHASE_UNAVAILABLE_MESSAGE);
      return;
    }
    const enabled = await SettingsService.getBoolean('membership.enabled', true);
    if (!enabled) {
      error(res, ErrorCodes.FORBIDDEN, '会员功能已关闭，暂不提供会员套餐');
      return;
    }
    const list = await listMemberPlans();
    success(res, { list });
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取会员套餐失败');
  }
});

export default router;
