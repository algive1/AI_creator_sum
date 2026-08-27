import { downloadFile, get, post, uploadFile } from './request';

interface UploadConfig {
  uploadMode?: string;
  storageProvider?: string;
  directUploadProviders?: string[];
  fallbackUploadUrl?: string;
}

interface DirectCredential {
  storageKey: string;
  uploadUrl: string;
  cdnUrl?: string;
  url?: string;
  fileId?: number;
  fileNo?: string;
  credential?: Record<string, string>;
}

type DirectUploadStage = 'file_info' | 'credential' | 'provider_upload' | 'notify';

class DirectUploadError extends Error {
  stage: DirectUploadStage;

  constructor(stage: DirectUploadStage, message: string) {
    super(message);
    this.stage = stage;
  }
}

function fileNameFromPath(filePath: string, fileCategory: string): string {
  const name = String(filePath || '').split(/[\\/]/).pop() || '';
  if (name && /\.[a-z0-9]{2,10}$/i.test(name)) return name;
  if (fileCategory === 'ref_audio') return 'upload.mp3';
  return fileCategory === 'ref_video' || fileCategory === 'ai_video' ? 'upload.mp4' : 'upload.jpg';
}

function inferMimeType(filePath: string, fileCategory: string): string {
  const ext = fileNameFromPath(filePath, fileCategory).split('.').pop()?.toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'avi') return 'video/x-msvideo';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'm4a') return 'audio/mp4';
  if (ext === 'aac') return 'audio/aac';
  if (ext === 'ogg') return 'audio/ogg';
  if (fileCategory === 'ref_audio') return 'audio/mpeg';
  return fileCategory === 'ref_video' || fileCategory === 'ai_video' ? 'video/mp4' : 'image/jpeg';
}

function fallbackUploadPath(config?: UploadConfig): string | undefined {
  return config?.fallbackUploadUrl?.replace(/^\/api\/v1/, '') || undefined;
}

function getLocalFileSize(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    uni.getFileInfo({
      filePath,
      success: (res) => resolve(Number(res.size || 0)),
      fail: (err) => reject(new DirectUploadError('file_info', err?.errMsg || '读取文件信息失败')),
    });
  });
}

function parseUploadBody(data: unknown): Record<string, unknown> {
  if (typeof data !== 'string') return (data || {}) as Record<string, unknown>;
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function uploadToQiniu(filePath: string, credential: DirectCredential, timeout: number) {
  return new Promise<{ etag: string }>((resolve, reject) => {
    const token = credential.credential?.uploadToken;
    if (!token || !credential.storageKey || !credential.uploadUrl) {
      reject(new DirectUploadError('credential', '上传凭证不完整'));
      return;
    }
    uni.uploadFile({
      url: credential.uploadUrl,
      filePath,
      name: 'file',
      timeout,
      formData: {
        token,
        key: credential.storageKey,
      },
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new DirectUploadError('provider_upload', `对象存储上传失败: ${res.statusCode}`));
          return;
        }
        const body = parseUploadBody(res.data);
        resolve({ etag: String(body.etag || body.hash || '') });
      },
      fail: (err) => reject(new DirectUploadError('provider_upload', err?.errMsg || '对象存储上传失败')),
    });
  });
}

function cosFormData(credential: DirectCredential, mimeType: string): Record<string, string> {
  const fields = credential.credential || {};
  const key = String(fields.key || credential.storageKey || '');
  if (!key || !credential.uploadUrl) {
    throw new DirectUploadError('credential', 'Tencent COS upload credential is incomplete');
  }
  const formData: Record<string, string> = { key };
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
      formData[name] = String(value);
    }
  }
  if (!formData['Content-Type']) formData['Content-Type'] = mimeType;
  return formData;
}

function uploadToCos(filePath: string, credential: DirectCredential, timeout: number, mimeType: string) {
  return new Promise<{ etag: string }>((resolve, reject) => {
    let formData: Record<string, string>;
    try {
      formData = cosFormData(credential, mimeType);
    } catch (err) {
      reject(err);
      return;
    }

    uni.uploadFile({
      url: credential.uploadUrl,
      filePath,
      name: 'file',
      timeout,
      formData,
      success: (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new DirectUploadError('provider_upload', `Tencent COS upload failed: ${res.statusCode}`));
          return;
        }
        const header = (res as any).header || {};
        resolve({ etag: String(header.ETag || header.etag || '').replace(/^"|"$/g, '') });
      },
      fail: (err) => reject(new DirectUploadError('provider_upload', err?.errMsg || 'Tencent COS upload failed')),
    });
  });
}

export function uploadAsset<T = Record<string, unknown>>(
  filePath: string,
  fileCategory = 'general',
  visibility: 'public' | 'private' = 'private',
) {
  const isVideo = fileCategory === 'ref_video' || fileCategory === 'ai_video';
  const isAudio = fileCategory === 'ref_audio';
  const fallback = (config?: UploadConfig) => uploadFile<T>({
    url: fallbackUploadPath(config),
    filePath,
    fileCategory,
    visibility,
    loading: '上传中',
    timeout: isVideo ? 300000 : isAudio ? 180000 : 120000,
  });

  return get<UploadConfig>('/files/upload-config', undefined, { silent: true, timeout: 10000 })
    .then(async (config) => {
      const provider = String(config.storageProvider || '');
      const supportsDirect = config.uploadMode === 'direct_client' &&
        ['qiniu_kodo', 'tencent_cos'].includes(provider) &&
        (config.directUploadProviders || []).includes(provider);
      if (!supportsDirect) return fallback(config);

      const size = await getLocalFileSize(filePath);
      if (!size) throw new DirectUploadError('file_info', '文件大小无效');
      const mimeType = inferMimeType(filePath, fileCategory);
      const originalName = fileNameFromPath(filePath, fileCategory);
      const credential = await get<DirectCredential>('/files/credential', {
        fileCategory,
        originalName,
        fileSize: size,
        contentType: mimeType,
        visibility,
      }, { silent: true, timeout: 15000 }).catch((err) => {
        throw new DirectUploadError('credential', err?.message || '生成上传凭证失败');
      });

      const startedAt = Date.now();
      uni.showLoading({ title: '上传中', mask: true });
      try {
        const timeout = isVideo ? 300000 : isAudio ? 180000 : 120000;
        const result = provider === 'tencent_cos'
          ? await uploadToCos(filePath, credential, timeout, mimeType)
          : await uploadToQiniu(filePath, credential, timeout);
        return await post<T>('/files/notify', {
          storageKey: credential.storageKey,
          etag: result.etag,
          fileSize: size,
          mimeType,
          durationMs: Date.now() - startedAt,
        }, { silent: true, timeout: 60000 }).catch((err) => {
          throw new DirectUploadError('notify', err?.message || '确认上传结果失败');
        });
      } finally {
        uni.hideLoading();
      }
    })
    .catch((err) => {
      if (err?.stage === 'notify') throw err;
      return fallback();
    });
}

export { downloadFile };
