import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';
import {
  cancelOrder,
  createOrder,
  getOrderDetail,
  listOrders,
} from '../services/payment-order.service';

const router = Router();

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { orderType, productId } = req.body || {};
    if (!['points', 'membership'].includes(orderType)) {
      error(res, ErrorCodes.PARAM_ERROR, '订单类型无效');
      return;
    }
    const parsedProductId = Number.parseInt(String(productId || ''), 10);
    if (!Number.isFinite(parsedProductId) || parsedProductId <= 0) {
      error(res, ErrorCodes.PARAM_ERROR, '商品 ID 无效');
      return;
    }
    const result = await createOrder({
      userId: req.user!.userId,
      orderType,
      productId: parsedProductId,
    });
    success(res, result);
  } catch (err: any) {
    if (err?.code && err.code < 5000) {
      error(res, err.code, err.message);
      return;
    }
    error(res, ErrorCodes.ORDER_CREATE_FAILED, err?.message || '创建订单失败');
  }
});

router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { orderType, status, payStatus, page, pageSize, lastId } = req.query as any;
    const result = await listOrders({
      userId: req.user!.userId,
      orderType: orderType === 'points' || orderType === 'membership' ? orderType : undefined,
      status: status ? String(status) : undefined,
      payStatus: payStatus ? String(payStatus) : undefined,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
      lastId: lastId ? Number(lastId) : undefined,
    });
    success(res, result);
  } catch (err: any) {
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取订单列表失败');
  }
});

router.get('/:orderNo', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await getOrderDetail(req.params.orderNo, req.user!.userId);
    success(res, result);
  } catch (err: any) {
    if (err?.code && err.code < 5000) {
      error(res, err.code, err.message);
      return;
    }
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '获取订单详情失败');
  }
});

router.post('/:orderNo/cancel', authMiddleware, async (req: Request, res: Response) => {
  try {
    const result = await cancelOrder(req.params.orderNo, req.user!.userId);
    success(res, result);
  } catch (err: any) {
    if (err?.code && err.code < 5000) {
      error(res, err.code, err.message);
      return;
    }
    error(res, ErrorCodes.SERVER_ERROR, err?.message || '取消订单失败');
  }
});

export default router;
