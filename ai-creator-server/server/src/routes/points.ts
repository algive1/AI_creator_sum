// src/routes/points.ts
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { getPointsBalance, getPointsTransactions } from '../services/points.service';
import { success, error } from '../utils/response';
import { ErrorCodes } from '../types';

const router = Router();

// GET /api/v1/points/balance
router.get('/balance', authMiddleware, async (req: Request, res: Response) => {
  try {
    const balance = await getPointsBalance(req.user!.userId);
    success(res, balance);
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '查询积分余额失败');
  }
});

// GET /api/v1/points/transactions
router.get('/transactions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { type, source, direction, category, page, pageSize } = req.query as any;
    const result = await getPointsTransactions(req.user!.userId, {
      type: type || undefined,
      source: source || undefined,
      direction: direction || undefined,
      category: category || undefined,
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 20,
    });
    success(res, result);
  } catch {
    error(res, ErrorCodes.SERVER_ERROR, '查询积分流水失败');
  }
});

export default router;
