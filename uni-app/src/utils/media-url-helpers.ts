export interface SimpleMediaDownloadConfig {
  origins?: unknown[];
  fileProxyOrigins?: unknown[];
  storageOrigins?: unknown[];
}

const FALLBACK_MEDIA_HOSTS = new Set([
  'ai-creator-1301433202.cos.ap-chengdu.myqcloud.com',
]);

export function isOwnDownloadableMediaUrlByConfig(url: unknown, mediaDownload: SimpleMediaDownloadConfig = {}): boolean {
  const value = String(url || '').trim();
  if (!value) return false;
  if (/^(wxfile|file):\/\//i.test(value)) return true;
  if (value.startsWith('/')) return false;
  if (!/^https?:\/\//i.test(value)) return false;

  try {
    const parsed = new URL(value);
    const config = normalizeMediaDownloadConfig(mediaDownload);
    if (config.storageOrigins.has(parsed.origin)) return true;
    if (config.fileProxyOrigins.has(parsed.origin)) return true;
    return FALLBACK_MEDIA_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function normalizeMediaDownloadConfig(value: SimpleMediaDownloadConfig) {
  const storageSource = Array.isArray(value.storageOrigins) ? value.storageOrigins : [];
  const proxySource = Array.isArray(value.fileProxyOrigins) ? value.fileProxyOrigins : [];
  return {
    storageOrigins: new Set(storageSource.map(originOf).filter(Boolean)),
    fileProxyOrigins: new Set(proxySource.map(originOf).filter(Boolean)),
  };
}

function originOf(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    return new URL(text).origin;
  } catch {
    return '';
  }
}
