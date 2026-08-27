import api from './api';

type UploadCategory = 'general' | 'template_cover' | 'ref_image' | 'ref_video' | 'ai_video';

export interface AdminAssetUploadOptions {
  category?: UploadCategory | string;
  refType?: string;
  refId?: string | number;
  onProgress?: (percent: number) => void;
}

interface UploadConfig {
  uploadMode?: string;
  storageProvider?: string;
  directUploadProviders?: string[];
  fallbackUploadUrl?: string;
}

interface DirectCredential {
  provider: string;
  storageProvider?: string;
  storageKey: string;
  uploadUrl: string;
  cdnUrl?: string;
  fileId?: number;
  fileNo?: string;
  fallbackUploadUrl?: string;
  credential?: Record<string, string>;
}

type UploadStage = 'config' | 'credential' | 'provider_upload' | 'notify' | 'fallback';

class UploadError extends Error {
  stage: UploadStage;

  constructor(stage: UploadStage, message: string) {
    super(message);
    this.stage = stage;
  }
}

function responseData<T = any>(value: any): T {
  return (value?.data ?? value) as T;
}

export function pickUploadUrl(fileInfo: any): string {
  return String(
    fileInfo?.deliveryUrl ||
    fileInfo?.publicUrl ||
    fileInfo?.cdnUrl ||
    fileInfo?.storageUrl ||
    fileInfo?.url ||
    fileInfo?.publicProxyUrl ||
    fileInfo?.previewUrl ||
    '',
  );
}

function inferMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = String(file.name || '').split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'avi') return 'video/x-msvideo';
  return 'application/octet-stream';
}

async function readUploadConfig(): Promise<UploadConfig> {
  try {
    return responseData<UploadConfig>(await api.get('/files/upload-config'));
  } catch (err: any) {
    throw new UploadError('config', err?.message || '读取上传配置失败');
  }
}

async function requestCredential(file: File, options: AdminAssetUploadOptions): Promise<DirectCredential> {
  try {
    return responseData<DirectCredential>(await api.get('/files/credential', {
      params: {
        originalName: file.name || 'upload.bin',
        fileSize: file.size,
        contentType: inferMimeType(file),
        category: options.category || 'general',
        refType: options.refType || 'admin_upload',
        refId: options.refId,
      },
    }));
  } catch (err: any) {
    throw new UploadError('credential', err?.message || '生成上传凭证失败');
  }
}

function uploadQiniuForm(file: File, credential: DirectCredential, onProgress?: (percent: number) => void): Promise<{ etag?: string }> {
  return new Promise((resolve, reject) => {
    const token = credential.credential?.uploadToken;
    if (!token || !credential.uploadUrl || !credential.storageKey) {
      reject(new UploadError('credential', '七牛上传凭证不完整'));
      return;
    }

    const form = new FormData();
    form.append('token', token);
    form.append('key', credential.storageKey);
    form.append('file', file, file.name || credential.storageKey.split('/').pop() || 'file');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', credential.uploadUrl, true);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new UploadError('provider_upload', `对象存储上传失败: ${xhr.status}`));
        return;
      }
      try {
        const body = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        onProgress?.(100);
        resolve({ etag: body?.etag || body?.hash || '' });
      } catch {
        onProgress?.(100);
        resolve({});
      }
    };
    xhr.onerror = () => reject(new UploadError('provider_upload', '对象存储上传网络失败'));
    xhr.ontimeout = () => reject(new UploadError('provider_upload', '对象存储上传超时'));
    xhr.timeout = Math.max(120000, Math.min(600000, Math.ceil(file.size / 1024 / 1024) * 15000));
    xhr.send(form);
  });
}

