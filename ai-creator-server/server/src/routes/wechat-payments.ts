import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { error, success } from '../utils/response';
import { ErrorCodes } from '../types';
import {
  handleWechatNotify,
  queryAndSyncWechatOrder,
  startWechatJsapiPayment,
} from '../services/payment-order.service';

const router = Router();

router.post('/wechat/jsapi', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orderNo = String(req.body?.orderNo || '').trim();
    if (!orderNo) {
      error(res, ErrorCodes.PARAM_ERROR, 'Missing orderNo');
      return;
    }
    const result = await startWechatJsapiPayment(orderNo, req.user!.userId);
    success(res, result);
  } catch (err: any) {
    if (err?.code && err.code < 5000) {
      error(res, err.code, err.message);
      return;
    }
    error(res, ErrorCodes.WECHAT_PREPAY_FAILED, err?.message || 'Failed to create WeChat prepay order');
  }
});

router.post('/wechat/query', authMiddleware, async (req: Request, res: Response) => {
  try {
    const orderNo = String(req.body?.orderNo || '').trim();
    if (!orderNo) {
      error(res, ErrorCodes.PARAM_ERROR, 'Missing orderNo');
      return;
    }
    const result = await queryAndSyncWechatOrder(orderNo, req.user!.userId, false);
    success(res, result);
  } catch (err: any) {
    if (err?.code && err.code < 5000) {
      error(res, err.code, err.message);
      return;
    }
    error(res, ErrorCodes.SERVER_ERROR, err?.message || 'Failed to query WeChat order');
  }
});

router.post('/wechat/notify', async (req: Request, res: Response) => {
  try {
    const result = await handleWechatNotify({
      headers: {
        timestamp: req.headers['wechatpay-timestamp'] as string | undefined,
        nonce: req.headers['wechatpay-nonce'] as string | undefined,
        signature: req.headers['wechatpay-signature'] as string | undefined,
        serial: req.headers['wechatpay-serial'] as string | undefined,
      },
      rawBody: (req as any).rawBody || JSON.stringify(req.body || {}),
      payload: req.body,
    });
    if (!result.success) {
      res.status(200).json({ code: 'FAIL', message: result.message || 'failed' });
      return;
    }
    res.status(200).json({ code: 'SUCCESS', message: 'success' });
  } catch (err: any) {
    res.status(200).json({ code: 'FAIL', message: err?.message || 'failed' });
  }
});

export default router;
