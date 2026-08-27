import type { Request } from 'express';

const LOCAL_HOST_PATTERN = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[?::1\]?)(:\d+)?$/i;

function firstHeaderValue(value: unknown): string {
  return String(value || '').split(',')[0].trim();
}

function configuredBaseUrl(): string {
  const configured = String(process.env.APP_PUBLIC_URL || process.env.PUBLIC_API_DOMAIN || process.env.SITE_API_DOMAIN || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(configured) ? configured : '';
}

export function publicRequestBaseUrl(req?: Request): string {
  const configured = configuredBaseUrl();
  if (configured) return configured;
  if (!req) return '';

  const host = firstHeaderValue(req.headers['x-forwarded-host']) || String(req.get('host') || '').trim();
  if (!host) return '';

  const forwardedProto = firstHeaderValue(req.headers['x-forwarded-proto']).toLowerCase();
  const requestProto = req.secure ? 'https' : String(req.protocol || 'http').toLowerCase();
  const isLocalHost = LOCAL_HOST_PATTERN.test(host);
  const proto = forwardedProto || (requestProto === 'http' && !isLocalHost ? 'https' : requestProto);
  return `${proto || 'http'}://${host}`.replace(/\/+$/, '');
}
