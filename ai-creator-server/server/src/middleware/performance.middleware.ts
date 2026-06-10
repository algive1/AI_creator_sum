import { Request, Response, NextFunction } from 'express';
import { query } from '../utils/db';

const WARN_MS = 500;
const ERROR_MS = 2000;

export function performanceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    if (durationMs < WARN_MS) return;

    const payload = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
      query: summarize(req.query),
      body: summarize(req.body),
      userId: req.user?.role === 'user' ? req.user.userId : null,
      adminId: req.user?.role === 'super_admin' ? req.user.userId : null,
      ip: req.ip || '',
    };

    if (durationMs >= ERROR_MS) {
      console.error('[API Slow]', payload);
      query(
        `INSERT INTO api_slow_logs
         (method, path, query_summary, body_summary, user_id, admin_id, ip, duration_ms, status_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
        [
          payload.method,
          payload.path.substring(0, 255),
          payload.query,
          payload.body,
          payload.userId,
          payload.adminId,
          payload.ip.substring(0, 64),
          payload.durationMs,
          payload.statusCode,
        ],
      ).catch(() => undefined);
      return;
    }

    console.warn('[API Warn]', payload);
  });
  next();
}

function summarize(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const cleaned: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (/password|token|secret|key|authorization/i.test(key)) {
      cleaned[key] = '[filtered]';
      continue;
    }
    if (typeof raw === 'string') cleaned[key] = raw.length > 120 ? `${raw.slice(0, 120)}...` : raw;
    else if (typeof raw === 'number' || typeof raw === 'boolean' || raw === null) cleaned[key] = raw;
    else if (Array.isArray(raw)) cleaned[key] = `[array:${raw.length}]`;
    else cleaned[key] = '[object]';
  }
  return JSON.stringify(cleaned).slice(0, 1024);
}
