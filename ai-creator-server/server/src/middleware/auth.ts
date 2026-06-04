// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/auth.service';
import { error } from '../utils/response';
import { ErrorCodes, JwtPayload } from '../types';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    error(res, ErrorCodes.UNAUTHORIZED, '未登录', 401);
    return;
  }

  try {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    if (payload.role !== 'user') {
      error(res, ErrorCodes.UNAUTHORIZED, '无效的用户令牌', 401);
      return;
    }

    req.user = payload;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      error(res, ErrorCodes.UNAUTHORIZED, '登录已过期，请重新登录', 401);
    } else {
      error(res, ErrorCodes.UNAUTHORIZED, '无效的令牌', 401);
    }
  }
}

export function optionalUserAuthMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (payload.role === 'user') req.user = payload;
  } catch {
    // Public endpoints stay public; invalid tokens simply get non-member pricing.
  }

  next();
}

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    error(res, ErrorCodes.UNAUTHORIZED, '未登录', 401);
    return;
  }

  try {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (payload.role !== 'super_admin') {
      error(res, ErrorCodes.FORBIDDEN, '仅超级管理员可访问后台', 403);
      return;
    }

    req.user = payload;
    next();
  } catch {
    error(res, ErrorCodes.UNAUTHORIZED, '无效的令牌', 401);
  }
}
