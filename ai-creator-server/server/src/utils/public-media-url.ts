import type { Request } from 'express';
import { queryOne } from './db';
import { SettingsService } from '../services/settings.service';
import { publicRequestBaseUrl } from './public-base-url';
import { choosePublicFileDeliveryUrl } from './public-media-url.helpers';

const FILE_CONTENT_PATH_PATTERN = /\/api\/v\d+\/files\/([^/?#]+)\/content/i;
const BACKEND_MEDIA_PATH_PATTERN = /^\/(?:static|assets|uploads)\//;
const STORAGE_KEY_PATTERN = /^[a-z_]+\/\d{4}-\d{2}\/[a-zA-Z0-9_-]{8,64}\.[a-z0-9]{2,10}$/i;

function requestBaseUrl(req?: Request): string {
  return publicRequestBaseUrl(req);
}

async function configuredApiBaseUrl(req?: Request): Promise<string> {
  const fromRequest = requestBaseUrl(req);
  if (fromRequest) return fromRequest;
  return String(await SettingsService.getString('site.api_domain', '')).trim().replace(/\/+$/, '');
}

async function configuredLocalBaseUrl(): Promise<string> {
  return String(process.env.LOCAL_BASE_URL || '').trim().replace(/\/+$/, '')
    || String(await SettingsService.getString('storage.local.base_url', '')).trim().replace(/\/+$/, '');
}

async function publicFileContentUrl(req: Request | undefined, fileNo: string): Promise<string> {
  const path = `/api/v1/files/${encodeURIComponent(fileNo)}/content`;
  const base = await configuredApiBaseUrl(req);
  return base ? `${base}${path}` : path;
}

function withoutQueryAndHash(value: string): string {
  const index = value.search(/[?#]/);
  return index >= 0 ? value.slice(0, index) : value;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function storageKeyFromUrl(value: string): string {
  const clean = withoutQueryAndHash(value).trim();
  if (STORAGE_KEY_PATTERN.test(clean)) return clean;
  try {
    const parsed = new URL(clean);
    const path = safeDecode(parsed.pathname.replace(/^\/+/, ''));
    return STORAGE_KEY_PATTERN.test(path) ? path : '';
  } catch {
    const path = safeDecode(clean.replace(/^\/+/, ''));
    return STORAGE_KEY_PATTERN.test(path) ? path : '';
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

interface MediaFileRow {
  file_no: string;
  cdn_url: string;
  access_url: string;
}

function absoluteUrl(req: Request | undefined, url: string): string {
  const value = String(url || '').trim();
  if (!value || /^https?:\/\//i.test(value)) return value;
  const base = requestBaseUrl(req);
  return base ? `${base}${value.startsWith('/') ? value : `/${value}`}` : value;
}

async function findFileByFileNo(fileNo: string): Promise<MediaFileRow | null> {
  const row = await queryOne<MediaFileRow>(
    `SELECT file_no, cdn_url, access_url
       FROM files
      WHERE file_no = ? AND is_deleted = 0
      LIMIT 1`,
    [fileNo],
  );
  return row || null;
}

async function findFileByMediaUrl(value: string): Promise<MediaFileRow | null> {
  const clean = withoutQueryAndHash(value);
  const storageKey = storageKeyFromUrl(value);
  const urlCandidates = unique([value, clean]);
  const conditions: string[] = [];
  const params: string[] = [];

  if (storageKey) {
    conditions.push('storage_key = ?');
    params.push(storageKey);
  }
  for (const candidate of urlCandidates) {
    conditions.push('cdn_url = ? OR access_url = ?');
    params.push(candidate, candidate);
  }
  if (!conditions.length) return null;

  const row = await queryOne<MediaFileRow>(
    `SELECT file_no, cdn_url, access_url
       FROM files
      WHERE is_deleted = 0
        AND (${conditions.map(condition => `(${condition})`).join(' OR ')})
      ORDER BY id DESC
      LIMIT 1`,
    params,
  );
  return row || null;
}

async function publicFileMediaUrl(req: Request | undefined, file: MediaFileRow | null, fileNo: string): Promise<string> {
  const apiBaseUrl = await configuredApiBaseUrl(req);
  const cdnUrl = absoluteUrl(req, String(file?.cdn_url || '').trim());
  const accessUrl = absoluteUrl(req, String(file?.access_url || '').trim());
  return choosePublicFileDeliveryUrl({
    apiBaseUrl,
    fileNo,
    cdnUrl,
    accessUrl,
    preferProxy: true,
  }) || await publicFileContentUrl(req, fileNo);
}

export async function normalizePublicMediaUrl(req: Request | undefined, url: unknown): Promise<string> {
  const value = String(url || '').trim();
  if (!value) return '';

  const proxyMatch = value.match(FILE_CONTENT_PATH_PATTERN);
  if (proxyMatch?.[1]) {
    const fileNo = safeDecode(proxyMatch[1]);
    return publicFileMediaUrl(req, await findFileByFileNo(fileNo), fileNo);
  }

  const file = await findFileByMediaUrl(value);
  if (file?.file_no) return publicFileMediaUrl(req, file, file.file_no);

  if (/^https?:\/\//i.test(value) || !value.startsWith('/')) return value;

  const apiBaseUrl = await configuredApiBaseUrl(req);
  if (apiBaseUrl && !BACKEND_MEDIA_PATH_PATTERN.test(value)) return `${apiBaseUrl}${value}`;

  if (BACKEND_MEDIA_PATH_PATTERN.test(value)) {
    const localBaseUrl = await configuredLocalBaseUrl();
    if (localBaseUrl) {
      try {
        return `${new URL(localBaseUrl).origin}${value}`;
      } catch {
        return value;
      }
    }
  }

  return apiBaseUrl ? `${apiBaseUrl}${value}` : value;
}
