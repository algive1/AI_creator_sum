import { appEnv } from '@/env/index';
import { isOwnDownloadableMediaUrlByConfig } from './media-url-helpers';

const BACKEND_MEDIA_PATH = /^\/(?:static|assets|uploads)\//;
export interface MediaDownloadConfig {
  origins?: unknown[];
  fileProxyOrigins?: unknown[];
  storageOrigins?: unknown[];
}

export function normalizeBackendMediaUrl(url: unknown): string {
  const value = String(url || '').trim();
  if (!value || /^https?:\/\//i.test(value) || !BACKEND_MEDIA_PATH.test(value)) return value;
  const base = String(appEnv.baseURL || '').replace(/\/api\/v\d+\/?$/i, '').replace(/\/+$/, '');
  return base ? `${base}${value}` : value;
}

export function isOwnDownloadableMediaUrl(url: unknown, mediaDownload: unknown[] | MediaDownloadConfig = []): boolean {
  const config = Array.isArray(mediaDownload) ? { origins: mediaDownload } : (mediaDownload || {});
  const fallbackOrigins = Array.isArray(config.origins) ? config.origins : [];
  return isOwnDownloadableMediaUrlByConfig(url, {
    storageOrigins: Array.isArray(config.storageOrigins) ? config.storageOrigins : fallbackOrigins,
    fileProxyOrigins: Array.isArray(config.fileProxyOrigins) ? config.fileProxyOrigins : [],
  });
}
