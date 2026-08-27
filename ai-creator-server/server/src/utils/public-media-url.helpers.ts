export interface PublicFileDeliveryOptions {
  apiBaseUrl?: string;
  fileNo?: string;
  cdnUrl?: string;
  accessUrl?: string;
  preferProxy?: boolean;
}

export function choosePublicFileDeliveryUrl(options: PublicFileDeliveryOptions): string {
  const apiBaseUrl = String(options.apiBaseUrl || '').trim().replace(/\/+$/, '');
  const fileNo = String(options.fileNo || '').trim();
  const cdnUrl = String(options.cdnUrl || '').trim();
  const accessUrl = String(options.accessUrl || '').trim();
  const preferProxy = options.preferProxy !== false;

  if (cdnUrl) return cdnUrl;
  if (accessUrl) return accessUrl;

  if (preferProxy && apiBaseUrl && fileNo) {
    return `${apiBaseUrl}/api/v1/files/${encodeURIComponent(fileNo)}/content`;
  }

  return fileNo && apiBaseUrl ? `${apiBaseUrl}/api/v1/files/${encodeURIComponent(fileNo)}/content` : '';
}
