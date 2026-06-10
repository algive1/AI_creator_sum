import { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyToken } from '../services/auth.service';

const rateLimitMessage = (message: string) => ({ code: 429, message, data: null });

function positiveInt(value: any, fallback: number): number {
  const parsed = parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const globalRateLimiter = rateLimit({
  windowMs: 60_000,
  max: positiveInt(process.env.GLOBAL_RATE_LIMIT_PER_MINUTE, 200),
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage('请求过于频繁，请稍后重试'),
  skip: (req: Request) => req.path === '/api/v1/payments/wechat/notify' || req.path === '/api/v1/payments/callback',
});

export const loginRateLimiter = rateLimit({
  windowMs: 60_000,
  max: positiveInt(process.env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE, 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage('登录尝试过于频繁，请稍后重试'),
});

export const registerRateLimiter = rateLimit({
  windowMs: 60_000,
  max: positiveInt(process.env.AUTH_REGISTER_RATE_LIMIT_PER_MINUTE, 5),
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage('注册尝试过于频繁，请稍后重试'),
});

export const taskUserRateLimiter = rateLimit({
  windowMs: 60_000,
  max: positiveInt(process.env.TASK_USER_RATE_LIMIT_PER_MINUTE, 20),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => String(req.user?.userId || tokenUserId(req) || req.ip),
  message: rateLimitMessage('任务接口请求过于频繁，请稍后重试'),
});

function tokenUserId(req: Request): number | null {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return null;
  try {
    const payload = verifyToken(auth.substring(7));
    return payload.role === 'user' ? payload.userId : null;
  } catch {
    return null;
  }
}
