import { appEnv } from '@/env/index';

const BACKEND_MEDIA_PATH = /^\/(?:static|assets|uploads)\//;

export function normalizeBackendMediaUrl(url: unknown): string {
  const value = String(url || '').trim();
  if (!value || /^https?:\/\//i.test(value) || !BACKEND_MEDIA_PATH.test(value)) return value;
  const base = String(appEnv.baseURL || '').replace(/\/api\/v\d+\/?$/i, '').replace(/\/+$/, '');
  return base ? `${base}${value}` : value;
}
