import { Request, Response, NextFunction } from 'express';
import { query } from '../utils/db';

const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE']);

export function adminOperationLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!WRITE_METHODS.has(req.method)) return next();

  const startedAt = Date.now();
  res.on('finish', () => {
    if (!req.user || req.user.role !== 'super_admin') return;
    if (res.statusCode >= 500) return;
    const target = inferTarget(req);
    const detail = {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      body: sanitize(req.body),
    };
    query(
      `INSERT INTO admin_operation_logs
       (admin_user_id, admin_id, action, target_type, table_name, target_id, record_id, before_data, after_data, detail, ip, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NOW(3))`,
      [
        req.user.userId,
        req.user.userId,
        `${req.method.toLowerCase()} ${target.tableName}`,
        target.tableName,
        target.tableName,
        target.recordId,
        target.recordId,
        JSON.stringify(detail),
        JSON.stringify(detail),
        (req.ip || '').substring(0, 64),
        (req.ip || '').substring(0, 45),
        String(req.headers['user-agent'] || '').substring(0, 512),
      ],
    ).catch(() => undefined);
  });

  next();
}

function inferTarget(req: Request): { tableName: string; recordId: string } {
  const parts = req.path.split('/').filter(Boolean);
  const tableName = normalizeTableName(parts[0] || 'admin');
  const recordId = String(req.params.id || req.params.orderNo || parts.find(part => /^\d+$/.test(part)) || '');
  return { tableName, recordId };
}

function normalizeTableName(value: string): string {
  return String(value || 'admin').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'admin';
}

function sanitize(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value || null;
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitize);
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (/password|token|secret|key|authorization/i.test(key)) output[key] = '[filtered]';
    else if (typeof raw === 'string') output[key] = raw.length > 300 ? `${raw.slice(0, 300)}...` : raw;
    else if (typeof raw === 'number' || typeof raw === 'boolean' || raw === null) output[key] = raw;
    else output[key] = sanitize(raw);
  }
  return output;
}