function appendCosFormFields(form: FormData, credential: DirectCredential, file: File): void {
  const fields = credential.credential || {};
  const key = String(fields.key || credential.storageKey || '');
  if (!key || !credential.uploadUrl) {
    throw new UploadError('credential', '腾讯云 COS 上传凭证不完整');
  }
  form.append('key', key);
  for (const name of [
    'Content-Type',
    'policy',
    'q-sign-algorithm',
    'q-ak',
    'q-key-time',
    'q-signature',
    'x-cos-security-token',
    'success_action_status',
  ]) {
    const value = fields[name];
    if (value !== undefined && value !== null && String(value) !== '') {
      form.append(name, String(value));
    }
  }
  if (!fields['Content-Type']) form.append('Content-Type', inferMimeType(file));
}

function uploadCosPostForm(file: File, credential: DirectCredential, onProgress?: (percent: number) => void): Promise<{ etag?: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    try {
      appendCosFormFields(form, credential, file);
    } catch (err) {
      reject(err);
      return;
    }
    form.append('file', file, file.name || credential.storageKey.split('/').pop() || 'file');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', credential.uploadUrl, true);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new UploadError('provider_upload', `腾讯云 COS 上传失败: ${xhr.status}`));
        return;
      }
      onProgress?.(100);
      resolve({ etag: (xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag') || '').replace(/^"|"$/g, '') });
    };
    xhr.onerror = () => reject(new UploadError('provider_upload', '腾讯云 COS 上传网络失败'));
    xhr.ontimeout = () => reject(new UploadError('provider_upload', '腾讯云 COS 上传超时'));
    xhr.timeout = Math.max(120000, Math.min(600000, Math.ceil(file.size / 1024 / 1024) * 15000));
    xhr.send(form);
  });
}

async function notifyUploadedObject(file: File, credential: DirectCredential, etag: string, startedAt: number) {
  try {
    return responseData(await api.post('/files/notify', {
      storageKey: credential.storageKey,
      etag,
      fileSize: file.size,
      mimeType: inferMimeType(file),
      durationMs: Date.now() - startedAt,
    }));
  } catch (err: any) {
    throw new UploadError('notify', err?.message || '确认上传结果失败');
  }
}

async function fallbackUpload(file: File, options: AdminAssetUploadOptions, fallbackUploadUrl = '/api/v1/admin/files/upload') {
  const form = new FormData();
  form.append('file', file);
  form.append('category', String(options.category || 'general'));
  form.append('refType', String(options.refType || 'admin_upload'));
  if (options.refId !== undefined && options.refId !== null) form.append('refId', String(options.refId));
  const url = fallbackUploadUrl.replace(/^\/api\/v1\/admin/, '');
  try {
    return responseData(await api.post(url, form));
  } catch (err: any) {
    throw new UploadError('fallback', err?.message || '上传失败');
  }
}

async function directQiniuUpload(file: File, options: AdminAssetUploadOptions) {
  const startedAt = Date.now();
  const credential = await requestCredential(file, options);
  const qiniuResult = await uploadQiniuForm(file, credential, options.onProgress);
  return notifyUploadedObject(file, credential, qiniuResult.etag || '', startedAt);
}

async function directCosUpload(file: File, options: AdminAssetUploadOptions) {
  const startedAt = Date.now();
  const credential = await requestCredential(file, options);
  const cosResult = await uploadCosPostForm(file, credential, options.onProgress);
  return notifyUploadedObject(file, credential, cosResult.etag || '', startedAt);
}

export async function uploadAdminAsset(file: File, options: AdminAssetUploadOptions = {}) {
  const config = await readUploadConfig();
  const provider = String(config.storageProvider || '');
  const supportsDirect = config.uploadMode === 'direct_client' &&
    ['qiniu_kodo', 'tencent_cos'].includes(provider) &&
    (config.directUploadProviders || []).includes(provider);

  if (!supportsDirect) {
    return fallbackUpload(file, options, config.fallbackUploadUrl);
  }

  try {
    if (provider === 'tencent_cos') return await directCosUpload(file, options);
    return await directQiniuUpload(file, options);
  } catch (err: any) {
    if (err?.stage === 'notify') throw err;
    return fallbackUpload(file, options, config.fallbackUploadUrl);
  }
}
