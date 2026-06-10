import { Router, Request, Response } from 'express';
import { adminAuthMiddleware } from '../middleware/auth';
import { query } from '../utils/db';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import {
  getAdminOrderDetail,
  listAdminOrders,
  queryAndSyncWechatOrder,
  regrantOrderBenefits,
} from '../services/payment-order.service';

const router = Router();

router.get('/orders', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { status, payStatus, grantStatus, orderType, keyword, userId, page, pageSize } = req.query as any;
    const result = await listAdminOrders({
      status: status ? String(status) : undefined,
      payStatus: payStatus ? String(payStatus) : undefined,
      grantStatus: grantStatus ? String(grantStatus) : undefined,
      orderType: orderType ? String(orderType) : undefined,
      keyword: keyword ? String(keyword) : undefined,
      userId: userId ? Number(userId) : undefined,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
    success(res, result);
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取支付订单列表失败');
  }
});

router.get('/orders/:orderNo', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await getAdminOrderDetail(req.params.orderNo);
    success(res, result);
  } catch (err: any) {
    if (err?.code && err.code < 5000) {
      error(res, err.code, err.message);
      return;
    }
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取支付订单详情失败');
  }
});

router.post('/orders/:orderNo/query-wechat', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await queryAndSyncWechatOrder(req.params.orderNo, req.user!.userId, true);
    await query('INSERT INTO admin_operation_logs (admin_user_id, action, target_type, target_id, created_at) VALUES (?, ?, ?, ?, NOW(3))', [req.user!.userId, 'payment.query_wechat', 'order', req.params.orderNo]).catch(() => undefined);
    success(res, result);
  } catch (err: any) {
    if (err?.code && err.code < 5000) {
      error(res, err.code, err.message);
      return;
    }
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '同步微信支付订单失败');
  }
});

router.post('/orders/:orderNo/regrant', adminAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await regrantOrderBenefits(req.params.orderNo, req.user!.userId);
    await query('INSERT INTO admin_operation_logs (admin_user_id, action, target_type, target_id, created_at) VALUES (?, ?, ?, ?, NOW(3))', [req.user!.userId, 'payment.regrant', 'order', req.params.orderNo]).catch(() => undefined);
    success(res, result);
  } catch (err: any) {
    if (err?.code && err.code < 5000) {
      error(res, err.code, err.message);
      return;
    }
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '补发订单权益失败');
  }
});

export default router;
