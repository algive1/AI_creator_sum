export interface UploadResponseInput {
  reqBaseUrl: string;
  fileId: number;
  fileNo: string;
  cdnUrl?: string;
  accessUrl?: string;
  storageUrl?: string;
  mimeType: string;
  fileSize: number;
  width?: number;
  height?: number;
  reused?: boolean;
}

function absoluteUrl(reqBaseUrl: string, url: string): string {
  const value = String(url || '').trim();
  if (!value || /^https?:\/\//i.test(value)) return value;
  return `${reqBaseUrl}${value.startsWith('/') ? value : `/${value}`}`;
}

function fileContentUrl(reqBaseUrl: string, fileNo: string): string {
  return `${reqBaseUrl}/api/v1/files/${encodeURIComponent(fileNo)}/content`;
}

export function buildUploadResponse(input: UploadResponseInput) {
  const deliveryUrl = fileContentUrl(input.reqBaseUrl, input.fileNo);
  const cdnUrl = absoluteUrl(input.reqBaseUrl, input.cdnUrl || input.storageUrl || '');
  const accessUrl = absoluteUrl(input.reqBaseUrl, input.accessUrl || '');
  const storageUrl = absoluteUrl(input.reqBaseUrl, input.storageUrl || input.cdnUrl || '');

  return {
    fileId: input.fileId,
    fileNo: input.fileNo,
    url: deliveryUrl,
    deliveryUrl,
    publicUrl: deliveryUrl,
    publicProxyUrl: deliveryUrl,
    storageUrl,
    cdnUrl,
    accessUrl,
    mimeType: input.mimeType,
    fileSize: input.fileSize,
    width: Number(input.width || 0),
    height: Number(input.height || 0),
    reused: Boolean(input.reused),
  };
}
